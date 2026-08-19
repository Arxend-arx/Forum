import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import { Avatar, EmptyState, SkeletonList, Markdown, MarkdownEditor, useConfirm } from '../components'

export default function Admin() {
  const { t } = useTranslation()
  const { toast } = useApp()
  const [tab, setTab] = useState(0)
  const [confirm, setConfirm] = useConfirm()

  // 公告
  const [anns, setAnns] = useState(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  // 用户
  const [users, setUsers] = useState(null)
  const [q, setQ] = useState('')

  const loadAnns = () => api.get('/announcements').then(setAnns).catch(() => setAnns([]))
  const loadUsers = (kw) => api.get(`/admin/users${kw ? `?q=${encodeURIComponent(kw)}` : ''}`).then(setUsers).catch(() => setUsers([]))

  useEffect(() => { loadAnns() }, [])
  useEffect(() => { loadUsers() }, [])

  const publishAnn = async () => {
    try {
      await api.post('/announcements', { title, content })
      setTitle(''); setContent('')
      toast('success', t('saved'))
      loadAnns()
    } catch (e) {
      toast('error', e.error || t('action.fail'))
    }
  }

  const delAnn = async (id) => {
    try {
      await api.del(`/announcements/${id}`)
      toast('success', t('saved'))
      loadAnns()
    } catch (e) {
      toast('error', e.error || t('action.fail'))
    }
  }

  const setRole = async (uid, role) => {
    try {
      await api.post(`/admin/users/${uid}/role`, { role })
      toast('success', t('saved'))
      loadUsers(q)
    } catch (e) {
      toast('error', e.error || t('action.fail'))
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('adminPanel')}</h1>
          <div className="sub">★ {t('admin')}</div>
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 0 ? 'active' : ''} onClick={() => setTab(0)}>{t('announcements')}</button>
        <button className={tab === 1 ? 'active' : ''} onClick={() => setTab(1)}>{t('manageUsers')}</button>
      </div>

      {tab === 0 && (
        <>
          <div className="card form">
            <div className="form-group">
              <label>{t('announceTitle')}</label>
              <input className="input" value={title} placeholder={t('announceTitle')} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t('announceContent')}</label>
              <MarkdownEditor value={content} onChange={setContent} minHeight={120} placeholder={t('announceContent')} />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-primary btn-sm" onClick={publishAnn}>{t('publishAnnounce')}</button>
            </div>
          </div>

          {!anns
            ? <SkeletonList count={2} />
            : anns.length === 0
              ? <EmptyState title={t('noAnnouncements')} />
              : anns.map((a) => (
                <div key={a.id} className="card">
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div className="grow">
                      <div className="head" style={{ marginBottom: 6 }}>
                        <Avatar name={a.publisher_username || t('admin')} src={a.publisher_avatar} size={26} />
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
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirm({ title: t('deleteAnnounce'), text: a.title, okText: t('delete'), onOk: () => delAnn(a.id) })}>
                      🗑 {t('deleteAnnounce')}
                    </button>
                  </div>
                </div>
              ))}
        </>
      )}

      {tab === 1 && (
        <>
          <div className="card">
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input grow"
                value={q}
                placeholder={t('userSearchPh')}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadUsers(q)}
              />
              <button className="btn btn-ghost btn-sm" onClick={() => loadUsers(q)}>{t('search')}</button>
            </div>
          </div>

          {!users
            ? <SkeletonList count={3} />
            : users.length === 0
              ? <EmptyState title={t('noResult')} />
              : users.map((u) => (
                <div key={u.id} className="list-item">
                  <Avatar name={u.username} src={u.avatar} />
                  <div className="main">
                    <div className="title">
                      <Link to={`/profile/${u.id}`}>{u.username}</Link>
                      {u.role === 'admin' && <span className="tag warn" style={{ marginLeft: 8 }}>★ {t('adminBadge')}</span>}
                    </div>
                    <div className="desc">#{u.id} · {u.create_time}</div>
                  </div>
                  <button
                    className={`btn btn-sm ${u.role === 'admin' ? 'btn-ghost' : 'btn-primary'}`}
                    onClick={() => setRole(u.id, u.role === 'admin' ? 'user' : 'admin')}
                  >
                    {u.role === 'admin' ? t('removeAdmin') : t('setAdmin')}
                  </button>
                </div>
              ))}
        </>
      )}

      {confirm}
    </>
  )
}
