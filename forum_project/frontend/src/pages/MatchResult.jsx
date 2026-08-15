import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { Markdown, EmptyState, SkeletonList } from '../components'

export default function MatchResult() {
  const { id } = useParams()
  const { t } = useTranslation()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState(0)
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    setData(null)
    setErr('')
    api.get(`/match/result/${id}`).then(setData).catch((e) => setErr(e.error || t('loadFailed')))
  }, [id])

  if (err) return <EmptyState title={err} />
  if (!data) return <SkeletonList count={2} />

  const list = data.literature

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('matchResult')}</h1>
          <div className="sub">"{data.record.keyword}" · {data.record.result_count} {t('resultCount')}</div>
        </div>
        <div className="actions">
          <Link className="btn btn-ghost btn-sm" to="/match">{t('backToMatch')}</Link>
          <Link className="btn btn-ghost btn-sm" to="/match/history">{t('matchHistory')}</Link>
        </div>
      </div>

      {data.summary && (
        <div className="card" style={{ borderColor: 'rgba(79,107,255,.4)' }}>
          <div className="card-title" style={{ color: 'var(--primary-2)' }}>✨ {t('summary')}</div>
          <Markdown text={data.summary} />
        </div>
      )}

      {data.errors && data.errors.length > 0 && (
        <div className="card mt-2" style={{ borderColor: 'rgba(255,140,80,.4)' }}>
          <div className="card-title" style={{ color: '#e08a3c' }}>⚠ {t('retrieveWarn')}</div>
          {data.errors.map((e, i) => (
            <div key={i} className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{e}</div>
          ))}
        </div>
      )}

      <div className="page-head mt-3">
        <div><h1 style={{ fontSize: 18 }}>{t('literature')} · {list.length}</h1></div>
      </div>

      {list.length === 0
        ? <EmptyState title={t('noResultMatch')} />
        : list.map((r, i) => {
          const title = r.title || r.name || r.publication_name || r['公开（公告）号'] || r['标题'] || ''
          const num = r['公开（公告）号'] || r.patent_number || r.id || ''
          const applicant = r['申请人'] || r.assignee || r.applicant || ''
          const abs = r['摘要'] || r.abstract || r.summary || r.snippet || ''
          return (
          <div key={i} className="result-card">
            <div className="r-title">
              {r.url ? <a href={r.url} target="_blank" rel="noopener">{title} ↗</a> : title}
            </div>
            <div className="r-meta">
              {num && <span className="tag">{num}</span>}
              {r.date && <span className="tag">{r.date}</span>}
              {applicant && <span className="tag">{applicant}</span>}
              {r.author && <span className="tag">{r.author}</span>}
            </div>
            {abs && (
              <p className={`r-abs ${expanded[i] ? '' : 'hide'}`}>{abs}</p>
            )}
            {abs && (
              <button className="btn btn-ghost btn-sm mt-1" onClick={() => setExpanded((s) => ({ ...s, [i]: !s[i] }))}>
                {expanded[i] ? t('collapse') : t('expand')}
              </button>
            )}
          </div>
        )})}
    </>
  )
}
