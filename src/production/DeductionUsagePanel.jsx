import { useEffect, useMemo, useState } from 'react'
import { findMaterial } from '../entry/materials'
import { createEntryRepository, errorMessage } from '../entry/entryRepository'
import { usageReport } from '../entry/stock'
import { formatNumber, todayISO } from '../entry/format'
import '../entry/entry.css'

// Raw material used (Production Deduction in Material Entry) against what was made in the same dates

const rateFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 })
const formatRate = value => (value === null || value === undefined ? '—' : rateFormat.format(value))

const monthStartISO = () => `${todayISO().slice(0, 8)}01`

export default function DeductionUsagePanel({ token, production }) {
  const repo = useMemo(() => createEntryRepository(token), [token])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [fromDate, setFromDate] = useState(monthStartISO)
  const [toDate, setToDate] = useState(todayISO)

  useEffect(() => {
    repo.list()
      .then(rows => { setEntries(rows); setLoadError('') })
      .catch(err => setLoadError(errorMessage(err)))
      .finally(() => setLoading(false))
  }, [repo])

  const report = useMemo(() => usageReport(entries, production, fromDate, toDate), [entries, production, fromDate, toDate])

  return (
    <div className="em-root em-plain">
      <div className="em-card">
        <div className="em-card-head">
          <h3>🧮 Raw Material Used vs Production</h3>
          <span className="em-muted">Used = Production Deductions in Material Entry for these dates</span>
        </div>

        <div className="em-filters">
          <label className="em-filter">
            <span>From</span>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </label>
          <label className="em-filter">
            <span>To</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </label>
        </div>

        <div className="em-summary">
          <div><span>Dozens made</span><strong>{formatNumber(report.dozens)}</strong></div>
          <div><span>Pairs made</span><strong>{formatNumber(report.pairs)}</strong></div>
        </div>

        {loading ? (
          <div className="em-center">Loading material…</div>
        ) : loadError ? (
          <div className="em-banner em-banner-error" role="alert">{loadError}</div>
        ) : (
          <div className="em-table-wrap">
            <table className="em-table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th className="em-num">Received</th>
                  <th className="em-num">Used</th>
                  <th className="em-num">In stock now</th>
                  <th className="em-num">Used / dozen</th>
                  <th className="em-num">Used / pair</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.length === 0 && (
                  <tr className="em-empty-row"><td colSpan={6}>No material received or deducted yet.</td></tr>
                )}
                {report.rows.map(r => (
                  <tr key={`${r.material}|${r.unit}`}>
                    <td data-label="Material">
                      <span className="em-badge" style={{ '--badge': findMaterial(r.material)?.color || '#475569' }}>{r.material}</span>
                    </td>
                    <td data-label="Received" className="em-num">{formatNumber(r.received)} {r.unit}</td>
                    <td data-label="Used" className="em-num"><strong>{formatNumber(r.used)} {r.unit}</strong></td>
                    <td data-label="In stock now" className={`em-num ${r.balance < 0 ? 'em-due' : ''}`}>{formatNumber(r.balance)} {r.unit}</td>
                    <td data-label="Used / dozen" className="em-num">{r.perDozen === null ? '—' : `${formatRate(r.perDozen)} ${r.unit}`}</td>
                    <td data-label="Used / pair" className="em-num">{r.perPair === null ? '—' : `${formatRate(r.perPair)} ${r.unit}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && report.dozens === 0 && report.rows.some(r => r.used > 0) && (
          <p className="em-hint">No production entered for these dates, so usage per dozen can't be worked out.</p>
        )}
      </div>
    </div>
  )
}
