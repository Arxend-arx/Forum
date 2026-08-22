import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import { Avatar, EmptyState, SkeletonList } from '../components'
import Icon from '../components/Icon'
import PostDetail from './PostDetail'
import Search from './Search'
import CreatePost from './CreatePost'

/* 提取正文里所有图片 URL（Reddit 卡片画廊用） */
function allImgs(content) {
  if (!content) return []
  const out = []
  const re = /!\[[^\]]*\]\(([^)\s]+)\)/g
  let m
  while ((m = re.exec(content))) out.push(m[1])
  return out
}

/* 提取第一张图片（无图返回空） */
function firstImg(content) {
  return allImgs(content)[0] || ''
}

/* 随机打乱数组（浏览/Explore 用） */
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/* ============================================================
   Reddit 画廊：单图直出；多图左右翻页 + 底部圆点 + 右上计数
   ============================================================ */
function Gallery({ imgs }) {
  const [idx, setIdx] = useState(0)
  if (!imgs || imgs.length === 0) return null
  if (imgs.length === 1) {
    return <img className="rd-thumb" src={imgs[0]} alt="" loading="eager" decoding="async" />
  }
  const prev = (e) => { e.stopPropagation(); setIdx((i) => (i - 1 + imgs.length) % imgs.length) }
  const next = (e) => { e.stopPropagation(); setIdx((i) => (i + 1) % imgs.length) }
  return (
    <div className="rd-gallery" onClick={(e) => e.stopPropagation()}>
      <div className="rd-g-track" style={{ transform: `translateX(-${idx * 100}%)` }}>
        {imgs.map((src, i) => (
          <div className="rd-g-slide" key={i}>
            <img src={src} alt="" loading="eager" decoding="async" />
          </div>
        ))}
      </div>
      <span className="rd-g-count">{idx + 1}/{imgs.length}</span>
      <button className="rd-g-arrow rd-g-prev" aria-label="prev" onClick={prev}>
        <Icon name="arrow-left" size={16} />
      </button>
      <button className="rd-g-arrow rd-g-next" aria-label="next" onClick={next}>
        <Icon name="arrow-right" size={16} />
      </button>
      <div className="rd-g-dots">
        {imgs.map((_, i) => (
          <button key={i} className={i === idx ? 'on' : ''} aria-label={`slide ${i + 1}`}
            onClick={(e) => { e.stopPropagation(); setIdx(i) }} />
        ))}
      </div>
    </div>
  )
}

/* ============================================================
   顶部 topbar（仿 Reddit：左 logo + 中搜索 + 右按钮组 + 头像）
   ============================================================ */
function SocialTopbar({ onSearch }) {
  const { t, i18n } = useTranslation()
  const { user, theme, toggleLang, toggleTheme } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [keyword, setKeyword] = useState('')
  const isZh = i18n.language === 'zh'

  const search = () => {
    const k = keyword.trim()
    if (!k) return
    onSearch(k)
  }

  const active = (to) => (location.pathname === to ? ' on' : '')

  return (
    <header className="rd-topbar">
      <Link className="rd-brand" to="/social"><span className="rd-logo">A</span><span className="rd-brand-name">{t('brand')}</span></Link>

      {/* 大页面入口：Home / Starlink / Polestars / Profile（顶栏直达，替代小房子） */}
      <nav className="rd-topnav">
        <Link to="/landing" className={active('/landing')}>{t('landingHome')}</Link>
        <Link to="/social" className={active('/social')}>{t('socialNav')}</Link>
        <Link to="/starlink" className={active('/starlink')}>{t('starlink')}</Link>
        {user ? (
          <Link to={`/profile/${user.id}`} className={active(`/profile/${user.id}`)}>{t('navProfile')}</Link>
        ) : (
          <Link to="/login" className={active('/login')}>{t('navProfile')}</Link>
        )}
        {user && user.role === 'admin' && <Link to="/admin" className={active('/admin')}>{t('manage')}</Link>}
      </nav>

      <div className="rd-topbar-search">
        <Icon name="search" />
        <input value={keyword} onChange={(e) => setKeyword(e.target.value)}
          placeholder={isZh ? '搜索帖子…' : 'Search for posts...'}
          onKeyDown={(e) => e.key === 'Enter' && search()} />
      </div>
      <div className="rd-topbar-right">
        {/* 统一：中/英切换 → 亮/暗切换 → 头像 Profile */}
        <button className="rd-icon-btn" title={t('langShort')} onClick={toggleLang}>{isZh ? 'EN' : '中'}</button>
        <button className="rd-icon-btn" title={theme === 'dark' ? (isZh ? '浅色' : 'Light') : (isZh ? '深色' : 'Dark')}
          onClick={toggleTheme}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
        </button>
        {user ? (
          <button className="rd-avatar-btn" onClick={() => navigate(`/profile/${user.id}`)} title={user.username}>
            <Avatar name={user.username} src={user.avatar} size={28} />
          </button>
        ) : (
          <Link className="rd-icon-btn" to="/login" title={t('login')}>
            <Avatar name="?" size={28} />
          </Link>
        )}
      </div>
    </header>
  )
}

