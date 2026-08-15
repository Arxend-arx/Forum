import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useApp } from '../context/AppContext'

export default function Login() {
  const { t, i18n } = useTranslation()
  const { login, toast, toggleLang, toggleTheme, theme } = useApp()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const isZh = i18n.language === 'zh'

  const submit = async () => {
    if (!username || !password) { toast('error', t('fieldRequired')); return }
    setBusy(true)
    try {
      await login(username, password)
      toast('success', t('welcomeBack'))
      navigate('/')
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
        <h1>{t('welcomeBack')}</h1>
        <p className="sub">{t('loginSub')}</p>

        <div className="form">
          <div className="form-group">
            <label>{t('username')}</label>
            <input className="input" value={username} placeholder={t('usernamePh')}
              onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="form-group">
            <label>{t('password')}</label>
            <input className="input" type="password" value={password} placeholder={t('passwordPh')}
              onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </div>
          <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={submit}>{t('login')}</button>
        </div>

        <p className="auth-alt">
          {t('noAccount')} <Link to="/register">{t('registerNow')}</Link>
        </p>
      </div>
    </div>
  )
}
