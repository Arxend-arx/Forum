import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import { Avatar, EmptyState, SkeletonList } from '../components'
import Icon from '../components/Icon'

// 通知内容里的链接提取（如 /post/1、/friends/requests?req=ID、/chat）
function noticeLink(link) {
  if (!link) return null
  if (link.startsWith('/post/')) return link
  if (link.includes('chat')) return '/chat'
  if (link.startsWith('/friends/requests') && !/[?&]req=/.test(link)) return '/friends/requests'
  return link
}

// 好友请求消息：link 形如 /friends/requests?req=ID → 信件箱内可直接接受/拒绝
function friendReqId(link) {
  const m = (link || '').match(/[?&]req=(\d+)/)
  return m ? m[1] : null
}

export default function Messages() {
  const { t } = useTranslation()
  const { user, refreshUser } = useApp()
  const [list, setList] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = () => api.get('/messages').then(setList).catch(() => setList([]))

  useEffect(() => {
    load().then(() => refreshUser())
  }, [])

  /* 在信件箱内直接处理好友请求：接受/拒绝后刷新，并刷新顶部未读徽标 */
  const act = async (m, accept) => {
    const reqId = friendReqId(m.link)
    if (!reqId || busyId) return
    setBusyId(reqId)
    try {
      await api.post(`/friends/requests/${reqId}/${accept ? 'accept' : 'reject'}`)
      await load()
      refreshUser()
    } catch (e) {
      /* 失败时保留原消息，刷新一次以同步真实状态 */
      await load()
      refreshUser()
    } finally {
      setBusyId(null)
    }
  }

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
            const reqId = friendReqId(m.link)
            const to = reqId ? null : noticeLink(m.link)
            const body = (
              <div className="list-item" style={{ alignItems: 'center' }}>
                {m.sender_avatar
                  ? <Avatar name={m.sender_name || '?'} src={m.sender_avatar} />
                  : <span className="avatar" style={{ background: 'var(--surface-3)' }}><Icon name="chat" size={16} /></span>}
                <div className="main">
                  <div className="title">
                    {m.sender_name || t('systemNotice')}
                    <span className="muted" style={{ fontWeight: 400 }}> — {m.content}</span>
                  </div>
                  <div className="desc">{m.create_time}</div>
                </div>
                {/* 好友请求：信件箱内直接接受 / 拒绝 */}
                {reqId && (
                  <div className="row" style={{ gap: 8, flexShrink: 0 }}>
                    <button className="btn btn-primary btn-sm" disabled={busyId === reqId}
                      onClick={() => act(m, true)}>{t('accept')}</button>
                    <button className="btn btn-ghost btn-sm" disabled={busyId === reqId}
                      onClick={() => act(m, false)}>{t('reject')}</button>
                  </div>
                )}
              </div>
            )
            return to ? <Link key={m.id} to={to}>{body}</Link> : <div key={m.id}>{body}</div>
          })
        )}
      </div>
    </>
  )
}
