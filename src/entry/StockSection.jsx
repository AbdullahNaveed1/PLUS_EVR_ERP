import { useMemo } from 'react'
import { findMaterial } from './materials'
import { stockBalance } from './stock'
import { formatNumber } from './format'

// Live material stock: everything received minus everything deducted for production
export default function StockSection({ entries }) {
  const rows = useMemo(() => stockBalance(entries), [entries])

  return (
    <div className="em-card">
      <div className="em-card-head">
        <h3>📦 Material Stock</h3>
        <span className="em-muted">Received (Entry) − used (Production Deduction)</span>
      </div>
      <div className="em-table-wrap">
        <table className="em-table">
          <thead>
            <tr><th>Material</th><th className="em-num">Received</th><th className="em-num">Used</th><th className="em-num">In stock</th><th>Unit</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr className="em-empty-row"><td colSpan={5}>No material received yet.</td></tr>
            )}
            {rows.map(r => (
              <tr key={`${r.material}|${r.unit}`}>
                <td data-label="Material">
                  <span className="em-badge" style={{ '--badge': findMaterial(r.material)?.color || '#475569' }}>{r.material}</span>
                </td>
                <td data-label="Received" className="em-num">{formatNumber(r.received)}</td>
                <td data-label="Used" className="em-num">{formatNumber(r.used)}</td>
                <td data-label="In stock" className={`em-num ${r.balance < 0 ? 'em-due' : ''}`}><strong>{formatNumber(r.balance)}</strong></td>
                <td data-label="Unit">{r.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
