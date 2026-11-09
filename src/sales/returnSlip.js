import { formatNumber } from '../entry/format'

// Printable slip for a saved sales return

const rs = value => `Rs. ${formatNumber(Number(value) || 0)}`
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export const printReturnSlip = (saved, sale) => {
  const win = window.open('', '_blank', 'width=800,height=600')
  if (!win) return
  const rows = (saved.items || []).map(i => `
    <tr><td>${escapeHtml(i.model)}</td><td>${escapeHtml(i.size)}</td><td class="n">${formatNumber(i.pairs)}</td>
    <td class="n">${formatNumber(i.price - i.discountPerPair)}</td><td class="n">${formatNumber(i.amount)}</td></tr>`).join('')
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Return #${saved.id}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}table{width:100%;border-collapse:collapse;margin-top:12px}
    th,td{border:1px solid #cbd5e1;padding:8px;text-align:left}.n{text-align:right}h2{margin:0 0 4px}</style></head><body>
    <h2>PLUS EVR — Sales Return Slip #${saved.id}</h2>
    <p>Date: ${escapeHtml(saved.date)} · Customer: <b>${escapeHtml(saved.customer)}</b> (${escapeHtml(saved.customerId)})<br>
    Against Bill No: ${escapeHtml(sale?.billNo || '—')} dated ${escapeHtml(sale?.date || '')}${saved.reason ? `<br>Reason: ${escapeHtml(saved.reason)}` : ''}</p>
    <table><thead><tr><th>Article</th><th>Size</th><th class="n">Pairs</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr><th colspan="4" class="n">Credited to customer</th><th class="n">${rs(saved.total)}</th></tr></tfoot></table>
    <script>window.onload = function () { window.print() }</script></body></html>`)
  win.document.close()
}
