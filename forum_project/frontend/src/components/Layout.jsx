import React from 'react'
import { NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useApp } from '../context/AppContext'
import { Avatar } from './index'
import Icon from './Icon'
import TopNav from './TopNav'

/* 顶部主导航（Reddit 风格：Home / Starlink / Polestars） */
const NAV_TOP = [
  { key: 'landingHome', to: '/', icon: 'home' },
  { key: 'socialNav', to: '/social', icon: 'social' },
  { key: 'starlink', to: '/starlink', icon: 'starlink' },
]

/* 底部"我"组 */
const NAV_ME = (t, role) => [
  { key: 'profile', to: '/profile/me', icon: 'profile' },
  ...(role === 'admin' ? [{ key: 'manage', to: '/admin', icon: 'shield' }] : []),
]

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

      {/* 主导航（裸列表，无卡片，Reddit 风格） */}
      <nav className="nav nav-top">
        {NAV_TOP.map(({ key, to, icon }) => (
          <NavLink key={key} to={to} end={key === 'landingHome'}
            className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon name={icon} className="ic" />
            <span>{t(key)}</span>
          </NavLink>
        ))}
      </nav>

      {/* 分组：我的（横线分隔 + 小标题） */}
      <div className="nav-group">
        <div className="nav-group-title">{isZh ? '我的' : 'Me'}</div>
        <nav className="nav nav-top">
          <NavLink to={profileTo} end className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon name="profile" className="ic" />
            <span>{t('profile')}</span>
          </NavLink>
          {user && user.role === 'admin' && (
            <NavLink to="/admin" className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon name="shield" className="ic" />
              <span>{t('manage')}</span>
            </NavLink>
          )}
        </nav>
      </div>

      <div className="spacer" />

      {/* 底部：主题/语言切换 + 用户卡 */}
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
  const { pathname } = useLocation()
  /* Social / Starlink 需要三栏 Reddit 布局，跳出 .main 的 900px 限制 */
  const wide = pathname === '/social' || pathname.startsWith('/starlink')
  /* Landing / Social / 帖子详情 / 用户主页 / Starlink 星空均独立渲染：
     Landing 需要整屏背景海洋特效（无侧栏）；其余页面不需要工作栏，只用页内返回按键 */
  const standalone = pathname === '/' || pathname === '/social' || pathname.startsWith('/post/') || pathname.startsWith('/profile/') || pathname.startsWith('/starlink')
  if (standalone) {
    return (
      <div className="layout standalone">
        <Outlet />
      </div>
    )
  }
  /* 私信 / 信件箱 / 全部好友页：保留顶部大页面入口，但不要左侧工具栏 */
  const noSidebar = pathname === '/chat' || pathname.startsWith('/chat/') ||
    pathname === '/messages' || pathname.startsWith('/friends/list')
  return (
    <div className="layout">
      {/* 顶部大页面入口（所有页面保留：Home / Starlink / Polestars / Profile） */}
      <TopNav />
      <div className="layout-body">
        {!noSidebar && <Sidebar />}
        <main className={'main' + (wide ? ' full-width' : '')}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}