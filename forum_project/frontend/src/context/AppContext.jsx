import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'

const AppCtx = createContext(null)

let toastSeq = 0

export function AppProvider({ children }) {
  const { i18n } = useTranslation()
  const [user, setUser] = useState(null)      // null=未登录, {…}=已登录
  const [authReady, setAuthReady] = useState(false)
  const [toasts, setToasts] = useState([])
  const [theme, setTheme] = useState(localStorage.getItem('acad-theme') || 'dark')

  // 主题应用
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('acad-theme', theme)
  }, [theme])

  // 启动时恢复登录态
  useEffect(() => {
    api.get('/auth/me')
      .then((u) => { setUser(u) })
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true))
  }, [])

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  const toggleLang = useCallback(() => {
    const next = i18n.language === 'zh' ? 'en' : 'zh'
    i18n.changeLanguage(next)
    localStorage.setItem('acad-lang', next)
    document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en'
  }, [i18n])

  const toast = useCallback((type, msg) => {
    const id = ++toastSeq
    setToasts((list) => [...list, { id, type, msg }])
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 2800)
  }, [])

  const login = useCallback(async (username, password) => {
    const u = await api.post('/auth/login', { username, password })
    setUser(u)
    return u
  }, [])

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout') } catch (e) { /* ignore */ }
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const u = await api.get('/auth/me')
      setUser(u)
    } catch (e) { /* 未登录 */ }
  }, [])

  return (
    <AppCtx.Provider value={{ user, authReady, theme, toggleTheme, toggleLang, toast, login, logout, refreshUser }}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span className="tc">{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}</span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </AppCtx.Provider>
  )
}

export function useApp() {
  return useContext(AppCtx)
}
