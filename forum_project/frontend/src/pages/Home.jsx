import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { PostCard, SkeletonList, EmptyState } from '../components'

export default function Home() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [posts, setPosts] = useState(null)
  const [err, setErr] = useState('')
  const [tagList, setTagList] = useState([])
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState('latest')
  const [tag, setTag] = useState(params.get('tag') || '')

  useEffect(() => { api.get('/tags').then(setTagList).catch(() => setTagList([])) }, [])

  useEffect(() => {
    let alive = true
    const q = tag ? `&tag=${encodeURIComponent(tag)}` : ''
    api.get(`/posts?sort=${sort}${q}`)
      .then((d) => alive && setPosts(d))
      .catch((e) => alive && setErr(e.error || t('loadFailed')))
    return () => { alive = false }
  }, [sort, tag])

  const pickTag = (name) => {
    const next = tag === name ? '' : name
    setTag(next)
    setParams(next ? { tag: next } : {}, { replace: true })
  }

  const search = () => {
    const k = keyword.trim()
    if (!k) return
    navigate(`/search?q=${encodeURIComponent(k)}`)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('latestPosts')}</h1>
          <div className="sub">{t('liveFeed')}</div>
        </div>
        <div className="actions">
          <Link className="btn btn-primary" to="/create">+ {t('newPost')}</Link>
        </div>
      </div>

      <div className="card filter-bar">
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div className="searchbox grow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
            </svg>
            <input value={keyword} placeholder={t('searchPh')} onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()} />
          </div>
          <div className="seg">
            <button className={sort === 'latest' ? 'on' : ''} onClick={() => setSort('latest')}>{t('sortLatest')}</button>
            <button className={sort === 'hot' ? 'on' : ''} onClick={() => setSort('hot')}>{t('sortHot')}</button>
          </div>
        </div>
        <div className="tag-row mt-2">
          <span className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{t('catFilter')}</span>
          <button className={`tag-chip ${tag === '' ? 'on' : ''}`} onClick={() => pickTag('')}>{t('allCats')}</button>
          {tagList.map((tg) => (
            <button key={tg.name} className={`tag-chip ${tag === tg.name ? 'on' : ''}`} onClick={() => pickTag(tg.name)}>
              #{tg.name} <small>{tg.count}</small>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {err
            ? <EmptyState title={err} />
            : !posts
              ? <SkeletonList />
              : posts.length === 0
                ? <EmptyState title={t('noPosts')} desc={t('tryOther')} />
                : posts.map((p) => <PostCard key={p.id} post={p} />)}
        </div>

        <aside className="rail" style={{ margin: 0 }}>
          <div className="rail-card">
            <h4>{t('match')}</h4>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>{t('matchSub')}</p>
            <Link className="btn btn-primary btn-sm mt-2" to="/match">{t('runSearch')}</Link>
          </div>
          <div className="rail-card">
            <h4>{t('chatTitle')}</h4>
            <Link className="btn btn-ghost btn-sm" to="/chat">{t('chatTitle')}</Link>
          </div>
          <div className="rail-card">
            <h4>{t('friends')}</h4>
            <Link className="btn btn-ghost btn-sm" to="/friends/requests">{t('friendsTitle')}</Link>
          </div>
        </aside>
      </div>
    </>
  )
}
