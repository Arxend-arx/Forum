import React, { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import { Avatar, EmptyState, SkeletonList } from '../components'

export default function Profile() {
  const { id } = useParams()
  const { t } = useTranslation()
  const { user, toast, refreshUser, logout } = useApp()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState(0)

  useEffect(() => {
    setData(null)
    setErr('')
    api.get(`/users/${id}`).then(setData).catch((e) => setErr(e.error || t('loadFailed')))
  }, [id])

  const toggleFollow = async () => {
    try {
      if (data.is_following) {
        await api.del(`/users/${id}/follow`)
      } else {
        await api.post(`/users/${id}/follow`)
      }
      toast('success', t('saved'))
      setData(await api.get(`/users/${id}`))
    } catch (e) {
      toast('error', e.error || t('action.fail'))
    }
  }

  const sendFriendReq = async () => {
    try {
      await api.post('/friends/requests', { user_id: Number(id) })
      toast('success', t('saved'))
      setData(await api.get(`/users/${id}`))
    } catch (e) {
      toast('error', e.error || t('action.fail'))
    }
  }

  if (err) return <EmptyState title={err} />
  if (!data) return <SkeletonList />

  const p = data.user
  const isMe = data.is_me

  return (
    <>
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-start', gap: 18 }}>
          <Avatar name={p.username} size={56} className="lg" src={p.avatar} />
          <div className="grow">
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>
              {p.username}
              {!isMe && (p.is_online
                ? <span className="tag success" style={{ marginLeft: 8 }}>● {t('online')}</span>
                : <span className="tag" style={{ marginLeft: 8 }}>● {t('offline')}</span>)}
            </h1>
            <div className="muted mt-1" style={{ fontSize: 13 }}>{t('joined')} {p.create_time}</div>
            {p.bio && <p className="mt-2" style={{ fontSize: 14, color: 'var(--text-2)' }}>{p.bio}</p>}
            {p.learning_interest && (
              <div className="row mt-2 wrap" style={{ gap: 6 }}>
                {p.learning_interest.split(/[,，、\s]+/).filter(Boolean).map((x) => <span key={x} className="chip">#{x}</span>)}
              </div>
            )}
          </div>
          <div className="row" style={{ gap: 10 }}>
            {isMe ? (
              <>
                <Link className="btn btn-ghost btn-sm" to="/profile/edit">{t('editBtn')}</Link>
                <button className="btn btn-ghost btn-sm" onClick={async () => {
                  await logout()
                  toast('success', t('saved'))
                  navigate('/')
                }}>{t('logout')}</button>
              </>
            ) : user ? (
              <>
                <button className="btn btn-primary btn-sm" onClick={toggleFollow}>
                  {data.is_following ? t('unfollowBtn') : t('followBtn')}
                </button>
                {data.friend_status === 'none' && (
                  <button className="btn btn-ghost btn-sm" onClick={sendFriendReq}>{t('addFriend')}</button>
                )}
                {data.friend_status === 'pending_sent' && <span className="tag warn">{t('friendSent')}</span>}
                {data.friend_status === 'pending_received' && <span className="tag">{t('friendReceived')}</span>}
              </>
            ) : (
              <Link className="btn btn-primary btn-sm" to="/login">{t('login')}</Link>
            )}
          </div>
        </div>
        <div className="divider" />
        <div className="stats">
          <div><div className="num">{data.post_count}</div><div className="lbl">{t('postCount')}</div></div>
          <div><div className="num">{data.follower_count}</div><div className="lbl">{t('follower')}</div></div>
          <div><div className="num">{data.following_count}</div><div className="lbl">{t('following')}</div></div>
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 0 ? 'active' : ''} onClick={() => setTab(0)}>{t('recentPosts')}</button>
        <button className={tab === 1 ? 'active' : ''} onClick={() => setTab(1)}>{t('follower')}</button>
        <button className={tab === 2 ? 'active' : ''} onClick={() => setTab(2)}>{t('following')}</button>
      </div>

      {tab === 0 && (
        data.posts.length === 0
          ? <EmptyState title={t('noPosts')} />
          : (
            <div className="card" style={{ padding: '8px 12px' }}>
              {data.posts.map((pst) => (
                <Link key={pst.id} className="list-item" to={`/post/${pst.id}`}>
                  <div className="main">
                    <div className="title" style={{ fontSize: 14.5 }}>{pst.title}</div>
                    <div className="desc">{pst.create_time}</div>
                  </div>
                  <div className="right" style={{ color: 'var(--primary-2)' }}>→</div>
                </Link>
              ))}
            </div>
          )
      )}
      {(tab === 1 || tab === 2) && (
        (tab === 1 ? data.follower_list : data.following_list).length === 0
          ? <EmptyState title={t('notSet')} />
          : (tab === 1 ? data.follower_list : data.following_list).map((u) => (
            <Link key={u.id} className="list-item" to={`/profile/${u.id}`}>
              <Avatar name={u.username} src={u.avatar} />
              <div className="main"><div className="title">{u.username}</div></div>
            </Link>
          ))
      )}
    </>
  )
}
