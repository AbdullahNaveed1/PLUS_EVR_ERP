import { useMemo, useRef, useState } from 'react'
import { findMaterial } from './materials'
import { isUsed } from './stock'
import { dash, formatDate, formatNumber, todayISO } from './format'

// Production deduction: raw material taken out for production. The server lowers the
// Stock Qty of the chosen Raw Materials tab item, and puts it back if the deduction is deleted.

const emptyForm = (enteredBy, date = todayISO()) => ({
  date, rawMaterialId: '', quantity: '', articleNo: '', remarks: '', enteredBy: enteredBy || ''
})

const Optional = () => <span className="em-optional">optional</span>

export default function DeductionSection({ entries, rawMaterials, username, onSave, onVoid, onRestore }) {
  const [form, setForm] = useState(() => emptyForm(username))
  const [errors, setErrors] = useState({})
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [materialFilter, setMaterialFilter] = useState('')
  const [showVoided, setShowVoided] = useState(false)
  const [confirmEntry, setConfirmEntry] = useState(null)
  const quantityRef = useRef(null)
  const materialRef = useRef(null)

  const set = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
  }

  const sortedMaterials = useMemo(
    () => [...rawMaterials].sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [rawMaterials]
  )
  const material = rawMaterials.find(m => String(m.id) === String(form.rawMaterialId))
  const inStock = material ? Number(material.stockQty) || 0 : null
  const overdraw = inStock !== null && Number(form.quantity) > inStock

  const validate = () => {
    const found = {}
    if (!form.date) found.date = 'Pick the date.'
    if (!material) found.material = 'Choose a material.'
    if (form.quantity === '') found.quantity = 'Enter the quantity used.'
    else if (!(Number(form.quantity) > 0)) found.quantity = 'Quantity must be more than 0.'
    return found
  }

  const handleSubmit = async e => {
    e.preventDefault()
    if (saving) return
    const found = validate()
    setErrors(found)
    setSaveError('')
    if (found.material) materialRef.current?.focus()
    else if (found.quantity) quantityRef.current?.focus()
    if (Object.values(found).some(Boolean)) return

    setSaving(true)
    try {
      await onSave({
        kind: 'used',
        date: form.date,
        rawMaterialId: material.id,
        material: material.name,
        quantity: Number(form.quantity),
        unit: material.unit,
        articleNo: form.articleNo,
        remarks: form.remarks,
        enteredBy: form.enteredBy
      })
      // Keep the date for fast entry of the day's other materials
      setForm(prev => emptyForm(prev.enteredBy, prev.date))
    } catch (err) {
      setSaveError(err.message || 'Could not save the deduction.')
    } finally {
      setSaving(false)
    }
  }

  const rows = useMemo(() => entries
    .filter(e => isUsed(e) && (showVoided || !e.voided))
    .filter(e => (!fromDate || e.date >= fromDate) && (!toDate || e.date <= toDate))
    .filter(e => !materialFilter || e.material === materialFilter)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt))),
  [entries, showVoided, fromDate, toDate, materialFilter])

  const totals = useMemo(() => {
    const map = new Map()
    rows.filter(e => !e.voided).forEach(e => {
      const key = `${e.material}|${e.unit}`
      const row = map.get(key) || { material: e.material, unit: e.unit, qty: 0 }
      row.qty += Number(e.quantity) || 0
      map.set(key, row)
    })
    return [...map.values()].sort((a, b) => a.material.localeCompare(b.material))
  }, [rows])

  return (
    <>
      <form className="em-card em-form" onSubmit={handleSubmit} noValidate>
        <div className="em-card-head">
          <h3>➖ Production Deduction</h3>
          <span className="em-muted">Raw material taken out for production. It is subtracted from the Raw Materials tab stock.</span>
        </div>

        {saveError && <div className="em-banner em-banner-error" role="alert">{saveError}</div>}

        <div className="em-grid">
          <label className="em-field">
            <span className="em-label">Date</span>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} aria-invalid={!!errors.date} />
            {errors.date && <span className="em-error">{errors.date}</span>}
          </label>

          <label className="em-field">
            <span className="em-label">Material</span>
            <select ref={materialRef} value={form.rawMaterialId} onChange={e => set('rawMaterialId', e.target.value)} aria-invalid={!!errors.material}>
              <option value="">{sortedMaterials.length ? 'Choose material…' : 'Add materials on the Raw Materials tab first'}</option>
              {sortedMaterials.map(m => (
                <option key={m.id} value={String(m.id)}>{m.name} ({formatNumber(Number(m.stockQty) || 0)} {m.unit} in stock)</option>
              ))}
            </select>
            {errors.material && <span className="em-error">{errors.material}</span>}
          </label>

          <label className="em-field">
            <span className="em-label">Quantity used</span>
            <input
              ref={quantityRef}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="0"
              value={form.quantity}
              onChange={e => set('quantity', e.target.value)}
              aria-invalid={!!errors.quantity}
            />
            {errors.quantity && <span className="em-error">{errors.quantity}</span>}
            {inStock !== null && (
              <span className={overdraw ? 'em-error' : 'em-hint'}>
                In stock: {formatNumber(inStock)} {material.unit}{overdraw ? ' — this is more than the stock' : ''}
              </span>
            )}
          </label>

          <label className="em-field">
            <span className="em-label">Unit</span>
            <input className="em-readonly" value={material?.unit || ''} placeholder="From the material" readOnly />
          </label>

          <label className="em-field">
            <span className="em-label">Article No <Optional /></span>
            <input type="text" placeholder="e.g. A-102" value={form.articleNo} onChange={e => set('articleNo', e.target.value)} />
          </label>

          <label className="em-field em-span-2">
            <span className="em-label">Remarks <Optional /></span>
            <input type="text" placeholder="e.g. Machine 2, night shift" value={form.remarks} onChange={e => set('remarks', e.target.value)} />
          </label>

          <label className="em-field">
            <span className="em-label">Entered by <Optional /></span>
            <input type="text" placeholder="Name" value={form.enteredBy} onChange={e => set('enteredBy', e.target.value)} />
          </label>
        </div>

        <div className="em-actions">
          <button type="submit" className="em-btn em-btn-primary" aria-busy={saving}>
            {saving ? 'Saving…' : 'Deduct from stock'}
          </button>
        </div>
      </form>

      <div className="em-card">
        <div className="em-card-head">
          <h3>Deductions</h3>
          <label className="em-check">
            <input type="checkbox" checked={showVoided} onChange={e => setShowVoided(e.target.checked)} />
            Show deleted
          </label>
        </div>

        <div className="em-filters">
          <label className="em-filter">
            <span>From</span>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </label>
          <label className="em-filter">
            <span>To</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </label>
          <label className="em-filter">
            <span>Material</span>
            <select value={materialFilter} onChange={e => setMaterialFilter(e.target.value)}>
              <option value="">All materials</option>
              {[...new Set(entries.filter(isUsed).map(e => e.material))].sort().map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        </div>

        {totals.length > 0 && (
          <div className="em-totals">
            <span>Used in this view:</span>
            <div className="em-chips">
              {totals.map(t => (
                <span key={`${t.material}|${t.unit}`} className="em-chip">{t.material}: <strong>{formatNumber(t.qty)}</strong> {t.unit}</span>
              ))}
            </div>
          </div>
        )}

        <div className="em-table-wrap">
          <table className="em-table">
            <thead>
              <tr>
                <th>Date</th><th>Material</th><th className="em-num">Qty used</th><th>Unit</th>
                <th>Article No</th><th>Remarks</th><th>Entered by</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr className="em-empty-row"><td colSpan={8}>No deductions yet. Use the form above when material goes to production.</td></tr>
              )}
              {rows.map(e => (
                <tr key={e.id} className={e.voided ? 'em-voided' : ''}>
                  <td data-label="Date">{formatDate(e.date)}</td>
                  <td data-label="Material">
                    <span className="em-badge" style={{ '--badge': findMaterial(e.material)?.color || '#475569' }}>{e.material}</span>
                    {e.voided && <span className="em-voided-tag">deleted</span>}
                  </td>
                  <td data-label="Qty used" className="em-num"><strong>−{formatNumber(e.quantity)}</strong></td>
                  <td data-label="Unit">{dash(e.unit)}</td>
                  <td data-label="Article No">{dash(e.articleNo)}</td>
                  <td data-label="Remarks" className="em-remarks">{dash(e.remarks)}</td>
                  <td data-label="Entered by">{dash(e.enteredBy)}</td>
                  <td data-label="Actions">
                    {e.voided
                      ? <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => onRestore(e)}>Restore</button>
                      : <button type="button" className="em-btn em-btn-danger em-btn-sm" onClick={() => setConfirmEntry(e)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {confirmEntry && (
        <div className="em-modal-backdrop" role="presentation" onClick={() => setConfirmEntry(null)}>
          <div className="em-modal" role="alertdialog" aria-modal="true" aria-labelledby="em-ded-confirm" onClick={e => e.stopPropagation()}>
            <h4 id="em-ded-confirm">Delete this deduction?</h4>
            <p>{formatDate(confirmEntry.date)} · {confirmEntry.material} · {formatNumber(confirmEntry.quantity)} {confirmEntry.unit}</p>
            <p className="em-muted">The quantity goes back into the Raw Materials tab stock. You can undo right away, or restore it later with "Show deleted".</p>
            <div className="em-actions">
              <button type="button" className="em-btn em-btn-ghost" onClick={() => setConfirmEntry(null)} autoFocus>Keep it</button>
              <button type="button" className="em-btn em-btn-danger" onClick={() => { onVoid(confirmEntry); setConfirmEntry(null) }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
