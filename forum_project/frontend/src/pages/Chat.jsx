import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import { Avatar, EmptyState, SkeletonList } from '../components'

export default function Chat() {
  const { t } = useTranslation()
  const { user } = useApp()
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    const load = () => api.get('/chat')
      .then((d) => alive && setData(d))
      .catch(() => alive && setData({ friends: [], convos: [] }))
    load()
    let es = null
    if (typeof EventSource !== 'undefined') {
      // SSE 实时推送：有新私信即时刷新会话列表与未读数（不再轮询）
      es = new EventSource('/api/chat/stream')
      es.onmessage = () => load()
    }
    return () => { alive = false; if (es) es.close() }
  }, [])

  if (!data) return <SkeletonList count={2} />
  const meId = user && user.id

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('chatTitle')}</h1>
          <div className="sub">{data.friends.length} {t('friends')} · {data.convos.length} {t('recent')}</div>
        </div>
        <div className="actions">
          <Link className="btn btn-ghost btn-sm" to="/friends/requests">{t('friendsTitle')}</Link>
        </div>
      </div>

      <div className="card" style={{ padding: '8px 10px' }}>
        {data.convos.length === 0 && <EmptyState title={t('emptyChat')} />}
        {data.convos.map((c) => (
          <Link key={c.other_id} className="list-item" to={`/chat/${c.other_id}`}>
            <Avatar name={c.other_name} src={c.other_avatar} />
            <div className="main">
              <div className="title">{c.other_name}</div>
              <div className="desc">{c.mine ? '— ' : ''}{c.content}</div>
            </div>
            <div className="right">
              <div>{c.time}</div>
              {c.unread > 0 && <div><span className="badge" style={{ background: 'var(--primary)' }}>{c.unread}</span></div>}
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}
