import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'

export default function Register() {
  const { t, i18n } = useTranslation()
  const { toast, toggleLang, toggleTheme, theme } = useApp()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const isZh = i18n.language === 'zh'

  const submit = async () => {
    if (!username || !password) { toast('error', t('fieldRequired')); return }
    if (password !== confirm) { toast('error', t('pwdMismatch')); return }
    setBusy(true)
    try {
      await api.post('/auth/register', { username, password })
      toast('success', t('saved'))
      navigate('/login')
    } catch (e) {
      toast('error', e.error || t('action.fail'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-lang">
        <button onClick={toggleLang}>{isZh ? 'EN' : '中'}</button>
        <button onClick={toggleTheme}>{theme === 'dark' ? (isZh ? '浅色' : 'Light') : (isZh ? '深色' : 'Dark')}</button>
      </div>
      <div className="auth-card">
        <Link className="brand" to="/">
          <span className="logo">A</span><span className="name">{t('brand')}</span>
        </Link>
        <h1>{t('createAccount')}</h1>
        <p className="sub">{t('regSub')}</p>

        <div className="form">
          <div className="form-group">
            <label>{t('username')}</label>
            <input className="input" value={username} placeholder={t('usernamePh')}
              onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="form-group">
            <label>{t('password')}</label>
            <input className="input" type="password" value={password} placeholder={t('passwordPh')}
              onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="form-group">
            <label>{t('confirmPwd')}</label>
            <input className="input" type="password" value={confirm} placeholder={t('passwordPh')}
              onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </div>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={submit}>{t('register')}</button>
        </div>

        <p className="auth-alt">
          {t('hasAccount')} <Link to="/login">{t('loginNow')}</Link>
        </p>
      </div>
    </div>
  )
}
