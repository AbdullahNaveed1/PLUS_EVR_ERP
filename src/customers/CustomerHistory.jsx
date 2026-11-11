import { Fragment, useState } from 'react'
import { formatDate, formatNumber } from '../entry/format'
import '../entry/entry.css'

// Simple customer ledger: one line per bill, cash payment or return with its date, amount and
// running balance. Tapping a line shows the bill's items and the Edit / Delete buttons.

const rs = value => `Rs. ${formatNumber(Number(value) || 0)}`
const balanceText = amount => (amount < 0 ? `Adv: Rs. ${formatNumber(Math.abs(amount))}` : `Rs. ${formatNumber(amount)}`)
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Line items of a sale, with every number defaulted so blank fields never show "undefined"
const itemsOf = sale => (sale?.lineItems || []).map(item => ({
  model: item.model || item.description || '—',
  size: item.size && item.size !== 'N/A' ? item.size : '—',
  qty: item.qty && item.qty !== '-' ? `${item.qty} ${item.unitType || ''}`.trim() : '—',
  pairs: Number(item.pairs) || 0,
  price: Number(item.price) || 0,
  discount: Number(item.discountAmount) || 0,
  amount: Number(item.netAmount ?? item.grossAmount) || 0
}))

// Time a payment was saved, e.g. "3:42 PM", so same-day duplicates can be told apart
const timeOf = value => {
  if (!String(value || '').includes('T')) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// What a ledger line is called: "Bill No 1452", "Cash received", "Return (Bill No 1452)"
const entryName = e => e.kind === 'bill'
  ? `Bill No ${e.billNo || '—'}`
  : e.kind === 'return' ? `Return (Bill No ${e.billNo || '—'})` : 'Cash received'

export default function CustomerHistory({ customer, ledger, sales, onBack, canDeletePayments, onDeletePayment, canEditBills, onEditBill, canDeleteReturns, onDeleteReturn }) {
  const [openKey, setOpenKey] = useState(null)
  const [confirmPayment, setConfirmPayment] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const closeConfirm = () => { if (!deleting) { setConfirmPayment(null); setDeleteError('') } }

  const confirmDelete = async () => {
    if (deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      await onDeletePayment(confirmPayment.sortId)
      setConfirmPayment(null)
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  const deleteReturn = async e => {
    if (!window.confirm(`Delete return #${e.returnId} (${rs(e.credit)})? The pairs leave stock again and the customer owes this amount again.`)) return
    try {
      await onDeleteReturn(e.returnId)
    } catch (err) {
      window.alert(err.message)
    }
  }

  const saleById = new Map(sales.map(s => [s.id, s]))
  const sum = kind => ledger.entries.filter(e => e.kind === kind).reduce((acc, e) => acc + e.debit + e.credit, 0)
  const totals = { billed: sum('bill'), paid: sum('payment'), returned: sum('return') }

  const handlePrint = () => {
    const rows = ledger.entries.map(e => `<tr><td>${formatDate(e.date)}</td><td>${escapeHtml(entryName(e))}</td>
      <td class="num">${e.kind === 'bill' ? rs(e.debit) : `− ${rs(e.credit)}`}</td><td class="num">${balanceText(e.balance)}</td></tr>`).join('')
    const win = window.open('', '_blank', 'width=800,height=700')
    if (!win) return
    win.document.write(`<!doctype html>
      <html><head><meta charset="utf-8"><title>Ledger - ${escapeHtml(customer.name)}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #1e293b; font-size: 13px; }
        h1 { color: #714B67; margin: 0 0 4px; font-size: 20px; }
        .muted { color: #64748b; }
        .info { display: flex; flex-wrap: wrap; gap: 6px 24px; margin: 10px 0; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #cbd5e1; padding: 7px; text-align: left; }
        th { background: #f1f5f9; }
        .num { text-align: right; }
        tr.total td { font-weight: 700; background: #faf5f8; }
        @media print { tr { page-break-inside: avoid; } }
      </style></head><body>
        <h1>PLUS EVR ERP: Customer Ledger</h1>
        <div class="info">
          <span><strong>${escapeHtml(customer.name)}</strong> (ID: ${escapeHtml(customer.phone || '—')})</span>
          <span class="muted">Printed ${formatDate(new Date().toISOString())}</span>
        </div>
        <table>
          <thead><tr><th>Date</th><th>Entry</th><th class="num">Amount</th><th class="num">Balance</th></tr></thead>
          <tbody>
            <tr><td></td><td>Opening balance</td><td></td><td class="num">${balanceText(ledger.openingBalance)}</td></tr>
            ${rows || '<tr><td colspan="4" class="muted">No bills or payments yet.</td></tr>'}
            <tr class="total"><td></td><td>Current balance</td><td></td><td class="num">${balanceText(ledger.closingBalance)}</td></tr>
          </tbody>
        </table>
        <p class="muted">Bills ${rs(totals.billed)} · Cash received ${rs(totals.paid)}${totals.returned ? ` · Returns ${rs(totals.returned)}` : ''}</p>
        <script>window.onload = function () { window.print() }</script>
      </body></html>`)
    win.document.close()
  }

  // The part shown when a line is tapped: bill items, payment time, and the action buttons
  const details = e => {
    const sale = e.kind === 'bill' ? saleById.get(e.sortId) : null
    const items = e.kind === 'bill' ? itemsOf(sale) : (e.items || []).map(i => ({ model: i.model, size: i.size, pairs: Number(i.pairs) || 0, amount: Number(i.amount) || 0 }))
    return (
      <div className="em-lg-details">
        {e.kind === 'payment' && <span className="em-hint">Saved {timeOf(e.at) ? `at ${timeOf(e.at)}` : ''} on {formatDate(e.date)}</span>}
        {e.kind === 'return' && e.reason && <span className="em-hint">Reason: {e.reason}</span>}
        {items.length > 0 && (
          <div className="em-items-wrap">
            <table className="em-items">
              <thead><tr><th>Article</th><th>Size</th><th className="em-num">Pairs</th><th className="em-num">Amount</th></tr></thead>
              <tbody>
                {items.map((i, index) => (
                  <tr key={index}><td>{i.model}</td><td>{i.size}</td><td className="em-num">{formatNumber(i.pairs)}</td><td className="em-num">{formatNumber(i.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="em-row-actions">
          {e.kind === 'bill' && canEditBills && sale && (
            <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => onEditBill(sale)}>✏️ Edit bill</button>
          )}
          {e.kind === 'payment' && canDeletePayments && (
            <button type="button" className="em-btn em-btn-danger em-btn-sm" onClick={() => setConfirmPayment(e)}>Delete payment</button>
          )}
          {e.kind === 'return' && canDeleteReturns && (
            <button type="button" className="em-btn em-btn-danger em-btn-sm" onClick={() => deleteReturn(e)}>Delete return</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="em-root em-plain">
      <div className="em-card">
        <div className="em-card-head">
          <div>
            <h3>📒 {customer.name}</h3>
            <span className="em-muted">ID: {customer.phone || '—'}</span>
          </div>
          <div className="em-head-actions">
            <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={onBack}>← Back to customers</button>
            <button type="button" className="em-btn em-btn-primary em-btn-sm" onClick={handlePrint}>🖨️ Print / PDF</button>
          </div>
        </div>

        <div className="em-summary em-summary-wide">
          <div><span>Total bills</span><strong>{rs(totals.billed)}</strong></div>
          <div><span>Cash received</span><strong>{rs(totals.paid)}</strong></div>
          {totals.returned > 0 && <div><span>Returns</span><strong>{rs(totals.returned)}</strong></div>}
          <div className={ledger.closingBalance < 0 ? 'em-good' : 'em-due'}><span>Current balance</span><strong>{balanceText(ledger.closingBalance)}</strong></div>
        </div>
      </div>

      <div className="em-card">
        <div className="em-table-wrap">
          <table className="em-table em-ledger">
            <thead>
              <tr>
                <th>Date</th>
                <th>Entry</th>
                <th className="em-num">Amount</th>
                <th className="em-num">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="em-row-muted">
                <td data-label="Date">—</td>
                <td data-label="Entry">Opening balance</td>
                <td data-label="Amount" className="em-num">—</td>
                <td data-label="Balance" className="em-num"><strong>{balanceText(ledger.openingBalance)}</strong></td>
              </tr>
              {ledger.entries.length === 0 && (
                <tr className="em-empty-row"><td colSpan={4}>No bills or payments for this customer yet.</td></tr>
              )}
              {ledger.entries.map(e => {
                const open = openKey === e.key
                const isBill = e.kind === 'bill'
                return (
                  <Fragment key={e.key}>
                    <tr
                      className={`em-lg-row ${isBill ? 'em-lg-bill' : 'em-lg-credit'} ${open ? 'em-lg-open' : ''}`}
                      tabIndex={0}
                      aria-expanded={open}
                      onClick={() => setOpenKey(open ? null : e.key)}
                      onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setOpenKey(open ? null : e.key) } }}
                    >
                      <td data-label="Date">{formatDate(e.date)}</td>
                      <td data-label="Entry">
                        {isBill ? '🧾' : e.kind === 'return' ? '↩️' : '💵'} {entryName(e)}
                        <span className="em-lg-caret" aria-hidden="true">{open ? '▲' : '▼'}</span>
                      </td>
                      <td data-label="Amount" className="em-num"><strong>{isBill ? rs(e.debit) : `− ${rs(e.credit)}`}</strong></td>
                      <td data-label="Balance" className="em-num">{balanceText(e.balance)}</td>
                    </tr>
                    {open && (
                      <tr className="em-subrow"><td colSpan={4}>{details(e)}</td></tr>
                    )}
                  </Fragment>
                )
              })}
              <tr className="em-row-total">
                <td data-label="Date">Today</td>
                <td data-label="Entry"><strong>Current balance</strong></td>
                <td data-label="Amount" className="em-num"></td>
                <td data-label="Balance" className="em-num"><strong>{balanceText(ledger.closingBalance)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="em-hint" style={{ margin: '8px 0 0' }}>Tap a line to see the bill's items or to edit / delete it.</p>
      </div>

      {confirmPayment && (
        <div className="em-modal-backdrop" role="presentation" onClick={closeConfirm}>
          <div className="em-modal" role="alertdialog" aria-modal="true" aria-labelledby="ch-delete-title" onClick={e => e.stopPropagation()}>
            <h4 id="ch-delete-title">Delete this payment?</h4>
            <p>
              <strong>{rs(confirmPayment.credit)}</strong> from {customer.name} on {formatDate(confirmPayment.date)}
              {timeOf(confirmPayment.at) ? ` at ${timeOf(confirmPayment.at)}` : ''}
            </p>
            <p className="em-muted">
              The payment is removed permanently and the customer's balance goes back up by this amount. Use this only for a duplicate or mistaken entry.
            </p>
            {deleteError && <div className="em-banner em-banner-error" role="alert">{deleteError}</div>}
            <div className="em-actions">
              <button type="button" className="em-btn em-btn-ghost" onClick={closeConfirm} autoFocus>Keep it</button>
              <button type="button" className="em-btn em-btn-danger" onClick={confirmDelete} aria-busy={deleting}>
                {deleting ? 'Deleting…' : 'Delete payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
