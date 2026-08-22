import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

/* 星星在瓶内的分布点（百分比） */
const POS = [
  [50, 28], [30, 54], [68, 40], [45, 70], [78, 60],
  [25, 78], [60, 88], [88, 82], [40, 38], [70, 72], [52, 58], [16, 64],
]
/* 瓶内最多同时渲染的星星数（发帖/被关注每颗累积，过多时只展示最新的） */
const MAX_STARS = 12

/* 集星瓶：成长记录站
   count  = 当前应显示的星星总数
   labels = 有序的成就说明列表（长度 = count）
   打开主页时，把「未展示的累计加分」播放动效：
   - 新增 ≤3 颗：逐个飞入
   - 新增 >3 颗：统一展示 3 颗星动效，其余淡入补全，气泡显示累计 +N ⭐
   播放完更新本地记录，刷新后静态展示。 */
export default function StarJar({ userId, count, labels }) {
  const { t } = useTranslation()
  const key = `starjar_${userId}`
  const prev = useMemo(() => {
    try { return Number(localStorage.getItem(key) || 0) } catch { return 0 }
  }, [key])
  const newCount = Math.max(0, count - prev)   // 未展示的累计加分
  const animCount = Math.min(newCount, 3)      // 动效星数最多 3 颗
  const [revealed, setRevealed] = useState(0)
  const [celebrate, setCelebrate] = useState(false)
  const [pop, setPop] = useState('')
  const timers = useRef([])

  useEffect(() => {
    if (newCount <= 0) {
      try { localStorage.setItem(key, String(count)) } catch {}
      return
    }
    setRevealed(0)
    let i = 0
    const iv = setInterval(() => {
      i++
      setRevealed(i)
      if (i >= animCount) {
        clearInterval(iv)
        // 超过 3 颗：其余星星统一淡入补全
        if (newCount > animCount) {
          timers.current.push(setTimeout(() => setRevealed(newCount), 450))
        }
        timers.current.push(setTimeout(() => {
          setCelebrate(true)
          setPop(`+${newCount} ⭐`)
        }, 750))
        timers.current.push(setTimeout(() => {
          setCelebrate(false)
          setPop('')
          try { localStorage.setItem(key, String(count)) } catch {}
        }, 2700))
      }
    }, 320)
    return () => { clearInterval(iv); timers.current.forEach(clearTimeout); timers.current = [] }
  }, [newCount, animCount, count, key])

  const base = count - newCount
  /* 只渲染最新的 MAX_STARS 颗（旧星堆在瓶底，避免海量星星重叠） */
  const from = Math.max(0, count - MAX_STARS)
  const visible = labels.slice(from)
  const clsOf = (i) => {
    const r = i - base
    if (r < 0) return ''
    if (r < revealed) return r < animCount ? 'enter' : 'fade'
    return 'hide'
  }

  return (
    <div className="card jar-card">
      <div className="jar-head">
        <div className="jar-title">
          {t('jarTitle')}
          <small>{t('jarSub')}</small>
        </div>
        <div className="jar-count"><small>{t('jarCollected')}</small> {count} ⭐</div>
      </div>
      <div className="jar-wrap">
        <div className={'jar' + (celebrate ? ' celebrate' : '')}>
          <div className="jar-lip" />
          <div className="jar-neck" />
          <div className="jar-body">
            <div className="jar-glow" />
            <div className="stars">
              {visible.map((s, i) => {
                const g = from + i
                const p = POS[g % POS.length]
                const cls = clsOf(g)
                return (
                  <div key={g}
                    className={'star' + (cls ? ' ' + cls : '')}
                    style={{ left: p[0] + '%', top: p[1] + '%' }}
                    title={s.label}>
                    <svg viewBox="0 0 24 24" fill="#fbbf24">
                      <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
                    </svg>
                  </div>
                )
              })}
            </div>
          </div>
          <div className={'pop' + (pop ? ' show' : '')}>{pop}</div>
        </div>
      </div>
    </div>
  )
}
