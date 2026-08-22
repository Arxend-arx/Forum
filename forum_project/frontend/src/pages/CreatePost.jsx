import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import { MarkdownEditor } from '../components'
import Icon from '../components/Icon'

export default function CreatePost({ onClose, onCreated }) {
  const { t } = useTranslation()
  const { toast } = useApp()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [category, setCategory] = useState('')
  const [hotTags, setHotTags] = useState([])

  useEffect(() => {
    api.get('/tags').then((d) => setHotTags((d || []).slice(0, 6).map((x) => x.name))).catch(() => {})
  }, [])

  const submit = async () => {
    if (!title.trim() || !content.trim()) {
      toast('error', t('titlePh'))
      return
    }
    setBusy(true)
    try {
      const d = await api.post('/posts', { title, content, category })
      toast('success', t('saved'))
      if (onCreated) { onCreated(d.id); return }   // 内联模式（Social 内）：由父组件收起编辑器并展开新帖
      navigate(`/post/${d.id}`)
    } catch (e) {
      toast('error', e.error || t('action.fail'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('newPost')}</h1>
          <div className="sub">{t('editorTip')}</div>
        </div>
      </div>

      <div className="form">
        <div className="form-group">
          <label>{t('titlePh')}</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('titlePh')} />
        </div>

        <div className="form-group">
          <label>r/ {t('category')}</label>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: 1, minWidth: 200 }} value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t('categoryPh')} />
            {hotTags.map((tg) => (
              <button key={tg} type="button"
                className={'btn btn-sm ' + (category === tg ? 'btn-primary' : 'btn-ghost')}
                onClick={() => setCategory(category === tg ? '' : tg)}>r/{tg}</button>
            ))}
          </div>
          <span className="hint mt-1"><Icon name="info" size={14} /> {t('tagHint')}</span>
        </div>

        <div className="form-group">
          <label>{t('contentPh')}</label>
          <MarkdownEditor value={content} onChange={setContent} placeholder={t('contentPh')} />
        </div>

        <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn-ghost" onClick={onClose || (() => navigate(-1))}>{t('cancel')}</button>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>
            {busy ? t('searching') : t('publish')}
          </button>
        </div>
      </div>
    </>
  )
}
