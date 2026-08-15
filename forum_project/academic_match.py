"""
学术资源匹配模块 - OpenAlex 文献检索 + OpenAI 兼容 LLM
=====================================================
功能：
  1. 文献：OpenAlex 免费 API（无需 key、无需企业认证）
  2. 用户自配 OpenAI 兼容大模型 API（base_url + api_key + model），
     对检索结果做摘要与"学习意向匹配度"分析
"""

import json
import os
import re
import time
from typing import Dict, List, Optional

import requests

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
# OpenAlex 免费学术文献检索（无需 Key / 企业认证）
# ---------------------------------------------------------------------------
OPENALEX_API = "https://api.openalex.org/works"


def _openalex_abstract(inverted: dict) -> str:
    """OpenAlex 摘要以倒排索引返回，重建为纯文本"""
    if not isinstance(inverted, dict):
        return ""
    pos = {}
    for word, idxs in inverted.items():
        for i in idxs:
            pos[int(i)] = word
    return " ".join(pos[i] for i in sorted(pos)) if pos else ""


def search_openalex(query: str, limit: int = 10) -> list:
    """
    通过 OpenAlex 免费 API 检索学术文献（无需 Key、无需企业认证）。
    返回与 PatsnapMCPClient._normalize_items 同构的条目列表，
    供前端「文献」Tab 直接渲染。
    """
    try:
        resp = requests.get(OPENALEX_API, params={
            "search": query,
            "per-page": limit,
            "mailto": "academy@example.com",  # 礼貌标识，提高限流额度
        }, timeout=30)
        resp.raise_for_status()
    except requests.exceptions.RequestException as exc:
        raise RuntimeError(f"OpenAlex 文献检索失败: {exc}") from exc

    items = []
    for w in (resp.json().get("results") or []):
        authors = ", ".join(
            a.get("author", {}).get("display_name", "")
            for a in (w.get("authorships") or [])[:3]
            if a.get("author", {}).get("display_name")
        )
        src = (w.get("primary_location") or {}).get("source") or {}
        journal = src.get("display_name") or ""
        doi = w.get("doi") or ""
        items.append({
            "title": w.get("display_name") or "",
            "snippet": _openalex_abstract(w.get("abstract_inverted_index"))[:500],
            "date": (w.get("publication_date") or "")[:10],
            "assignee": authors or journal,
            "patent_number": "",
            "url": doi or "",
            "raw": {"doi": doi, "journal": journal,
                    "cited_by_count": w.get("cited_by_count")},
        })
    return items


# ---------------------------------------------------------------------------
# Espacenet OPS 专利检索（免费注册 key，config.json espacenet 节点配置）
# ---------------------------------------------------------------------------
OPS_TOKEN_URL = "https://ops.epo.org/3.2/auth/accesstoken"
OPS_API = "https://ops.epo.org/3.2/rest-services"
OPS_PATENT_URL_TPL = "https://worldwide.espacenet.com/patent/search?q=pn%3D{pn}"


def _ops_config() -> tuple:
    cfg = _load_config().get("espacenet", {}) or {}
    return (cfg.get("consumer_key") or "").strip(), (cfg.get("consumer_secret") or "").strip()


def ops_configured() -> bool:
    key, secret = _ops_config()
    return bool(key and secret)


def _ops_token() -> str:
    """OAuth2 client_credentials 换取 access_token"""
    key, secret = _ops_config()
    if not key or not secret:
        raise RuntimeError("未配置 Espacenet OPS key（config.json espacenet 节点）")
    try:
        r = requests.post(OPS_TOKEN_URL,
                          data={"grant_type": "client_credentials"},
                          auth=(key, secret), timeout=30)
        r.raise_for_status()
    except requests.exceptions.RequestException as exc:
        raise RuntimeError(f"Espacenet OPS 认证失败: {exc}") from exc
    token = r.json().get("access_token")
    if not token:
        raise RuntimeError(f"Espacenet OPS 认证响应异常: {r.text[:200]}")
    return token


def _ops_walk(obj, key_suffix: str):
    """递归收集所有 key 以 key_suffix 结尾的节点值"""
    results = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k.endswith(key_suffix):
                results.append(v)
            results.extend(_ops_walk(v, key_suffix))
    elif isinstance(obj, list):
        for it in obj:
            results.extend(_ops_walk(it, key_suffix))
    return results


def _ops_first(obj, key_suffix: str):
    found = _ops_walk(obj, key_suffix)
    return found[0] if found else None


