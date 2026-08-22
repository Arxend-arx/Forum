import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useApp } from '../context/AppContext'
import { api } from '../api/client'
import { Flag, Avatar } from '../components'

const ENGINE_JS = '/vendor/stellarium/stellarium-web-engine.js'
const ENGINE_WASM = '/vendor/stellarium/stellarium-web-engine.wasm'
const SKY_BASE = '/vendor/stellarium/skydata/'

let engineScriptEl = null   // 模块级：引擎脚本元素（只注入一次）
let pendingStart = null     // 模块级：最新一次的启动回调（脚本加载完成后调用）

/* ---------- 稳定字符串哈希（用户 → 天球坐标） ---------- */
function hashStr(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function userSkyPos(id) {
  const h = hashStr(String(id))
  const alt = -0.12 + ((h % 1000) / 1000) * 1.35 // 高度 -7° ~ 69°
  const az = ((h >> 8) % 6283) / 1000            // 方位 0 ~ 2π
  return { alt, az }
}

/* 用户单位向量（水平系：x=cos alt cos az, y=cos alt sin az, z=sin alt） */
function skyVec({ alt, az }) {
  const c = Math.cos(alt)
  return [c * Math.cos(az), c * Math.sin(az), Math.sin(alt)]
}

/* 视角中心 azalt → 把目标向量投影到屏幕（透视投影，与引擎 proj_perspective 一致） */
function projectToScreen(v, C, W, H, fov) {
  const wup = [0, 0, 1]
  let rx = wup[1] * C[2] - wup[2] * C[1]
  let ry = wup[2] * C[0] - wup[0] * C[2]
  let rz = wup[0] * C[1] - wup[1] * C[0]
  const rl = Math.hypot(rx, ry, rz)
  if (rl < 1e-6) { rx = 0; ry = 1; rz = 0 } else { rx /= rl; ry /= rl; rz /= rl }
  const ux = C[1] * rz - C[2] * ry
  const uy = C[2] * rx - C[0] * rz
  const uz = C[0] * ry - C[1] * rx
  const relx = v[0] * rx + v[1] * ry + v[2] * rz
  const rely = v[0] * ux + v[1] * uy + v[2] * uz
  const relz = v[0] * C[0] + v[1] * C[1] + v[2] * C[2]
  if (relz <= 0.03) return null
  const f = (H / 2) / Math.tan(fov / 2)
  return { x: W / 2 + f * relx / relz, y: H / 2 - f * rely / relz }
}

export default function Starlink() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, theme, toggleLang, toggleTheme, toast } = useApp()
  const isZh = i18n.language === 'zh'

  const canvasRef = useRef(null)
  const fieldRef = useRef(null)
  const svgRef = useRef(null)
  const stelRef = useRef(null)
  const [engineReady, setEngineReady] = useState(false)

  const [users, setUsers] = useState([])
  const [matched, setMatched] = useState([])
  const [kw, setKw] = useState('')
  const [busy, setBusy] = useState(false)
  const [searched, setSearched] = useState(false)
  const [following, setFollowing] = useState({})
  const [seed, setSeed] = useState(0)
  const [hotInterests, setHotInterests] = useState([])

  /* ---------- 引擎初始化（真实 Stellarium 星空） ---------- */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let alive = true // 仅当组件真正卸载时置 false

    const start = () => {
      if (!window.StelWebEngine) return
      window.StelWebEngine({
        wasmFile: ENGINE_WASM,
        canvas,
        translateFn: (domain, str) => str,
        onReady: (stel) => {
          if (!alive) return
          stelRef.current = stel
          const core = stel.core
          // 数据源（本地 skydata）
          core.stars.addDataSource({ url: SKY_BASE + 'stars' })
          core.skycultures.addDataSource({ url: SKY_BASE + 'skycultures/western', key: 'western' })
          core.dsos.addDataSource({ url: SKY_BASE + 'dso' })
          core.milkyway.addDataSource({ url: SKY_BASE + 'surveys/milkyway' })
          core.planets.addDataSource({ url: SKY_BASE + 'surveys/sso/moon', key: 'moon' })
          core.planets.addDataSource({ url: SKY_BASE + 'surveys/sso/sun', key: 'sun' })
          core.planets.addDataSource({ url: SKY_BASE + 'surveys/sso/moon', key: 'default' })
          // 深空观感：关大气/地面，开星座线与银河
          try { core.atmosphere.visible = false } catch (e) {}
          try { core.landscapes.visible = false } catch (e) {}
          try { core.constellations.lines_visible = true } catch (e) {}
          try { core.constellations.labels_visible = true } catch (e) {}
          try { core.milkyway.visible = true } catch (e) {}
          try { core.dsos.visible = true } catch (e) {}
          try { core.pointer.visible = false } catch (e) {}
          // 默认视角：朝向银河带方向（0 秒瞬移）
          try { stel.lookAt(skyVec({ alt: 0.5, az: 2.9 }), 0) } catch (e) {}
          setEngineReady(true)
        },
      })
    }
    pendingStart = start

    if (window.StelWebEngine) {
      start()
    } else if (!engineScriptEl) {
      engineScriptEl = document.createElement('script')
      engineScriptEl.src = ENGINE_JS
      engineScriptEl.onload = () => { if (pendingStart) pendingStart() }
      engineScriptEl.onerror = () => toast('error', 'Stellarium 引擎加载失败')
      document.head.appendChild(engineScriptEl)
    } else if (!window.StelWebEngine) {
      // 脚本已注入但仍在加载（StrictMode 第一次挂载注入的）：挂等待回调
      const prev = engineScriptEl.onload
      engineScriptEl.onload = () => { if (prev) prev(); if (pendingStart) pendingStart() }
    }
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- 全量用户 + 热门研究方向 ---------- */
  useEffect(() => {
    let alive = true
    api.get('/starlink/users')
      .then((d) => {
        if (!alive) return
        setUsers(d || [])
        const cnt = {}
        ;(d || []).forEach((u) => {
          ;(u.learning_interest || '').split(/[,，\s]+/).filter(Boolean).forEach((k) => {
            cnt[k] = (cnt[k] || 0) + 1
          })
        })
        setHotInterests(Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k))
      })
      .catch(() => alive && setUsers([]))
    return () => { alive = false }
  }, [seed])

  /* 用户 → 天球坐标（优先用服务端绑定的星位，缺失时退化为 id 哈希） */
  const skyMap = useMemo(() => {
    const map = {}
    users.forEach((u) => {
      const fallback = userSkyPos(u.id)
      map[u.id] = {
        alt: typeof u.sky_alt === 'number' && !Number.isNaN(u.sky_alt) ? u.sky_alt : fallback.alt,
        az: typeof u.sky_az === 'number' && !Number.isNaN(u.sky_az) ? u.sky_az : fallback.az,
      }
    })
    return map
  }, [users])

  /* 登录用户 → 自己的星坐标 */
  const myStar = useMemo(() => {
    const me = users.find((u) => u.is_me)
    return me && skyMap[me.id] ? { ...skyMap[me.id], username: me.username } : null
  }, [users, skyMap])

  /* 定位单颗星：让它的投影落在「搜索框下方可见区域」（水平居中、垂直约 62% 处） */
  const locateStar = useCallback((u, silent) => {
    const stel = stelRef.current
    const s = u && skyMap[u.id]
    if (!stel || !s) {
      if (!silent) toast('info', t('starlinkNoMe'))
      return false
    }
    const W = window.innerWidth
    const H = window.innerHeight
    const fov = stel.core.fov || 0.9
    const f = (H / 2) / Math.tan(fov / 2)
    const ty = H * 0.62
    // 视角高度偏移 δ，使星恰好投影到 ty（精确推导：rely/relz = -tan δ）
    const delta = Math.atan((ty - H / 2) / f)
    const alt = s.alt + delta
    const az = s.az
    const c = Math.cos(alt)
    try {
      stel.lookAt([c * Math.cos(az), c * Math.sin(az), Math.sin(alt)], 0.8)
    } catch (e) {
      return false
    }
    return true
  }, [skyMap, toast, t])

  /* 引擎就绪且拿到用户列表后：自动把视角定位到「我的星」（只做一次） */
  const focusedOnce = useRef(false)
  useEffect(() => {
    if (!engineReady || !myStar || focusedOnce.current) return
    focusedOnce.current = true
    const me = users.find((u) => u.is_me)
    if (me) locateStar(me, true)
  }, [engineReady, myStar, users, locateStar])

  /* ---------- 投影循环：每帧把用户星点/星座线贴到引擎画布上 ---------- */
  useEffect(() => {
    if (!engineReady) return
    let raf
    const tick = () => {
      const stel = stelRef.current
      const nav = stel && stel.core && stel.core.observer
      const field = fieldRef.current
      const svg = svgRef.current
      const azalt = nav && nav.azalt
      if (stel && azalt && field) {
        const W = window.innerWidth
        const H = window.innerHeight
        const fov = stel.core.fov || 0.8
        const C = [azalt[0], azalt[1], azalt[2]]
        const proj = {}
        // 星点
        field.querySelectorAll('.pl-star-node').forEach((node) => {
          const p = skyMap[node.dataset.id]
          if (!p) return
          const s = projectToScreen(skyVec(p), C, W, H, fov)
          if (!s) { node.style.display = 'none'; return }
          node.style.display = ''
          node.style.left = s.x + 'px'
          node.style.top = s.y + 'px'
          proj[node.dataset.id] = s
        })
        // 星座连线
        if (svg) {
          svg.querySelectorAll('line').forEach((ln) => {
            const a = proj[ln.dataset.from]
            const b = proj[ln.dataset.to]
            if (a && b) {
              ln.setAttribute('x1', a.x); ln.setAttribute('y1', a.y)
              ln.setAttribute('x2', b.x); ln.setAttribute('y2', b.y)
            } else {
              ln.setAttribute('x1', 0); ln.setAttribute('y1', 0)
              ln.setAttribute('x2', 0); ln.setAttribute('y2', 0)
            }
          })
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [engineReady, skyMap])

  /* 视角飞向匹配星群：质心 + 视场拉大到能框住全部匹配星 */
  const flyToMatches = useCallback((stel, matches) => {
    if (!stel || !matches || matches.length === 0) return
    const vecs = matches.map((u) => skyMap[u.id]).filter(Boolean).map(skyVec)
    if (vecs.length === 0) return
    const c = [0, 0, 0]
    vecs.forEach((v) => { c[0] += v[0]; c[1] += v[1]; c[2] += v[2] })
    const n = Math.hypot(c[0], c[1], c[2])
    const target = n > 0.05 ? [c[0] / n, c[1] / n, c[2] / n] : vecs[0]
    try { stel.lookAt(target, 1.0) } catch (e) {}
    // 视场覆盖最大角距（留 2.2 倍余量，限制在 28°~143°）
    let spread = 0
    vecs.forEach((v) => {
      const d = Math.acos(Math.max(-1, Math.min(1, v[0] * target[0] + v[1] * target[1] + v[2] * target[2])))
      if (d > spread) spread = d
    })
    try { stel.zoomTo(Math.max(0.5, Math.min(2.5, spread * 2.2)), 1.0) } catch (e) {}
  }, [skyMap])

  const search = useCallback(async (keyword) => {
    const k = (keyword ?? kw).trim()
    if (!k) { toast('error', t('starlinkEmpty')); return }
    setBusy(true)
    setSearched(true)
    try {
      const d = await api.get(`/starlink/users?q=${encodeURIComponent(k)}`)
      setMatched(d || [])
      // 命中后把视角带到匹配星群，让被匹配的星真正进入视野
      flyToMatches(stelRef.current, d || [])
    } catch (e) {
      setMatched([])
      toast('error', e.error || t('action.fail'))
    } finally {
      setBusy(false)
    }
  }, [kw, t, toast, flyToMatches])

  const pickInterest = (k) => { setKw(k); search(k) }

  /* 即输即搜：输入停顿 300ms 自动匹配 */
  useEffect(() => {
    const k = kw.trim()
    if (!k) return
    const id = setTimeout(() => search(k), 300)
    return () => clearTimeout(id)
  }, [kw]) // eslint-disable-line react-hooks/exhaustive-deps

  /* 定位我的星：视角转向当前用户的星（带到搜索框下方可见区域） */
  const locateMe = () => {
    const me = users.find((u) => u.is_me)
    if (!me) { toast('info', t('starlinkNoMe')); return }
    if (locateStar(me)) toast('success', t('starlinkLocateDone'))
  }

  const toggleFollow = async (u) => {
    if (!user) { navigate('/login', { state: { from: location.pathname } }); return }
    try {
      await api.post(`/users/${u.id}/follow`)
      setFollowing((f) => ({ ...f, [u.id]: !f[u.id] }))
      toast('success', t('saved'))
    } catch (e) {
      toast('error', e.error || t('action.fail'))
    }
  }

  const isFollowing = (u) => (following[u.id] !== undefined ? following[u.id] : u.is_following)

  /* 匹配结果之间的星座连线（按 id 排序依次相连） */
  const lines = useMemo(() => {
    if (matched.length < 2) return []
    const ids = [...matched].sort((a, b) => a.id - b.id)
    const out = []
    for (let i = 1; i < ids.length; i++) {
      out.push({ key: `${ids[i - 1].id}-${ids[i].id}`, from: ids[i - 1].id, to: ids[i].id })
    }
    return out
  }, [matched])

  const activeIds = useMemo(() => new Set(matched.map((u) => u.id)), [matched])

  /* 星点大小/亮度随用户集星数（Polestars 星空：星越多越亮越大） */
  const starStyle = (n) => {
    const s = n.star_total || 0
    const size = Math.min(14, 5 + s * 0.55)
    return { width: size + 'px', height: size + 'px', opacity: Math.min(1, 0.35 + s * 0.09) }
  }

  return (
    <div className="polarium pl-starlink">
      {/* 真实 Stellarium 星空（WebGL canvas） */}
      <canvas ref={canvasRef} className="pl-stel-canvas" />

      {/* 星座连线（匹配成功用户之间） */}
      <svg ref={svgRef} className="pl-star-lines">
        {lines.map((l) => (
          <line key={l.key} data-from={l.from} data-to={l.to} />
        ))}
      </svg>

      {/* 用户星点（投影到天球坐标） */}
      {engineReady && (
        <div ref={fieldRef} className="pl-star-field">
          {users.map((u) => {
            const on = activeIds.has(u.id)
            const dim = searched && !on
            return (
              <button
                key={u.id}
                data-id={u.id}
                className={`pl-star-node ${on ? 'on' : ''} ${dim ? 'dim' : ''} ${u.is_online ? 'online' : ''} ${u.is_me ? 'me' : ''}`}
                onClick={() => (on ? locateStar(u, true) : navigate(`/profile/${u.id}`))}
                title={on ? t('starlinkGoTo') : u.username}
              >
                <span className="pl-star-dot" style={starStyle(u)} />
                {on && <span className="pl-star-name">{u.username}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* 顶部导航 */}
      <nav className="pl-navbar">
        <div className="pl-container">
          <Link className="pl-brand" to="/"><span className="pl-logo">✦</span> Polarium</Link>
          <div className="pl-navlinks">
            <Link to="/">{t('landingHome')}</Link>
            <Link to="/social">{t('socialNav')}</Link>
            <Link to="/starlink" className="on">{t('starlink')}</Link>
            {user ? (
              <Link to={`/profile/${user.id}`}>{t('navProfile')}</Link>
            ) : (
              <Link to="/login" state={{ from: location.pathname }}>{t('navProfile')}</Link>
            )}
            {user && user.role === 'admin' && <Link to="/admin">{t('manage')}</Link>}
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

      {/* 中央搜索卡 */}
      <div className="pl-starlink-overlay">
        <div className="pl-search-card pl-star-card">
          <h1>✦ <span className="pl-grad">{t('starlink')}</span></h1>
          <div className="pl-sub">{t('starlinkSub')}</div>
          <div className="pl-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={kw}
              placeholder={t('starlinkPh')}
              onChange={(e) => setKw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              autoFocus
            />
            <span className="pl-kbd">↵</span>
          </div>
          <div className="pl-types">
            <button className="on" onClick={() => search()}>{busy ? t('searching') : t('starlinkMatch')}</button>
            {user && <button onClick={locateMe}>🔭 {t('starlinkLocate')}</button>}
          </div>
          {hotInterests.length > 0 && (
            <div className="pl-star-hots">
              <span className="pl-muted">{t('starlinkHot')}:</span>
              {hotInterests.map((k) => (
                <button key={k} onClick={() => pickInterest(k)}>#{k}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 匹配结果面板 */}
      {(searched || busy) && (
        <div className="pl-star-results">
          <div className="pl-star-results-head">
            <span>⭑ {t('starlinkResults')} · {matched.length}</span>
            <button className="pl-muted" onClick={() => { setSearched(false); setMatched([]) }}>{t('starlinkClear')}</button>
          </div>
          {busy ? (
            <div className="pl-muted" style={{ fontSize: 13, padding: '6px 4px' }}>{t('loading')}…</div>
          ) : matched.length === 0 ? (
            <div className="pl-muted" style={{ fontSize: 13, padding: '6px 4px' }}>{t('noResult')}</div>
          ) : (
            <div className="pl-star-strip">
              {matched.map((u) => (
                <div key={u.id} className="pl-star-user">
                  <button className="pl-star-user-main" onClick={() => locateStar(u, true)} title={t('starlinkGoTo')}>
                    <span className="pl-avatar" style={{ backgroundImage: u.avatar ? `url(${u.avatar})` : undefined }}>
                      {u.avatar ? '' : (u.username || '?').charAt(0)}
                    </span>
                    <div className="pl-star-user-info">
                      <div className="pl-star-user-name">
                        {u.username}
                        <span className="pl-star-user-star" title={`${u.star_total || 0} ⭐`}
                          style={{ fontSize: Math.min(15, 9 + (u.star_total || 0) * 0.6) + 'px', opacity: Math.min(1, 0.35 + (u.star_total || 0) * 0.09) }}>
                          ✦
                        </span>
                        {u.is_online && <i className="pl-star-online" />}
                        {typeof u.score === 'number' && <span className="pl-star-score">♡ {t('starlinkScore')} {Math.round(u.score * 100)}%</span>}
                      </div>
                      {u.learning_interest && <div className="pl-star-user-tags">{(u.learning_interest || '').split(/[,，\s]+/).filter(Boolean).slice(0, 3).map((k) => <span key={k}>#{k}</span>)}</div>}
                      <div className="pl-muted" style={{ fontSize: 11.5 }}>{u.nationality && <Flag code={u.nationality} size={13} />} {u.nationality || t('notSet')} · {u.bio ? u.bio.slice(0, 24) : t('notSet')}</div>
                    </div>
                  </button>
                  <div className="pl-star-user-ops">
                    <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => locateStar(u, true)}>🔭 {t('starlinkGoTo')}</button>
                    <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => navigate(`/profile/${u.id}`)}>{t('starlinkProfile')}</button>
                    {!u.is_me && user && (
                      <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => toggleFollow(u)}>
                        {isFollowing(u) ? t('unfollowBtn') : t('followBtn')}
                      </button>
                    )}
                    {!u.is_me && !user && (
                      <button className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => navigate('/login', { state: { from: location.pathname } })}>{t('login')}</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 底部提示 */}
      <div className="pl-star-tip">✦ {t('starlinkTip')}</div>
    </div>
  )
}
