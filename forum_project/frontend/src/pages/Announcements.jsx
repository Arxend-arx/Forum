import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { Avatar, Markdown, EmptyState, SkeletonList } from '../components'

export default function Announcements() {
  const { t } = useTranslation()
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get('/announcements').then(setList).catch((e) => setErr(e.error || t('loadFailed')))
  }, [])

  if (err) return <EmptyState title={err} />
  if (!list) return <SkeletonList count={3} />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>📢 {t('announcements')}</h1>
          <div className="sub">{list.length} {t('resultCount')}</div>
        </div>
        <div className="actions">
          <Link className="btn btn-ghost btn-sm" to="/">← {t('back')}</Link>
        </div>
      </div>

      {list.length === 0
        ? <EmptyState title={t('noAnnouncements')} />
        : list.map((a) => (
          <div key={a.id} className="card">
            <div className="head" style={{ marginBottom: 6 }}>
              <Avatar name={a.publisher_username || t('admin')} src={a.publisher_avatar} />
              <div className="meta">
                <div className="author">
                  {a.publisher_username || t('admin')}
                  {a.publisher_role === 'admin' && <span className="tag warn" style={{ marginLeft: 8 }}>★ {t('adminBadge')}</span>}
                </div>
                <div className="time">{a.create_time}</div>
              </div>
            </div>
            <div className="card-title">📢 {a.title}</div>
            <Markdown text={a.content} />
          </div>
        ))}
    </>
  )
}
