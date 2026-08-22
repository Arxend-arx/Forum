# -*- coding: utf-8 -*-
"""
Starlink：画像向量化 + 天球定位 + 相似度匹配
================================================
- profile_vec: 中文字符二元组 + 英文单词 hashing → 128 维 L2 归一化向量
- vec_to_sky : 固定种子随机投影到 3D → 归一化 → 单位方向 (az, alt)
- cosine     : 余弦相似度（画像同频度）
纯标准库实现，无外部依赖。
"""
import math
import random
import re

DIM = 128
PROJ_SEED = 20260822

_CJK = re.compile(r'[\u4e00-\u9fff]+')
_WORD = re.compile(r'[a-zA-Z0-9]+')


def _tokens(text):
    """画像文本 → 词条：中文按字符二元组（单字也保留），英文/数字按单词"""
    if not text:
        return []
    text = str(text).lower()
    toks = []
    for seg in _CJK.findall(text):
        seg = seg.strip()
        if not seg:
            continue
        if len(seg) == 1:
            toks.append(seg)
        else:
            toks.extend(seg[i:i + 2] for i in range(len(seg) - 1))
    toks.extend(_WORD.findall(text))
    return toks


def _hash_token(tok):
    h = 2166136261
    for ch in tok:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def profile_vec(profile_text):
    """画像文本 → 128 维 L2 归一化向量（词频 hashing trick）"""
    vec = [0.0] * DIM
    for tok in _tokens(profile_text):
        vec[_hash_token(tok) % DIM] += 1.0
    norm = math.sqrt(sum(v * v for v in vec))
    if norm == 0:
        return vec
    return [v / norm for v in vec]


def cosine(a, b):
    """两个 L2 归一化向量的余弦相似度（-1 ~ 1）"""
    s = 0.0
    for i in range(DIM):
        s += a[i] * b[i]
    return s


# 固定种子随机投影：3 个 128 维归一化高斯向量（相似向量投影后仍相近）
_rng = random.Random(PROJ_SEED)
_PROJ = []
for _ in range(3):
    v = [_rng.gauss(0, 1) for _ in range(DIM)]
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    _PROJ.append([x / n for x in v])


def vec_to_sky(vec):
    """128 维向量 → 天球方向 (az, alt)。az∈[0,2π)，alt∈[-π/2,π/2]"""
    p = [sum(vec[i] * _PROJ[j][i] for i in range(DIM)) for j in range(3)]
    n = math.sqrt(sum(x * x for x in p))
    if n < 1e-9:
        return (0.0, 0.0)
    x, y, z = p[0] / n, p[1] / n, p[2] / n
    az = math.atan2(y, x) % (2 * math.pi)
    alt = math.asin(max(-1.0, min(1.0, z)))
    return (az, alt)


def jitter_sky(user_id, az, alt):
    """基于 user_id 的微小抖动：避免完全相同的画像完全重叠，同时不破坏聚类"""
    h = _hash_token(str(user_id))
    az = (az + (h % 1000) / 1000.0 * 0.05) % (2 * math.pi)
    alt = max(-1.5, min(1.5, alt + (((h >> 8) % 1000) / 1000.0 - 0.5) * 0.05))
    return (az, alt)
