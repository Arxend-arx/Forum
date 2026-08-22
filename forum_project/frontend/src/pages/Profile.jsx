import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import { Avatar, EmptyState, SkeletonList, Flag } from '../components'
import TopNav from '../components/TopNav'
import StarJar from '../components/StarJar'
import Icon from '../components/Icon'
import { countryName } from '../constants/countries'

export default function Profile() {
  const { id } = useParams()
  const { t, i18n } = useTranslation()
  const { user, toast, refreshUser, logout } = useApp()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState(0)
  /* 学术邮箱绑定 */
  const [emailInput, setEmailInput] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [bindBusy, setBindBusy] = useState(false)
  /* 论文发布（DOI） */
  const [doiInput, setDoiInput] = useState('')
  const [doiBusy, setDoiBusy] = useState(false)

  /* 集星瓶成就：后端按动作记录（register+1 / first_post+1 / first_follower+1 / email+2 / first_article+3） */
  const ACH_LABELS = {
    register: 'starRegister',
    first_post: 'starFirstPost',
    first_follower: 'starFirstFollower',
    email: 'starEmail',
    first_article: 'starFirstArticle',
  }
  /* 注意：Hooks 必须在任何条件 return 之前调用，否则渲染 hook 数量变化会白屏 */
  const starLabels = useMemo(() => {
    const arr = []
    /* 一次性成就（注册/邮箱/论文） */
    ;(data?.achievements || []).forEach((a) => {
      const key = ACH_LABELS[a.type] || 'starRegister'
      for (let k = 0; k < (a.star || 1); k++) arr.push({ label: t(key) })
    })
    /* 发帖每次 +1 星、被关注每次 +1 星 */
    for (let k = 0; k < (data?.post_count || 0); k++) arr.push({ label: t('starPost') })
    for (let k = 0; k < (data?.follower_count || 0); k++) arr.push({ label: t('starFollow') })
    return arr
  }, [data, t])

  useEffect(() => {
    setData(null)
    setErr('')
    api.get(`/users/${id}`).then(setData).catch((e) => setErr(e.error || t('loadFailed')))
  }, [id])

  const reload = () => api.get(`/users/${id}`).then(setData).catch(() => {})

  /* 申请绑定学术邮箱：后端发 6 位验证码 */
  const sendCode = async () => {
    if (!emailInput.trim()) { toast('error', t('emailPh')); return }
    setBindBusy(true)
    try {
      await api.post('/email/bind', { email: emailInput.trim() })
      setCodeSent(true)
      toast('success', t('sendCode'))
    } catch (e) {
      toast('error', e.error || t('action.fail'))
    } finally {
      setBindBusy(false)
    }
  }

  /* 输入验证码完成绑定 */
  const verifyCode = async () => {
    setBindBusy(true)
    try {
      await api.post('/email/verify', { email: emailInput.trim(), code: codeInput.trim() })
      toast('success', t('saved'))
      await reload()
    } catch (e) {
      toast('error', e.error || t('action.fail'))
    } finally {
      setBindBusy(false)
    }
  }

  /* 按 DOI 发布论文（OpenAlex 校验作者邮箱） */
  const publishArticle = async () => {
    if (!doiInput.trim()) { toast('error', t('doiPh')); return }
    setDoiBusy(true)
    try {
      await api.post('/articles/publish', { doi: doiInput.trim() })
      setDoiInput('')
      toast('success', t('saved'))
      await reload()
    } catch (e) {
      toast('error', e.error || t('action.fail'))
    } finally {
      setDoiBusy(false)
    }
  }

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

  /* 返回上一级（回到来源页）；直接打开时回退到帖子流 */
  const goBack = () => {
    if (window.history.length > 1) { navigate(-1); return }
    navigate('/social')
  }

  return (
    <>
      {/* 顶部大页面入口：Home / Starlink / Polestars / Profile（所有页面保留） */}
      <TopNav />
      <div style={{ padding: '18px clamp(16px, 4vw, 44px) 40px', maxWidth: 900, margin: '0 auto' }}>
        <button type="button" className="muted" style={{ fontSize: 13, background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginBottom: 12 }} onClick={goBack}>← {t('back')}</button>

      <div className="card">
        <div className="row" style={{ alignItems: 'flex-start', gap: 18 }}>
          <Avatar name={p.username} size={56} className="lg" src={p.avatar} />
          <div className="grow">
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>
              {p.username}
              {p.role === 'admin' && <span className="tag warn" style={{ marginLeft: 8 }}><Icon name="star" size={11} /> {t('adminBadge')}</span>}
              {!isMe && (p.is_online
                ? <span className="tag success" style={{ marginLeft: 8 }}>● {t('online')}</span>
                : <span className="tag" style={{ marginLeft: 8 }}>● {t('offline')}</span>)}
            </h1>
            <div className="muted mt-1" style={{ fontSize: 13 }}>{t('joined')} {p.create_time}</div>
            {p.nationality && (
              <div className="muted" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Flag code={p.nationality} size={15} /> {countryName(p.nationality, i18n.language)}
              </div>
            )}
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

      {/* 集星瓶 · 成长记录站（资料卡下方） */}
      <StarJar userId={id} count={starLabels.length} labels={starLabels} />

      <div className="tabs">
        <button className={tab === 0 ? 'active' : ''} onClick={() => setTab(0)}>{t('articles')}</button>
        <button className={tab === 1 ? 'active' : ''} onClick={() => setTab(1)}>{t('recentPosts')}</button>
        <button className={tab === 2 ? 'active' : ''} onClick={() => setTab(2)}>{t('follower')}</button>
        <button className={tab === 3 ? 'active' : ''} onClick={() => setTab(3)}>{t('following')}</button>
      </div>

      {/* Articles：学术论文（需先绑定学术邮箱；发布入口在最后一篇下方） */}
      {tab === 0 && (
        <>
          {isMe && !data.has_academic_email && (
            <div className="card" style={{ padding: 16, marginBottom: 12 }}>
              <h4>{t('bindEmailTitle')}</h4>
              <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 10px' }}>{t('bindEmailDesc')}</p>
              <div className="row" style={{ gap: 8 }}>
                <input className="input" value={emailInput} placeholder={t('emailPh')}
                  onChange={(e) => setEmailInput(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
                <button className="btn btn-primary" disabled={bindBusy} onClick={sendCode}>
                  {bindBusy ? t('checking') : t('sendCode')}
                </button>
              </div>
              {codeSent && (
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <input className="input" value={codeInput} placeholder={t('codePh')}
                    onChange={(e) => setCodeInput(e.target.value)} style={{ maxWidth: 180 }} />
                  <button className="btn btn-ghost" disabled={bindBusy} onClick={verifyCode}>{t('verifyBind')}</button>
                </div>
              )}
            </div>
          )}

          {isMe && data.has_academic_email && (
            <div className="muted" style={{ fontSize: 12.5, margin: '0 2px 8px' }}>
              ✓ {t('emailBound')}: <b>{p.academic_email}</b>
            </div>
          )}

          <div className="card" style={{ padding: '8px 12px' }}>
            {data.articles.length === 0 ? (
              <div className="muted" style={{ fontSize: 13, padding: 10 }}>{t('noArticles')}</div>
            ) : data.articles.map((a) => (
              <div key={a.id} className="list-item" style={{ display: 'block' }}>
                <div className="title" style={{ fontSize: 14.5 }}>{a.title}</div>
                <div className="desc" style={{ fontSize: 12.5 }}>
                  {a.authors}{a.venue ? ' · ' + a.venue : ''}{a.year ? ' (' + a.year + ')' : ''}
                  <span style={{ marginLeft: 8 }}>DOI: {a.doi}</span>
                </div>
              </div>
            ))}
            {/* 发布论文入口：最后一篇文章的最下方（仅本人且已绑定邮箱） */}
            {isMe && data.has_academic_email && (
              <>
                <div className="divider" style={{ margin: '8px 0 0' }} />
                <div style={{ padding: '10px 2px 2px' }}>
                  <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>{t('publishArticle')}</div>
                  <div className="row" style={{ gap: 8 }}>
                    <input className="input" value={doiInput} placeholder={t('doiPh')}
                      onChange={(e) => setDoiInput(e.target.value)} style={{ flex: 1, minWidth: 200 }}
                      onKeyDown={(e) => e.key === 'Enter' && publishArticle()} />
                    <button className="btn btn-primary" disabled={doiBusy} onClick={publishArticle}>
                      {doiBusy ? t('checking') : t('publish')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {tab === 1 && (
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
      {(tab === 2 || tab === 3) && (
        (tab === 2 ? data.follower_list : data.following_list).length === 0
          ? <EmptyState title={t('notSet')} />
          : (tab === 2 ? data.follower_list : data.following_list).map((u) => (
            <Link key={u.id} className="list-item" to={`/profile/${u.id}`}>
              <Avatar name={u.username} src={u.avatar} />
              <div className="main"><div className="title">{u.username}</div></div>
            </Link>
          ))
      )}
      </div>
    </>
  )
}
