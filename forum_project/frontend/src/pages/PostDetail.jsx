import React, { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import { Avatar, Markdown, MarkdownEditor, EmptyState, SkeletonList, useConfirm, TagChips } from '../components'
import Icon from '../components/Icon'

export default function PostDetail({ id: propId, onClose }) {
  const { id: paramId } = useParams()
  const id = paramId || propId              // 内联模式（Social 内显示）时用 prop 传入 id
  const { t } = useTranslation()
  const { user, toast } = useApp()
  const navigate = useNavigate()
  const [post, setPost] = useState(null)
  const [err, setErr] = useState('')
  const [text, setText] = useState('')
  const [sort, setSort] = useState('latest')
  const [confirm, setConfirm] = useConfirm()

  useEffect(() => {
    setPost(null)
    setErr('')
    api.get(`/posts/${id}?sort=${sort}`).then(setPost).catch((e) => setErr(e.error || t('loadFailed')))
  }, [id, sort])

  /* 评论真实投票（与帖子投票一致的交互：再点一次取消） */
  const voteComment = async (c, value) => {
    if (!user) {
      toast('error', t('loginSub'))
      navigate('/login')
      return
    }
    const next = c.my_vote === value ? 0 : value
    const before = { score: c.score, my_vote: c.my_vote }
    setPost((p) => p && ({
      ...p,
      comments: p.comments.map((x) =>
        x.id === c.id ? { ...x, my_vote: next, score: (x.score || 0) - (before.my_vote || 0) + next } : x),
    }))
    try {
      const d = await api.post(`/comments/${c.id}/vote`, { value: next })
      setPost((p) => p && ({
        ...p,
        comments: p.comments.map((x) => x.id === c.id ? { ...x, score: d.score, my_vote: d.my_vote } : x),
      }))
    } catch (e) {
      toast('error', e.error || t('action.fail'))
      setPost((p) => p && ({
        ...p,
        comments: p.comments.map((x) => x.id === c.id ? { ...x, ...before } : x),
      }))
    }
  }

  const submitComment = async () => {
    if (!text.trim()) return
    try {
      await api.post(`/posts/${id}/comments`, { content: text })
      setText('')
      toast('success', t('saved'))
      const updated = await api.get(`/posts/${id}?sort=${sort}`)
      setPost(updated)
    } catch (e) {
      toast('error', e.error || t('action.fail'))
    }
  }

  const doDelete = async () => {
    try {
      await api.del(`/posts/${id}`)
      toast('success', t('saved'))
      if (onClose) onClose()
      else navigate('/landing')
    } catch (e) {
      toast('error', e.error || t('action.fail'))
    }
  }

  if (err) return <EmptyState title={err} desc={t('tryOther')} />
  if (!post) return <SkeletonList />

  /* 返回上一级（回到来源页）；直接打开时回退到帖子流 */
  const goBack = () => {
    if (window.history.length > 1) { navigate(-1); return }
    navigate('/social')
  }

  return (
    <>
      <button type="button" className="muted" style={{ fontSize: 13, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} onClick={onClose || goBack}>← {t('back')}</button>

      <article className="card mt-2">
        <h1 style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.4, marginBottom: 12 }}>{post.title}</h1>
        <TagChips tags={post.tags} onPick={(tg) => navigate(`/tags/${encodeURIComponent(tg)}`)} />
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
              <Icon name="trash" size={15} /> {t('deletePost')}
            </button>
          </div>
        )}
      </article>

      <div className="page-head mt-3">
        <div><h1 style={{ fontSize: 18 }}>{post.comment_count} {t('comments')}</h1></div>
        <div className="seg" style={{ height: 30 }}>
          <button className={sort === 'hot' ? 'on' : ''} onClick={() => setSort('hot')}><Icon name="flame" size={14} /> {t('sortHot')}</button>
          <button className={sort === 'latest' ? 'on' : ''} onClick={() => setSort('latest')}>{t('sortLatest')}</button>
        </div>
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
              <div className="c-vote">
                <button type="button" className={'rd-vb' + (c.my_vote === 1 ? ' on up' : '')}
                  aria-label="up" onClick={() => voteComment(c, 1)}>▲</button>
                <span className="rd-score">{c.score ?? 0}</span>
                <button type="button" className={'rd-vb' + (c.my_vote === -1 ? ' on down' : '')}
                  aria-label="down" onClick={() => voteComment(c, -1)}>▼</button>
              </div>
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
                        try { await api.del(`/comments/${c.id}`); toast('success', t('saved')); setPost(await api.get(`/posts/${id}?sort=${sort}`)) }
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
