import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { formatDate, formatNumber, todayISO } from '../entry/format'
import ArticlePicker from '../common/ArticlePicker'
import '../entry/entry.css'

// Weekly piece-rate (thekka) wages, Saturday to Friday, paid on Saturday.
// Earned = dozens made × rate; final = earned − advances taken this week ± carry from last week.

const API_BASE_URL = import.meta.env.VITE_API_URL || ''
const rs = value => `Rs. ${formatNumber(Math.round((Number(value) || 0) * 100) / 100)}`
const errorText = err => err?.response?.data?.message || (err?.response ? `Server error (HTTP ${err.response.status})` : 'Could not reach the server.')
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const addDays = (iso, days) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
const carryText = v => (v > 0 ? `+ ${rs(v)} still owed to him` : v < 0 ? `− ${rs(-v)} extra advance from before` : 'Nothing')

const printSheet = (data, w) => {
  const lines = w.lines.map(l => `<tr><td>${escapeHtml(l.article)}</td><td>${escapeHtml(l.size || 'all sizes')}</td><td class="n">${formatNumber(l.dozens)}</td><td class="n">${formatNumber(l.rate)}</td><td class="n">${rs(l.amount)}</td></tr>`).join('')
  const adv = w.advances.map(a => `<tr><td>${formatDate(a.date)}</td><td>${escapeHtml(a.notes || 'Advance')}</td><td class="n">${rs(a.amount)}</td></tr>`).join('')
  const win = window.open('', '_blank', 'width=700,height=700')
  if (!win) return
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Wages ${escapeHtml(w.worker.name)}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px;color:#0f172a;font-size:13px}h1{color:#714B67;font-size:19px;margin:0 0 4px}
    table{width:100%;border-collapse:collapse;margin:8px 0 14px}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left}.n{text-align:right}
    .final{font-size:18px;font-weight:800}</style></head><body>
    <h1>Weekly wages: ${escapeHtml(w.worker.name)} (${escapeHtml(w.worker.role || '')})</h1>
    <div>Week ${formatDate(data.weekStart)} (Sat) to ${formatDate(data.weekEnd)} (Fri) · Payday ${formatDate(data.payday)}</div>
    <table><thead><tr><th>Article</th><th>Size</th><th class="n">Dozens</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead>
    <tbody>${lines || '<tr><td colspan="5">No production</td></tr>'}<tr><th colspan="2">Earned</th><th class="n">${formatNumber(w.dozens)}</th><th></th><th class="n">${rs(w.earned)}</th></tr></tbody></table>
    <table><thead><tr><th>Advance date</th><th>Note</th><th class="n">Amount</th></tr></thead>
    <tbody>${adv || '<tr><td colspan="3">No advances</td></tr>'}<tr><th colspan="2">Advances this week</th><th class="n">${rs(w.advanceTotal)}</th></tr></tbody></table>
    <p>Earned ${rs(w.earned)} − advances ${rs(w.advanceTotal)} ${w.carryIn ? `${w.carryIn > 0 ? '+' : '−'} carried ${rs(Math.abs(w.carryIn))}` : ''}</p>
    <p class="final">To pay: ${w.final >= 0 ? rs(w.final) : `nothing (${rs(-w.final)} advance carries to next week)`}</p>
    <script>window.onload = function () { window.print() }</script></body></html>`)
  win.document.close()
}

function RatesEditor({ token, worker, rates, products, onSaved }) {
  const [rows, setRows] = useState(() => rates.map(r => ({ articleNumber: r.articleNumber || '', size: r.size || '', ratePerDozen: String(r.ratePerDozen) })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const setRow = (i, field, value) => setRows(prev => prev.map((r, j) => (j === i ? { ...r, [field]: value } : r)))

  const save = async () => {
    if (rows.some(r => !(Number(r.ratePerDozen) > 0))) return setError('Every rate must be more than 0.')
    setSaving(true)
    setError('')
    try {
      await axios.put(`${API_BASE_URL}/api/wages/weekly/rates/${worker.id}`,
        rows.map(r => ({ articleNumber: r.articleNumber.trim() || null, size: r.size.trim() || null, ratePerDozen: Number(r.ratePerDozen) })),
        { headers: { Authorization: `Bearer ${token}` } })
      onSaved()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="em-ps">
      <span className="em-hint">Leave article or size empty for "all". The most specific rate is used.</span>
      {rows.map((r, i) => (
        <div key={i} className="em-ps-row">
          <ArticlePicker mode="article" allowNew label="Article (empty = all)" products={products} value={r.articleNumber}
            onChange={v => setRow(i, 'articleNumber', v)} placeholder="All articles" />
          <label className="em-field"><span className="em-label">Size (empty = all)</span>
            <input value={r.size} placeholder="All sizes, e.g. 7/10" onChange={e => setRow(i, 'size', e.target.value)} /></label>
          <label className="em-field"><span className="em-label">Rs / dozen</span>
            <input type="number" min="0" step="any" inputMode="decimal" value={r.ratePerDozen} onChange={e => setRow(i, 'ratePerDozen', e.target.value)} /></label>
          <button type="button" className="em-btn em-btn-danger em-btn-sm" aria-label="Remove rate" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      {error && <span className="em-error">{error}</span>}
      <div className="em-ps-foot">
        <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => setRows([...rows, { articleNumber: '', size: '', ratePerDozen: '' }])}>+ Add rate</button>
        <button type="button" className="em-btn em-btn-primary em-btn-sm" onClick={save} aria-busy={saving} disabled={saving}>{saving ? 'Saving…' : 'Save rates'}</button>
      </div>
    </div>
  )
}

export default function WeeklyWagesPanel({ token, workers, products, isAdmin, onPaymentsChanged }) {
  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token])
  const [day, setDay] = useState(todayISO)
  const [data, setData] = useState(null)
  const [rates, setRates] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [payAmount, setPayAmount] = useState({})
  const [busy, setBusy] = useState(null)
  const [editingRatesFor, setEditingRatesFor] = useState(null)

  const load = useCallback(() => Promise.all([
    axios.get(`${API_BASE_URL}/api/wages/weekly`, { ...headers, params: { weekStart: day } }),
    axios.get(`${API_BASE_URL}/api/wages/weekly/rates`, headers)
  ]).then(([week, rateRes]) => { setData(week.data); setRates(rateRes.data); setError('') })
    .catch(err => setError(errorText(err))), [headers, day])

  useEffect(() => { load() }, [load])

  const settle = async w => {
    const typed = payAmount[w.worker.id]
    const amount = typed === undefined || typed === '' ? Math.max(0, w.final) : Number(typed)
    if (!(amount >= 0)) return setError('Enter the amount paid.')
    if (!window.confirm(`Pay ${w.worker.name} ${rs(amount)} for the week ${formatDate(data.weekStart)} to ${formatDate(data.weekEnd)}?${amount !== Math.max(0, w.final) ? `\n${rs(w.final - amount)} will carry to next week.` : ''}`)) return
    setBusy(w.worker.id)
    setMessage('')
    try {
      await axios.post(`${API_BASE_URL}/api/wages/weekly/settle`, { workerId: w.worker.id, weekStart: data.weekStart, amount }, headers)
      setMessage(`${w.worker.name}'s week settled: paid ${rs(amount)}.`)
      setPayAmount(prev => ({ ...prev, [w.worker.id]: '' }))
      await load()
      onPaymentsChanged?.()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  const undo = async (w) => {
    if (!window.confirm(`Undo ${w.worker.name}'s settlement for this week? The payment record is removed.`)) return
    try {
      await axios.delete(`${API_BASE_URL}/api/wages/weekly/settle/${w.settlement.id}`, headers)
      await load()
      onPaymentsChanged?.()
    } catch (err) {
      setError(errorText(err))
    }
  }

  const ratesOf = workerId => rates.filter(r => r.workerId === workerId)
  const rateSummary = workerId => ratesOf(workerId)
    .map(r => `${r.articleNumber ? `Art ${r.articleNumber}` : 'All articles'}${r.size ? ` size ${r.size}` : ''}: Rs ${formatNumber(r.ratePerDozen)}`).join(' · ')
  const workersWithoutRates = workers.filter(w => ratesOf(w.id).length === 0)

  return (
    <div className="em-root em-plain">
      <div className="em-card">
        <div className="em-card-head">
          <div>
            <h3>🧮 Weekly Thekka Wages</h3>
            {data && <span className="em-muted">Week Sat {formatDate(data.weekStart)} to Fri {formatDate(data.weekEnd)} · Payday Sat {formatDate(data.payday)}</span>}
          </div>
          <div className="em-head-actions">
            <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => setDay(addDays(data?.weekStart || day, -7))}>◀ Previous week</button>
            <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => setDay(todayISO())}>This week</button>
            <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => setDay(addDays(data?.weekStart || day, 7))}>Next week ▶</button>
          </div>
        </div>
        {data && <p className="em-hint" style={{ margin: 0 }}>Counted from production on {formatDate(data.startDate)} onwards; everything before was settled by hand.</p>}
        {error && <div className="em-banner em-banner-error" role="alert">{error}</div>}
        {message && <div className="em-banner em-banner-success" role="status">{message}</div>}
      </div>

      {data?.workers.map(w => {
        const settled = w.settlement
        return (
          <div key={w.worker.id} className="em-card">
            <div className="em-card-head">
              <div>
                <h3>{w.worker.name} <span className="em-muted">{w.worker.role}</span></h3>
                <span className="em-hint">{rateSummary(w.worker.id)}</span>
              </div>
              <div className="em-head-actions">
                <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => setEditingRatesFor(editingRatesFor === w.worker.id ? null : w.worker.id)}>⚙️ Rates</button>
                <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => printSheet(data, w)}>🖨️ Print</button>
              </div>
            </div>

            {editingRatesFor === w.worker.id && (
              <RatesEditor token={token} worker={w.worker} rates={ratesOf(w.worker.id)} products={products}
                onSaved={() => { setEditingRatesFor(null); load() }} />
            )}

            {w.warnings.map((text, i) => <div key={i} className="em-banner em-banner-warn" role="status">⚠️ {text}</div>)}

            <div className="em-table-wrap">
              <table className="em-table em-ledger">
                <thead><tr><th>Article</th><th>Size</th><th className="em-num">Dozens</th><th className="em-num">Rate</th><th className="em-num">Amount</th></tr></thead>
                <tbody>
                  {w.lines.length === 0 && <tr className="em-empty-row"><td colSpan={5}>No production this week yet.</td></tr>}
                  {w.lines.map(l => (
                    <tr key={`${l.article}|${l.size}|${l.rate}`}>
                      <td data-label="Article">{l.article}</td>
                      <td data-label="Size">{l.size || 'all'}</td>
                      <td data-label="Dozens" className="em-num">{formatNumber(l.dozens)}</td>
                      <td data-label="Rate" className="em-num">{formatNumber(l.rate)}</td>
                      <td data-label="Amount" className="em-num">{rs(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="em-wage-sum">
              <div><span>Earned ({formatNumber(w.dozens)} dozen)</span><strong>{rs(w.earned)}</strong></div>
              <div>
                <span>Advances this week{w.advances.length ? ` (${w.advances.map(a => `${formatDate(a.date).slice(0, 5)}: ${formatNumber(a.amount)}`).join(', ')})` : ''}</span>
                <strong>− {rs(w.advanceTotal)}</strong>
              </div>
              {w.carryIn !== 0 && <div><span>From last week</span><strong>{carryText(w.carryIn)}</strong></div>}
              <div className="em-wage-final">
                <span>{w.final >= 0 ? 'Final to pay' : 'He owes (carries to next week)'}</span>
                <strong>{rs(Math.abs(w.final))}</strong>
              </div>
            </div>

            {settled ? (
              <div className="em-banner em-banner-success" role="status">
                ✅ Settled: paid {rs(settled.paid)}{settled.carryOut ? `; ${settled.carryOut > 0 ? 'still owed' : 'advance to recover'} ${rs(Math.abs(settled.carryOut))} carries to next week` : ''}.
                {isAdmin && <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => undo(w)}>Undo</button>}
              </div>
            ) : (
              <div className="em-actions" style={{ alignItems: 'flex-end' }}>
                <label className="em-field" style={{ maxWidth: 200 }}>
                  <span className="em-label">Amount paid</span>
                  <input type="number" min="0" step="any" inputMode="decimal" placeholder={String(Math.max(0, Math.round(w.final)))}
                    value={payAmount[w.worker.id] ?? ''} onChange={e => setPayAmount(prev => ({ ...prev, [w.worker.id]: e.target.value }))} />
                </label>
                <button type="button" className="em-btn em-btn-primary" onClick={() => settle(w)} aria-busy={busy === w.worker.id} disabled={busy === w.worker.id}>
                  {busy === w.worker.id ? 'Saving…' : '✅ Settle week'}
                </button>
              </div>
            )}
          </div>
        )
      })}

      {workersWithoutRates.length > 0 && (
        <div className="em-card">
          <span className="em-hint">Workers without thekka rates (not on this sheet): {workersWithoutRates.map(w => w.name).join(', ')}.</span>
          <div className="em-row-actions" style={{ marginTop: 8 }}>
            {workersWithoutRates.map(w => (
              <button key={w.id} type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => setEditingRatesFor(w.id)}>Set rates for {w.name}</button>
            ))}
          </div>
          {workersWithoutRates.some(w => w.id === editingRatesFor) && (
            <RatesEditor token={token} worker={workers.find(w => w.id === editingRatesFor)} rates={[]} products={products}
              onSaved={() => { setEditingRatesFor(null); load() }} />
          )}
        </div>
      )}
    </div>
  )
}