/* ============================================================
   左侧栏：裸条目 + 分组（仿 Reddit 左栏，0 卡片边框）
   ============================================================ */
function SocialLeft({ onCreate }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const tag = searchParams.get('tag') || ''
  const sort = searchParams.get('sort') || ''
  const [tags, setTags] = useState(null)
  const [gamesOpen, setGamesOpen] = useState(true)
  const [expanded, setExpanded] = useState(false)   // 发现更多主题：展开被隐藏的标签
  const isZh = i18n.language === 'zh'

  useEffect(() => {
    api.get('/tags')
      .then((d) => setTags(d || []))
      .catch(() => setTags([]))
  }, [])

  const shownTags = tags ? (expanded ? tags : tags.slice(0, 6)) : []

  return (
    <aside className="rd-left">
      <nav className="rd-l-section">
        <button className={'rd-l-item' + (!tag && !sort ? ' on' : '')} onClick={() => navigate('/social')}>
          <Icon name="home" className="ic" size={20} />
          <span>{isZh ? '主页' : 'Home'}</span>
        </button>
        <button className={'rd-l-item' + (sort === 'hot' ? ' on' : '')} onClick={() => navigate('/social?sort=hot')}>
          <Icon name="trending-up" className="ic" size={20} />
          <span>{isZh ? '受欢迎' : 'Popular'}</span>
        </button>
        <button className={'rd-l-item' + (sort === 'recommended' ? ' on' : '')} onClick={() => navigate('/social?sort=recommended')}>
          <Icon name="feed" className="ic" size={20} />
          <span>{isZh ? '资讯' : 'News'}</span>
        </button>
        <button className={'rd-l-item' + (sort === 'random' ? ' on' : '')} onClick={() => navigate('/social?sort=random')}>
          <Icon name="search" className="ic" size={20} />
          <span>{isZh ? '浏览' : 'Explore'}</span>
        </button>
      </nav>

      {/* 发帖入口：在主区内联打开编辑器，不跳页、左栏不动 */}
      <button className="rd-l-create" onClick={onCreate}>
        <Icon name="plus" size={20} />
        <span>{isZh ? '创建帖子' : 'Create Post'}</span>
      </button>

      {/* 主题组（折叠分组标题；默认展示前 6 个，可展开全部） */}
      <div className="rd-l-section">
        <div className="rd-l-group-head" onClick={() => setGamesOpen((v) => !v)}>
          <span>{isZh ? '主题' : 'TOPICS'}</span>
          <Icon name={gamesOpen ? 'arrow-up' : 'arrow-down'} size={12} />
        </div>
        {gamesOpen && (
          <>
            {!tags ? (
              <SkeletonList count={3} />
            ) : tags.length === 0 ? (
              <div className="muted" style={{ padding: '8px 10px', fontSize: 12.5 }}>
                {isZh ? '暂无主题' : 'No topics yet'}
              </div>
            ) : (
              shownTags.map((tg) => (
                <button key={tg.name}
                  className={'rd-l-comm' + (tag === tg.name ? ' on' : '')}
                  onClick={() => navigate(`/social?tag=${encodeURIComponent(tg.name)}`)}>
                  <span className="rd-l-avatar">{(tg.name || '?').slice(0, 1).toUpperCase()}</span>
                  <span className="rd-l-cname">r/{tg.name}</span>
                </button>
              ))
            )}
            {tags && tags.length > 6 && (
              <button className="rd-l-item rd-l-discover" onClick={() => setExpanded((v) => !v)}>
                <Icon name={expanded ? 'arrow-up' : 'plus'} className="ic" size={20} />
                <span>{expanded ? (isZh ? '收起主题' : 'Collapse') : (isZh ? '发现更多主题' : 'Discover more topics')}</span>
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  )
}

/* ============================================================
   中间：Reddit 风格帖子流（卡片加宽、元数据加粗）
   ============================================================ */
function RedditFeed({ onOpenPost }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, toast } = useApp()
  const [searchParams] = useSearchParams()
  const tag = searchParams.get('tag') || ''
  const sort = searchParams.get('sort') || 'hot'
  const [posts, setPosts] = useState(null)
  const [err, setErr] = useState('')
  const [topTags, setTopTags] = useState([])

  useEffect(() => {
    let alive = true
    setPosts(null)
    const req = sort === 'recommended'
      ? api.get('/feed/recommended?limit=40')
      : api.get(`/posts?sort=${sort}${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`)
    req.then((d) => {
      if (!alive) return
      // 浏览（Explore）：随机打乱顺序
      setPosts(sort === 'random' ? shuffle(d || []) : d)
    }).catch((e) => alive && setErr(e.error || t('loadFailed')))
    return () => { alive = false }
  }, [sort, tag])

  useEffect(() => {
    api.get('/tags').then((d) => setTopTags((d || []).slice(0, 8).map((x) => x.name))).catch(() => {})
  }, [])

  const setSort = (s) => {
    const p = new URLSearchParams(searchParams)
    if (s === 'hot') p.delete('sort'); else p.set('sort', s)
    const qs = p.toString()
    navigate(qs ? `/social?${qs}` : '/social')
  }

  /* 真实投票：value=1 赞 / -1 踩 / 0 取消（再点一次取消） */
  const vote = async (p, value) => {
    if (!user) {
      toast('error', t('loginSub'))
      navigate('/login')
      return
    }
    const next = p.my_vote === value ? 0 : value
    const before = { score: p.score, my_vote: p.my_vote }
    setPosts((prev) => (prev || []).map((x) =>
      x.id === p.id ? { ...x, my_vote: next, score: (x.score || 0) - (before.my_vote || 0) + next } : x))
    try {
      const d = await api.post(`/posts/${p.id}/vote`, { value: next })
      setPosts((prev) => (prev || []).map((x) =>
        x.id === p.id ? { ...x, score: d.score, my_vote: d.my_vote } : x))
    } catch (e) {
      toast('error', e.error || t('action.fail'))
      setPosts((prev) => (prev || []).map((x) => x.id === p.id ? { ...x, ...before } : x))
    }
  }

  /* 收藏 / 取消收藏 */
  const toggleBookmark = async (p) => {
    if (!user) {
      toast('error', t('loginSub'))
      navigate('/login')
      return
    }
    const before = p.is_bookmarked
    setPosts((prev) => (prev || []).map((x) =>
      x.id === p.id ? { ...x, is_bookmarked: !x.is_bookmarked } : x))
    try {
      await api.post(`/posts/${p.id}/bookmark`)
      toast('success', before ? t('unSaved') : t('saved'))
    } catch (e) {
      toast('error', e.error || t('action.fail'))
      setPosts((prev) => (prev || []).map((x) => x.id === p.id ? { ...x, is_bookmarked: before } : x))
    }
  }

  /* 分享 */
  const share = async (p) => {
    const url = `${location.origin}/post/${p.id}`
    try {
      if (navigator.share) { await navigator.share({ title: p.title, url }); return }
      await navigator.clipboard.writeText(url)
      toast('success', t('linkCopied'))
    } catch (e) {
      if (e && e.name === 'AbortError') return
      toast('success', t('linkCopied'))
    }
  }

  const tagsArr = (p) => (p.tags || '').split(',').filter(Boolean)
  const firstTagOf = (p) => tagsArr(p)[0] || ''

  return (
    <>
      {/* 顶部条：排序（仿 Reddit "最佳 ▾"） */}
      <div className="rd-sort-bar">
        <button className="rd-sort-btn" onClick={() => setSort('hot')}>
          {sort === 'hot' ? (t('sortBest') === '最佳' ? '最佳' : 'Best') : (t('sortBest') === '最佳' ? '最佳' : 'Best')}
          <Icon name="chevron-down" size={14} />
        </button>
        <span className="rd-sort-sep">·</span>
        <span className="rd-sort-sep">{t('justPopular')}</span>
      </div>

      {/* 当前社区（由 URL ?tag= 进入） */}
      {tag && (
        <div className="rd-community">
          <span className="rd-sub" style={{ fontSize: 15 }}>r/{tag}</span>
          <span className="muted" style={{ fontSize: 13 }}>· {t('tagPostsSub')}</span>
          <button className="btn btn-primary btn-sm rd-join" style={{ marginLeft: 'auto' }}
            onClick={() => toast('success', t('joinedCommunity'))}>
            <Icon name="plus" size={13} /> {t('join')}</button>
        </div>
      )}

      {/* 帖子列表 */}
      {err
        ? <EmptyState title={err} />
        : !posts
          ? <SkeletonList count={4} />
          : posts.length === 0
            ? <EmptyState title={t('noPosts')} desc={t('tryOther')} />
            : posts.map((p) => {
              const ftag = firstTagOf(p)
              const imgs = allImgs(p.content)
              return (
                <article key={p.id} className="rd-card">
                  {/* 投票列 */}
                  <div className="rd-vote">
                    <button type="button"
                      className={'rd-vb' + (p.my_vote === 1 ? ' on up' : '')}
                      aria-label="up" onClick={() => vote(p, 1)}>▲</button>
                    <span className="rd-score">{p.score ?? 0}</span>
                    <button type="button"
                      className={'rd-vb' + (p.my_vote === -1 ? ' on down' : '')}
                      aria-label="down" onClick={() => vote(p, -1)}>▼</button>
                  </div>
                  {/* 内容 */}
                  <div className="rd-body" onClick={() => onOpenPost(p.id)}>
                    <div className="rd-meta">
                      <span className="rd-sub" style={{ cursor: 'pointer' }}
                        onClick={(e) => { e.stopPropagation(); navigate(`/social?tag=${encodeURIComponent(ftag)}`) }}>
                        {ftag ? 'r/' + ftag : 'r/' + (t('brand') || 'Polarium')}</span>
                      <span className="rd-time">· {p.create_time}</span>
                      {!tag && <span className="rd-time">· {t('justPopular')}</span>}
                    </div>
                    <h3 className="rd-title">{p.title}</h3>
                    <Gallery imgs={imgs} />
                    {p.content && p.content.replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim() && (
                      <p className="rd-excerpt">{p.content.replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim()}</p>
                    )}
                    <div className="rd-foot">
                      <span className="rd-actions" onClick={(e) => { e.stopPropagation(); onOpenPost(p.id) }}><Icon name="comment" size={16} /> {p.comment_count || 0} {t('comments')}</span>
                      <span className="rd-actions" role="button" tabIndex={0} aria-label={t('share')}
                        onClick={(e) => { e.stopPropagation(); share(p) }}>
                        <Icon name="share" size={16} /> {t('share')}</span>
                      <span className={'rd-actions' + (p.is_bookmarked ? ' on' : '')} role="button" tabIndex={0}
                        aria-pressed={!!p.is_bookmarked} aria-label={t('save')}
                        onClick={(e) => { e.stopPropagation(); toggleBookmark(p) }}>
                        <Icon name="bookmark" size={16} /> {t('save')}</span>
                    </div>
                  </div>
                </article>
              )
            })}
    </>
  )
}

/* ============================================================
   右侧栏：好友列表（私信入口）· 前 6 位，多的折叠 + 全部好友详情页
   ============================================================ */
function SocialRail() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user } = useApp()
  const [friends, setFriends] = useState([])
  const [loaded, setLoaded] = useState(false)
  const isZh = i18n.language === 'zh'
  const LIMIT = 6

  useEffect(() => {
    if (!user) { setFriends([]); setLoaded(true); return }
    api.get('/friends/list')
      .then((d) => { setFriends(d || []); setLoaded(true) })
      .catch(() => { setFriends([]); setLoaded(true) })
  }, [user])

  const shown = friends.slice(0, LIMIT)
  const more = friends.length - LIMIT

  return (
    <aside className="social-rail">
      <div className="rail-card rd-recent">
        <div className="rail-card-head">
          <h4 style={{ margin: 0 }}>{isZh ? '好友' : 'Friends'}</h4>
          {friends.length > 0 && (
            <button className="rail-clear" onClick={() => navigate('/friends/list')}>{t('viewAll')}</button>
          )}
        </div>
        {!user ? (
          <div className="muted" style={{ fontSize: 12.5 }}>
            <Link to="/login" className="link" style={{ color: 'var(--primary)' }}>{t('login')}</Link>
            {isZh ? ' 后查看好友并私信' : ' to see friends & chat'}
          </div>
        ) : !loaded ? (
          <div className="muted" style={{ fontSize: 12.5 }}>…</div>
        ) : friends.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5 }}>{t('noFriend')}</div>
        ) : (
          <>
            {shown.map((f) => (
              <div key={f.id} className="r-post" onClick={() => navigate(`/chat/${f.id}`)} title={t('chatBtn')}>
                <div className="r-friend">
                  <Avatar name={f.username} src={f.avatar} size={30} />
                  <div className="r-friend-main">
                    <div className="pt">
                      {f.username}
                      {f.is_online && <span className="dot-on" />}
                    </div>
                    <div className="pm">💬 {t('chatBtn')}</div>
                  </div>
                </div>
              </div>
            ))}
            {more > 0 && (
              <div className="r-more" onClick={() => navigate('/friends/list')}>
                +{more} {isZh ? '更多好友' : 'more friends'} →
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  )
}

/* ============================================================
   Social：Reddit 完整三栏（顶部 topbar + 左栏 + 中栏 + 右栏）
   ============================================================ */
export default function Social() {
  const navigate = useNavigate()
  const { user } = useApp()
  const [searchParams] = useSearchParams()
  const postId = searchParams.get('post')    // URL ?post=ID：帖子详情在主区内联展开（左栏不动）
  const [inline, setInline] = useState(null) // {type:'search', q} | {type:'create'} | null

  /* 打开帖子：带上当前 tag/sort 参数，只追加 post */
  const openPost = (id) => {
    const p = new URLSearchParams(searchParams)
    p.set('post', id)
    navigate(`/social?${p.toString()}`)
  }

  /* 关闭帖子：仅移除 post 参数，回到原来的信息流 */
  const closePost = () => {
    const p = new URLSearchParams(searchParams)
    p.delete('post')
    const qs = p.toString()
    navigate(qs ? `/social?${qs}` : '/social')
  }

  /* 搜索 / 发帖前先收起已展开的帖子 */
  const collapsePost = () => {
    if (!searchParams.get('post')) return
    closePost()
  }

  const onCreate = () => {
    if (!user) { navigate('/login'); return }
    collapsePost()
    setInline({ type: 'create' })
  }

  return (
    <div className="rd-page">
      <SocialTopbar onSearch={(q) => { collapsePost(); setInline({ type: 'search', q }) }} />
      <div className="social-layout">
        <SocialLeft onCreate={onCreate} />
        <div className="social-main">
          {postId ? (
            <PostDetail id={Number(postId)} onClose={closePost} />
          ) : inline && inline.type === 'search' ? (
            <Search q={inline.q} onClose={() => setInline(null)} onOpenPost={openPost} />
          ) : inline && inline.type === 'create' ? (
            <CreatePost onClose={() => setInline(null)} onCreated={(id) => { setInline(null); openPost(id) }} />
          ) : (
            <RedditFeed onOpenPost={openPost} />
          )}
        </div>
        <SocialRail />
      </div>
    </div>
  )
}
