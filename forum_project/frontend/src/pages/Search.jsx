import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { Avatar, EmptyState, TagChips } from '../components'

export default function Search({ q: propQ, onClose, onOpenPost }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const isInline = propQ !== undefined        // 内联模式：在 Social 内显示，不跳页
  const urlQ = params.get('q') || ''
  const [q, setQ] = useState(isInline ? propQ : urlQ)
  const [input, setInput] = useState(isInline ? propQ : urlQ)
  const [tab, setTab] = useState(params.get('type') === 'user' ? 1 : 0)
  const [data, setData] = useState(null)

  useEffect(() => {
    if (isInline) { setQ(propQ); setInput(propQ) }
  }, [propQ])

  useEffect(() => {
    if (!q) { setData({ posts: [], users: [] }); return }
    let alive = true
    api.get(`/search?q=${encodeURIComponent(q)}`).then((d) => alive && setData(d)).catch(() => alive && setData({ posts: [], users: [] }))
    return () => { alive = false }
  }, [q])

  const run = () => {
    if (isInline) setQ(input)
    else setParams({ q: input })
  }

  return (
    <>
      {isInline ? (
        /* 内联模式（Social 顶栏已有关键词输入框）：不再重复显示搜索框，只留返回 + 关键词 */
        <div className="page-head">
          {onClose && (
            <button type="button" className="muted" style={{ fontSize: 13, background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginRight: 10 }} onClick={onClose}>← {t('back')}</button>
          )}
          <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>“{q}”</span>
        </div>
      ) : (
        <div className="page-head">
          <div className="searchbox grow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
            </svg>
            <input value={input} placeholder={t('searchPh')} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run()} />
          </div>
          <button className="btn btn-primary" onClick={run}>{t('search')}</button>
        </div>
      )}

      <div className="tabs">
        <button className={tab === 0 ? 'active' : ''} onClick={() => setTab(0)}>{t('posts')}</button>
        <button className={tab === 1 ? 'active' : ''} onClick={() => setTab(1)}>{t('users')}</button>
      </div>

      {!data ? null : tab === 0 ? (
        data.posts.length === 0
          ? <EmptyState title={t('noResult')} desc={t('tryOther')} />
          : data.posts.map((p) => (
            <article key={p.id} className="card post click">
              <div className="head">
                <Avatar name={p.author} />
                <div className="meta">
                  <div className="author">{p.author} <small>· {p.create_time}</small></div>
                </div>
              </div>
              <h3>{onOpenPost
                ? <a href="#" style={{ cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); onOpenPost(p.id) }}>{p.title}</a>
                : <Link to={`/post/${p.id}`}>{p.title}</Link>}</h3>
              <TagChips tags={p.tags} onPick={(tg) => navigate(`/tags/${encodeURIComponent(tg)}`)} />
              <p className="excerpt">{p.content}</p>
              <div className="foot">
                <span className="stat">{p.comment_count} {t('comments')}</span>
              </div>
            </article>
          ))
      ) : (
        data.users.length === 0
          ? <EmptyState title={t('noResult')} desc={t('tryOther')} />
          : data.users.map((u) => (
            <Link key={u.id} className="list-item" to={`/profile/${u.id}`}>
              <Avatar name={u.username} />
              <div className="main">
                <div className="title">{u.username}</div>
                <div className="desc">{u.bio || t('notSet')}</div>
              </div>
              <span className="tag">@ {u.username}</span>
            </Link>
          ))
      )}
    </>
  )
}
