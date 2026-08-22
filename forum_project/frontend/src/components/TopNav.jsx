import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useApp } from '../context/AppContext'
import { Avatar } from '../components'

/* 全站顶部大页面入口：Home / Starlink / Polestars / Profile（管理员 + Manage）
   与 Landing / Starlink 页的 pl-navbar 视觉一致，保证所有页面顶部入口不丢失 */
export default function TopNav() {
  const { t, i18n } = useTranslation()
  const { user, theme, toggleLang, toggleTheme } = useApp()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isZh = i18n.language === 'zh'
  const on = (prefix) => (pathname === prefix || pathname.startsWith(prefix + '/') ? ' on' : '')

  return (
    <div className="polarium topnav-wrap">
      <nav className="pl-navbar">
        <div className="pl-container">
          <Link className="pl-brand" to="/"><span className="pl-logo">✦</span> Polarium</Link>
          <div className="pl-navlinks">
            <Link to="/landing" className={pathname === '/' || pathname.startsWith('/landing') ? 'on' : ''}>{t('landingHome')}</Link>
            <Link to="/social" className={on('/social')}>{t('socialNav')}</Link>
            <Link to="/starlink" className={on('/starlink')}>{t('starlink')}</Link>
            {user ? (
              <Link to={`/profile/${user.id}`} className={on(`/profile/${user.id}`)}>{t('navProfile')}</Link>
            ) : (
              <Link to="/login" className={on('/login')}>{t('navProfile')}</Link>
            )}
            {user && user.role === 'admin' && <Link to="/admin" className={on('/admin')}>{t('manage')}</Link>}
          </div>
          <div className="pl-navright">
            {/* 统一：中/英切换 → 亮/暗切换 → 头像 Profile */}
            <button className="pl-btn pl-btn-icon" title={isZh ? 'EN' : '中文'} onClick={toggleLang}>
              {isZh ? 'EN' : '中'}
            </button>
            <button className="pl-btn pl-btn-icon" title={theme === 'dark' ? 'Light' : 'Dark'} onClick={toggleTheme}>
              {theme === 'dark' ? '🌗' : '🌘'}
            </button>
            {user ? (
              <button className="pl-btn pl-btn-icon" title={user.username} onClick={() => navigate(`/profile/${user.id}`)}>
                <Avatar name={user.username} src={user.avatar} size={26} />
              </button>
            ) : (
              <button className="pl-btn pl-btn-icon" title={t('login')} onClick={() => navigate('/login')}>
                <Avatar name="?" size={26} />
              </button>
            )}
          </div>
        </div>
      </nav>
    </div>
  )
}
