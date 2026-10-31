import { useMemo, useState } from 'react'
import { MATERIALS, findMaterial } from './materials'
import { computeAmount, toPayload, validateEntry } from './entryLogic'
import { dash, downloadCsv, formatDate, formatMoney, formatNumber, todayISO } from './format'

const PAGE_SIZE = 25

const COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'material', label: 'Material' },
  { key: 'quantity', label: 'Qty', numeric: true },
  { key: 'unit', label: 'Unit' },
  { key: 'articleNo', label: 'Article No' },
  { key: 'size', label: 'Size' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'billNo', label: 'Bill No' },
  { key: 'amount', label: 'Amount', numeric: true },
  { key: 'remarks', label: 'Remarks' },
  { key: 'enteredBy', label: 'Entered by' }
]

const SEARCH_FIELDS = ['material', 'articleNo', 'supplier', 'billNo', 'size', 'remarks']

// Sort helper: numbers numerically, text case-insensitively, blanks always last
const compareBy = (key, numeric) => (a, b) => {
  const va = a[key]
  const vb = b[key]
  const aBlank = va === null || va === undefined || va === ''
  const bBlank = vb === null || vb === undefined || vb === ''
  if (aBlank || bBlank) return aBlank === bBlank ? 0 : aBlank ? 1 : -1
  return numeric ? Number(va) - Number(vb) : String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' })
}

// Editable copy of a saved entry (inputs work with strings)
const toDraft = e => ({
  date: e.date,
  material: e.material,
  quantity: String(e.quantity ?? ''),
  unit: e.unit || '',
  articleNo: e.articleNo || '',
  size: e.size || '',
  supplier: e.supplier || '',
  billNo: e.billNo || '',
  rate: e.rate === null || e.rate === undefined ? '' : String(e.rate),
  amount: e.amount === null || e.amount === undefined ? '' : String(e.amount),
  remarks: e.remarks || '',
  enteredBy: e.enteredBy || ''
})

