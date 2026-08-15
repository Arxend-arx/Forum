import React from 'react'
import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useApp } from '../context/AppContext'
import { Avatar } from './index'

const NAV = [
  { key: 'home', to: '/', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { key: 'create', to: '/create', icon: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z', needAuth: true },
  { key: 'match', to: '/match', icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z', needAuth: true },
  { key: 'chat', to: '/chat', icon: 'M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.4-.7L3 21l1.8-5.6A8.4 8.4 0 1 1 21 11.5z', needAuth: true },
  { key: 'messages', to: '/messages', icon: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0', needAuth: true },
]
const PROFILE_ICON = 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'

export function Sidebar() {
  const { t, i18n } = useTranslation()
  const { user, theme, toggleLang, toggleTheme } = useApp()
  const navigate = useNavigate()
  const isZh = i18n.language === 'zh'
  const profileTo = user ? `/profile/${user.id}` : '/login'

  return (
    <aside className="sidebar">
      <Link className="brand" to="/">
        <span className="logo">A</span>
        <span className="name">{t('brand')}</span>
      </Link>
      <nav className="nav">
        {NAV.map(({ key, to, icon, needAuth }) => (
          <NavLink
            key={key}
            to={needAuth && !user ? '/login' : to}
            end={key === 'home'}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d={icon} />
            </svg>
            <span>{t(key)}</span>
            {key === 'messages' && user && user.unread_count > 0 && (
              <span className="badge">{user.unread_count}</span>
            )}
          </NavLink>
        ))}
        <NavLink to={profileTo} end className={({ isActive }) => (isActive ? 'active' : '')}>
          <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d={PROFILE_ICON} />
          </svg>
          <span>{t('profile')}</span>
        </NavLink>
      </nav>
      <div className="spacer" />
      <div className="ctrl">
        <button onClick={toggleLang}>{isZh ? 'EN' : '中'}</button>
        <button onClick={toggleTheme}>
          {theme === 'dark' ? (isZh ? '浅色' : 'Light') : (isZh ? '深色' : 'Dark')}
        </button>
      </div>
      <div className="user-chip" onClick={() => navigate(profileTo)}>
        <Avatar name={user ? user.username : t('login')} size={32} src={user && user.avatar} />
        <div style={{ minWidth: 0 }}>
          <div className="u-name">{user ? user.username : t('login')}</div>
          <div className="u-sub">{t('online')}</div>
        </div>
      </div>
    </aside>
  )
}

export function Layout() {
  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
