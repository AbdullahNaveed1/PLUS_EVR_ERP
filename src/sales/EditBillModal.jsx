import { useState } from 'react'
import { formatNumber } from '../entry/format'
import '../entry/entry.css'

// Admin window for correcting a saved bill: bill details plus each line's size, qty, unit, rate
// and discount. The server recalculates totals and moves finished-goods stock by the difference.

const rs = value => `Rs. ${formatNumber(Number(value) || 0)}`
const toNumber = value => (Number.isFinite(Number(value)) ? Number(value) : 0)
const pairsOf = line => toNumber(line.qty) * (line.unitType === 'pairs' ? 1 : 12)
const lineAmounts = line => {
  const pairs = pairsOf(line)
  const gross = pairs * toNumber(line.price)
  const discount = Math.min(gross, pairs * Math.max(0, toNumber(line.discountPerPair)))
  return { pairs, gross, discount, net: gross - discount }
}

// Old bills may only have a pair count, so those open in pairs
const toLine = item => {
  const hasQty = toNumber(item.qty) > 0
  return {
    ...item,
    productId: item.productId ?? 'N/A',
    qty: String(hasQty ? item.qty : toNumber(item.pairs) || ''),
    unitType: hasQty && item.unitType !== 'pairs' ? 'dozens' : 'pairs',
    price: String(toNumber(item.price)),
    discountPerPair: String(Math.round(toNumber(item.discountPerPair) * 100) / 100)
  }
}

