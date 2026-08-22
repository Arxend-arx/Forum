import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useApp } from '../context/AppContext'
import { api } from '../api/client'
import { Markdown, Avatar } from '../components'
import Icon from '../components/Icon'

/* 帖子海洋粒子数 */
const COUNT = 26
const rand = (a, b) => a + Math.random() * (b - a)

/* 文献推荐精选（静态卡片，链接到学术匹配页） */
const LIT_PICKS = [
  { icon: 'book-open', title: 'Attention Is All You Need', desc: 'transformerPaper', badge: 'paper1' },
  { icon: 'award', title: 'Diffusion Models Beat GANs', desc: 'diffusionPaper', badge: 'paper2' },
  { icon: 'trending-up', title: 'Topological Quantum Computation', desc: 'topoPaper', badge: 'paper3' },
]

/* 平台特性（i18n 文案） */
const FEATURES = [
  { icon: 'globe', key: 'featNav' },
  { icon: 'refresh', key: 'featFlow' },
  { icon: 'chat', key: 'featCommunity' },
  { icon: 'translate', key: 'featI18n' },
  { icon: 'bookmark', key: 'featTags' },
  { icon: 'lock', key: 'featSafe' },
]

export default function Landing() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user, theme, toggleLang, toggleTheme } = useApp()
  const [anns, setAnns] = useState([])
  const [annOpen, setAnnOpen] = useState(false)
  const [hot, setHot] = useState([])
  const [tagList, setTagList] = useState([])
  const [stats, setStats] = useState(null)

  /* 帖子海洋：数据 / 暂停 / 排序（滚动特效背景） */
  const [posts, setPosts] = useState([])
  const [sort, setSort] = useState('hot')
  const [paused, setPaused] = useState(false)
  const [seed, setSeed] = useState(0)

  /* 数字格式：1000+ / 1.2k+ 等 */
  const fmt = (n) => {
    if (n == null) return '…'
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k+`
    return `${n}+`
  }

  useEffect(() => {
    api.get('/announcements').then((d) => {
      setAnns(d || [])
      /* 公告弹窗：仅在每次登录后首次回到 Landing 时弹出一次 */
      if (d && d.length > 0 && sessionStorage.getItem('ann_popup_pending') === '1') {
        setAnnOpen(true)
        sessionStorage.removeItem('ann_popup_pending')
      }
    }).catch(() => setAnns([]))
    api.get('/posts?sort=hot&limit=5').then(setHot).catch(() => setHot([]))
    api.get('/tags').then(setTagList).catch(() => setTagList([]))
    api.get('/stats').then(setStats).catch(() => setStats(null))
  }, [])

  /* 帖子海洋数据：最新/最热，最多 60 条 */
  useEffect(() => {
    let alive = true
    api.get(`/posts?sort=${sort}&limit=60`)
      .then((d) => alive && setPosts(d))
      .catch(() => alive && setPosts([]))
    return () => { alive = false }
  }, [sort])

  const isZh = i18n.language === 'zh'
  const popupAnns = anns.slice(0, 3)

  /* 刷新：重新随机铺粒子 */
  const refresh = () => setSeed((s) => s + 1)

  /* 粒子布局：posts/seed 变化时重新生成随机参数 */
  const particles = useMemo(() => {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1200
    return Array.from({ length: COUNT }, (_, i) => {
      const p = posts[i % Math.max(posts.length, 1)]
      const w = Math.round(rand(160, 235))
      return {
        id: `${seed}-${i}`,
        post: p,
        x: rand(1, Math.max(5, 98 - (w * 100) / Math.min(width, 1400))) + '%',
        w: w + 'px',
        delay: -rand(0, 32),
        dur: Math.round(rand(20, 44)),
      }
    })
  }, [posts, seed])

  return (
    <div className="polarium">
      {/* 帖子海洋：整页滚动特效背景（粒子持续上浮，随页面滚动保持流动） */}
      <div className={`pl-ocean pl-ocean-bg ${paused ? 'paused' : ''}`}>
        {particles.map((pt) => {
          const p = pt.post
          if (!p) return null
          const firstTag = (p.tags || '').split(',').filter(Boolean)[0]
          return (
            <div
              key={pt.id}
              className="pl-particle"
              style={{
                '--x': pt.x,
                '--w': pt.w,
                '--d': `${pt.dur}s`,
                '--delay': `${pt.delay}s`,
              }}
              onClick={() => navigate(`/post/${p.id}`)}
            >
              <h4>{p.title}</h4>
              <div className="pl-pmeta">
                <span style={{ fontWeight: 600, color: 'var(--pl-text)' }}>{p.author}</span>
                {firstTag && <span className="pl-ptag">#{firstTag}</span>}
                <span className="pl-pheat">🔥 {p.comment_count || 0}</span>
              </div>
            </div>
          )
        })}
        <div className="pl-tip">◉ {t('feedTip')}</div>
      </div>

      {/* 海洋交互控件层：浮于内容层之上 */}
      <div className="pl-ocean-ui">
        <div className="pl-feedbar">
          <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => setPaused((v) => !v)}>
            {paused ? '▶ ' + t('feedPlay') : '⏸ ' + t('feedPause')}
          </button>
          <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={refresh}>⟳ {t('feedRefresh')}</button>
          <div className="pl-spacer" />
          <div className="pl-seg" style={{ display: 'inline-flex' }}>
            <button className={sort === 'latest' ? 'on' : ''} onClick={() => setSort('latest')}>{t('sortLatest')}</button>
            <button className={sort === 'hot' ? 'on' : ''} onClick={() => setSort('hot')}>{t('sortHot')}</button>
          </div>
        </div>

        <div className="pl-tagbar">
          <Link to="/starlink" className="pl-tagbar-chip pl-tagbar-match">✦ {t('starlink')} →</Link>
        </div>

        <Link to="/create" className="pl-fab pl-fab-br" title={t('newPost')}>＋</Link>
        <Link to="/messages" className="pl-fab pl-fab-bl" title={t('msgTitle')}>
          ✉
          {user && user.unread_count > 0 && <span className="pl-fab-badge">{user.unread_count}</span>}
        </Link>
      </div>

      <div className="pl-landing-content">
        <nav className="pl-navbar">
          <div className="pl-container">
            <Link className="pl-brand" to="/">
              <span className="pl-logo"><Icon name="starlink" size={15} /></span>
              Polarium
            </Link>
            <div className="pl-navlinks">
              <Link to="/" className="on">{t('landingHome')}</Link>
              <Link to="/social">{t('socialNav')}</Link>
              <Link to="/starlink">{t('starlink')}</Link>
              {user ? (
                <Link to={`/profile/${user.id}`}>{t('navProfile')}</Link>
              ) : (
                <Link to="/login">{t('navProfile')}</Link>
              )}
              {user && user.role === 'admin' && <Link to="/admin">{t('manage')}</Link>}
            </div>
            <div className="pl-navright">
              {/* 统一：中/英切换 → 亮/暗切换 → 头像 Profile */}
              <button className="pl-btn pl-btn-icon" title={isZh ? 'EN' : '中文'} onClick={toggleLang}>
                {isZh ? 'EN' : '中'}
              </button>
              <button className="pl-btn pl-btn-icon" title={theme === 'dark' ? 'Light' : 'Dark'} onClick={toggleTheme}>
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
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

        {/* Hero */}
        <section className="pl-hero">
          <div className="pl-container">
            <span className="pl-eyebrow">{t('landingEyebrow')}</span>
            <h1>
              {t('heroLine1')}<br />
              <span style={{ color: 'var(--pl-primary)' }}>{t('heroLine2')}</span>
            </h1>
            <p className="pl-sub">{t('landingSub')}</p>
            <div className="pl-cta">
              <Link className="pl-btn pl-btn-primary pl-btn-lg" to="/social">
                <Icon name="arrow-right" size={17} /> {t('startExplore')}
              </Link>
              <Link className="pl-btn pl-btn-ghost pl-btn-lg" to="/social">{t('enterForum')} →</Link>
            </div>
            <div className="pl-stats">
              <div><div className="pl-num">{stats ? fmt(stats.scholars) : t('statScholars')}</div><div className="pl-lbl">{t('statScholarsLbl')}</div></div>
              <div><div className="pl-num">{stats ? fmt(stats.discussions) : t('statDiscussions')}</div><div className="pl-lbl">{t('statDiscussionsLbl')}</div></div>
              <div><div className="pl-num">{stats ? fmt(stats.literature) : t('statLit')}</div><div className="pl-lbl">{t('statLitLbl')}</div></div>
              <div><div className="pl-num">{stats ? fmt(stats.tags) : (tagList.length || 24)}</div><div className="pl-lbl">{t('statTagsLbl')}</div></div>
            </div>
          </div>
        </section>

        {/* 公告 */}
        <div className="pl-container pl-section" style={{ paddingTop: 0 }}>
          <div className="pl-section-head">
            <h2><Icon name="bell" size={18} /> {t('announcements')}</h2>
            <Link className="pl-muted" style={{ fontSize: 13 }} to="/announcements">{t('viewAll')} →</Link>
          </div>
          {anns.length === 0 ? (
            <div className="pl-card pl-pad pl-muted" style={{ fontSize: 13.5 }}>{t('noAnnouncements')}</div>
          ) : (
            anns.slice(0, 1).map((a) => (
              <div key={a.id} className="pl-card pl-pad">
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{a.title}</div>
                <div className="pl-muted" style={{ fontSize: 12.5, margin: '2px 0 8px' }}>
                  <Icon name="profile" size={12} /> {a.publisher_username || t('adminBadge')} · {a.create_time}
                </div>
                <p className="pl-muted" style={{ fontSize: 13.5 }}>{a.content}</p>
              </div>
            ))
          )}
        </div>

        {/* 热门讨论 */}
        <div className="pl-container pl-section" style={{ paddingTop: 0 }}>
          <div className="pl-section-head">
            <h2><Icon name="flame" size={18} /> {t('hotTopics')}</h2>
            <Link className="pl-muted" style={{ fontSize: 13 }} to="/social">{t('enterForum')} →</Link>
          </div>
          <div className="pl-card pl-pad" style={{ padding: 8 }}>
            {hot.length === 0 && <div className="pl-muted" style={{ fontSize: 13, padding: 10 }}>{t('noPosts')}</div>}
            {hot.map((p) => {
              const tags = (p.tags || '').split(',').filter(Boolean).slice(0, 2)
              return (
                <Link key={p.id} className="pl-item" to={`/post/${p.id}`}>
                  <div className="pl-avatar">{(p.author || '?').charAt(0)}</div>
                  <div className="pl-main">
                    <h4>{p.title}</h4>
                    <p>{p.content}</p>
                    <div className="pl-meta">
                      {tags.map((tg) => <span key={tg} className="pl-tag">#{tg}</span>)}
                      <span>{p.author}</span>
                      <span>·</span>
                      <span>{p.create_time}</span>
                      <span style={{ marginLeft: 'auto' }}><Icon name="flame" size={12} /> {p.comment_count || 0}</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        {/* 文献推荐 */}
        <div className="pl-container pl-section" style={{ paddingTop: 0 }}>
          <div className="pl-section-head">
            <h2><Icon name="book-open" size={18} /> {t('litRecommend')}</h2>
            <Link className="pl-muted" style={{ fontSize: 13 }} to="/match">{t('goMatch')} →</Link>
          </div>
          <div className="pl-grid-3">
            {LIT_PICKS.map((l) => (
              <div key={l.title} className="pl-feature">
                <div className="pl-ic"><Icon name={l.icon} size={20} /></div>
                <h4>{l.title}</h4>
                <p className="pl-muted">{t(l.desc)}</p>
                <Link style={{ fontSize: 13 }} to="/match">{t('openOriginal')} ↗</Link>
              </div>
            ))}
          </div>
        </div>

        {/* 特性 */}
        <div className="pl-container pl-section" style={{ paddingTop: 0 }}>
          <div className="pl-section-head"><h2>{t('whyPolarium')}</h2></div>
          <div className="pl-grid-3">
            {FEATURES.map((f) => (
              <div key={f.key} className="pl-feature">
                <div className="pl-ic"><Icon name={f.icon} size={20} /></div>
                <h4>{t(f.key + 'Title')}</h4>
                <p>{t(f.key + 'Desc')}</p>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="pl-container pl-section" style={{ paddingTop: 0, maxWidth: 820 }}>
          <div className="pl-section-head"><h2>{t('faqTitle')}</h2></div>
          {[1, 2, 3, 4].map((i) => (
            <details key={i} className="pl-faq">
              <summary>{t(`faqQ${i}`)}</summary>
              <p>{t(`faqA${i}`)}</p>
            </details>
          ))}
        </div>

        {/* CTA */}
        <div className="pl-container pl-section" style={{ paddingTop: 0, textAlign: 'center' }}>
          <div className="pl-card pl-cta-card pl-pad">
            <h2>{t('ctaTitle')}</h2>
            <p className="pl-sub">{t('ctaSub')}</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link className="pl-btn" to="/register" style={{ background: 'var(--pl-primary)', color: '#fff', fontWeight: 700 }}>{t('freeRegister')}</Link>
              <Link className="pl-btn" to="/social" style={{ border: '1px solid var(--pl-border)', color: 'var(--pl-text)' }}>{t('viewWall')}</Link>
            </div>
          </div>
        </div>

        <footer className="pl-footer">
          <div className="pl-container pl-cols">
            <div style={{ flex: 1.4, minWidth: 220 }}>
              <div className="pl-brand" style={{ marginBottom: 8 }}>
                <span className="pl-logo"><Icon name="starlink" size={15} /></span> Polarium
              </div>
              <p className="pl-muted" style={{ fontSize: 13, maxWidth: 320 }}>{t('footerSlogan')}</p>
            </div>
            <div><h5>{t('footerPlatform')}</h5><ul><li><Link to="/">{t('aboutUs')}</Link></li><li><Link to="/">{t('communityPact')}</Link></li></ul></div>
            <div><h5>{t('footerResources')}</h5><ul><li><Link to="/starlink">{t('starlink')}</Link></li><li><Link to="/social">{t('socialNav')}</Link></li></ul></div>
            <div><h5>{t('footerSupport')}</h5><ul><li><Link to="/">{t('privacy')}</Link></li><li><Link to="/">{t('terms')}</Link></li></ul></div>
          </div>
        </footer>
      </div>{/* /pl-landing-content */}

      {/* 公告弹窗 */}
      {annOpen && popupAnns.length > 0 && (
        <div className="pl-modal-mask" onClick={() => setAnnOpen(false)}>
          <div className="pl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pl-modal-head">
              <h3><Icon name="bell" size={16} /> {t('annModalTitle')}</h3>
              <button className="pl-btn pl-btn-icon" onClick={() => setAnnOpen(false)} title={t('close')}>
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="pl-modal-body">
              {popupAnns.map((a) => (
                <div key={a.id} className="pl-ann">
                  <div className="pl-ann-title">{a.title}</div>
                  <div className="pl-muted" style={{ fontSize: 12, margin: '2px 0 6px' }}>
                    <Icon name="profile" size={12} /> {a.publisher_username || t('adminBadge')} · {a.create_time}
                  </div>
                  <div className="pl-ann-content"><Markdown text={a.content} /></div>
                </div>
              ))}
            </div>
            <div className="pl-modal-foot">
              <button className="pl-btn pl-btn-primary pl-btn-sm" onClick={() => setAnnOpen(false)}>{t('gotIt')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
