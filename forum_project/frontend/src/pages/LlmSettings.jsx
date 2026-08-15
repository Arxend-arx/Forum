import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'

export default function LlmSettings() {
  const { t } = useTranslation()
  const { toast } = useApp()
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [configured, setConfigured] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    api.get('/settings/llm').then((d) => {
      setBaseUrl(d.base_url || '')
      setModel(d.model || '')
      setConfigured(d.configured || false)
    }).catch(() => { /* ignore */ })
  }, [])

  const save = async () => {
    if (!baseUrl || !apiKey || !model) { toast('error', t('cfgEmpty')); return }
    try {
      await api.post('/settings/llm', { base_url: baseUrl, api_key: apiKey, model })
      setConfigured(true)
      toast('success', t('cfgSaved'))
    } catch (e) {
      toast('error', e.error || t('action.fail'))
    }
  }

  const test = async () => {
    if (!baseUrl || !apiKey || !model) { toast('error', t('cfgEmpty')); return }
    setTesting(true)
    try {
      await api.post('/settings/llm/test', { base_url: baseUrl, api_key: apiKey, model })
      toast('success', t('testSuccess'))
    } catch (e) {
      toast('error', e.error || t('testFail'))
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('llmTitle')}</h1>
          <div className="sub">{t('llmSub')}</div>
        </div>
        <div className="actions">
          <span className={`status ${configured ? 'ok' : 'warn'}`}>
            <span className="dot" />{t(configured ? 'keyMasked' : 'notConfigured')}
          </span>
        </div>
      </div>

      <div className="card form">
        <div className="form-group">
          <label>{t('baseUrl')}</label>
          <input className="input" value={baseUrl} placeholder={t('baseUrlPh')} onChange={(e) => setBaseUrl(e.target.value)} />
        </div>
        <div className="form-group">
          <label>{t('apiKey')}</label>
          <input className="input" type="password" value={apiKey} placeholder="sk-…" onChange={(e) => setApiKey(e.target.value)} />
        </div>
        <div className="form-group">
          <label>{t('model')}</label>
          <input className="input" value={model} placeholder={t('modelPh')} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn-ghost" disabled={testing} onClick={test}>
            {testing ? t('testing') : t('testConn')}
          </button>
          <button className="btn btn-primary" onClick={save}>{t('saveCfg')}</button>
        </div>
      </div>
    </>
  )
}
