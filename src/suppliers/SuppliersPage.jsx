import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { formatDate, formatNumber, todayISO } from '../entry/format'
import '../entry/entry.css'

// Suppliers and their khata. Purchases come from Material Entry (goods received with a supplier
// picked); payments are entered here. Balance = opening + purchases − payments (what we owe).

const API_BASE_URL = import.meta.env.VITE_API_URL || ''
const rs = value => `Rs. ${formatNumber(Number(value) || 0)}`
const owed = value => (value < 0 ? `Advance ${rs(Math.abs(value))}` : rs(value))
const errorText = err => err?.response?.data?.message || (err?.response ? `Server error (HTTP ${err.response.status})` : 'Could not reach the server.')
const emptySupplier = () => ({ name: '', phone: '', address: '', openingBalance: '', notes: '' })
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Printable / PDF supplier khata, laid out like the customer statement
const printLedger = ledger => {
  const s = ledger.supplier
  const rows = ledger.entries.map(e => `<tr><td>${formatDate(e.date)}</td><td>${e.kind === 'purchase' ? 'Purchase' : 'Payment'}: ${escapeHtml(e.detail)}</td>
    <td class="n">${e.purchase ? rs(e.purchase) : ''}</td><td class="n">${e.payment ? rs(e.payment) : ''}</td><td class="n">${owed(e.balance)}</td></tr>`).join('')
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Supplier Khata - ${escapeHtml(s.name)}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px;color:#1e293b;font-size:12px}h1{color:#714B67;font-size:20px;margin:0 0 4px}
    .info{display:flex;flex-wrap:wrap;gap:6px 24px;margin:10px 0}table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #cbd5e1;padding:6px;text-align:left}th{background:#f1f5f9}.n{text-align:right}.muted{color:#64748b}
    tr.total td{font-weight:700;background:#faf5f8}@media print{tr{page-break-inside:avoid}}</style></head><body>
    <h1>PLUS EVR ERP: Supplier Khata</h1>
    <div class="info"><span><strong>${escapeHtml(s.name)}</strong></span>${s.phone ? `<span>Phone: ${escapeHtml(s.phone)}</span>` : ''}
      ${s.address ? `<span>${escapeHtml(s.address)}</span>` : ''}<span class="muted">Printed ${formatDate(new Date().toISOString())}</span></div>
    <div class="info"><span>Opening: <strong>${owed(ledger.openingBalance)}</strong></span><span>Purchases: <strong>${rs(ledger.totalPurchases)}</strong></span>
      <span>Paid: <strong>${rs(ledger.totalPaid)}</strong></span><span>We owe: <strong>${owed(ledger.balance)}</strong></span></div>
    <table><thead><tr><th>Date</th><th>Detail</th><th class="n">Purchase</th><th class="n">Paid</th><th class="n">Balance</th></tr></thead><tbody>
      <tr><td></td><td><strong>Opening balance</strong></td><td></td><td></td><td class="n"><strong>${owed(ledger.openingBalance)}</strong></td></tr>
      ${rows || '<tr><td colspan="5" class="muted">No purchases or payments yet.</td></tr>'}
      <tr class="total"><td></td><td>Closing balance</td><td class="n">${rs(ledger.totalPurchases)}</td><td class="n">${rs(ledger.totalPaid)}</td><td class="n">${owed(ledger.balance)}</td></tr>
    </tbody></table><script>window.onload = function () { window.print() }</script></body></html>`)
  win.document.close()
}

export default function SuppliersPage({ token, isAdmin }) {
  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [form, setForm] = useState(emptySupplier)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [payFor, setPayFor] = useState(null) // { supplier, date, amount, notes }
  const [ledger, setLedger] = useState(null)

  const load = useCallback(() => axios.get(`${API_BASE_URL}/api/suppliers`, headers)
    .then(res => setSuppliers(res.data))
    .catch(err => setMessage({ tone: 'error', text: errorText(err) }))
    .finally(() => setLoading(false)), [headers])

  useEffect(() => { load() }, [load])

  const openLedger = id => axios.get(`${API_BASE_URL}/api/suppliers/${id}/ledger`, headers)
    .then(res => { setLedger(res.data); window.scrollTo(0, 0) })
    .catch(err => setMessage({ tone: 'error', text: errorText(err) }))

  const totalOwed = suppliers.reduce((acc, s) => acc + Math.max(0, Number(s.balance) || 0), 0)

  const handleSave = async e => {
    e.preventDefault()
    if (saving) return
    if (!form.name.trim()) return setMessage({ tone: 'error', text: 'Enter the supplier name.' })
    setSaving(true)
    setMessage(null)
    try {
      const payload = { ...form, openingBalance: form.openingBalance === '' ? 0 : Number(form.openingBalance) }
      if (editingId) await axios.put(`${API_BASE_URL}/api/suppliers/${editingId}`, payload, headers)
      else await axios.post(`${API_BASE_URL}/api/suppliers`, payload, headers)
      setMessage({ tone: 'success', text: editingId ? 'Supplier updated.' : `Supplier ${form.name.trim()} added.` })
      setForm(emptySupplier())
      setEditingId(null)
      await load()
    } catch (err) {
      setMessage({ tone: 'error', text: errorText(err) })
    } finally {
      setSaving(false)
    }
  }

  const startEdit = s => {
    setEditingId(s.id)
    setForm({ name: s.name, phone: s.phone || '', address: s.address || '', openingBalance: String(s.openingBalance ?? ''), notes: s.notes || '' })
    window.scrollTo(0, 0)
  }

  const savePayment = async () => {
    if (saving) return
    if (!(Number(payFor.amount) > 0)) return setMessage({ tone: 'error', text: 'Enter the amount paid.' })
    setSaving(true)
    try {
      await axios.post(`${API_BASE_URL}/api/suppliers/${payFor.supplier.id}/payments`, { date: payFor.date, amount: Number(payFor.amount), notes: payFor.notes }, headers)
      setMessage({ tone: 'success', text: `Paid ${rs(payFor.amount)} to ${payFor.supplier.name}.` })
      const openId = ledger?.supplier?.id
      setPayFor(null)
      await load()
      if (openId === payFor.supplier.id) await openLedger(openId)
    } catch (err) {
      setMessage({ tone: 'error', text: errorText(err) })
    } finally {
      setSaving(false)
    }
  }

  const deletePayment = async paymentId => {
    if (!window.confirm('Delete this payment? The supplier balance goes back up. This is recorded in the audit log.')) return
    try {
      await axios.delete(`${API_BASE_URL}/api/suppliers/payments/${paymentId}`, headers)
      await load()
      await openLedger(ledger.supplier.id)
    } catch (err) {
      setMessage({ tone: 'error', text: errorText(err) })
    }
  }

  const banner = message && (
    <div className={`em-banner ${message.tone === 'error' ? 'em-banner-error' : 'em-banner-success'}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</div>
  )

  const payModal = payFor && (
    <div className="em-modal-backdrop" role="presentation" onClick={() => !saving && setPayFor(null)}>
      <div className="em-modal" role="dialog" aria-modal="true" aria-labelledby="pay-title" onClick={e => e.stopPropagation()}>
        <h4 id="pay-title">Pay {payFor.supplier.name}</h4>
        <p className="em-muted">Owed now: {owed(payFor.supplier.balance)}</p>
        <div className="em-stack" style={{ gap: 12 }}>
          <label className="em-field"><span className="em-label">Date</span>
            <input type="date" value={payFor.date} onChange={e => setPayFor({ ...payFor, date: e.target.value })} /></label>
          <label className="em-field"><span className="em-label">Amount (Rs.)</span>
            <input type="number" min="0" step="any" inputMode="decimal" autoFocus value={payFor.amount} onChange={e => setPayFor({ ...payFor, amount: e.target.value })} /></label>
          <label className="em-field"><span className="em-label">Notes <span className="em-optional">optional</span></span>
            <input value={payFor.notes} placeholder="Cash / bank / cheque no" onChange={e => setPayFor({ ...payFor, notes: e.target.value })} /></label>
        </div>
        <div className="em-actions">
          <button type="button" className="em-btn em-btn-ghost" onClick={() => setPayFor(null)} disabled={saving}>Cancel</button>
          <button type="button" className="em-btn em-btn-primary" onClick={savePayment} aria-busy={saving} disabled={saving}>{saving ? 'Saving…' : 'Save payment'}</button>
        </div>
      </div>
    </div>
  )

  if (ledger) {
    const s = suppliers.find(x => x.id === ledger.supplier.id) || ledger.supplier
    return (
      <div className="em-root em-plain">
        {banner}
        <div className="em-card">
          <div className="em-card-head">
            <h3>📒 {ledger.supplier.name} — Khata</h3>
            <div className="em-head-actions">
              <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => setLedger(null)}>← All suppliers</button>
              <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => printLedger(ledger)}>🖨️ Print / PDF</button>
              <button type="button" className="em-btn em-btn-primary em-btn-sm" onClick={() => setPayFor({ supplier: s, date: todayISO(), amount: '', notes: '' })}>💵 Pay</button>
            </div>
          </div>
          <div className="em-summary em-summary-wide">
            <div><span>Opening</span><strong>{owed(ledger.openingBalance)}</strong></div>
            <div><span>Purchases</span><strong>{rs(ledger.totalPurchases)}</strong></div>
            <div><span>Paid</span><strong>{rs(ledger.totalPaid)}</strong></div>
            <div className={ledger.balance > 0 ? 'em-due' : 'em-good'}><span>We owe</span><strong>{owed(ledger.balance)}</strong></div>
          </div>
        </div>
        <div className="em-card">
          <div className="em-table-wrap">
            <table className="em-table em-compact">
              <thead><tr><th>Date</th><th>Detail</th><th className="em-num">Purchase</th><th className="em-num">Paid</th><th className="em-num">Balance</th></tr></thead>
              <tbody>
                <tr className="em-row-muted"><td data-label="Date">—</td><td data-label="Detail">Opening balance</td><td data-label="Purchase" className="em-num">—</td><td data-label="Paid" className="em-num">—</td><td data-label="Balance" className="em-num"><strong>{owed(ledger.openingBalance)}</strong></td></tr>
                {ledger.entries.length === 0 && <tr className="em-empty-row"><td colSpan={5}>No purchases or payments yet. Purchases are added in Material Entry by picking this supplier.</td></tr>}
                {ledger.entries.map(e => (
                  <tr key={`${e.kind}-${e.id}`}>
                    <td data-label="Date">{formatDate(e.date)}</td>
                    <td data-label="Detail">
                      <div className="em-detail-actions">
                        <span>{e.kind === 'purchase' ? '📦 ' : '💵 '}{e.detail}</span>
                        {e.kind === 'payment' && isAdmin && <button type="button" className="em-btn em-btn-danger em-btn-sm" onClick={() => deletePayment(e.id)}>Delete</button>}
                      </div>
                    </td>
                    <td data-label="Purchase" className="em-num">{e.purchase ? rs(e.purchase) : '—'}</td>
                    <td data-label="Paid" className="em-num em-paid">{e.payment ? rs(e.payment) : '—'}</td>
                    <td data-label="Balance" className="em-num"><strong>{owed(e.balance)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {payModal}
      </div>
    )
  }

  return (
    <div className="em-root em-plain">
      <div className="em-title"><h2>🚚 Suppliers <span className="em-muted">(khata of what we owe)</span></h2></div>
      {banner}

      <div className="em-summary">
        <div><span>Suppliers</span><strong>{formatNumber(suppliers.length)}</strong></div>
        <div className="em-due"><span>Total we owe</span><strong>{rs(totalOwed)}</strong></div>
      </div>

      <form className="em-card em-form" onSubmit={handleSave} noValidate>
        <div className="em-card-head">
          <h3>{editingId ? 'Edit supplier' : 'Add supplier'}</h3>
          <span className="em-muted">Purchases are recorded in Material Entry → Entry by picking the supplier.</span>
        </div>
        <div className="em-grid">
          <label className="em-field"><span className="em-label">Name</span>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <label className="em-field"><span className="em-label">Phone <span className="em-optional">optional</span></span>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
          <label className="em-field"><span className="em-label">Opening balance (we owe) <span className="em-optional">optional</span></span>
            <input type="number" step="any" inputMode="decimal" placeholder="0" value={form.openingBalance} onChange={e => setForm({ ...form, openingBalance: e.target.value })} /></label>
          <label className="em-field em-span-2"><span className="em-label">Address <span className="em-optional">optional</span></span>
            <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></label>
          <label className="em-field"><span className="em-label">Notes <span className="em-optional">optional</span></span>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        </div>
        <div className="em-actions">
          {editingId && <button type="button" className="em-btn em-btn-ghost" onClick={() => { setEditingId(null); setForm(emptySupplier()) }}>Cancel</button>}
          <button type="submit" className="em-btn em-btn-primary" aria-busy={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add supplier'}</button>
        </div>
      </form>

      <div className="em-card">
        {loading ? <div className="em-center">Loading…</div> : (
          <div className="em-table-wrap">
            <table className="em-table">
              <thead><tr><th>Supplier</th><th>Phone</th><th className="em-num">Purchases</th><th className="em-num">Paid</th><th className="em-num">We owe</th><th>Actions</th></tr></thead>
              <tbody>
                {suppliers.length === 0 && <tr className="em-empty-row"><td colSpan={6}>No suppliers yet. Add the first one above.</td></tr>}
                {suppliers.map(s => (
                  <tr key={s.id}>
                    <td data-label="Supplier"><strong>{s.name}</strong>{s.address && <div className="em-hint">{s.address}</div>}</td>
                    <td data-label="Phone">{s.phone || '—'}</td>
                    <td data-label="Purchases" className="em-num">{rs(s.purchases)}</td>
                    <td data-label="Paid" className="em-num">{rs(s.paid)}</td>
                    <td data-label="We owe" className={`em-num ${s.balance > 0 ? 'em-due' : ''}`}><strong>{owed(s.balance)}</strong></td>
                    <td data-label="Actions">
                      <div className="em-row-actions">
                        <button type="button" className="em-btn em-btn-primary em-btn-sm" onClick={() => openLedger(s.id)}>📒 Khata</button>
                        <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => setPayFor({ supplier: s, date: todayISO(), amount: '', notes: '' })}>💵 Pay</button>
                        <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => startEdit(s)}>Edit</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {payModal}
    </div>
  )
}
