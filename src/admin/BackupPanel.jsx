import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import '../entry/entry.css'

// Admin backups: download a full copy now, email one now, test that a backup loads back, and see their status.

const API_BASE_URL = import.meta.env.VITE_API_URL || ''
const errorText = err => err?.response?.data?.message || (err?.response ? `Server error (HTTP ${err.response.status})` : 'Could not reach the server.')
const when = value => new Date(value).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
const hourText = h => `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`

export default function BackupPanel({ token }) {
  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token])
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState(null)

  const load = useCallback(() => axios.get(`${API_BASE_URL}/api/backup/status`, headers)
    .then(res => setStatus(res.data))
    .catch(err => setMessage({ tone: 'error', text: errorText(err) })), [headers])

  useEffect(() => { load() }, [load])

  const download = async () => {
    setBusy('download')
    setMessage(null)
    try {
      const res = await axios.get(`${API_BASE_URL}/api/backup/download`, { ...headers, responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `plus-evr-erp-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setMessage({ tone: 'error', text: errorText(err) })
    } finally {
      setBusy('')
    }
  }

  const emailNow = async () => {
    setBusy('email')
    setMessage(null)
    try {
      const res = await axios.post(`${API_BASE_URL}/api/backup/email-now`, null, headers)
      setMessage({ tone: 'success', text: `${res.data.message} Check ${status?.to}.` })
    } catch (err) {
      setMessage({ tone: 'error', text: errorText(err) })
    } finally {
      setBusy('')
      load()
    }
  }

  const restoreTest = async () => {
    setBusy('restore')
    setMessage(null)
    try {
      const res = await axios.post(`${API_BASE_URL}/api/backup/restore-test`, null, headers)
      setMessage({ tone: res.data.passed ? 'success' : 'error', text: [res.data.summary, ...(res.data.problems || []).slice(0, 5)].join(' ') })
    } catch (err) {
      setMessage({ tone: 'error', text: errorText(err) })
    } finally {
      setBusy('')
      load()
    }
  }

  const last = status?.recent?.find(a => a.action.startsWith('backup_'))
  const test = status?.restoreTest
  const testResult = test ? (() => { try { return JSON.parse(test.changes) } catch { return {} } })() : {}
  const testSummary = testResult.Summary || ''
  const testProblems = test?.action === 'restore_test_failed' ? testResult.problems || [] : []
  const lastError = last?.action === 'backup_failed' ? (() => { try { return JSON.parse(last.changes).error } catch { return '' } })() : ''

  return (
    <div className="em-root em-plain">
      <div className="em-card">
        <div className="em-card-head">
          <h3>💾 Backups</h3>
          <div className="em-head-actions">
            <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={download} aria-busy={busy === 'download'} disabled={!!busy}>
              {busy === 'download' ? 'Preparing…' : '⬇ Download backup now'}
            </button>
            <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={restoreTest} aria-busy={busy === 'restore'} disabled={!!busy}>
              {busy === 'restore' ? 'Testing…' : '🧪 Test restore now'}
            </button>
            <button type="button" className="em-btn em-btn-primary em-btn-sm" onClick={emailNow} aria-busy={busy === 'email'} disabled={!!busy || !status?.configured}>
              {busy === 'email' ? 'Sending…' : '✉️ Email backup now'}
            </button>
          </div>
        </div>
        {message && <div className={`em-banner ${message.tone === 'error' ? 'em-banner-error' : 'em-banner-success'}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</div>}
        {status && (status.configured ? (
          <p className="em-hint" style={{ margin: 0 }}>
            A full backup is emailed to <strong>{status.to}</strong> every night at {hourText(status.hourPakistan)} (Pakistan time).{' '}
            {last ? <>Last: <strong>{last.action === 'backup_emailed' ? '✅ sent' : '❌ failed'}</strong> {when(last.at)}{lastError ? ` (${lastError})` : ''}.</> : 'None sent yet.'}
          </p>
        ) : (
          <p className="em-hint" style={{ margin: 0 }}>
            Nightly email backup is <strong>off</strong>. To turn it on, add BACKUP_EMAIL_TO, SMTP_USER and SMTP_PASSWORD
            (a Gmail app password) to the app's variables on Railway. You can still download a backup any time.
          </p>
        ))}
        {status && (
          <p className="em-hint" style={{ margin: '8px 0 0' }}>
            Every Sunday at 3:00 AM a fresh backup is loaded back into a temporary copy and checked row by row; you get an email if it fails.{' '}
            {test ? <>Last test: <strong>{test.action === 'restore_test_passed' ? '✅ passed' : '❌ failed'}</strong> {when(test.at)}{testSummary ? ` (${testSummary})` : ''}.</> : 'Not run yet.'}
          </p>
        )}
        {testProblems.length > 0 && (
          <ul className="em-hint" style={{ margin: '6px 0 0', paddingLeft: '18px', color: '#b91c1c' }}>
            {testProblems.map(problem => <li key={problem}>{problem}</li>)}
          </ul>
        )}
      </div>
    </div>
  )
}
