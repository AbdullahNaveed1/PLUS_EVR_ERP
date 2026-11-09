import { useState } from 'react'
import { formatNumber, todayISO } from '../entry/format'
import '../entry/entry.css'

// Record goods a customer sent back against one bill. Each line can be returned up to what was
// billed minus earlier returns; the rate is the bill's rate less its discount per pair.

const rs = value => `Rs. ${formatNumber(Number(value) || 0)}`

// Pairs already returned per bill line
const returnedByLine = returns => returns.reduce((map, r) => {
  for (const item of r.items || []) map[item.lineIndex] = (map[item.lineIndex] || 0) + Number(item.pairs || 0)
  return map
}, {})

export default function ReturnModal({ sale, returns, onSave, onClose }) {
  const already = returnedByLine(returns)
  const lines = (sale.lineItems || []).map((item, index) => {
    const pairs = Number(item.pairs) || 0
    const rate = Math.max(0, (Number(item.price) || 0) - (Number(item.discountPerPair) || 0))
    return { index, model: item.model, size: item.size, pairs, left: Math.max(0, pairs - (already[index] || 0)), rate }
  })
  const [qty, setQty] = useState({})
  const [date, setDate] = useState(todayISO)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const rowError = line => {
    const value = qty[line.index]
    if (value === undefined || value === '') return ''
    const n = Number(value)
    if (!Number.isInteger(n) || n < 0) return 'Whole pairs only'
    if (n > line.left) return `Only ${formatNumber(line.left)} left`
    return ''
  }
  const chosen = lines.filter(l => Number(qty[l.index]) > 0)
  const total = chosen.reduce((acc, l) => acc + Number(qty[l.index]) * l.rate, 0)
  const invalid = lines.some(rowError)

  const save = async () => {
    if (saving) return
    if (chosen.length === 0) return setError('Enter how many pairs came back for at least one item.')
    if (invalid) return setError('Fix the highlighted quantities.')
    setSaving(true)
    setError('')
    try {
      await onSave({ saleId: sale.id, date, reason, items: chosen.map(l => ({ lineIndex: l.index, pairs: Number(qty[l.index]) })) })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const close = () => { if (!saving) onClose() }

  return (
    <div className="em-root em-plain">
      <div className="em-modal-backdrop" role="presentation" onClick={close}>
        <div className="em-modal em-modal-wide" role="dialog" aria-modal="true" aria-labelledby="ret-title" onClick={e => e.stopPropagation()}>
          <h4 id="ret-title">↩️ Return against Bill No {sale.billNo || '—'} — {sale.customer}</h4>
          <p className="em-muted">Returned pairs go back into stock and the amount comes off the customer's balance.</p>

          <div className="em-grid">
            <label className="em-field">
              <span className="em-label">Return date</span>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </label>
            <label className="em-field em-span-2">
              <span className="em-label">Reason <span className="em-optional">optional</span></span>
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. wrong size, damaged" />
            </label>
          </div>

          <div className="em-table-wrap" style={{ marginTop: 14 }}>
            <table className="em-table">
              <thead><tr><th>Article</th><th>Size</th><th className="em-num">Billed</th><th className="em-num">Can return</th><th className="em-num">Rate</th><th>Pairs back</th></tr></thead>
              <tbody>
                {lines.map(l => {
                  const err = rowError(l)
                  return (
                    <tr key={l.index}>
                      <td data-label="Article">{l.model}</td>
                      <td data-label="Size">{l.size}</td>
                      <td data-label="Billed" className="em-num">{formatNumber(l.pairs)}</td>
                      <td data-label="Can return" className="em-num">{formatNumber(l.left)}</td>
                      <td data-label="Rate" className="em-num">{formatNumber(l.rate)}</td>
                      <td data-label="Pairs back">
                        <input type="number" min="0" step="1" inputMode="numeric" placeholder="0" disabled={l.left === 0}
                          value={qty[l.index] ?? ''} aria-invalid={!!err} onChange={e => setQty({ ...qty, [l.index]: e.target.value })} />
                        {err && <span className="em-error">{err}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="em-eb-summary">Credit to customer: <strong>{rs(total)}</strong> for {formatNumber(chosen.reduce((a, l) => a + Number(qty[l.index]), 0))} pairs</div>
          {error && <div className="em-banner em-banner-error" role="alert">{error}</div>}
          <div className="em-actions">
            <button type="button" className="em-btn em-btn-ghost" onClick={close} disabled={saving}>Cancel</button>
            <button type="button" className="em-btn em-btn-primary" onClick={save} aria-busy={saving} disabled={saving}>{saving ? 'Saving…' : 'Save return'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
