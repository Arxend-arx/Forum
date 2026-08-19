import React, { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import { Avatar, Markdown, MarkdownEditor, EmptyState, SkeletonList, useConfirm, TagChips } from '../components'

export default function PostDetail() {
  const { id } = useParams()
  const { t } = useTranslation()
  const { user, toast } = useApp()
  const navigate = useNavigate()
  const [post, setPost] = useState(null)
  const [err, setErr] = useState('')
  const [text, setText] = useState('')
  const [confirm, setConfirm] = useConfirm()

  useEffect(() => {
    setPost(null)
    setErr('')
    api.get(`/posts/${id}`).then(setPost).catch((e) => setErr(e.error || t('loadFailed')))
  }, [id])

  const submitComment = async () => {
    if (!text.trim()) return
    try {
      await api.post(`/posts/${id}/comments`, { content: text })
      setText('')
      toast('success', t('saved'))
      const updated = await api.get(`/posts/${id}`)
      setPost(updated)
    } catch (e) {
      toast('error', e.error || t('action.fail'))
    }
  }

  const doDelete = async () => {
    try {
      await api.del(`/posts/${id}`)
      toast('success', t('saved'))
      navigate('/')
    } catch (e) {
      toast('error', e.error || t('action.fail'))
    }
  }

  if (err) return <EmptyState title={err} desc={t('tryOther')} />
  if (!post) return <SkeletonList />

  return (
    <>
      <Link to="/" className="muted" style={{ fontSize: 13 }}>← {t('back')}</Link>

      <article className="card mt-2">
        <h1 style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.4, marginBottom: 12 }}>{post.title}</h1>
        <TagChips tags={post.tags} onPick={(tg) => navigate(`/?tag=${encodeURIComponent(tg)}`)} />
        <div className="head" style={{ marginBottom: 6 }}>
          <Link to={`/profile/${post.user_id}`}><Avatar name={post.author} src={post.author_avatar} /></Link>
          <div className="meta">
            <div className="author"><Link to={`/profile/${post.user_id}`}>{post.author}</Link></div>
            <div className="time">{post.create_time}</div>
          </div>
        </div>
        <div className="muted" style={{ fontSize: 12.5, display: 'flex', gap: 16, marginBottom: 8 }}>
          <span>{post.comment_count} {t('comments')}</span>
        </div>
        <div className="divider" />
        <Markdown text={post.content} />
        {(post.is_mine || (user && user.role === 'admin')) && (
          <div className="row mt-3">
            <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ title: t('deletePost'), text: t('confirmDelPost'), okText: t('delete'), onOk: doDelete })}>
              🗑 {t('deletePost')}
            </button>
          </div>
        )}
      </article>

      <div className="page-head mt-3">
        <div><h1 style={{ fontSize: 18 }}>{post.comment_count} {t('comments')}</h1></div>
      </div>

      <div className="card">
        {user ? (
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Avatar name={user.username} src={user.avatar} />
            <div className="grow">
              <MarkdownEditor value={text} onChange={setText} minHeight={80} placeholder={t('commentPh')} />
              <div className="row mt-2" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-primary btn-sm" onClick={submitComment}>{t('submitComment')}</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="center muted" style={{ padding: '8px 0' }}>
            <Link to="/login" style={{ color: 'var(--primary-2)' }}>{t('login')}</Link> {t('loginSub')}
          </div>
        )}
      </div>

      <div className="card" style={{ paddingTop: 6, paddingBottom: 6 }}>
        {post.comments.length === 0
          ? <EmptyState title={t('noComments')} />
          : post.comments.map((c) => (
            <div key={c.id} className="comment">
              <Avatar name={c.username} size={32} src={c.user_avatar} />
              <div className="body">
                <div className="c-meta">
                  <span className="c-author"><Link to={`/profile/${c.user_id}`}>{c.username}</Link></span>
                  <span className="c-time">{c.create_time}</span>
                </div>
                <div className="c-text"><Markdown text={c.content} /></div>
                {user && user.id === c.user_id && (
                  <div className="c-actions">
                    <span style={{ cursor: 'pointer', color: 'var(--danger)' }}
                      onClick={async () => {
                        try { await api.del(`/comments/${c.id}`); toast('success', t('saved')); setPost(await api.get(`/posts/${id}`)) }
                        catch (e) { toast('error', e.error) }
                      }}>{t('delete')}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
      </div>

      {confirm}
    </>
  )
}
