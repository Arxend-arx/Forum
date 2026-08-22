import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { Avatar, EmptyState, SkeletonList } from '../components'

/* 全部好友列表页：展示所有好友，支持一键进入私信。
   由 Layout 包裹，顶部保留五个大页面入口 + 中/英 + 明/暗 + 头像。 */
export default function FriendsList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [list, setList] = useState(null)

  useEffect(() => {
    api.get('/friends/list').then(setList).catch(() => setList([]))
  }, [])

  if (!list) return <SkeletonList count={6} />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('friendListTitle')}</h1>
          <div className="sub">{list.length} {t('friends')}</div>
        </div>
        <Link className="btn btn-ghost btn-sm" to="/friends/requests">{t('friendsTitle')}</Link>
      </div>

      {list.length === 0
        ? <EmptyState title={t('noFriend')} desc={t('noFriendDesc')} />
        : (
          <div className="card" style={{ padding: '6px 12px' }}>
            {list.map((f) => (
              <div key={f.id} className="list-item">
                <Link to={`/profile/${f.id}`}>
                  <Avatar name={f.username} src={f.avatar} />
                </Link>
                <div className="main">
                  <div className="title">
                    <Link to={`/profile/${f.id}`}>{f.username}</Link>
                    {f.is_online
                      ? <span className="tag success" style={{ marginLeft: 8, fontSize: 11 }}>● {t('online')}</span>
                      : <span className="tag" style={{ marginLeft: 8, fontSize: 11 }}>● {t('offline')}</span>}
                  </div>
                  {f.bio && <div className="desc">{f.bio.slice(0, 60)}</div>}
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => navigate(`/chat/${f.id}`)}>
                  💬 {t('chatBtn')}
                </button>
              </div>
            ))}
          </div>
        )}
    </>
  )
}
