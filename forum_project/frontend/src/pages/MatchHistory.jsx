import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { EmptyState, SkeletonList } from '../components'

export default function MatchHistory() {
  const { t } = useTranslation()
  const [rows, setRows] = useState(null)

  useEffect(() => {
    api.get('/match/history').then(setRows).catch(() => setRows([]))
  }, [])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('matchHistory')}</h1>
        </div>
        <div className="actions">
          <Link className="btn btn-primary btn-sm" to="/match">+ {t('runSearch')}</Link>
        </div>
      </div>

      {!rows ? <SkeletonList /> : rows.length === 0 ? (
        <EmptyState title={t('emptyHistory')} />
      ) : (
        <div className="card table-wrap" style={{ padding: '8px 6px' }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('keyword')}</th><th>{t('resultCount')}</th><th>{t('time')}</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><span style={{ fontWeight: 600 }}>{r.keyword}</span></td>
                  <td><span className="tag">{r.result_count}</span></td>
                  <td className="muted">{r.create_time}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Link className="btn btn-ghost btn-sm" to={`/match/result/${r.id}`}>{t('view')}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
