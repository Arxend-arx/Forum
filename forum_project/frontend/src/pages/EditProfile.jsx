import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'

export default function EditProfile() {
  const { t } = useTranslation()
  const { user, toast, refreshUser } = useApp()
  const navigate = useNavigate()
  const [avatar, setAvatar] = useState('')
  const [bio, setBio] = useState('')
  const [interest, setInterest] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    if (user) {
      setAvatar(user.avatar || '')
      setBio(user.bio || '')
      setInterest(user.learning_interest || '')
    }
  }, [user])

  const uploadAvatar = async (file) => {
    if (!file) return
    if (!/^image\//.test(file.type)) {
      toast('error', t('avatarTypeErr'))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast('error', t('avatarSizeErr'))
      return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const d = await api.upload('/upload', fd)
      setAvatar(d.url)
      toast('success', t('uploaded'))
    } catch (e) {
      toast('error', e.error || t('action.fail'))
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    try {
      await api.put('/users/me', { avatar, bio, learning_interest: interest })
      await refreshUser()
      toast('success', t('cfgSaved'))
      if (user) navigate(`/profile/${user.id}`)
    } catch (e) {
      toast('error', e.error || t('action.fail'))
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('editProfile')}</h1>
          <div className="sub">@ {user && user.username}</div>
        </div>
      </div>

      <div className="card form">
        <div className="row" style={{ gap: 18, alignItems: 'flex-start' }}>
          <div className="ava-preview" style={{ position: 'relative', flexShrink: 0 }}>
            {avatar
              ? <img className="avatar img" src={avatar} alt="avatar" style={{ width: 56, height: 56, borderRadius: 16, objectFit: 'cover' }} />
              : <span className="avatar lg" style={{ width: 56, height: 56, fontSize: 20, borderRadius: 16 }}>{user && user.username ? user.username.charAt(0) : '?'}</span>}
          </div>
          <div className="form-group grow">
            <label>{t('avatarLabel')}</label>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}>
                {busy ? t('uploading') : '📁 ' + t('chooseImage')}
              </button>
              {avatar && (
                <button className="btn btn-ghost btn-sm" onClick={() => setAvatar('')}>{t('removeAvatar')}</button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => { uploadAvatar(e.target.files && e.target.files[0]); e.target.value = '' }}
              />
            </div>
            <span className="hint">{t('avatarHint')}</span>
            <input
              className="input mt-1"
              value={avatar}
              placeholder={t('avatarPh')}
              onChange={(e) => setAvatar(e.target.value)}
            />
          </div>
        </div>
        <div className="form-group">
          <label>{t('bioLabel')}</label>
          <input className="input" value={bio} placeholder={t('bioPh')} onChange={(e) => setBio(e.target.value)} />
        </div>
        <div className="form-group">
          <label>{t('interestLabel')}</label>
          <input className="input" value={interest} placeholder={t('interestPh')} onChange={(e) => setInterest(e.target.value)} />
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => navigate(-1)}>{t('cancel')}</button>
          <button className="btn btn-primary" onClick={save}>{t('saveProfile')}</button>
        </div>
      </div>
    </>
  )
}
