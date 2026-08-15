import React, { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import { Avatar, EmptyState, SkeletonList, EmojiPicker } from '../components'

export default function ChatDetail() {
  const { userId } = useParams()
  const { t } = useTranslation()
  const { user, toast } = useApp()
  const [data, setData] = useState(null)
  const [text, setText] = useState('')
  const boxRef = useRef(null)
  const taRef = useRef(null)

  const load = () => api.get(`/chat/${userId}`).then(setData).catch(() => setData({ other: null, msgs: [] }))
  useEffect(() => {
    load()
    let es = null
    if (typeof EventSource !== 'undefined') {
      // SSE 实时推送：收到本会话新消息即刷新（服务端即时推送，不再轮询）
      es = new EventSource('/api/chat/stream')
      es.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data)
          if (evt.type === 'message' && (evt.sender_id === Number(userId) || evt.receiver_id === Number(userId))) {
            load()
          }
        } catch (_) { /* 忽略非 JSON 帧 */ }
      }
    }
    return () => { if (es) es.close() }
  }, [userId])
  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [data])

  const send = async () => {
    if (!text.trim()) return
    try {
      await api.post(`/chat/${userId}/send`, { content: text })
      setText('')
      load()
    } catch (e) {
      toast('error', e.error || t('action.fail'))
    }
  }

  const insertEmoji = (emoji) => {
    const ta = taRef.current
    if (!ta) return
    const s = ta.selectionStart ?? text.length
    const e = ta.selectionEnd ?? s
    setText(text.slice(0, s) + emoji + text.slice(e))
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + emoji.length, s + emoji.length) })
  }

  if (!data) return <SkeletonList />
  const meId = user && user.id

  return (
    <>
      <div className="page-head">
        <div className="row" style={{ gap: 12 }}>
          <Avatar name={(data.other && data.other.username) || '?'} src={data.other && data.other.avatar} />
          <div>
            <h1 style={{ fontSize: 19 }}>{data.other ? data.other.username : t('notSet')}</h1>
            <div className="sub" style={{ color: data.other && data.other.is_online ? 'var(--success)' : 'var(--text-3)' }}>
              ● {data.other && data.other.is_online ? t('online') : t('offline')}
            </div>
          </div>
        </div>
        <div className="actions">
          <Link className="btn btn-ghost btn-sm" to="/chat">← {t('back')}</Link>
        </div>
      </div>

      <div className="card msgs" ref={boxRef} style={{ maxHeight: '52vh', overflowY: 'auto' }}>
        {data.msgs.length === 0
          ? <EmptyState title={t('emptyChat')} />
          : data.msgs.map((m) => (
            <div key={m.id} className={`msg ${m.sender_id === meId ? 'mine' : ''}`}>
              <Avatar name={m.sender_name || '?'} size={32} src={m.sender_avatar} />
              <div className="bubble">{m.content}</div>
              <span className="time">{m.create_time}</span>
            </div>
          ))}
      </div>

      <div className="card mt-2" style={{ padding: 14 }}>
        <div className="row" style={{ alignItems: 'flex-end', gap: 10 }}>
          <Avatar name={(user && user.username) || '?'} size={34} />
          <div className="grow">
            <textarea ref={taRef} className="textarea" style={{ minHeight: 56 }} value={text}
              placeholder={t('typeMsg')} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())} />
            <div className="mt-1">
              <EmojiPicker className="up" onPick={insertEmoji} />
            </div>
          </div>
          <button className="btn btn-primary" onClick={send}>{t('send')}</button>
        </div>
      </div>
    </>
  )
}
