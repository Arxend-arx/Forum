import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import { Avatar, EmptyState, SkeletonList } from '../components'

// 通知内容里的链接提取（如 /post/1、/friends/requests、/chat）
function noticeLink(link) {
  if (!link) return null
  if (link.startsWith('/post/')) return link
  if (link.includes('friends')) return '/friends/requests'
  if (link.includes('chat')) return '/chat'
  return link
}

export default function Messages() {
  const { t } = useTranslation()
  const { user, refreshUser } = useApp()
  const [list, setList] = useState(null)

  useEffect(() => {
    api.get('/messages').then((d) => { setList(d); refreshUser() }).catch(() => setList([]))
  }, [])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('msgTitle')}</h1>
          <div className="sub">{t('markRead')}</div>
        </div>
      </div>

      <div className="card" style={{ padding: '8px 10px' }}>
        {!list ? <SkeletonList /> : list.length === 0 ? (
          <EmptyState title={t('emptyMsgs')} />
        ) : (
          list.map((m) => {
            const to = noticeLink(m.link)
            const body = (
              <div className="list-item">
                {m.sender_avatar
                  ? <Avatar name={m.sender_name || '?'} src={m.sender_avatar} />
                  : <span className="avatar" style={{ background: 'var(--surface-3)', fontSize: 16 }}>💬</span>}
                <div className="main">
                  <div className="title">
                    {m.sender_name || t('systemNotice')}
                    <span className="muted" style={{ fontWeight: 400 }}> — {m.content}</span>
                  </div>
                  <div className="desc">{m.create_time}</div>
                </div>
              </div>
            )
            return to ? <Link key={m.id} to={to}>{body}</Link> : <div key={m.id}>{body}</div>
          })
        )}
      </div>
    </>
  )
}
