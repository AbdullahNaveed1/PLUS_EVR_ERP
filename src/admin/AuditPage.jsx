import { Fragment, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { todayISO } from '../entry/format'
import BackupPanel from './BackupPanel'
import '../entry/entry.css'

// Admin page: every add / edit / delete, sign-in and user change, newest first. Read-only.

const API_BASE_URL = import.meta.env.VITE_API_URL || ''
const PAGE_SIZE = 50
const errorText = err => err?.response?.data?.message || (err?.response ? `Server error (HTTP ${err.response.status})` : 'Could not reach the server.')

const ENTITY_NAMES = {
  Sale: 'Bill', Payment: 'Payment', Customer: 'Customer', Product: 'Stock item', Article: 'Article',
  ProductPriceHistory: 'Price change', ProductionRecord: 'Production', RawMaterial: 'Raw material',
  MaterialEntry: 'Material entry', MaterialCount: 'Material count', Expense: 'Expense', Worker: 'Worker',
  WagePayment: 'Wage payment', BomEntry: 'Recipe line', User: 'User', Supplier: 'Supplier',
  SupplierPayment: 'Supplier payment', SalesReturn: 'Sales return', Backup: 'Backup'
}
const ACTIONS = {
  create: { label: 'Added', tone: 'good' },
  update: { label: 'Edited', tone: 'info' },
  delete: { label: 'Deleted', tone: 'bad' },
  login: { label: 'Signed in', tone: 'muted' },
  login_failed: { label: 'Failed sign-in', tone: 'bad' },
  backup_emailed: { label: 'Backup emailed', tone: 'good' },
  backup_failed: { label: 'Backup failed', tone: 'bad' }
}
// Internal fields that only add noise to the summary line
const HIDDEN = new Set(['Id', 'CreatedAt', 'UpdatedAt', 'PasswordHash', 'LineItemsJson', 'SizesJson'])

const daysAgoISO = days => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}
const when = iso => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
const show = value => (value === null || value === undefined || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value))
const parse = text => { try { return JSON.parse(text || 'null') } catch { return null } }

// One-line summary of what changed
const summarize = log => {
  const data = parse(log.changes)
  if (!data) return ''
  if (log.action === 'login' || log.action === 'login_failed') return data.ip ? `from ${data.ip}` : ''
  if (log.entity === 'Backup') return [data.to && `to ${data.to}`, data.sizeKb && `${data.sizeKb} KB`, data.error].filter(Boolean).join(' · ')
  const fields = Object.entries(data).filter(([k]) => !HIDDEN.has(k))
  if (log.action === 'update') {
    const parts = fields.map(([k, v]) => `${k}: ${show(v?.old)} → ${show(v?.new)}`)
    if (data.PasswordHash) parts.unshift('Password reset')
    if (data.LineItemsJson) parts.push('Bill items changed')
    if (data.SizesJson) parts.push('Sizes changed')
    return parts.join(' · ')
  }
  return fields.filter(([, v]) => v !== null && v !== '' && v !== false).slice(0, 6).map(([k, v]) => `${k}: ${show(v)}`).join(' · ')
}

export default function AuditPage({ token }) {
  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token])
  const [filters, setFilters] = useState({ from: daysAgoISO(7), to: todayISO(), user: '', entity: '', action: '' })
  const [options, setOptions] = useState({ users: [], entities: [] })
  const [page, setPage] = useState(1)
  const [result, setResult] = useState({ total: 0, items: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/audit/filters`, headers).then(res => setOptions(res.data)).catch(() => {})
  }, [headers])

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/audit`, { ...headers, params: { ...filters, page, pageSize: PAGE_SIZE } })
      .then(res => { setResult(res.data); setError('') })
      .catch(err => setError(errorText(err)))
      .finally(() => setLoading(false))
  }, [headers, filters, page])

  const setFilter = (key, value) => { setFilters(prev => ({ ...prev, [key]: value })); setPage(1); setLoading(true) }
  const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE))

  return (
    <div className="em-root em-plain">
      <div className="em-title"><h2>🕵️ Audit Log <span className="em-muted">(every change, who and when)</span></h2></div>

      <BackupPanel token={token} />

      <div className="em-card">
        <div className="em-filters">
          <label className="em-filter"><span>From</span><input type="date" value={filters.from} onChange={e => setFilter('from', e.target.value)} /></label>
          <label className="em-filter"><span>To</span><input type="date" value={filters.to} onChange={e => setFilter('to', e.target.value)} /></label>
          <label className="em-filter">
            <span>User</span>
            <select value={filters.user} onChange={e => setFilter('user', e.target.value)}>
              <option value="">Everyone</option>
              {options.users.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <label className="em-filter">
            <span>Record</span>
            <select value={filters.entity} onChange={e => setFilter('entity', e.target.value)}>
              <option value="">All records</option>
              {options.entities.map(e => <option key={e} value={e}>{ENTITY_NAMES[e] || e}</option>)}
            </select>
          </label>
          <label className="em-filter">
            <span>Action</span>
            <select value={filters.action} onChange={e => setFilter('action', e.target.value)}>
              <option value="">All actions</option>
              {Object.entries(ACTIONS).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
            </select>
          </label>
        </div>

        <div className="em-totals"><span><strong>{result.total.toLocaleString()}</strong> changes</span></div>

        {error ? <div className="em-banner em-banner-error" role="alert">{error}</div> : loading ? <div className="em-center">Loading…</div> : (
          <div className="em-table-wrap">
            <table className="em-table">
              <thead><tr><th>When</th><th>User</th><th>Action</th><th>Record</th><th>What changed</th></tr></thead>
              <tbody>
                {result.items.length === 0 && <tr className="em-empty-row"><td colSpan={5}>Nothing recorded for these filters.</td></tr>}
                {result.items.map(log => {
                  const action = ACTIONS[log.action] || { label: log.action, tone: 'muted' }
                  const open = openId === log.id
                  return (
                    <Fragment key={log.id}>
                      <tr>
                        <td data-label="When">{when(log.at)}</td>
                        <td data-label="User"><strong>{log.user}</strong></td>
                        <td data-label="Action"><span className={`em-audit-tag em-audit-${action.tone}`}>{action.label}</span></td>
                        <td data-label="Record">{ENTITY_NAMES[log.entity] || log.entity}{log.entityId ? ` #${log.entityId}` : ''}</td>
                        <td data-label="What changed" className="em-audit-summary">
                          <span>{summarize(log) || '—'}</span>
                          {log.changes && (
                            <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => setOpenId(open ? null : log.id)}>
                              {open ? 'Hide' : 'Details'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr className="em-subrow">
                          <td colSpan={5}><pre className="em-audit-json">{JSON.stringify(parse(log.changes), null, 2)}</pre></td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {pageCount > 1 && (
          <div className="em-pager">
            <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => { setPage(page - 1); setLoading(true) }} disabled={page === 1}>‹ Newer</button>
            <span>Page {page} of {pageCount}</span>
            <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => { setPage(page + 1); setLoading(true) }} disabled={page === pageCount}>Older ›</button>
          </div>
        )}
      </div>
    </div>
  )
}
