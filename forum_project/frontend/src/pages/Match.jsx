import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'
import { SkeletonList } from '../components'

export default function Match() {
  const { t } = useTranslation()
  const { toast } = useApp()
  const navigate = useNavigate()
  const [info, setInfo] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [useInterest, setUseInterest] = useState(true)
  const [useLLM, setUseLLM] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get('/match').then(setInfo).catch(() => setInfo({ default_interest: '', llm_ready: false, mcp_ready: false }))
  }, [])

  const run = async () => {
    if (!keyword.trim()) { toast('error', t('keywordPh')); return }
    setBusy(true)
    try {
      const d = await api.post('/match/search', { keyword, use_interest: useInterest, use_llm: useLLM })
      navigate(`/match/result/${d.search_id}`)
    } catch (e) {
      toast('error', e.error || t('action.fail'))
      setBusy(false)
    }
  }

  if (!info) return <SkeletonList count={2} />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('matchTitle')}</h1>
          <div className="sub">{t('matchSub')}</div>
        </div>
        <div className="actions">
          <Link className="btn btn-ghost btn-sm" to="/match/history">{t('matchHistory')}</Link>
          <Link className="btn btn-ghost btn-sm" to="/settings/llm">{t('settings')}</Link>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 12, marginBottom: 18 }}>
        <div className="card" style={{ flex: 1, minWidth: 180, padding: '16px 18px', margin: 0 }}>
          <span className={`status ${info.mcp_ready ? 'ok' : 'err'}`}><span className="dot" />{t(info.mcp_ready ? 'mcpReady' : 'mcpNotReady')}</span>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 180, padding: '16px 18px', margin: 0 }}>
          <span className={`status ${info.llm_ready ? 'ok' : 'warn'}`}><span className="dot" />{t(info.llm_ready ? 'llmReady' : 'llmNotReady')}</span>
          {info.llm_model && <div className="muted mt-1" style={{ fontSize: 12.5 }}>{info.llm_model}</div>}
        </div>
      </div>

      <div className="card form">
        <div className="form-group">
          <label>{t('keywordPh')}</label>
          <input className="input" value={keyword} placeholder={t('keywordPh')}
            onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} />
          {info.default_interest && <span className="hint mt-1">↳ {info.default_interest}</span>}
        </div>
        <label className="switch">
          <div>
            <div className="lbl">{t('useInterest')}</div>
            <div className="dsc">{info.default_interest || t('notSet')}</div>
          </div>
          <input type="checkbox" checked={useInterest} onChange={(e) => setUseInterest(e.target.checked)} />
        </label>
        <label className="switch">
          <div>
            <div className="lbl">{t('useLLM')}</div>
            <div className="dsc">{info.llm_model || t('llmNotReady')}</div>
          </div>
          <input type="checkbox" checked={useLLM} onChange={(e) => setUseLLM(e.target.checked)} />
        </label>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={run}>
          {busy ? t('searching') : t('runSearch')}
        </button>
      </div>

      {busy && (
        <div className="card" style={{ marginTop: 18, padding: '22px', textAlign: 'center' }}>
          <div className="progress"><div className="bar" /></div>
          <div className="mt-2" style={{ fontWeight: 700 }}>{t('matchLoading')}</div>
          <div className="muted mt-1" style={{ fontSize: 12.5 }}>{t('matchLoadingTip')}</div>
        </div>
      )}
    </>
  )
}