def _ops_text(v) -> str:
    """OPS JSON 文本值：{'$': '...'} / str / list"""
    if isinstance(v, dict):
        return v.get("$") or ""
    if isinstance(v, str):
        return v
    if isinstance(v, list):
        return " ".join(t for t in (_ops_text(x) for x in v) if t)
    return str(v) if v is not None else ""


def _ops_format_date(v) -> str:
    s = _ops_text(v).strip()
    if len(s) == 8 and s.isdigit():
        return f"{s[:4]}-{s[4:6]}-{s[6:8]}"
    return s[:10]


def _ops_search(token: str, query: str, limit: int) -> list:
    """检索专利，返回公开号（epodoc）列表"""
    try:
        r = requests.post(f"{OPS_API}/published-data/search",
                          params={"q": f'txt="{query}"', "Range": f"1-{limit}"},
                          headers={"Authorization": f"Bearer {token}",
                                   "Accept": "application/json"},
                          timeout=60)
        r.raise_for_status()
    except requests.exceptions.RequestException as exc:
        raise RuntimeError(f"Espacenet OPS 检索失败: {exc}") from exc
    data = r.json()
    refs = _ops_first(data, "publication-reference")
    if not isinstance(refs, list):
        refs = [refs] if refs else []
    numbers = []
    for ref in refs:
        num = _ops_text(_ops_first(ref, "doc-number")).strip()
        if num and num not in numbers:
            numbers.append(num)
    return numbers[:limit]


def _ops_biblio(token: str, docnumber: str) -> Optional[dict]:
    """按公开号取 biblio 详情（标题/摘要/申请人/公开日）"""
    try:
        r = requests.get(
            f"{OPS_API}/published-data/publication/epodoc/{docnumber}/biblio",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            timeout=60)
        r.raise_for_status()
    except requests.exceptions.RequestException:
        return None
    try:
        data = r.json()
    except ValueError:
        return None

    biblio = _ops_first(data, "bibliographic-data")
    if not biblio:
        biblio = data
    # 标题（优先英文/中文，其次任意）
    titles = _ops_walk(biblio, "invention-title")
    title = ""
    for t in titles:
        s = _ops_text(t).strip()
        if s and not title:
            title = s
        if isinstance(t, dict) and t.get("@lang") in ("en", "zh") and s:
            title = s
            break
    # 摘要（拼接 p 段落）
    abs_parts = []
    for ab in _ops_walk(biblio, "abstract"):
        if isinstance(ab, dict) and ab.get("@lang") == "en":
            abs_parts = [t for t in (_ops_text(x) for x in _ops_walk(ab, "p")) if t]
            break
    if not abs_parts:
        for ab in _ops_walk(biblio, "abstract"):
            abs_parts = [t for t in (_ops_text(x) for x in _ops_walk(ab, "p")) if t]
            if abs_parts:
                break
    # 申请人
    applicants = _ops_walk(biblio, "applicant-name")
    assignee = ""
    for ap in applicants:
        s = _ops_text(_ops_first(ap, "name")) or _ops_text(ap)
        s = s.strip()
        if s:
            assignee = s
            break
    pub_date = _ops_format_date(_ops_first(biblio, "publication-date"))
    pub_number = _ops_text(_ops_first(biblio, "doc-number")).strip()
    if not pub_number:
        pub_number = docnumber
    return {
        "title": title,
        "snippet": " ".join(abs_parts)[:500],
        "date": pub_date,
        "assignee": assignee,
        "patent_number": pub_number,
        "url": OPS_PATENT_URL_TPL.replace("{pn}", pub_number),
        "raw": {"doc_number": pub_number, "source": "Espacenet"},
    }


def search_ops(query: str, limit: int = 10) -> list:
    """Espacenet OPS 专利检索：认证 → 检索公开号 → 逐个取 biblio 详情"""
    token = _ops_token()
    numbers = _ops_search(token, query, limit)
    items = []
    for num in numbers:
        info = _ops_biblio(token, num)
        if info:
            items.append(info)
    return items


# ---------------------------------------------------------------------------
# 数据库辅助（检索历史持久化，PostgreSQL）
# ---------------------------------------------------------------------------
def save_search(db, user_id: int, keyword: str,
                result_count: int, summary: str = "") -> int:
    """保存一次学术匹配记录，返回记录 id（db 为 psycopg2 连接）"""
    from datetime import datetime
    cur = db.execute(
        "INSERT INTO academic_search (user_id, keyword, result_count, summary, "
        "create_time) VALUES (%s, %s, %s, %s, %s) RETURNING id",
        (user_id, keyword, result_count, summary,
         datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    )
    db.commit()
    return cur.fetchone()["id"]
