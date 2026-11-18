import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import '../entry/entry.css'

// Admin month closing: once a month's books are checked, close it so nothing dated in it can be added,
// changed or removed. Reopening needs a reason, which goes to the audit log.

const API_BASE_URL = import.meta.env.VITE_API_URL || ''
const errorText = err => err?.response?.data?.message || (err?.response ? `Server error (HTTP ${err.response.status})` : 'Could not reach the server.')
const monthName = key => new Date(`${key}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
const when = value => new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })

// The last 12 months that have ended, newest first, as yyyy-MM
const endedMonths = () => {
  const now = new Date()
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

export default function PeriodsPanel({ token }) {
  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token])
  const [closed, setClosed] = useState([])
  const [month, setMonth] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  const load = useCallback(() => axios.get(`${API_BASE_URL}/api/periods`, headers)
    .then(res => setClosed(res.data || []))
    .catch(err => setMessage({ tone: 'error', text: errorText(err) })), [headers])

  useEffect(() => { load() }, [load])

  const open = endedMonths().filter(m => !closed.some(c => c.month === m))
  const selected = month && open.includes(month) ? month : open[0] || ''

  const run = async (action, body, confirmText) => {
    if (busy || (confirmText && !window.confirm(confirmText))) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await axios.post(`${API_BASE_URL}/api/periods/${action}`, body, headers)
      setMessage({ tone: 'success', text: res.data.message })
      await load()
    } catch (err) {
      setMessage({ tone: 'error', text: errorText(err) })
    } finally {
      setBusy(false)
    }
  }

  const reopen = m => {
    const reason = window.prompt(`Why reopen ${monthName(m)}? (saved in the audit log)`)
    if (reason === null) return
    if (!reason.trim()) { setMessage({ tone: 'error', text: 'Give a reason for reopening the month.' }); return }
    run('reopen', { month: m, reason })
  }

  return (
    <div className="em-root em-plain">
      <div className="em-card">
        <div className="em-card-head">
          <h3>🔒 Close months</h3>
          <div className="em-head-actions">
            <select value={selected} onChange={e => setMonth(e.target.value)} disabled={busy || open.length === 0} aria-label="Month to close">
              {open.map(m => <option key={m} value={m}>{monthName(m)}</option>)}
            </select>
            <button type="button" className="em-btn em-btn-primary em-btn-sm" disabled={busy || !selected} aria-busy={busy}
              onClick={() => run('close', { month: selected }, `Close ${monthName(selected)}? Nothing dated in it can be added, changed or removed until an Admin reopens it.`)}>
              Close month
            </button>
          </div>
        </div>
        <p className="em-hint" style={{ marginTop: 0 }}>
          Close a month once its bills, cash, expenses, production and wages are checked. After that, nobody can add, change,
          cancel or delete anything dated in it until an Admin reopens it with a reason.
        </p>
        {message && <div className={`em-banner ${message.tone === 'error' ? 'em-banner-error' : 'em-banner-success'}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</div>}
        {closed.length === 0 ? (
          <p className="em-muted" style={{ margin: 0 }}>No month is closed yet.</p>
        ) : (
          <table className="em-table em-ledger">
            <thead><tr><th>Month</th><th>Closed</th><th>By</th><th></th></tr></thead>
            <tbody>
              {closed.map(c => (
                <tr key={c.month}>
                  <td><strong>{monthName(c.month)}</strong></td>
                  <td>{when(c.closedAt)}</td>
                  <td>{c.closedBy}</td>
                  <td><button type="button" className="em-btn em-btn-ghost em-btn-sm" disabled={busy} onClick={() => reopen(c.month)}>Reopen</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
