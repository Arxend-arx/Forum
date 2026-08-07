"""
学术资源匹配模块 - 智慧芽(PatSnap) MCP 客户端 + OpenAI兼容 LLM 客户端
=====================================================================
功能：
  1. 通过标准 MCP 协议（JSON-RPC 2.0 over Streamable HTTP）调用智慧芽开放平台
  2. 自动发现 MCP 服务器可用工具（patent_search / 文献检索等）
  3. 用户自配 OpenAI 兼容大模型 API（base_url + api_key + model），
     对检索结果做摘要与"学习意向匹配度"分析

管理员配置（二选一，环境变量优先）：
  环境变量:  PAT_SNAP_MCP_URL / PAT_SNAP_MCP_KEY
  配置文件:  config.json 中的 patsnap 节点
"""

import json
import os
import re
import sqlite3
import time
from typing import Dict, List, Optional

import requests

# ---------------------------------------------------------------------------
# 管理员配置加载
# ---------------------------------------------------------------------------
DEFAULT_MCP_URL = "https://connect.zhihuiya.com/1458a4/mcp"
MCP_PROTOCOL_VERSION = "2025-11-25"

# 工具发现失败时的候选工具名（按顺序尝试，兼容不同服务端命名）
DEFAULT_PATENT_TOOL_CANDIDATES = [
    "search_patents", "patent_search", "search_patent", "patentsearch",
]
DEFAULT_LITERATURE_TOOL_CANDIDATES = [
    "search_literature", "literature_search", "search_papers",
    "search_articles", "search_documents", "search_pub", "search_science",
]
# tools/list 结果本地缓存（1小时），避免频繁请求触发智慧芽限流
_TOOLS_CACHE_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), ".mcp_tools_cache.json"
)
_TOOLS_CACHE_TTL = 3600

# 专利详情页默认跳转模板（Espacenet 欧专局公开库，国内可访问，{pn} 替换为专利号）
DEFAULT_PATENT_URL_TEMPLATE = (
    "https://worldwide.espacenet.com/patent/search?q=pn%3D{pn}"
)


