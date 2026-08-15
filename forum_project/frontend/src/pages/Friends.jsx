import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import { Avatar, EmptyState, SkeletonList } from '../components'

export default function Friends() {
  const { t } = useTranslation()
  const { toast, refreshUser } = useApp()
  const [tab, setTab] = useState(0)
  const [data, setData] = useState(null)

  const load = () => api.get('/friends/requests').then(setData).catch(() => setData({ received: [], sent: [] }))
  useEffect(() => { load() }, [])

  const act = async (fn, okMsg) => {
    try {
      await fn()
      toast('success', okMsg)
      load(); refreshUser()
    } catch (e) {
      toast('error', e.error || t('action.fail'))
    }
  }

  if (!data) return <SkeletonList />
  const list = tab === 0 ? data.received : data.sent

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('friendsTitle')}</h1>
          <div className="sub">{data.received.length} {t('pending')}</div>
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 0 ? 'active' : ''} onClick={() => setTab(0)}>{t('received')}</button>
        <button className={tab === 1 ? 'active' : ''} onClick={() => setTab(1)}>{t('sent')}</button>
      </div>

      {list.length === 0
        ? <EmptyState title={t(tab === 0 ? 'emptyReceived' : 'emptySent')} />
        : list.map((r) => (
          <div key={r.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Avatar name={r.username} src={r.avatar} />
            <div className="grow">
              <div style={{ fontWeight: 700 }}>{r.username}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>{r.create_time}</div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              {tab === 0 ? (
                <>
                  <button className="btn btn-primary btn-sm"
                    onClick={() => act(() => api.post(`/friends/requests/${r.id}/accept`), t('saved'))}>{t('accept')}</button>
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => act(() => api.post(`/friends/requests/${r.id}/reject`), t('saved'))}>{t('reject')}</button>
                </>
              ) : (
                <span className="tag warn">{t('pending')}</span>
              )}
            </div>
          </div>
        ))}
    </>
  )
}
