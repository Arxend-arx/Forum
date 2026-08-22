import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { PostCard, SkeletonList, EmptyState } from '../components'

export default function TagPosts() {
  const { t } = useTranslation()
  const { tag } = useParams()
  const [posts, setPosts] = useState(null)
  const [err, setErr] = useState('')
  const [sort, setSort] = useState('latest')

  useEffect(() => {
    let alive = true
    api.get(`/posts?sort=${sort}&tag=${encodeURIComponent(tag)}`)
      .then((d) => alive && setPosts(d))
      .catch((e) => alive && setErr(e.error || t('loadFailed')))
    return () => { alive = false }
  }, [tag, sort])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>#{tag}</h1>
          <div className="sub">{t('tagPostsSub')}</div>
        </div>
        <div className="actions">
          <div className="seg">
            <button className={sort === 'latest' ? 'on' : ''} onClick={() => setSort('latest')}>{t('sortLatest')}</button>
            <button className={sort === 'hot' ? 'on' : ''} onClick={() => setSort('hot')}>{t('sortHot')}</button>
          </div>
        </div>
      </div>

      {err
        ? <EmptyState title={err} />
        : !posts
          ? <SkeletonList />
          : posts.length === 0
            ? <EmptyState title={t('noPosts')} desc={t('tryOther')} />
            : posts.map((p) => <PostCard key={p.id} post={p} />)}

      <div style={{ marginTop: 20, textAlign: 'center' }}>
        <Link className="btn btn-ghost" to="/">← {t('landingHome')}</Link>
      </div>
    </>
  )
}