export default function EntryTable({ entries, suppliers, onUpdate, onVoid, onRestore }) {
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [materialFilter, setMaterialFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [showVoided, setShowVoided] = useState(false)
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' })
  const [page, setPage] = useState(1)

  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [draftErrors, setDraftErrors] = useState({})
  const [editError, setEditError] = useState('')
  const [confirmEntry, setConfirmEntry] = useState(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries.filter(e => {
      if (!showVoided && e.voided) return false
      if (fromDate && e.date < fromDate) return false
      if (toDate && e.date > toDate) return false
      if (materialFilter && e.material !== materialFilter) return false
      if (supplierFilter && (e.supplier || '') !== supplierFilter) return false
      if (q && !SEARCH_FIELDS.some(f => String(e[f] || '').toLowerCase().includes(q))) return false
      return true
    })
  }, [entries, search, fromDate, toDate, materialFilter, supplierFilter, showVoided])

  const sorted = useMemo(() => {
    const column = COLUMNS.find(c => c.key === sort.key)
    const base = compareBy(sort.key, column?.numeric)
    const dir = sort.dir === 'asc' ? 1 : -1
    // Newest-created breaks ties so the latest entry of a day shows first
    return [...filtered].sort((a, b) => dir * base(a, b) || String(b.createdAt).localeCompare(String(a.createdAt)))
  }, [filtered, sort])

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // Totals cover the whole filtered view (not just this page), excluding voided rows
  const totals = useMemo(() => {
    const live = filtered.filter(e => !e.voided)
    const byMaterial = new Map()
    live.forEach(e => {
      const key = `${e.material}|${e.unit}`
      const row = byMaterial.get(key) || { material: e.material, unit: e.unit, qty: 0 }
      row.qty += Number(e.quantity) || 0
      byMaterial.set(key, row)
    })
    const withAmount = live.filter(e => e.amount !== null && e.amount !== undefined)
    return {
      count: live.length,
      byMaterial: [...byMaterial.values()].sort((a, b) => a.material.localeCompare(b.material)),
      amount: withAmount.reduce((acc, e) => acc + Number(e.amount), 0),
      amountCount: withAmount.length
    }
  }, [filtered])

  const resetPage = setter => value => { setter(value); setPage(1) }

  const toggleSort = key => {
    setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'date' ? 'desc' : 'asc' })
  }

  const clearFilters = () => {
    setSearch(''); setFromDate(''); setToDate(''); setMaterialFilter(''); setSupplierFilter(''); setPage(1)
  }

  const startEdit = entry => {
    setEditingId(entry.id)
    setDraft(toDraft(entry))
    setDraftErrors({})
    setEditError('')
  }

  const cancelEdit = () => { setEditingId(null); setDraft(null); setDraftErrors({}); setEditError('') }

  const setDraftField = (field, value) => {
    setDraft(prev => {
      const next = { ...prev, [field]: value }
      // Changing material resets the unit to that material's default
      if (field === 'material' && findMaterial(value)) next.unit = findMaterial(value).unit
      return next
    })
    setDraftErrors(prev => ({ ...prev, [field]: undefined }))
  }

  const saveEdit = async () => {
    const found = validateEntry(draft)
    setDraftErrors(found)
    if (Object.keys(found).length > 0) return
    try {
      await onUpdate(editingId, toPayload(draft))
      cancelEdit()
    } catch (err) {
      setEditError(err.message || 'Could not save changes.')
    }
  }

  const exportCsv = () => {
    const headers = ['Date', 'Material', 'Qty', 'Unit', 'Article No', 'Size', 'Supplier', 'Bill No', 'Rate', 'Amount', 'Remarks', 'Entered by', 'Voided']
    const rows = sorted.map(e => [
      formatDate(e.date), e.material, e.quantity, e.unit, e.articleNo, e.size, e.supplier, e.billNo,
      e.rate, e.amount, e.remarks, e.enteredBy, e.voided ? 'Yes' : ''
    ])
    downloadCsv(`material-entries-${todayISO()}.csv`, headers, rows)
  }

  const hasFilters = search || fromDate || toDate || materialFilter || supplierFilter

  const renderEditRow = () => {
    const amountAuto = draft.rate !== '' && Number(draft.quantity) > 0
    const input = (field, props = {}) => (
      <input
        value={draft[field]}
        onChange={e => setDraftField(field, e.target.value)}
        aria-invalid={!!draftErrors[field]}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit() } if (e.key === 'Escape') cancelEdit() }}
        {...props}
      />
    )
    return (
      <tr key={editingId} className="em-editing">
        <td data-label="Date">{input('date', { type: 'date' })}</td>
        <td data-label="Material">
          <select value={draft.material} onChange={e => setDraftField('material', e.target.value)} aria-invalid={!!draftErrors.material}>
            {!findMaterial(draft.material) && <option value={draft.material}>{draft.material}</option>}
            {MATERIALS.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
          </select>
        </td>
        <td data-label="Qty">{input('quantity', { type: 'number', min: '0', step: 'any', inputMode: 'decimal' })}</td>
        <td data-label="Unit">{input('unit', { list: 'em-unit-list' })}</td>
        <td data-label="Article No">{input('articleNo', { placeholder: 'optional' })}</td>
        <td data-label="Size">{input('size', { placeholder: 'optional' })}</td>
        <td data-label="Supplier">{input('supplier', { list: 'em-supplier-list', placeholder: 'optional' })}</td>
        <td data-label="Bill No">{input('billNo', { placeholder: 'optional' })}</td>
        <td data-label="Amount">
          <div className="em-stack">
            {input('rate', { type: 'number', min: '0', step: 'any', placeholder: 'Rate' })}
            {amountAuto
              ? <span className="em-hint">{formatMoney(computeAmount(draft.quantity, draft.rate, ''))}</span>
              : input('amount', { type: 'number', min: '0', step: 'any', placeholder: 'Amount' })}
          </div>
        </td>
        <td data-label="Remarks">{input('remarks', { placeholder: 'optional' })}</td>
        <td data-label="Entered by">{input('enteredBy', { placeholder: 'optional' })}</td>
        <td data-label="Actions">
          <div className="em-row-actions">
            <button type="button" className="em-btn em-btn-primary em-btn-sm" onClick={saveEdit}>Save</button>
            <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={cancelEdit}>Cancel</button>
          </div>
          {(Object.values(draftErrors).some(Boolean) || editError) && (
            <span className="em-error">{editError || Object.values(draftErrors).find(Boolean)}</span>
          )}
        </td>
      </tr>
    )
  }

  return (
    <div className="em-card">
      <div className="em-card-head">
        <h3>Entries</h3>
        <div className="em-head-actions">
          <label className="em-check">
            <input type="checkbox" checked={showVoided} onChange={e => resetPage(setShowVoided)(e.target.checked)} />
            Show deleted
          </label>
          <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={exportCsv} disabled={sorted.length === 0}>
            ⬇ Export CSV
          </button>
        </div>
      </div>

      <div className="em-filters">
        <input
          type="search"
          className="em-search"
          placeholder="Search material, article, supplier, bill no, size, remarks…"
          value={search}
          onChange={e => resetPage(setSearch)(e.target.value)}
          aria-label="Search entries"
        />
        <label className="em-filter">
          <span>From</span>
          <input type="date" value={fromDate} onChange={e => resetPage(setFromDate)(e.target.value)} />
        </label>
        <label className="em-filter">
          <span>To</span>
          <input type="date" value={toDate} onChange={e => resetPage(setToDate)(e.target.value)} />
        </label>
        <label className="em-filter">
          <span>Material</span>
          <select value={materialFilter} onChange={e => resetPage(setMaterialFilter)(e.target.value)}>
            <option value="">All materials</option>
            {MATERIALS.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
          </select>
        </label>
        <label className="em-filter">
          <span>Supplier</span>
          <select value={supplierFilter} onChange={e => resetPage(setSupplierFilter)(e.target.value)}>
            <option value="">All suppliers</option>
            {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        {hasFilters && <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={clearFilters}>Clear filters</button>}
      </div>

      <div className="em-totals">
        <span><strong>{formatNumber(totals.count)}</strong> entries</span>
        {totals.amountCount > 0 && <span>Total amount: <strong>{formatMoney(totals.amount)}</strong></span>}
        <div className="em-chips">
          {totals.byMaterial.map(t => (
            <span key={`${t.material}|${t.unit}`} className="em-chip">
              {t.material}: <strong>{formatNumber(t.qty)}</strong> {t.unit}
            </span>
          ))}
        </div>
      </div>

      <div className="em-table-wrap">
        <table className="em-table">
          <thead>
            <tr>
              {COLUMNS.map(c => (
                <th key={c.key} className={c.numeric ? 'em-num' : ''} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="em-sort" onClick={() => toggleSort(c.key)}>
                    {c.label}
                    <span className="em-sort-icon">{sort.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                  </button>
                </th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr className="em-empty-row">
                <td colSpan={COLUMNS.length + 1}>
                  {entries.length === 0 ? 'No entries yet. Add the first delivery using the form above.' : 'No entries match these filters.'}
                </td>
              </tr>
            )}
            {pageRows.map(e => {
              if (e.id === editingId) return renderEditRow()
              const color = findMaterial(e.material)?.color || '#475569'
              return (
                <tr key={e.id} className={e.voided ? 'em-voided' : ''}>
                  <td data-label="Date">{formatDate(e.date)}</td>
                  <td data-label="Material">
                    <span className="em-badge" style={{ '--badge': color }}>{e.material}</span>
                    {e.voided && <span className="em-voided-tag">deleted</span>}
                  </td>
                  <td data-label="Qty" className="em-num"><strong>{formatNumber(e.quantity)}</strong></td>
                  <td data-label="Unit">{dash(e.unit)}</td>
                  <td data-label="Article No">{dash(e.articleNo)}</td>
                  <td data-label="Size">{dash(e.size)}</td>
                  <td data-label="Supplier">{dash(e.supplier)}</td>
                  <td data-label="Bill No">{dash(e.billNo)}</td>
                  <td data-label="Amount" className="em-num">
                    {formatMoney(e.amount)}
                    {e.rate !== null && e.rate !== undefined && <div className="em-hint">@ {formatNumber(e.rate)}/{e.unit}</div>}
                  </td>
                  <td data-label="Remarks" className="em-remarks">{dash(e.remarks)}</td>
                  <td data-label="Entered by">{dash(e.enteredBy)}</td>
                  <td data-label="Actions">
                    <div className="em-row-actions">
                      {e.voided ? (
                        <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => onRestore(e)}>Restore</button>
                      ) : (
                        <>
                          <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => startEdit(e)} disabled={editingId !== null}>Edit</button>
                          <button type="button" className="em-btn em-btn-danger em-btn-sm" onClick={() => setConfirmEntry(e)}>Delete</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="em-pager">
          <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}>‹ Prev</button>
          <span>Page {currentPage} of {pageCount} · {formatNumber(sorted.length)} rows</span>
          <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => setPage(currentPage + 1)} disabled={currentPage === pageCount}>Next ›</button>
        </div>
      )}

      {confirmEntry && (
        <div className="em-modal-backdrop" role="presentation" onClick={() => setConfirmEntry(null)}>
          <div className="em-modal" role="alertdialog" aria-modal="true" aria-labelledby="em-confirm-title" onClick={e => e.stopPropagation()}>
            <h4 id="em-confirm-title">Delete this entry?</h4>
            <p>
              {formatDate(confirmEntry.date)} · {confirmEntry.material} · {formatNumber(confirmEntry.quantity)} {confirmEntry.unit}
              {confirmEntry.supplier ? ` · ${confirmEntry.supplier}` : ''}
            </p>
            <p className="em-muted">It will be hidden from the list and totals. You can undo right away, or restore it later with "Show deleted".</p>
            <div className="em-actions">
              <button type="button" className="em-btn em-btn-ghost" onClick={() => setConfirmEntry(null)} autoFocus>Keep it</button>
              <button
                type="button"
                className="em-btn em-btn-danger"
                onClick={() => { onVoid(confirmEntry); setConfirmEntry(null) }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
