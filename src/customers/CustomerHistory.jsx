import { Fragment } from 'react'
import { formatDate, formatNumber } from '../entry/format'
import '../entry/entry.css'

// Complete record of one customer: opening balance, every bill with all its items,
// every payment, a running balance, and all-time totals.

const rs = value => `Rs. ${formatNumber(Number(value) || 0)}`
const balanceText = amount => (amount < 0 ? `Adv: Rs. ${formatNumber(Math.abs(amount))}` : `Rs. ${formatNumber(amount)}`)
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Line items of a sale, with every number defaulted so blank fields never show "undefined"
const itemsOf = sale => (sale?.lineItems || []).map(item => ({
  article: item.productId && item.productId !== 'N/A' ? item.productId : '—',
  model: item.model || item.description || '—',
  size: item.size && item.size !== 'N/A' ? item.size : '—',
  qty: item.qty && item.qty !== '-' ? `${item.qty} ${item.unitType || ''}`.trim() : '—',
  pairs: Number(item.pairs) || 0,
  price: Number(item.price) || 0,
  discount: Number(item.discountAmount) || 0,
  amount: Number(item.netAmount ?? item.grossAmount) || 0
}))

export default function CustomerHistory({ customer, ledger, sales, invoiceNumber, onBack }) {
  const saleById = new Map(sales.map(s => [s.id, s]))
  const bills = ledger.entries.filter(e => e.kind === 'bill')
  const payments = ledger.entries.filter(e => e.kind === 'payment')
  const billSales = bills.map(b => saleById.get(b.sortId)).filter(Boolean)

  const totals = {
    gross: billSales.reduce((acc, s) => acc + (Number(s.rawTotal) || Number(s.total) || 0), 0),
    discount: billSales.reduce((acc, s) => acc + (Number(s.discount) || 0), 0),
    billed: ledger.totalBilled,
    paid: ledger.totalPaid,
    pairs: bills.reduce((acc, b) => acc + (Number(b.pairs) || 0), 0)
  }
  const firstDate = ledger.entries[0]?.date
  const lastDate = ledger.entries[ledger.entries.length - 1]?.date

  const handlePrint = () => {
    const rows = ledger.entries.map(e => {
      if (e.kind === 'payment') {
        return `<tr><td>${formatDate(e.date)}</td><td>Cash payment received</td><td></td><td class="num">${rs(e.credit)}</td><td class="num">${balanceText(e.balance)}</td></tr>`
      }
      const sale = saleById.get(e.sortId)
      const items = itemsOf(sale).map(i => `
        <tr><td>${escapeHtml(i.article)}</td><td>${escapeHtml(i.model)}</td><td>${escapeHtml(i.size)}</td><td>${escapeHtml(i.qty)}</td>
        <td class="num">${formatNumber(i.pairs)}</td><td class="num">${formatNumber(i.price)}</td><td class="num">${i.discount ? formatNumber(i.discount) : '—'}</td><td class="num">${formatNumber(i.amount)}</td></tr>`).join('')
      return `
        <tr class="bill"><td>${formatDate(e.date)}</td>
          <td><strong>Bill No: ${escapeHtml(e.billNo || '—')}</strong> · Invoice: ${escapeHtml(e.invoiceNo)} · ${formatNumber(e.pairs)} pairs<br>
          <span class="muted">Transport: ${escapeHtml(e.transportCompany)} · Builty: ${escapeHtml(e.builtyNo)}</span></td>
          <td class="num">${rs(e.debit)}</td><td></td><td class="num">${balanceText(e.balance)}</td></tr>
        ${items ? `<tr><td></td><td colspan="4"><table class="items"><thead><tr><th>Article</th><th>Model</th><th>Size</th><th>Qty</th><th>Pairs</th><th>Rate</th><th>Discount</th><th>Amount</th></tr></thead><tbody>${items}</tbody></table></td></tr>` : ''}`
    }).join('')

    const win = window.open('', '_blank', 'width=900,height=700')
    win.document.write(`
      <html><head><meta charset="utf-8"><title>Full History - ${escapeHtml(customer.name)}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #1e293b; font-size: 12px; }
        h1 { color: #714B67; margin: 0 0 4px; font-size: 20px; }
        .muted { color: #64748b; }
        .info, .totals { display: flex; flex-wrap: wrap; gap: 6px 24px; margin: 10px 0; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; vertical-align: top; }
        th { background: #f1f5f9; }
        .num { text-align: right; }
        tr.bill td { background: #faf5f8; }
        table.items th, table.items td { border-color: #e2e8f0; padding: 3px 5px; font-size: 11px; }
        @media print { tr { page-break-inside: avoid; } }
      </style></head><body>
        <h1>PLUS EVR ERP: Customer Full History</h1>
        <div class="info">
          <span><strong>${escapeHtml(customer.name)}</strong> (ID: ${escapeHtml(customer.phone || '—')})</span>
          <span>Region: ${escapeHtml(customer.region || 'Punjab')}</span>
          ${customer.description ? `<span>${escapeHtml(customer.description)}</span>` : ''}
          <span class="muted">Printed ${formatDate(new Date().toISOString())}</span>
        </div>
        <div class="totals">
          <span>Opening balance: <strong>${balanceText(ledger.openingBalance)}</strong></span>
          <span>Bills: <strong>${bills.length}</strong> (${formatNumber(totals.pairs)} pairs)</span>
          <span>Total billed: <strong>${rs(totals.billed)}</strong></span>
          <span>Discounts: <strong>${rs(totals.discount)}</strong></span>
          <span>Payments: <strong>${payments.length}</strong></span>
          <span>Total paid: <strong>${rs(totals.paid)}</strong></span>
          <span>Current balance: <strong>${balanceText(ledger.closingBalance)}</strong></span>
        </div>
        <table>
          <thead><tr><th>Date</th><th>Detail</th><th class="num">Bill (Debit)</th><th class="num">Paid (Credit)</th><th class="num">Balance</th></tr></thead>
          <tbody>
            <tr><td></td><td><strong>Opening balance</strong></td><td></td><td></td><td class="num"><strong>${balanceText(ledger.openingBalance)}</strong></td></tr>
            ${rows || '<tr><td colspan="5" class="muted">No bills or payments yet.</td></tr>'}
            <tr><td></td><td><strong>Current balance</strong></td><td class="num"><strong>${rs(totals.billed)}</strong></td><td class="num"><strong>${rs(totals.paid)}</strong></td><td class="num"><strong>${balanceText(ledger.closingBalance)}</strong></td></tr>
          </tbody>
        </table>
        <script>window.onload = function () { window.print() }</script>
      </body></html>`)
    win.document.close()
  }

  return (
    <div className="em-root em-plain">
      <div className="em-card">
        <div className="em-card-head">
          <div>
            <h3>📒 Full History: {customer.name}</h3>
            <span className="em-muted">
              ID: {customer.phone || '—'} · Region: {customer.region || 'Punjab'}
              {customer.description ? ` · ${customer.description}` : ''}
              {firstDate ? ` · ${formatDate(firstDate)} to ${formatDate(lastDate)}` : ''}
            </span>
          </div>
          <div className="em-head-actions">
            <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={onBack}>← Back to customers</button>
            <button type="button" className="em-btn em-btn-primary em-btn-sm" onClick={handlePrint}>🖨️ Print / PDF</button>
          </div>
        </div>

        <div className="em-summary em-summary-wide">
          <div><span>Opening balance</span><strong>{balanceText(ledger.openingBalance)}</strong></div>
          <div><span>Bills ({bills.length})</span><strong>{rs(totals.billed)}</strong></div>
          <div><span>Pairs billed</span><strong>{formatNumber(totals.pairs)}</strong></div>
          <div><span>Discounts given</span><strong>{rs(totals.discount)}</strong></div>
          <div><span>Payments ({payments.length})</span><strong>{rs(totals.paid)}</strong></div>
          <div className={ledger.closingBalance < 0 ? 'em-good' : 'em-due'}><span>Current balance</span><strong>{balanceText(ledger.closingBalance)}</strong></div>
        </div>
      </div>

      <div className="em-card">
        <div className="em-table-wrap">
          <table className="em-table em-compact">
            <thead>
              <tr>
                <th className="em-th">Date</th>
                <th className="em-th">Detail</th>
                <th className="em-th em-num">Bill (Debit)</th>
                <th className="em-th em-num">Paid (Credit)</th>
                <th className="em-th em-num">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="em-row-muted">
                <td data-label="Date">—</td>
                <td data-label="Detail"><strong>Opening balance</strong></td>
                <td data-label="Bill" className="em-num">—</td>
                <td data-label="Paid" className="em-num">—</td>
                <td data-label="Balance" className="em-num"><strong>{balanceText(ledger.openingBalance)}</strong></td>
              </tr>
              {ledger.entries.length === 0 && (
                <tr className="em-empty-row"><td colSpan={5}>No bills or payments for this customer yet.</td></tr>
              )}
              {ledger.entries.map(e => {
                if (e.kind === 'payment') {
                  return (
                    <tr key={e.key}>
                      <td data-label="Date">{formatDate(e.date)}</td>
                      <td data-label="Detail">💵 Cash payment received</td>
                      <td data-label="Bill" className="em-num">—</td>
                      <td data-label="Paid" className="em-num em-paid"><strong>{rs(e.credit)}</strong></td>
                      <td data-label="Balance" className="em-num"><strong>{balanceText(e.balance)}</strong></td>
                    </tr>
                  )
                }
                const items = itemsOf(saleById.get(e.sortId))
                return (
                  <Fragment key={e.key}>
                    <tr className="em-row-bill">
                      <td data-label="Date">{formatDate(e.date)}</td>
                      <td data-label="Detail">
                        <strong>🧾 Bill No: {e.billNo || '—'}</strong>
                        <span className="em-hint"> · Invoice: {invoiceNumber(saleById.get(e.sortId) || {})} · {formatNumber(e.pairs)} pairs</span>
                        <div className="em-hint">Transport: {e.transportCompany} · Builty: {e.builtyNo}</div>
                      </td>
                      <td data-label="Bill" className="em-num"><strong>{rs(e.debit)}</strong></td>
                      <td data-label="Paid" className="em-num">—</td>
                      <td data-label="Balance" className="em-num"><strong>{balanceText(e.balance)}</strong></td>
                    </tr>
                    {items.length > 0 && (
                      <tr className="em-subrow">
                        <td colSpan={5}>
                          <div className="em-items-wrap">
                            <table className="em-items">
                              <thead>
                                <tr><th>Article</th><th>Model</th><th>Size</th><th>Qty</th><th className="em-num">Pairs</th><th className="em-num">Rate</th><th className="em-num">Discount</th><th className="em-num">Amount</th></tr>
                              </thead>
                              <tbody>
                                {items.map((i, index) => (
                                  <tr key={index}>
                                    <td>{i.article}</td>
                                    <td>{i.model}</td>
                                    <td>{i.size}</td>
                                    <td>{i.qty}</td>
                                    <td className="em-num">{formatNumber(i.pairs)}</td>
                                    <td className="em-num">{formatNumber(i.price)}</td>
                                    <td className="em-num">{i.discount ? formatNumber(i.discount) : '—'}</td>
                                    <td className="em-num">{formatNumber(i.amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              <tr className="em-row-total">
                <td data-label="Date">Today</td>
                <td data-label="Detail"><strong>Current balance</strong></td>
                <td data-label="Bill" className="em-num"><strong>{rs(totals.billed)}</strong></td>
                <td data-label="Paid" className="em-num"><strong>{rs(totals.paid)}</strong></td>
                <td data-label="Balance" className="em-num"><strong>{balanceText(ledger.closingBalance)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
