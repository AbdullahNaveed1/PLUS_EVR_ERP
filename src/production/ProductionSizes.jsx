import { emptySize, pairsOf, sizeTotals } from './sizeRows'
import '../entry/entry.css'

// Size breakdown for one production entry. Each row picks a product (size / colour) of the
// article; its pairs are added to that product's finished-goods stock when saved.

const variantLabel = p => `Size ${p.size || 'N/A'}${p.color ? ` · ${p.color}` : ''} (stock ${Number(p.trueStock ?? p.qty) || 0})`

export default function ProductionSizes({ variants, rows, onChange }) {
  const update = (index, field, value) => onChange(rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  const remove = index => onChange(rows.filter((_, i) => i !== index))
  const sorted = [...variants].sort((a, b) =>
    String(a.color || '').localeCompare(String(b.color || '')) ||
    String(a.size).localeCompare(String(b.size), undefined, { numeric: true }))
  const totals = sizeTotals(rows)

  return (
    <div className="em-root em-plain em-ps">
      {rows.map((row, index) => (
        <div key={index} className="em-ps-row">
          <label className="em-field">
            <span className="em-label">Size</span>
            <select value={String(row.productId)} onChange={e => update(index, 'productId', e.target.value)} aria-invalid={!row.productId && pairsOf(row) > 0}>
              <option value="">Choose size…</option>
              {sorted.map(p => <option key={p.id} value={String(p.id)}>{variantLabel(p)}</option>)}
            </select>
          </label>
          <label className="em-field">
            <span className="em-label">Dozens</span>
            <input type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={row.dozens} onChange={e => update(index, 'dozens', e.target.value)} />
          </label>
          <label className="em-field">
            <span className="em-label">Extra pairs</span>
            <input type="number" min="0" step="1" inputMode="numeric" placeholder="0" value={row.pairs} onChange={e => update(index, 'pairs', e.target.value)} />
          </label>
          <button type="button" className="em-btn em-btn-danger em-btn-sm" onClick={() => remove(index)} aria-label="Remove this size">✕</button>
        </div>
      ))}
      <div className="em-ps-foot">
        <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => onChange([...rows, emptySize()])}>+ Add size</button>
        <span className="em-hint">
          Total: <strong>{totals.dozens} dozens{totals.pairs ? ` + ${totals.pairs} pairs` : ''}</strong> ({totals.totalPairs} pairs) — added to finished stock on save
        </span>
      </div>
    </div>
  )
}
