import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { formatDate, formatNumber, todayISO } from '../entry/format'
import '../entry/entry.css'

// Profit & loss for any date range (Admins only). Cost of goods uses each article's recipe
// material cost per pair, so articles without a recipe are flagged.

const API_BASE_URL = import.meta.env.VITE_API_URL || ''
const rs = value => `Rs. ${formatNumber(Math.round((Number(value) || 0) * 100) / 100)}`
const minus = value => `− ${rs(value)}`
const errorText = err => err?.response?.data?.message || (err?.response ? `Server error (HTTP ${err.response.status})` : 'Could not reach the server.')
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const iso = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10) }
const PRESETS = {
  'This month': () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), todayISO()] },
  'Last month': () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), iso(new Date(n.getFullYear(), n.getMonth(), 0))] },
  'This year': () => [`${new Date().getFullYear()}-01-01`, todayISO()]
}

// Statement lines in order: label, value, how to show it, emphasis
const lines = r => [
  ['Gross sales (before discount)', r.grossSales, rs],
  ['Discounts given', r.discounts, minus],
  ['Sales returns', r.returns, minus],
  ['Net sales', r.netSales, rs, 'total'],
  ['Cost of goods sold (recipe material)', r.costOfGoods, minus],
  ['Gross profit', r.grossProfit, rs, 'total'],
  ['Wages paid', r.wages, minus],
  ['Expenses', r.expenses, minus],
  ['Net profit', r.netProfit, rs, 'result']
]

export default function ProfitPage({ token }) {
  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token])
  const [range, setRange] = useState(() => PRESETS['This month']())
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const [from, to] = range
    if (!from || !to) return
    axios.get(`${API_BASE_URL}/api/reports/profit`, { ...headers, params: { from, to } })
      .then(res => { setReport(res.data); setError('') })
      .catch(err => setError(errorText(err)))
  }, [headers, range])

  const handlePrint = () => {
    const r = report
    const rows = lines(r).map(([label, value, show, tone]) =>
      `<tr class="${tone || ''}"><td>${escapeHtml(label)}</td><td class="n">${show(value)}</td></tr>`).join('')
    const cats = (r.expensesByCategory || []).map(c => `<tr><td>${escapeHtml(c.category)}</td><td class="n">${rs(c.amount)}</td></tr>`).join('')
    const win = window.open('', '_blank', 'width=800,height=700')
    if (!win) return
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Profit ${r.from} to ${r.to}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}h1{color:#714B67;font-size:20px;margin:0 0 4px}
      table{width:100%;border-collapse:collapse;margin-top:12px}td,th{border:1px solid #cbd5e1;padding:8px;text-align:left}.n{text-align:right}
      tr.total td{font-weight:700;background:#f8fafc}tr.result td{font-weight:800;background:#faf5f8;font-size:15px}.muted{color:#64748b}</style></head><body>
      <h1>PLUS EVR ERP: Profit &amp; Loss</h1>
      <div class="muted">${formatDate(r.from)} to ${formatDate(r.to)} · ${r.bills} bills · ${formatNumber(r.pairsSold)} pairs sold · ${formatNumber(r.pairsReturned)} returned</div>
      <table><tbody>${rows}<tr><td>Margin</td><td class="n">${r.marginPercent ?? '—'}%</td></tr></tbody></table>
      ${cats ? `<h3>Expenses by category</h3><table><tbody>${cats}</tbody></table>` : ''}
      ${r.withoutRecipe.length ? `<p class="muted">No recipe (cost counted as 0): ${r.withoutRecipe.map(m => `${escapeHtml(m.article)} (${formatNumber(m.pairs)} pairs)`).join(', ')}</p>` : ''}
      <script>window.onload = function () { window.print() }</script></body></html>`)
    win.document.close()
  }

  return (
    <div className="em-root em-plain">
      <div className="em-title"><h2>💰 Profit &amp; Loss <span className="em-muted">(Admins only)</span></h2></div>

      <div className="em-card">
        <div className="em-filters">
          <label className="em-filter"><span>From</span><input type="date" value={range[0]} onChange={e => setRange([e.target.value, range[1]])} /></label>
          <label className="em-filter"><span>To</span><input type="date" value={range[1]} onChange={e => setRange([range[0], e.target.value])} /></label>
          {Object.entries(PRESETS).map(([label, get]) => (
            <button key={label} type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => setRange(get())}>{label}</button>
          ))}
          <button type="button" className="em-btn em-btn-primary em-btn-sm" onClick={handlePrint} disabled={!report}>🖨️ Print / PDF</button>
        </div>

        {error && <div className="em-banner em-banner-error" role="alert">{error}</div>}
        {!report && !error && <div className="em-center">Loading…</div>}

        {report && (
          <>
            <div className="em-summary">
              <div><span>Net sales</span><strong>{rs(report.netSales)}</strong></div>
              <div><span>Gross profit</span><strong>{rs(report.grossProfit)}</strong></div>
              <div className={report.netProfit < 0 ? 'em-due' : 'em-good'}><span>Net profit</span><strong>{rs(report.netProfit)}</strong></div>
              <div><span>Margin</span><strong>{report.marginPercent == null ? '—' : `${report.marginPercent}%`}</strong></div>
            </div>
            <p className="em-hint">
              {report.bills} bills · {formatNumber(report.pairsSold)} pairs sold · {formatNumber(report.pairsReturned)} pairs returned.
              Material cost uses each article's recipe at today's unit costs.
            </p>

            {report.withoutRecipe.length > 0 && (
              <div className="em-banner em-banner-warn" role="status">
                No recipe, so their material cost counts as 0 and profit looks higher than it is:{' '}
                {report.withoutRecipe.map(m => `${m.article} (${formatNumber(m.pairs)} pairs)`).join(', ')}.
                Add recipes in Production → Recipes.
              </div>
            )}

            <div className="em-table-wrap">
              <table className="em-table em-pl">
                <tbody>
                  {lines(report).map(([label, value, show, tone]) => (
                    <tr key={label} className={tone ? `em-pl-${tone}` : ''}>
                      <td data-label="">{label}</td>
                      <td data-label="" className="em-num">{show(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {report.expensesByCategory.length > 0 && (
              <>
                <h4 style={{ margin: '16px 0 8px' }}>Expenses by category</h4>
                <div className="em-table-wrap">
                  <table className="em-table em-pl">
                    <tbody>
                      {report.expensesByCategory.map(c => (
                        <tr key={c.category}><td data-label="">{c.category}</td><td data-label="" className="em-num">{rs(c.amount)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
