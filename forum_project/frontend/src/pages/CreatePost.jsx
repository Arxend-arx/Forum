import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import { MarkdownEditor } from '../components'

export default function CreatePost() {
  const { t } = useTranslation()
  const { toast } = useApp()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!title.trim() || !content.trim()) {
      toast('error', t('titlePh'))
      return
    }
    setBusy(true)
    try {
      const d = await api.post('/posts', { title, content })
      toast('success', t('saved'))
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
          <label>{t('contentPh')}</label>
          <MarkdownEditor value={content} onChange={setContent} placeholder={t('contentPh')} />
          <span className="hint mt-1">💡 {t('tagHint')}</span>
        </div>

        <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => navigate(-1)}>{t('cancel')}</button>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>
            {busy ? t('searching') : t('publish')}
          </button>
        </div>
      </div>
    </>
  )
}
