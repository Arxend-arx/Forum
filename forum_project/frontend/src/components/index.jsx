import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import katex from 'katex'
import 'katex/dist/katex.min.css'

/* ---------- 头像（有图显图，无图显首字） ---------- */
export function Avatar({ name, size, className, src }) {
  const ch = (name || '?').charAt(0)
  const style = size ? { width: size, height: size, fontSize: size * 0.4, borderRadius: size * 0.3 } : undefined
  if (src) {
    return (
      <img
        className={`avatar img ${className || ''}`}
        src={src}
        alt={name || 'avatar'}
        style={{
          width: (style && style.width) || 38,
          height: (style && style.height) || 38,
          fontSize: style && style.fontSize,
          borderRadius: (style && style.borderRadius) || '50%',
        }}
      />
    )
  }
  return <span className={`avatar ${className || ''}`} style={style}>{ch}</span>
}

/* ---------- 常用表情列表 ---------- */
const EMOJI_LIST = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '🥰', '😘', '😉', '😎',
  '🤩', '🥳', '😜', '🤪', '😇', '🙃', '😌', '😔', '😢', '😭',
  '😤', '😡', '🥺', '😳', '🤔', '🤗', '🤭', '🤫', '😴', '🤯',
  '😱', '🙄', '😏', '👍', '👎', '👏', '🙏', '🤝', '💪', '✌️',
  '👌', '🤟', '👀', '💡', '❤️', '🧡', '💛', '💚', '💙', '💜',
  '🖤', '💯', '🔥', '✨', '⭐', '🎉', '🎊', '🎈', '🎁', '🚀',
  '🌈', '🍀', '☕', '🍎', '🍺', '🎧', '📚', '⚽', '🐱', '🐶',
]

/* ---------- 表情选择器 ---------- */
export function EmojiPicker({ onPick, className }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <span className={`emoji-wrap ${className || ''}`} ref={wrapRef}>
      <button type="button" className="emoji-btn" title="Emoji" onClick={() => setOpen((o) => !o)}>😀</button>
      {open && (
        <div className="emoji-panel">
          {EMOJI_LIST.map((e) => (
            <button key={e} type="button" onClick={() => { onPick(e); setOpen(false) }}>{e}</button>
          ))}
        </div>
      )}
    </span>
  )
}

/* ---------- Markdown 编辑器（发帖 / 评论共用） ---------- */
export function MarkdownEditor({ value, onChange, minHeight, placeholder }) {
  const taRef = useRef(null)

  const insert = (before, after, sel) => {
    const ta = taRef.current
    if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd
    const next = value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e)
    onChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(s + before.length, s + before.length + (sel || (e - s)))
    })
  }

  return (
    <div className="editor">
      <div className="toolbar">
        <button type="button" onClick={() => insert('**', '**', 0)} title="Bold"><b>B</b></button>
        <button type="button" onClick={() => insert('*', '*', 0)} title="Italic"><i>I</i></button>
        <button type="button" onClick={() => insert('## ', '', 0)} title="Heading">H</button>
        <button type="button" onClick={() => insert('> ', '', 0)} title="Quote">❝</button>
        <button type="button" onClick={() => insert('`', '`', 0)} title="Code">{'<>'}</button>
        <button type="button" onClick={() => insert('[', '](https://)', 0)} title="Link">🔗</button>
        <button type="button" onClick={() => insert('![', '](https://)', 0)} title="Image">🖼</button>
        <EmojiPicker onPick={(emo) => insert(emo, '', 0)} />
        <span className="hint" style={{ marginLeft: 'auto' }}>{value.length}</span>
      </div>
      <textarea ref={taRef} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} style={minHeight ? { minHeight } : undefined} />
    </div>
  )
}

/* ---------- 空态 ---------- */
export function EmptyState({ title, desc, icon }) {
  return (
    <div className="empty">
      {icon || (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12h8" />
        </svg>
      )}
      <h3>{title}</h3>
      {desc && <p>{desc}</p>}
    </div>
  )
}