def _load_config() -> dict:
    """读取 config.json（与 app.py 同目录），无文件时返回空字典"""
    try:
        base = os.path.dirname(os.path.abspath(__file__))
        with open(os.path.join(base, "config.json"), "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


def get_patsnap_mcp_url() -> str:
    """获取智慧芽 MCP 地址：环境变量优先，其次 config.json"""
    return (
        os.environ.get("PAT_SNAP_MCP_URL")
        or _load_config().get("patsnap", {}).get("mcp_url")
        or DEFAULT_MCP_URL
    )


def get_patsnap_mcp_key() -> str:
    """获取智慧芽 MCP Key：环境变量优先，其次 config.json。

    仅当 Key 以 sk- 开头时才视为有效（智慧芽 MCP Key 固定格式），
    可避免占位文本/错误配置被当作真实 Key 发起请求。
    """
    key = (
        os.environ.get("PAT_SNAP_MCP_KEY", "")
        or _load_config().get("patsnap", {}).get("api_key", "")
    ).strip()
    return key if key.startswith("sk-") else ""


def mcp_configured() -> bool:
    """智慧芽 MCP 是否已配置（Key 有效）"""
    return bool(get_patsnap_mcp_key())


def get_literature_mcp_url() -> str:
    """获取智慧芽文献 MCP 地址（独立服务，可在 marketplace 开通后配置）"""
    return (
        os.environ.get("PAT_SNAP_LITERATURE_MCP_URL", "")
        or _load_config().get("patsnap_literature", {}).get("mcp_url", "")
    ).strip()


def get_literature_mcp_key() -> str:
    """
    获取智慧芽文献 MCP Key。
    智慧芽一个账户的 Key 可连接多个 MCP 服务器，
    文献节点未单独配置 Key 时自动复用专利 Key。
    """
    key = (
        os.environ.get("PAT_SNAP_LITERATURE_MCP_KEY", "")
        or _load_config().get("patsnap_literature", {}).get("api_key", "")
        or get_patsnap_mcp_key()
    ).strip()
    return key if key.startswith("sk-") else ""


def literature_mcp_configured() -> bool:
    """智慧芽文献 MCP 是否可配置（URL 必填；Key 可复用专利 Key）"""
    return bool(get_literature_mcp_url() and get_literature_mcp_key())


def get_patent_url_template() -> str:
    """
    专利详情页 URL 模板。
    优先级：环境变量 > config.json > 默认 Espacenet（欧专局公开库）。
    模板中 {pn} 会被替换为专利号。
    """
    return (
        os.environ.get("PAT_SNAP_PATENT_URL_TEMPLATE", "")
        or _load_config().get("patsnap", {}).get("patent_url_template", "")
        or DEFAULT_PATENT_URL_TEMPLATE
    ).strip()


# ---------------------------------------------------------------------------
# 智慧芽 MCP 客户端
# ---------------------------------------------------------------------------
class PatsnapMCPClient:
    """通过 HTTP 直接调用智慧芽 MCP 服务的 JSON-RPC 接口（无需 mcp SDK）"""

    def __init__(self, mcp_url: Optional[str] = None, api_key: Optional[str] = None):
        self.mcp_url = mcp_url or get_patsnap_mcp_url()
        self.api_key = api_key or get_patsnap_mcp_key()
        self._tools: Optional[List[dict]] = None

    # -- 基础请求 -----------------------------------------------------------
    def _build_url(self) -> str:
        """
        构造带鉴权的请求 URL：
          - 若配置的 URL 含 {your_api_key}/{api_key} 占位符 -> 替换为真实 Key
          - 若 URL 无 apikey 参数 -> 追加 ?apikey= 参数（兼容 URL 参数鉴权）
          - Bearer 头仍会一并发送（双保险，服务端接受任一方式）
        """
        url = self.mcp_url
        if not self.api_key:
            return url
        if "{your_api_key}" in url or "{api_key}" in url:
            return url.replace("{your_api_key}", self.api_key) \
                      .replace("{api_key}", self.api_key)
        if "apikey=" not in url:
            sep = "&" if "?" in url else "?"
            url = f"{url}{sep}apikey={self.api_key}"
        return url

    def _request(self, method: str, params: Optional[dict] = None,
                 request_id: int = 1) -> dict:
        """发送 JSON-RPC 请求，兼容 JSON / SSE 两种响应格式"""
        payload = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params or {},
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "accept": "application/json, text/event-stream",
            "mcp-protocol-version": MCP_PROTOCOL_VERSION,
        }
        try:
            resp = requests.post(self._build_url(), json=payload,
                                 headers=headers, timeout=60)
            resp.raise_for_status()
        except requests.exceptions.RequestException as exc:
            raise RuntimeError(f"智慧芽MCP网络请求失败: {exc}") from exc

        # 解析响应（SSE 或纯 JSON）
        ctype = resp.headers.get("Content-Type", "")
        if "text/event-stream" in ctype:
            msg = self._parse_sse(resp.text)
        else:
            try:
                msg = resp.json()
            except ValueError as exc:
                raise RuntimeError(
                    f"智慧芽MCP响应无法解析: {resp.text[:200]}"
                ) from exc

        if isinstance(msg, dict) and msg.get("error"):
            err = msg["error"]
            raise RuntimeError(
                f"智慧芽MCP错误: {err.get('message', err)}"
            )
        return msg.get("result", {})

    @staticmethod
    def _parse_sse(text: str) -> dict:
        """解析 Streamable HTTP 的 SSE 响应，返回 JSON-RPC 消息体"""
        for line in text.splitlines():
            line = line.strip()
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if not data:
                continue
            try:
                return json.loads(data)
            except json.JSONDecodeError:
                continue
        raise RuntimeError(f"智慧芽MCP SSE响应中未找到有效数据: {text[:200]}")

    # -- 工具发现 -----------------------------------------------------------
    def _load_tools_cache(self) -> Optional[List[dict]]:
        """读取本服务器(按 mcp_url 区分)的工具缓存（1小时内有效）"""
        try:
            if os.path.exists(_TOOLS_CACHE_FILE):
                with open(_TOOLS_CACHE_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                entry = data.get(self.mcp_url) or {}
                if time.time() - entry.get("ts", 0) < _TOOLS_CACHE_TTL:
                    return entry.get("tools") or None
        except (OSError, json.JSONDecodeError, ValueError):
            pass
        return None

    def _save_tools_cache(self, tools: List[dict]) -> None:
        """写入本服务器(按 mcp_url 区分)的工具缓存"""
        try:
            data = {}
            if os.path.exists(_TOOLS_CACHE_FILE):
                try:
                    with open(_TOOLS_CACHE_FILE, "r", encoding="utf-8") as f:
                        data = json.load(f)
                except (OSError, json.JSONDecodeError):
                    data = {}
            data[self.mcp_url] = {"ts": time.time(), "tools": tools}
            with open(_TOOLS_CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
        except OSError:
            pass

    def list_tools(self) -> List[dict]:
        """获取工具列表：优先本地缓存，其次请求 tools/list（成功则写缓存）"""
        if self._tools is None:
            cached = self._load_tools_cache()
            if cached:
                self._tools = cached
            else:
                try:
                    result = self._request("tools/list")
                    self._tools = result.get("tools", [])
                    if self._tools:
                        self._save_tools_cache(self._tools)
                except RuntimeError:
                    # tools/list 失败（限流/网络）：回退缓存，无缓存则为空
                    self._tools = self._load_tools_cache() or []
        return self._tools

    def discover_search_tools(self) -> Dict[str, List[dict]]:
        """
        按名称关键字对可用工具分类；tools/list 不可用或未命中时，
        回退为常见候选工具名（search_patents / patent_search / 文献类等）。
        """
        tools = self.list_tools()

        if not tools:
            # tools/list 失败或无工具：使用候选名，交给 search() 逐个尝试
            return {
                "patent_tools": [{"name": n} for n in DEFAULT_PATENT_TOOL_CANDIDATES],
                "literature_tools": [{"name": n} for n in DEFAULT_LITERATURE_TOOL_CANDIDATES],
                "other_search_tools": [],
            }

        patent, literature, other = [], [], []
        for t in tools:
            name = t.get("name", "").lower()
            if "patent" in name:
                patent.append(t)
            elif any(k in name for k in ("literature", "paper", "article",
                                         "scholar", "research", "science",
                                         "scientific", "publication",
                                         "document", "doc")):
                literature.append(t)
            elif "search" in name:
                other.append(t)
        # 专利组内优先选择名称含 search 的检索类工具
        # （避免 patent_detail / patent_family 等非检索工具被误选）
        patent_search = [t for t in patent if "search" in t.get("name", "").lower()]
        if patent_search:
            patent = patent_search
        if not patent:
            patent = [{"name": n} for n in DEFAULT_PATENT_TOOL_CANDIDATES]
        # 注意：文献工具不在这里补候选名——
        # 独立文献服务器由 search() 按 patsnap_literature 配置单独处理；
        # 无配置时在专利服务器上未发现文献工具，直接提示用户开通文献服务即可。
        return {
            "patent_tools": patent,
            "literature_tools": literature,
            "other_search_tools": other,
        }

    # -- 检索 ---------------------------------------------------------------
    def _call_tool(self, tool_name: str, arguments: dict) -> dict:
        """调用指定 MCP 工具；工具返回 isError 时抛异常"""
        result = self._request(
            "tools/call",
            {"name": tool_name, "arguments": arguments},
            request_id=2,
        )
        if result.get("isError"):
            raise RuntimeError(
                self._content_to_text(result) or f"工具 {tool_name} 调用失败"
            )
        return result

    @staticmethod
    def _content_to_text(result: dict) -> str:
        """提取 MCP 标准 content[] 中的纯文本"""
        content = result.get("content")
        if not isinstance(content, list):
            return ""
        parts = []
        for c in content:
            if isinstance(c, dict) and c.get("text"):
                parts.append(str(c["text"]))
        return "\n".join(parts)

    @staticmethod
    def _parse_content_payload(result: dict):
        """
        MCP tools/call 结果通常为:
            {"content": [{"type": "text", "text": "<json字符串或文本>"}]}
        尝试将 text 解析为 JSON，返回 (parsed, raw_text)：
          parsed   -> list 或 dict（解析成功时）
          raw_text -> 原始文本（解析失败或需展示时）
        """
        text = PatsnapMCPClient._content_to_text(result)
        if not text:
            return None, ""
        try:
            return json.loads(text), ""
        except (json.JSONDecodeError, TypeError):
            return None, text

    @staticmethod
    def _effective_prop_type(prop: dict) -> str:
        """
        获取 JSON Schema 属性的有效类型：
        兼容 type 直接声明，以及 anyOf/oneOf/$ref 等写法；
        完全无法判断时按 string 处理（必填字段尽量填上查询词）。
        """
        t = prop.get("type")
        if t in ("string", "array", "integer", "number", "boolean", "object"):
            return t
        for key in ("anyOf", "oneOf"):
            for sub in prop.get(key) or []:
                st = sub.get("type")
                if st in ("string", "array"):
                    return st
        return "string"

    @staticmethod
    def _build_novelty_args(tool_name: str, query: str) -> dict:
        """
        构造智慧芽「查新检索轻量版」系列工具的参数（基于官方 schema）：
          data.summary_result   = 对象（tech_subject/tech_problem/tech_solution）
          data.keywords_extract_result = 数组（feature_text_original/feature_type/express）
        聚合检索工具额外带 search_types=["semantic","paper"]（含论文检索）
        """
        data = {
            "summary_result": {
                "tech_subject": query,
                "tech_problem": query,
                "tech_solution": query,
            },
            "keywords_extract_result": [
                {
                    "feature_text_original": query,
                    "feature_type": "key_search",
                    "express": [{"word": {"key": query}}],
                }
            ],
        }
        # 单路检索工具（paper/website）schema 无 search_types，不传；
        # 聚合/语义/布尔工具带上（paper 用于学术论文检索）
        if not tool_name.endswith(("_paper_search", "_website_search")):
            data["search_types"] = ["semantic", "paper"]
        return {"data": data}

    @staticmethod
    def _build_search_arguments(tool: dict, query: str, limit: int) -> dict:
        """
        根据工具 inputSchema 构造检索参数：
          0. novelty_lite_* 系列（智慧芽查新Lite）按官方 schema 专用构造
          1. 顶层已知查询字段（query_text/query/keyword/q 等）
          2. 嵌套对象（如 data）内：已知查询字段 > 必填属性优先 > 首个 string
          3. 顶层首个 string 属性 / 兜底
        """
        tool_name = (tool.get("name") or "").lower()
        if tool_name.startswith("novelty_lite_"):
            return PatsnapMCPClient._build_novelty_args(tool_name, query)

        input_schema = tool.get("inputSchema") or {}
        schema = input_schema.get("properties") or {}
        query_keys = ["query_text", "query", "keyword", "keywords",
                      "q", "search_text", "search_query", "text"]
        limit_keys = ["limit", "max_results", "count", "size",
                      "num", "number", "page_size"]

        def _fill_known(schema_dict: dict) -> dict:
            """已知查询字段 + 限制字段"""
            inner = {}
            for k in query_keys:
                if k in schema_dict:
                    inner[k] = query
                    break
            if not inner:
                return {}
            for k in limit_keys:
                if k in schema_dict:
                    inner[k] = limit
                    break
            return inner

        # 已知内容字段名：即使 schema 未标必填，服务器端可能仍要求非空
        CONTENT_KEYS = ("summary_result", "keywords_extract_result", "summary",
                        "technical_field", "technical_solution", "description",
                        "text", "content", "query", "query_text", "claim",
                        "topic", "keyword", "keywords")

        def _fill_required(schema_dict: dict, required_list: list) -> dict:
            """必填属性 + 已知内容字段优先：string->query；array(enum)->首个enum，
            无enum数组->[query]；存在 search_types 时默认含 paper"""
            inner = {}
            candidates = list(dict.fromkeys(
                list(required_list)
                + [k for k in CONTENT_KEYS if k in schema_dict]
            ))
            for k in candidates:
                prop = schema_dict.get(k) or {}
                ptype = PatsnapMCPClient._effective_prop_type(prop)
                if ptype == "string":
                    inner.setdefault(k, query)
                elif ptype == "array":
                    enum = (prop.get("items") or {}).get("enum")
                    inner.setdefault(k, [enum[0]] if enum else [query])
            if "search_types" in schema_dict and "search_types" not in inner:
                enum = ((schema_dict["search_types"].get("items")
                         or {}).get("enum")) or []
                pick = [e for e in ("semantic", "paper") if e in enum]
                if pick:
                    inner["search_types"] = pick
            if not inner:
                return {}
            for k in limit_keys:
                if k in schema_dict and k not in inner:
                    inner[k] = limit
                    break
            return inner

        # 1) 顶层已知查询字段
        args = _fill_known(schema)
        if args:
            return args

        # 2) 嵌套对象（如 data）
        if schema:
            for name, prop in schema.items():
                if prop.get("type") == "object":
                    inner_schema = prop.get("properties") or {}
                    inner_required = prop.get("required") or []
                    inner = _fill_known(inner_schema)
                    if not inner:
                        inner = _fill_required(inner_schema, inner_required)
                    if not inner:
                        # 全兜底：第一个 string 属性承载查询，尽量带 limit
                        for k, p in inner_schema.items():
                            if p.get("type") == "string":
                                inner = {k: query}
                                break
                        if inner:
                            for k in limit_keys:
                                if k in inner_schema:
                                    inner[k] = limit
                                    break
                    if inner:
                        return {name: inner}
            # 3) 顶层首个 string 属性
            for name, prop in schema.items():
                if prop.get("type") == "string":
                    return {name: query}
        # 4) 兜底
        return {"query": query, "limit": limit}

    def _call_first_available(self, tools: List[dict], query: str, limit: int):
        """
        按顺序尝试候选工具，返回第一个成功的结果 (items, raw_text, error)。
        全部失败时汇总所有失败原因（含工具名、参数与 schema，便于精确定位）。
        """
        errors = []
        for tool in tools[:3]:  # 最多尝试3个候选
            args = self._build_search_arguments(tool, query, limit)
            try:
                result = self._call_tool(tool["name"], args)
                items, raw = self._normalize_items(result)
                return items, raw, None
            except RuntimeError as exc:
                schema_text = json.dumps(
                    tool.get("inputSchema") or {}, ensure_ascii=False
                )
                errors.append(
                    f"[{tool['name']}] 参数{args} -> {exc} | schema:{schema_text[:300]}"
                )
        if not errors:
            return [], "", None
        return [], "", RuntimeError("；".join(errors))

    def search(self, query: str, limit: int = 10) -> dict:
        """
        多类资源检索：
          - 专利：使用专利 MCP 服务器（patsnap 配置）
          - 文献：优先使用独立文献 MCP 服务器（patsnap_literature 配置）；
                 未配置时回退在专利服务器上寻找文献类工具
        返回: {"patents": [...], "literature": [...], "errors": [...],
              "patents_raw": "...", "literature_raw": "...", "tools_found": {...}}
        """
        groups = self.discover_search_tools()
        results = {
            "patents": [], "literature": [],
            "patents_raw": "", "literature_raw": "",
            "tools_found": {
                "patent": [t.get("name") for t in groups["patent_tools"]],
                "literature": [t.get("name") for t in groups["literature_tools"]],
                "other": [t.get("name") for t in groups["other_search_tools"]],
            },
            "errors": [],
        }

        # 专利检索（候选工具逐个尝试）
        items, raw, err = self._call_first_available(
            groups["patent_tools"], query, limit
        )
        results["patents"] = items
        results["patents_raw"] = raw[:2000]
        if err:
            results["errors"].append(f"专利检索: {err}")

        # 科技文献检索
        if literature_mcp_configured():
            # 独立文献 MCP 服务器（marketplace 开通后配置）
            lit_client = PatsnapMCPClient(
                get_literature_mcp_url(), get_literature_mcp_key()
            )
            lit_groups = lit_client.discover_search_tools()
            lit_tools = (lit_groups["literature_tools"]
                         + lit_groups["other_search_tools"]
                         + lit_groups["patent_tools"])
            results["tools_found"]["literature"] = [
                t.get("name") for t in lit_tools
            ]
            items, raw, err = lit_client._call_first_available(
                lit_tools, query, limit
            )
            results["literature"] = items
            results["literature_raw"] = raw[:2000]
            if err:
                results["errors"].append(f"文献检索: {err}")
        else:
            # 未配置独立文献服务器：在专利服务器上找文献类工具
            lit_tools = (groups["literature_tools"]
                         + groups["other_search_tools"])
            if lit_tools:
                items, raw, err = self._call_first_available(
                    lit_tools, query, limit
                )
                results["literature"] = items
                results["literature_raw"] = raw[:2000]
                if err:
                    results["errors"].append(f"文献检索: {err}")
            else:
                results["errors"].append(
                    "未配置文献MCP服务：如需文献匹配，请在智慧芽开放平台开通文献服务，"
                    "并将文献MCP的URL与Key填入 config.json 的 patsnap_literature 节点"
                )

        return results

    # 常见结果列表字段名（用于递归挖掘）
    LIST_KEYS = ("items", "list", "results", "data", "patents",
                 "literatures", "records", "rows", "hits", "documents",
                 "docs", "articles", "papers", "payload")

    # 专利公开号形态：国家代码(2位) + 数字 + 可选类型字母，如 CN118123456A / US11234567B2
    PN_PATTERN = re.compile(
        r"^(?P<cc>[A-Za-z]{2})\s*-?\s*(?P<num>\d{4,13})\s*(?P<kind>[A-Za-z]\d*)?$"
    )

    # DOI 形态：10.xxxx/xxxxx（全球论文标准标识）
    DOI_PATTERN = re.compile(r"^10\.\d{4,9}/")

    @staticmethod
    def _normalize_jump_url(raw_url: str) -> str:
        """
        归一化跳转链接：
          - http(s):// 原样返回
          - 裸 DOI（10.xxxx/...）补全为 https://doi.org/ 链接
          - 其他（内部ID/相对路径等）返回空（不生成跳转）
        """
        url = (raw_url or "").strip()
        if not url:
            return ""
        if url.startswith(("http://", "https://")):
            return url
        if PatsnapMCPClient.DOI_PATTERN.match(url):
            return "https://doi.org/" + url
        return ""

    @staticmethod
    def _looks_like_publication_number(v: str) -> bool:
        """判断字符串是否像专利公开号（排除 UUID / 内部ID）"""
        v = v.strip()
        if not v or "-" in v and PatsnapMCPClient._is_uuid(v):
            return False
        return bool(PatsnapMCPClient.PN_PATTERN.match(v))

    @staticmethod
    def _is_uuid(v: str) -> bool:
        return bool(re.match(
            r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
            r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", v.strip()))

    @staticmethod
    def _pick_publication_number(item: dict) -> str:
        """
        提取真正的专利公开号（排除内部 patent_id 等 UUID）：
          1. 精确键优先（publication_number / patent_number / pub_no 等）
          2. 扫描所有值，匹配"国家代码+数字"形态的字符串
        """
        for k in ("publication_number", "publicationNumber",
                  "publication_no", "pub_no", "publish_number",
                  "patent_number", "patentNumber", "publicationNo"):
            if k in item and item[k] not in (None, ""):
                v = PatsnapMCPClient._to_str(item[k])
                if PatsnapMCPClient._looks_like_publication_number(v):
                    return v
        # 值形态扫描（跳过内部ID/UUID）
        for key, val in item.items():
            kl = key.lower()
            if "id" in kl or "uuid" in kl or "guid" in kl:
                continue  # 内部ID字段直接跳过
            v = PatsnapMCPClient._to_str(val)
            if PatsnapMCPClient._looks_like_publication_number(v):
                return v
        return ""

    @staticmethod
    def _find_list(obj, depth: int = 0):
        """
        递归挖掘第一个结果列表，兼容多层包裹：
          {"patents": [...]}                       -> 直接命中
          {"data": {"patents": [...]}}             -> 递归命中
          {"data": {"list": [...]}}                -> 递归命中
          [ {...}, {...} ]                         -> 本身就是列表
        返回 None 表示未找到。
        """
        if depth > 5 or obj is None:
            return None
        if isinstance(obj, list):
            return obj
        if isinstance(obj, dict):
            # 优先匹配已知字段名
            for k in PatsnapMCPClient.LIST_KEYS:
                v = obj.get(k)
                if isinstance(v, list):
                    return v
            # 未命中则递归遍历值
            for v in obj.values():
                found = PatsnapMCPClient._find_list(v, depth + 1)
                if found is not None:
                    return found
        return None

    @staticmethod
    def _to_str(v) -> str:
        """将各种取值类型转为字符串（兼容列表/数字/嵌套对象）"""
        if isinstance(v, str):
            return v
        if isinstance(v, (int, float)):
            return str(v)
        if isinstance(v, list):
            return ", ".join(str(x) for x in v if x)
        if isinstance(v, dict):
            for k in ("value", "name", "title", "text"):
                if v.get(k):
                    return str(v[k])
        return ""

    @staticmethod
    def _format_date(v) -> str:
        """
        日期格式化：
          20201123 / 20201123203020 / 2023-01-15 等 -> 2020-11-23
        无法识别时原样返回（或截断过长的数字串）。
        """
        s = PatsnapMCPClient._to_str(v).strip()
        if not s:
            return ""
        digits = re.sub(r"\D", "", s)
        if len(digits) >= 8 and digits.isdigit():
            return "{}-{}-{}".format(digits[:4], digits[4:6], digits[6:8])
        if re.match(r"^\d{4}-\d{1,2}-\d{1,2}", s):
            return s[:10]
        return s[:20]

    @staticmethod
    def _pick(item: dict, exact_keys: tuple, keyword_fallbacks: tuple = ()) -> str:
        """
        智能取值：先精确匹配键名，再按键名关键字模糊匹配首个非空值，
        兼容 camelCase / snake_case / 中文键等多种命名。
        """
        for k in exact_keys:
            if k in item and item[k] not in (None, ""):
                return PatsnapMCPClient._to_str(item[k])
        for key, val in item.items():
            if val in (None, ""):
                continue
            kl = key.lower()
            if any(kw in kl for kw in keyword_fallbacks):
                return PatsnapMCPClient._to_str(val)
        return ""

    @staticmethod
    def _normalize_items(result: dict):
        """
        将不同工具返回结构统一为列表，返回 (items, raw_text)：
          1. 标准 MCP structuredContent（结构化返回，优先）
          2. 直接字段 items/results/data/patents/...
          3. content[].text 中的 JSON 字符串（递归挖取）
          4. 均失败时返回 raw_text 供页面兜底展示
        """
        raw = None
        raw_text = ""

        # 1. MCP 标准结构化返回 structuredContent
        structured = result.get("structuredContent")
        if structured is not None:
            raw = PatsnapMCPClient._find_list(structured)

        # 2. 直接字段（排除 content/structuredContent，避免误把文本块当结果）
        if raw is None:
            direct = {k: v for k, v in result.items()
                      if k not in ("content", "structuredContent", "isError")}
            raw = PatsnapMCPClient._find_list(direct)

        # 3. content[].text 内的 JSON
        if raw is None:
            parsed, text = PatsnapMCPClient._parse_content_payload(result)
            if text:
                raw_text = text
            if parsed is not None:
                raw = PatsnapMCPClient._find_list(parsed)

        if not raw:
            return [], raw_text

        items = []
        for it in raw[:50]:
            if not isinstance(it, dict):
                continue
            patent_number = PatsnapMCPClient._pick_publication_number(it)
            # 跳转链接：智慧芽返回链接 > 专利号模板 > PMID
            url = PatsnapMCPClient._pick(
                it,
                ("url", "link", "detail_url", "source_url", "view_url",
                 "detailLink", "patent_url", "official_url",
                 "publication_url", "paper_url", "doi", "doi_url"),
                ("url", "link", "detail", "原文", "链接"))
            url = PatsnapMCPClient._normalize_jump_url(url)
            if not url and patent_number:
                tpl = get_patent_url_template()
                if tpl:
                    url = tpl.replace("{pn}", patent_number)
            if not url:
                pmid = PatsnapMCPClient._pick(
                    it, ("pmid", "pubmed_id", "pubmedId", "pubmed", "pm_id"),
                    ("pmid", "pubmed", "pm_id"))
                if pmid and pmid.strip().isdigit():
                    url = "https://pubmed.ncbi.nlm.nih.gov/{}/".format(pmid.strip())
            items.append({
                "title": PatsnapMCPClient._pick(
                    it,
                    ("title", "name", "publication_title", "invention_title",
                     "patent_title", "article_title", "paper_title",
                     "publicationTitle", "inventionTitle"),
                    ("title", "name", "标题", "题目", "名称")),
                "snippet": PatsnapMCPClient._pick(
                    it,
                    ("abstract", "summary", "snippet", "description",
                     "abstract_text", "abstractText", "abstractContent"),
                    ("abstract", "summary", "snippet", "descrip",
                     "摘要", "简介", "描述")),
                "date": PatsnapMCPClient._format_date(
                    PatsnapMCPClient._pick(
                        it,
                        ("pbd", "publication_date", "publish_date",
                         "publicationDate", "publishDate", "date",
                         "create_time", "filing_date", "filingDate",
                         "application_date", "applicationDate",
                         "grant_date", "grantDate"),
                        ("pbd", "date", "public", "publish", "filing",
                         "time", "日期", "公开", "申请日", "时间"))),
                "assignee": PatsnapMCPClient._pick(
                    it,
                    ("assignee", "applicant", "organization", "authors",
                     "assignees", "assignee_name", "applicant_name",
                     "company", "owner", "assigneeName", "applicantName",
                     "organization_name"),
                    ("assignee", "applicant", "company", "owner",
                     "organiz", "author", "申请人", "专利权人",
                     "公司", "机构", "作者")),
                "patent_number": patent_number,
                "url": url,
                "raw": it,
            })
        return items, raw_text


# ---------------------------------------------------------------------------
# OpenAI 兼容 LLM 客户端（用户自配 API）
# ---------------------------------------------------------------------------
DEFAULT_LLM_BASE_URL = "https://api.deepseek.com/v1"
DEFAULT_LLM_MODEL = "deepseek-chat"


def llm_chat(base_url: str, api_key: str, model: str, messages: List[dict],
             temperature: float = 0.3, timeout: int = 120) -> str:
    """
    调用 OpenAI 兼容格式的 /chat/completions 接口
    兼容: DeepSeek / 通义千问 / Kimi / GLM / OpenAI 等
    """
    url = base_url.rstrip("/") + "/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    resp = requests.post(url, json=payload, headers=headers, timeout=timeout)
    if resp.status_code == 401:
        raise RuntimeError("LLM API Key 无效或已过期")
    if resp.status_code == 429:
        raise RuntimeError("LLM 请求过于频繁，请稍后再试")
    resp.raise_for_status()
    data = resp.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as exc:
        raise RuntimeError(f"LLM 响应格式异常: {data}") from exc


def analyze_matches(api_key: str, base_url: str, model: str,
                    learning_interest: str, results: dict) -> str:
    """
    让用户自配的 LLM 对检索结果做摘要 + 与学习意向的匹配度分析
    返回纯文本分析报告（失败时抛出 RuntimeError）
    """
    # 组装资源列表文本
    lines = []
    for kind, label in (("patents", "专利"), ("literature", "科技文献")):
        for i, item in enumerate(results.get(kind, []), 1):
            meta = item.get("date", "") or ""
            if item.get("assignee"):
                meta = (meta + " / " + str(item["assignee"])) if meta else str(item["assignee"])
            lines.append(
                f"[{label}{i}] {item['title']}（{meta}）\n摘要: {item['snippet'][:300]}"
            )
    resource_text = "\n\n".join(lines) if lines else "（未检索到结果）"

    prompt = (
        "你是一名学术资源匹配助手。以下是根据关键词检索到的专利和科技文献列表，"
        f"用户的学习意向是：{learning_interest or '未填写'}。\n\n"
        f"检索结果如下：\n{resource_text}\n\n"
        "请完成两件事：\n"
        "1. 用 2-3 句话总结这批资源的主要技术/研究方向；\n"
        "2. 逐条判断每条资源与用户学习意向的匹配程度（高/中/低），"
        "并给出简短理由。\n"
        "请用中文回答，条理清晰。"
    )
    return llm_chat(
        base_url, api_key, model,
        [{"role": "user", "content": prompt}],
    )


# ---------------------------------------------------------------------------
# 数据库辅助（检索历史持久化）
# ---------------------------------------------------------------------------
def save_search(db: sqlite3.Connection, user_id: int, keyword: str,
                result_count: int, summary: str = "") -> int:
    """保存一次学术匹配记录，返回记录 id"""
    from datetime import datetime
    cur = db.execute(
        "INSERT INTO academic_search (user_id, keyword, result_count, summary, "
        "create_time) VALUES (?, ?, ?, ?, ?)",
        (user_id, keyword, result_count, summary,
         datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    )
    db.commit()
    return cur.lastrowid
