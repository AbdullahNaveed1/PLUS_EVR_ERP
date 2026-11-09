import { useMemo } from 'react'
import { findMaterial } from './materials'
import { isUsed } from './stock'
import { formatNumber } from './format'

// Raw Materials tab stock, plus how much of each was taken out by Production Deductions
export default function StockSection({ entries, rawMaterials }) {
  const rows = useMemo(() => {
    const usedBy = new Map()
    entries.filter(e => isUsed(e) && !e.voided && e.rawMaterialId != null).forEach(e => {
      usedBy.set(e.rawMaterialId, (usedBy.get(e.rawMaterialId) || 0) + (Number(e.quantity) || 0))
    })
    return [...rawMaterials]
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .map(m => ({ ...m, used: usedBy.get(m.id) || 0, stock: Number(m.stockQty) || 0 }))
  }, [entries, rawMaterials])

  return (
    <div className="em-card">
      <div className="em-card-head">
        <h3>📦 Material Stock</h3>
        <span className="em-muted">Stock Qty from the Raw Materials tab, after Production Deductions</span>
      </div>
      <div className="em-table-wrap">
        <table className="em-table">
          <thead>
            <tr><th>Material</th><th className="em-num">Used (deducted)</th><th className="em-num">In stock</th><th>Unit</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr className="em-empty-row"><td colSpan={4}>No materials yet. Add them on the Raw Materials tab.</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id}>
                <td data-label="Material">
                  <span className="em-badge" style={{ '--badge': findMaterial(r.name)?.color || '#475569' }}>{r.name}</span>
                </td>
                <td data-label="Used (deducted)" className="em-num">{formatNumber(r.used)}</td>
                <td data-label="In stock" className={`em-num ${r.stock < 0 ? 'em-due' : ''}`}><strong>{formatNumber(r.stock)}</strong></td>
                <td data-label="Unit">{r.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