/* ---------- 骨架屏 ---------- */
export function SkeletonList({ count = 3 }) {
  return (
    <div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skel-card">
          <div className="skeleton" style={{ width: '36%', height: 18, marginBottom: 12 }} />
          <div className="skeleton" style={{ width: '100%', height: 14, marginBottom: 8 }} />
          <div className="skeleton" style={{ width: '82%', height: 14, marginBottom: 16 }} />
          <div className="skeleton" style={{ width: '30%', height: 12 }} />
        </div>
      ))}
    </div>
  )
}

/* ---------- 确认弹窗 ---------- */
export function ConfirmModal({ title, text, okText, onOk, onCancel }) {
  const { t } = useTranslation()
  return (
    <div className="modal-mask" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal">
        <h3>{title}</h3>
        <p>{text}</p>
        <div className="row">
          <button className="btn btn-ghost" onClick={onCancel}>{t('cancel')}</button>
          <button className="btn btn-danger" onClick={onOk}>{okText || t('confirm')}</button>
        </div>
      </div>
    </div>
  )
}
export function useConfirm() {
  const [cfg, setCfg] = useState(null)
  const modal = cfg ? (
    <ConfirmModal
      {...cfg}
      onCancel={() => setCfg(null)}
      onOk={() => { setCfg(null); cfg.onOk && cfg.onOk() }}
    />
  ) : null
  return [modal, setCfg]
}