export default function EditBillModal({ sale, inventory, onSave, onClose }) {
  const [billNo, setBillNo] = useState(sale.billNo || '')
  const [transportCompany, setTransportCompany] = useState(sale.transportCompany === 'N/A' ? '' : sale.transportCompany || '')
  const [builtyNo, setBuiltyNo] = useState(sale.builtyNo === 'N/A' ? '' : sale.builtyNo || '')
  const [lines, setLines] = useState(() => (sale.lineItems || []).map(toLine))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const productById = new Map(inventory.map(p => [String(p.id), p]))

  // Sizes offered for a line: every product of the same article, so a wrong size can be swapped
  const sizeOptions = line => {
    const current = productById.get(String(line.productId))
    if (!current) return []
    const article = current.articleNumber || current.model
    return inventory
      .filter(p => (p.articleNumber || p.model) === article && (p.color || '') === (current.color || ''))
      .sort((a, b) => String(a.size).localeCompare(String(b.size), undefined, { numeric: true }))
  }

  const updateLine = (index, field, value) => {
    setLines(current => current.map((line, i) => {
      if (i !== index) return line
      if (field !== 'productId') return { ...line, [field]: value }
      const product = productById.get(value)
      return product ? { ...line, productId: String(product.id), model: product.model, size: product.size || 'N/A' } : line
    }))
  }

  const lineErrors = lines.map(line => ({
    qty: toNumber(line.qty) > 0 ? '' : 'Enter a quantity above 0',
    price: line.price !== '' && toNumber(line.price) >= 0 ? '' : 'Enter a rate',
    discountPerPair: toNumber(line.discountPerPair) >= 0 ? '' : 'Cannot be negative'
  }))
  const hasErrors = lineErrors.some(e => e.qty || e.price || e.discountPerPair)

  const newTotal = lines.reduce((acc, line) => acc + lineAmounts(line).net, 0)
  const oldTotal = toNumber(sale.total)

  // Stock moves per product: positive = more pairs leave stock, negative = pairs return
  const stockMoves = (() => {
    const map = new Map()
    const add = (id, label, pairs) => {
      const key = String(id)
      if (!key || key === 'N/A') return
      const row = map.get(key) || { label, pairs: 0 }
      row.pairs += pairs
      map.set(key, row)
    }
    for (const item of sale.lineItems || []) add(item.productId, `${item.model} (Size ${item.size})`, -toNumber(item.pairs))
    for (const line of lines) add(line.productId, `${line.model} (Size ${line.size})`, pairsOf(line))
    return [...map.values()].filter(r => Math.round(r.pairs) !== 0)
  })()

  const handleSave = async () => {
    setSubmitted(true)
    if (hasErrors || saving) return
    setSaving(true)
    setError('')
    try {
      const lineItems = lines.map(line => {
        const amounts = lineAmounts(line)
        return {
          ...line,
          qty: toNumber(line.qty),
          price: toNumber(line.price),
          discountPerPair: Math.max(0, toNumber(line.discountPerPair)),
          pairs: amounts.pairs,
          grossAmount: amounts.gross,
          discountAmount: amounts.discount,
          netAmount: amounts.net,
          // Old bills keep qty/rate text in the description, which would override the new numbers
          description: line.model || 'Footwear Article'
        }
      })
      await onSave({
        ...sale,
        billNo: billNo.trim(),
        transportCompany: transportCompany.trim() || 'N/A',
        builtyNo: builtyNo.trim() || 'N/A',
        lineItems
      })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const close = () => { if (!saving) onClose() }

  return (
    <div className="em-root em-plain">
      <div className="em-modal-backdrop" role="presentation" onClick={close}>
        <div className="em-modal em-modal-wide" role="dialog" aria-modal="true" aria-labelledby="eb-title" onClick={e => e.stopPropagation()}>
          <h4 id="eb-title">✏️ Edit bill — {sale.customer}</h4>
          <p className="em-muted">Bill date {sale.date}. Changing quantities or sizes also updates finished-goods stock.</p>

          <div className="em-grid">
            <label className="em-field">
              <span className="em-label">Bill No</span>
              <input value={billNo} onChange={e => setBillNo(e.target.value)} />
            </label>
            <label className="em-field">
              <span className="em-label">Transport company</span>
              <input value={transportCompany} onChange={e => setTransportCompany(e.target.value)} />
            </label>
            <label className="em-field">
              <span className="em-label">Builty No</span>
              <input value={builtyNo} onChange={e => setBuiltyNo(e.target.value)} />
            </label>
          </div>

          <div className="em-eb-lines">
            {lines.map((line, index) => {
              const sizes = sizeOptions(line)
              const amounts = lineAmounts(line)
              const errs = submitted ? lineErrors[index] : {}
              return (
                <fieldset key={index} className="em-eb-line">
                  <legend>{line.model || `Item ${index + 1}`} <span className="em-hint">#{line.productId}</span></legend>
                  <div className="em-eb-grid">
                    <label className="em-field">
                      <span className="em-label">Size</span>
                      {sizes.length > 1 ? (
                        <select value={String(line.productId)} onChange={e => updateLine(index, 'productId', e.target.value)}>
                          {sizes.map(p => (
                            <option key={p.id} value={String(p.id)}>{p.size || 'N/A'} (stock {formatNumber(toNumber(p.qty))})</option>
                          ))}
                        </select>
                      ) : (
                        <input className="em-readonly" value={line.size || 'N/A'} readOnly />
                      )}
                    </label>
                    <label className="em-field">
                      <span className="em-label">Qty</span>
                      <input type="number" min="0" step="any" inputMode="decimal" value={line.qty} aria-invalid={!!errs.qty}
                        onChange={e => updateLine(index, 'qty', e.target.value)} />
                      {errs.qty && <span className="em-error">{errs.qty}</span>}
                    </label>
                    <label className="em-field">
                      <span className="em-label">Unit</span>
                      <select value={line.unitType} onChange={e => updateLine(index, 'unitType', e.target.value)}>
                        <option value="dozens">Dozens (12)</option>
                        <option value="pairs">Pairs</option>
                      </select>
                    </label>
                    <label className="em-field">
                      <span className="em-label">Rate (Rs./pair)</span>
                      <input type="number" min="0" step="any" inputMode="decimal" value={line.price} aria-invalid={!!errs.price}
                        onChange={e => updateLine(index, 'price', e.target.value)} />
                      {errs.price && <span className="em-error">{errs.price}</span>}
                    </label>
                    <label className="em-field">
                      <span className="em-label">Discount (Rs./pair)</span>
                      <input type="number" min="0" step="any" inputMode="decimal" value={line.discountPerPair} aria-invalid={!!errs.discountPerPair}
                        onChange={e => updateLine(index, 'discountPerPair', e.target.value)} />
                      {errs.discountPerPair && <span className="em-error">{errs.discountPerPair}</span>}
                    </label>
                  </div>
                  <div className="em-eb-amount">
                    {formatNumber(amounts.pairs)} pairs · <strong>{rs(amounts.net)}</strong>
                    {amounts.discount > 0 && <span className="em-hint"> (after {rs(amounts.discount)} discount)</span>}
                  </div>
                </fieldset>
              )
            })}
          </div>

          <div className="em-eb-summary">
            <div>Bill total: <s className="em-hint">{rs(oldTotal)}</s> → <strong>{rs(newTotal)}</strong></div>
            {stockMoves.length > 0 && (
              <ul className="em-eb-stock">
                {stockMoves.map(m => (
                  <li key={m.label}>
                    {m.label}: {m.pairs > 0 ? `${formatNumber(m.pairs)} more pairs taken from stock` : `${formatNumber(-m.pairs)} pairs back into stock`}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <div className="em-banner em-banner-error" role="alert">{error}</div>}
          <div className="em-actions">
            <button type="button" className="em-btn em-btn-ghost" onClick={close} disabled={saving}>Cancel</button>
            <button type="button" className="em-btn em-btn-primary" onClick={handleSave} aria-busy={saving} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
