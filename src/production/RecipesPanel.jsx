import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { formatNumber } from '../entry/format'
import '../entry/entry.css'

// Recipe per article: how much of each raw material one dozen uses. Production saved for an
// article with a recipe deducts that material automatically; the cost per dozen comes from each
// material's unit cost on the Raw Materials tab.

const API_BASE_URL = import.meta.env.VITE_API_URL || ''
const rateFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 })
const rs = value => `Rs. ${formatNumber(Math.round((Number(value) || 0) * 100) / 100)}`
const errorText = err => err?.response?.data?.message || (err?.response ? `Server error (HTTP ${err.response.status})` : 'Could not reach the server.')
const emptyLine = () => ({ rawMaterialId: '', qtyPerDozen: '' })

export default function RecipesPanel({ token, rawMaterials, articles }) {
  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token])
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // { articleNumber, lines, isNew }
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  const materialById = useMemo(() => new Map(rawMaterials.map(m => [String(m.id), m])), [rawMaterials])
  const costPerDozen = lines => lines.reduce((acc, l) => acc + (Number(l.qtyPerDozen) || 0) * (Number(materialById.get(String(l.rawMaterialId))?.unitCost) || 0), 0)

  const load = useCallback(() => axios.get(`${API_BASE_URL}/api/bom/recipes`, headers)
    .then(res => setRecipes(res.data))
    .catch(err => setMessage({ tone: 'error', text: errorText(err) }))
    .finally(() => setLoading(false)), [headers])

  useEffect(() => { load() }, [load])

  const startNew = () => setEditing({ articleNumber: '', lines: [emptyLine()], isNew: true })
  const startEdit = r => setEditing({
    articleNumber: r.articleNumber,
    lines: r.lines.map(l => ({ rawMaterialId: String(l.rawMaterialId), qtyPerDozen: String(l.qtyPerDozen) })),
    isNew: false
  })
  const setLine = (index, field, value) => setEditing(prev => ({ ...prev, lines: prev.lines.map((l, i) => (i === index ? { ...l, [field]: value } : l)) }))

  const save = async (remove = false) => {
    if (saving) return
    const article = editing.articleNumber.trim()
    if (!article) return setMessage({ tone: 'error', text: 'Enter the article number.' })
    const lines = remove ? [] : editing.lines.filter(l => l.rawMaterialId || l.qtyPerDozen)
    if (!remove && lines.length === 0) return setMessage({ tone: 'error', text: 'Add at least one material.' })
    if (lines.some(l => !l.rawMaterialId || !(Number(l.qtyPerDozen) > 0))) return setMessage({ tone: 'error', text: 'Pick a material and an amount above 0 on every line.' })
    if (editing.isNew && recipes.some(r => r.articleNumber.toLowerCase() === article.toLowerCase()))
      return setMessage({ tone: 'error', text: `Article ${article} already has a recipe. Use Edit on it.` })

    setSaving(true)
    try {
      await axios.put(`${API_BASE_URL}/api/bom/recipes/${encodeURIComponent(article)}`,
        lines.map(l => ({ rawMaterialId: Number(l.rawMaterialId), qtyPerDozen: Number(l.qtyPerDozen) })), headers)
      setMessage({ tone: 'success', text: remove ? `Recipe for ${article} removed.` : `Recipe for ${article} saved. Production saved from now on uses it.` })
      setEditing(null)
      await load()
    } catch (err) {
      setMessage({ tone: 'error', text: errorText(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="em-root em-plain">
      <div className="em-card">
        <div className="em-card-head">
          <h3>🧾 Recipes (material per dozen)</h3>
          {!editing && <button type="button" className="em-btn em-btn-primary em-btn-sm" onClick={startNew} disabled={rawMaterials.length === 0}>+ New recipe</button>}
        </div>
        <p className="em-hint" style={{ marginTop: 0 }}>
          When production is saved for an article with a recipe, its material is taken from Raw Materials stock automatically
          (shown in Material Entry → Production Deduction). Editing or deleting the production updates it.
        </p>
        {message && <div className={`em-banner ${message.tone === 'error' ? 'em-banner-error' : 'em-banner-success'}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</div>}

        {editing && (
          <div className="em-ps" style={{ marginBottom: 14 }}>
            <label className="em-field" style={{ maxWidth: 260 }}>
              <span className="em-label">Article number</span>
              <input list="recipe-articles" value={editing.articleNumber} disabled={!editing.isNew}
                onChange={e => setEditing({ ...editing, articleNumber: e.target.value })} />
              <datalist id="recipe-articles">{articles.map(a => <option key={a} value={a} />)}</datalist>
            </label>
            {editing.lines.map((line, index) => {
              const material = materialById.get(String(line.rawMaterialId))
              return (
                <div key={index} className="em-ps-row">
                  <label className="em-field">
                    <span className="em-label">Material</span>
                    <select value={line.rawMaterialId} onChange={e => setLine(index, 'rawMaterialId', e.target.value)}>
                      <option value="">Choose…</option>
                      {rawMaterials.map(m => <option key={m.id} value={String(m.id)}>{m.name} ({m.unit})</option>)}
                    </select>
                  </label>
                  <label className="em-field">
                    <span className="em-label">Per dozen{material ? ` (${material.unit})` : ''}</span>
                    <input type="number" min="0" step="any" inputMode="decimal" value={line.qtyPerDozen} onChange={e => setLine(index, 'qtyPerDozen', e.target.value)} />
                  </label>
                  <div className="em-field">
                    <span className="em-label">Cost / dozen</span>
                    <span className="em-hint">{material ? rs((Number(line.qtyPerDozen) || 0) * (Number(material.unitCost) || 0)) : '—'}</span>
                  </div>
                  <button type="button" className="em-btn em-btn-danger em-btn-sm" aria-label="Remove this material"
                    onClick={() => setEditing({ ...editing, lines: editing.lines.filter((_, i) => i !== index) })}>✕</button>
                </div>
              )
            })}
            <div className="em-ps-foot">
              <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => setEditing({ ...editing, lines: [...editing.lines, emptyLine()] })}>+ Add material</button>
              <span className="em-hint">Material cost: <strong>{rs(costPerDozen(editing.lines))}</strong> per dozen · {rs(costPerDozen(editing.lines) / 12)} per pair</span>
            </div>
            <div className="em-actions" style={{ marginTop: 0 }}>
              {!editing.isNew && <button type="button" className="em-btn em-btn-danger" onClick={() => save(true)} disabled={saving}>Remove recipe</button>}
              <button type="button" className="em-btn em-btn-ghost" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
              <button type="button" className="em-btn em-btn-primary" onClick={() => save(false)} aria-busy={saving} disabled={saving}>{saving ? 'Saving…' : 'Save recipe'}</button>
            </div>
          </div>
        )}

        {loading ? <div className="em-center">Loading…</div> : (
          <div className="em-table-wrap">
            <table className="em-table">
              <thead><tr><th>Article</th><th>Material per dozen</th><th className="em-num">Cost / dozen</th><th className="em-num">Cost / pair</th><th>Actions</th></tr></thead>
              <tbody>
                {recipes.length === 0 && <tr className="em-empty-row"><td colSpan={5}>No recipes yet. Add one so production deducts material automatically.</td></tr>}
                {recipes.map(r => {
                  const cost = costPerDozen(r.lines)
                  return (
                    <tr key={r.articleNumber}>
                      <td data-label="Article"><strong>{r.articleNumber}</strong></td>
                      <td data-label="Material per dozen">
                        {r.lines.map(l => {
                          const m = materialById.get(String(l.rawMaterialId))
                          return <div key={l.rawMaterialId}>{m?.name || 'Deleted material'}: {rateFormat.format(l.qtyPerDozen)} {m?.unit || ''}</div>
                        })}
                      </td>
                      <td data-label="Cost / dozen" className="em-num">{rs(cost)}</td>
                      <td data-label="Cost / pair" className="em-num">{rs(cost / 12)}</td>
                      <td data-label="Actions"><button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => startEdit(r)} disabled={!!editing}>Edit</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