/* ---------- 轻量 Markdown ---------- */
export function Markdown({ text }) {
  if (!text) return null
  let html = String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // 代码块：先整体取出保护，避免后续行级处理破坏
  const codeBlocks = []
  html = html.replace(/```[^\n]*\n?([\s\S]*?)```/g, (m, code) => {
    codeBlocks.push(`<pre><code>${code.replace(/\n$/, '')}</code></pre>`)
    return `\u0001C${codeBlocks.length - 1}\u0001`
  })
  // 数学公式（LaTeX）：块级 $$...$$ 与行内 $...$
  const mathBlocks = []
  html = html.replace(/\$\$([\s\S]+?)\$\$/g, (m, code) => {
    mathBlocks.push(katex.renderToString(code.trim(), { displayMode: true, throwOnError: false }))
    return `\u0001M${mathBlocks.length - 1}\u0001`
  })
  html = html.replace(/(^|[^$\\\w])\$([^$\n]+?)\$(?!\$)/g, (m, pre, code) => {
    mathBlocks.push(katex.renderToString(code.trim(), { throwOnError: false }))
    return `${pre}\u0001M${mathBlocks.length - 1}\u0001`
  })
  // 行内代码
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>')
  // 图片/视频（先于链接）
  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) => {
    if (/\.(mp4|webm|ogg|mov|mkv)(\?|#|$)/i.test(src)) {
      return `<video controls preload="metadata" style="max-width:100%;border-radius:10px"><source src="${src}"></video>`
    }
    return `<img src="${src}" alt="${alt}" loading="lazy" style="max-width:100%;border-radius:10px">`
  })
  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, href) => {
    if (href.startsWith('/')) return `<a href="${href}">${txt}</a>`
    if (/^https?:/i.test(href)) return `<a href="${href}" target="_blank" rel="noopener">${txt}</a>`
    return m
  })
  // 加粗/斜体
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
  // 表格（GFM）：| a | b | + 分隔行 + 数据行
  const tables = []
  html = html.replace(/^\|.*\|[ \t]*\n\|[\s\-:|]+\|[ \t]*\n(?:\|.*\|[ \t]*\n?)+/gm, (m) => {
    const rows = m.replace(/\n$/, '').split('\n')
      .map((r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
    const head = rows[0]
    const body = rows.slice(2)
    tables.push(
      `<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead>` +
      `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    )
    return `\u0001T${tables.length - 1}\u0001`
  })
  // 逐行块级：标题 / 引用 / 列表（有序+无序） / 段落
  const out = []
  let list = null // { type: 'ul' | 'ol', items: [] }
  let quote = null
  const flushList = () => {
    if (!list) return
    const tag = list.type === 'ol' ? 'ol' : 'ul'
    out.push(`<${tag}>${list.items.join('')}</${tag}>`)
    list = null
  }
  const flushQuote = () => { if (quote) { out.push(`<blockquote>${quote.join('')}</blockquote>`); quote = null } }
  for (const raw of html.split('\n')) {
    const line = raw.trim()
    if (!line) { flushList(); flushQuote(); continue }
    const cb = line.match(/^\u0001C(\d+)\u0001$/)
    if (cb) { flushList(); flushQuote(); out.push(codeBlocks[+cb[1]]); continue }
    const mb = line.match(/^\u0001M(\d+)\u0001$/)
    if (mb) { flushList(); flushQuote(); out.push(mathBlocks[+mb[1]]); continue }
    const tb = line.match(/^\u0001T(\d+)\u0001$/)
    if (tb) { flushList(); flushQuote(); out.push(tables[+tb[1]]); continue }
    let m = line.match(/^(#{1,3}) (.*)$/)
    if (m) { flushList(); flushQuote(); out.push(`<h${m[1].length}>${m[2]}</h${m[1].length}>`); continue }
    m = line.match(/^&gt; ?(.*)$/)
    if (m) { flushList(); if (quote) quote.push(m[1]); else quote = [m[1]]; continue }
    m = line.match(/^[-*] (.*)$/)
    if (m) {
      flushQuote()
      if (list && list.type === 'ul') list.items.push(`<li>${m[1]}</li>`)
      else { flushList(); list = { type: 'ul', items: [`<li>${m[1]}</li>`] } }
      continue
    }
    m = line.match(/^\d+\.\s+(.*)$/)
    if (m) {
      flushQuote()
      if (list && list.type === 'ol') list.items.push(`<li>${m[1]}</li>`)
      else { flushList(); list = { type: 'ol', items: [`<li>${m[1]}</li>`] } }
      continue
    }
    flushList(); flushQuote()
    out.push(`<p>${line}</p>`)
  }
  flushList(); flushQuote()
  // 还原嵌入段落的占位符
  let finalHtml = out.join('')
  finalHtml = finalHtml.replace(/\u0001M(\d+)\u0001/g, (m, i) => mathBlocks[+i])
  finalHtml = finalHtml.replace(/\u0001T(\d+)\u0001/g, (m, i) => tables[+i])
  return <div className="md" dangerouslySetInnerHTML={{ __html: finalHtml }} />
}

/* ---------- 标签（#分类，可点击筛选） ---------- */
export function TagChips({ tags, onPick }) {
  if (!tags) return null
  const list = String(tags).split(',').filter(Boolean)
  if (list.length === 0) return null
  return (
    <div className="tag-row" style={{ marginTop: 8 }}>
      {list.map((tg) => (
        <span key={tg} className="tag-chip" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPick && onPick(tg) }}>
          #{tg}
        </span>
      ))}
    </div>
  )
}

/* ---------- 帖子卡片 ---------- */
export function PostCard({ post }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <article className="card post">
      <div className="head">
        <Avatar name={post.author} src={post.author_avatar} />
        <div className="meta">
          <div className="author">{post.author} <small>· {post.create_time}</small></div>
        </div>
      </div>
      <h3><Link to={`/post/${post.id}`}>{post.title}</Link></h3>
      <TagChips tags={post.tags} onPick={(tg) => navigate(`/?tag=${encodeURIComponent(tg)}`)} />
      <p className="excerpt">{post.content}</p>
      <div className="foot">
        <span className="stat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.4-.7L3 21l1.8-5.6A8.4 8.4 0 1 1 21 11.5z" /></svg>
          {post.comment_count} {t('comments')}
        </span>
        <Link to={`/post/${post.id}`} style={{ marginLeft: 'auto', color: 'var(--primary-2)', fontWeight: 600 }}>
          {t('readMore')} →
        </Link>
      </div>
    </article>
  )
}

