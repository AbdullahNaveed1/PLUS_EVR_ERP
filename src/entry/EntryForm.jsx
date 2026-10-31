import { useRef, useState } from 'react'
import { MATERIALS, UNITS, findMaterial } from './materials'
import { computeAmount, toPayload, validateEntry } from './entryLogic'
import { formatNumber, todayISO } from './format'

const emptyForm = enteredBy => ({
  date: todayISO(),
  material: '',
  quantity: '',
  unit: '',
  articleNo: '',
  size: '',
  supplier: '',
  billNo: '',
  rate: '',
  amount: '',
  remarks: '',
  enteredBy: enteredBy || ''
})

const Optional = () => <span className="em-optional">optional</span>

export default function EntryForm({ username, suppliers, onSave }) {
  const [form, setForm] = useState(() => emptyForm(username))
  const [errors, setErrors] = useState({})
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const dateRef = useRef(null)
  const materialRef = useRef(null)
  const quantityRef = useRef(null)
  const unitRef = useRef(null)

  const set = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
  }

  // Picking a material fills in its default unit (still editable afterwards)
  const handleMaterialChange = value => {
    const match = findMaterial(value)
    setForm(prev => ({ ...prev, material: value, unit: match ? match.unit : prev.unit }))
    if (errors.material || errors.unit) setErrors(prev => ({ ...prev, material: undefined, unit: undefined }))
  }

  const autoAmount = form.rate !== '' && Number(form.quantity) > 0
  const amountValue = autoAmount ? computeAmount(form.quantity, form.rate, '') : form.amount

  const handleSubmit = async e => {
    e.preventDefault()
    if (saving) return
    const found = validateEntry(form)
    setErrors(found)
    setSaveError('')
    const firstInvalid = ['date', 'material', 'quantity', 'unit'].find(f => found[f])
    if (firstInvalid) {
      ({ date: dateRef, material: materialRef, quantity: quantityRef, unit: unitRef })[firstInvalid].current?.focus()
      return
    }

    setSaving(true)
    try {
      await onSave(toPayload(form))
      // Keep date, supplier, material and unit for fast repeated entry; clear the rest
      setForm(prev => ({
        ...emptyForm(prev.enteredBy),
        date: prev.date,
        supplier: prev.supplier,
        material: findMaterial(prev.material)?.name || prev.material,
        unit: prev.unit
      }))
      quantityRef.current?.focus()
    } catch (err) {
      setSaveError(err.message || 'Could not save the entry.')
    } finally {
      setSaving(false)
    }
  }

  const handleClear = () => {
    setForm(emptyForm(username))
    setErrors({})
    setSaveError('')
    dateRef.current?.focus()
  }

  return (
    <form className="em-card em-form" onSubmit={handleSubmit} noValidate>
      <div className="em-card-head">
        <h3>New Material Entry</h3>
        <span className="em-muted">Date, supplier and material stay filled after saving.</span>
      </div>

      {saveError && <div className="em-banner em-banner-error" role="alert">{saveError}</div>}

      <div className="em-grid">
        <label className="em-field">
          <span className="em-label">Date of entry</span>
          <input
            ref={dateRef}
            type="date"
            value={form.date}
            onChange={e => set('date', e.target.value)}
            aria-invalid={!!errors.date}
          />
          {errors.date && <span className="em-error">{errors.date}</span>}
        </label>

        <label className="em-field">
          <span className="em-label">Material</span>
          <input
            ref={materialRef}
            list="em-material-list"
            placeholder="Type to search…"
            value={form.material}
            onChange={e => handleMaterialChange(e.target.value)}
            aria-invalid={!!errors.material}
            autoComplete="off"
          />
          <datalist id="em-material-list">
            {MATERIALS.map(m => <option key={m.name} value={m.name} />)}
          </datalist>
          {errors.material && <span className="em-error">{errors.material}</span>}
        </label>

        <label className="em-field">
          <span className="em-label">Quantity</span>
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
        </label>

        <label className="em-field">
          <span className="em-label">Unit</span>
          <input
            ref={unitRef}
            list="em-unit-list"
            placeholder="pcs / kg / pairs"
            value={form.unit}
            onChange={e => set('unit', e.target.value)}
            aria-invalid={!!errors.unit}
            autoComplete="off"
          />
          <datalist id="em-unit-list">
            {UNITS.map(u => <option key={u} value={u} />)}
          </datalist>
          {errors.unit && <span className="em-error">{errors.unit}</span>}
        </label>

        <label className="em-field">
          <span className="em-label">Article No <Optional /></span>
          <input type="text" placeholder="e.g. A-102" value={form.articleNo} onChange={e => set('articleNo', e.target.value)} />
        </label>

        <label className="em-field">
          <span className="em-label">Size <Optional /></span>
          <input type="text" placeholder="e.g. 7.5, 42, Free, XL" value={form.size} onChange={e => set('size', e.target.value)} />
        </label>

        <label className="em-field">
          <span className="em-label">Supplier / Party <Optional /></span>
          <input
            type="text"
            list="em-supplier-list"
            placeholder="Supplier name"
            value={form.supplier}
            onChange={e => set('supplier', e.target.value)}
            autoComplete="off"
          />
          <datalist id="em-supplier-list">
            {suppliers.map(s => <option key={s} value={s} />)}
          </datalist>
        </label>

        <label className="em-field">
          <span className="em-label">Bill / Invoice No <Optional /></span>
          <input type="text" placeholder="Supplier bill no" value={form.billNo} onChange={e => set('billNo', e.target.value)} />
        </label>

        <label className="em-field">
          <span className="em-label">Rate per unit <Optional /></span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="Rs."
            value={form.rate}
            onChange={e => set('rate', e.target.value)}
          />
        </label>

        <label className="em-field">
          <span className="em-label">Amount <Optional /></span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="Rs."
            value={amountValue ?? ''}
            readOnly={autoAmount}
            className={autoAmount ? 'em-readonly' : ''}
            onChange={e => set('amount', e.target.value)}
          />
          {autoAmount && <span className="em-hint">Qty × rate = Rs. {formatNumber(amountValue)}</span>}
        </label>

        <label className="em-field em-span-2">
          <span className="em-label">Remarks / Notes <Optional /></span>
          <input type="text" placeholder="Anything to remember about this delivery" value={form.remarks} onChange={e => set('remarks', e.target.value)} />
        </label>

        <label className="em-field">
          <span className="em-label">Entered by <Optional /></span>
          <input type="text" placeholder="Name" value={form.enteredBy} onChange={e => set('enteredBy', e.target.value)} />
        </label>
      </div>

      <div className="em-actions">
        <button type="button" className="em-btn em-btn-ghost" onClick={handleClear}>Clear form</button>
        {/* Never disabled: a second press while saving is ignored in handleSubmit */}
        <button type="submit" className="em-btn em-btn-primary" aria-busy={saving}>
          {saving ? 'Saving…' : 'Save entry'}
        </button>
      </div>
    </form>
  )
}
