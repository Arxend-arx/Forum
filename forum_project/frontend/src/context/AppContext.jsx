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
  /* 默认深色。仅当用户曾**主动切到 light** 时才用 light（用独立 key 标记，避免旧 light 残留污染） */
  const [theme, setTheme] = useState(
    localStorage.getItem('acad-theme-set') ? (localStorage.getItem('acad-theme') || 'dark') : 'dark'
  )

  // 主题应用
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('acad-theme', theme)
    localStorage.setItem('acad-theme-set', '1')   // 标记：用户已主动表态
  }, [theme])

  // 启动时恢复登录态
  useEffect(() => {
    api.get('/auth/me')
      .then((u) => { setUser(u) })
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true))
  }, [])

  // 准实时刷新用户信息（角色/未读数等）：每 30s 一次 + 窗口聚焦时立即刷新，
  // 保证"被授予管理员"等变更在合理时间内生效（无需手动刷新页面）
  useEffect(() => {
    if (!authReady) return
    const refresh = () => {
      api.get('/auth/me')
        .then(setUser)
        .catch(() => { /* 未登录 */ })
    }
    const id = setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', refresh)
    }
  }, [authReady])

  // 全局 SSE：管理员设置角色后服务端实时推送 role_changed，前端立即刷新用户信息
  useEffect(() => {
    if (!authReady || !user) return
    if (typeof EventSource === 'undefined') return
    let es
    try {
      es = new EventSource('/api/chat/stream')
      es.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data)
          if (d && d.type === 'role_changed') {
            api.get('/auth/me').then(setUser).catch(() => {})
          }
        } catch (e) { /* 忽略非 JSON/无关事件 */ }
      }
    } catch (e) { /* SSE 不可用时降级为轮询 */ }
    return () => { if (es) es.close() }
  }, [authReady, user && user.id])

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
