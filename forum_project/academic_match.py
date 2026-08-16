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
    返回条目列表，供前端「文献」列表直接渲染。
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
