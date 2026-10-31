import { useCallback, useEffect, useMemo, useState } from 'react'
import { MATERIALS } from '../entry/materials'
import { createEntryRepository, errorMessage } from '../entry/entryRepository'
import { formatDate, formatNumber, todayISO } from '../entry/format'
import { createCountRepository } from './countRepository'
import { buildPeriods, dozensByDate, previewCount, summarizeUsage } from './materialUsage'
import '../entry/entry.css'

// Usage rates are small (e.g. 0.035 kg per pair), so show up to 4 decimals
const rateFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 })
const formatRate = value => (value === null || value === undefined ? '—' : rateFormat.format(value))

const daysAgoISO = days => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

const sameText = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

export default function MaterialUsagePanel({ token, production }) {
  const countRepo = useMemo(() => createCountRepository(token), [token])
  const entryRepo = useMemo(() => createEntryRepository(token), [token])

  const [counts, setCounts] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [countDate, setCountDate] = useState(todayISO())
  const [drafts, setDrafts] = useState({}) // `${date}|${material}` -> { remaining, unit }
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState(null)

  const [fromDate, setFromDate] = useState(daysAgoISO(30))
  const [toDate, setToDate] = useState(todayISO())
  const [detailMaterial, setDetailMaterial] = useState('')

  const fetchAll = useCallback(() => Promise.all([countRepo.list(), entryRepo.list()])
    .then(([countRows, entryRows]) => { setCounts(countRows); setEntries(entryRows); setLoadError('') })
    .catch(err => setLoadError(errorMessage(err)))
    .finally(() => setLoading(false)), [countRepo, entryRepo])

  useEffect(() => { fetchAll() }, [fetchAll])

  // The form shows what's already saved for the chosen date unless the user has typed something
  const savedCount = material => counts.find(c => c.date === countDate && sameText(c.material, material))
  const draftFor = material => {
    const typed = drafts[`${countDate}|${material.name}`]
    if (typed) return typed
    const saved = savedCount(material.name)
    return { remaining: saved ? String(saved.remainingQty) : '', unit: saved ? saved.unit : material.unit }
  }
  const setDraft = (material, field, value) => {
    const key = `${countDate}|${material.name}`
    setDrafts(prev => ({ ...prev, [key]: { ...draftFor(material), [field]: value } }))
    setSaveMessage(null)
  }

  const dozensOnCountDate = dozensByDate(production).get(countDate) || 0

  const handleSaveCounts = async e => {
    e.preventDefault()
    if (saving) return
    const items = MATERIALS
      .map(m => ({ material: m.name, ...draftFor(m) }))
      // Skip materials never counted that day and left blank, so nothing is sent for them
      .filter(d => d.remaining !== '' || savedCount(d.material))
      .map(d => ({ material: d.material, remainingQty: d.remaining === '' ? null : Number(d.remaining), unit: d.unit }))
    const invalid = items.find(i => i.remainingQty !== null && (!(i.remainingQty >= 0) || !String(i.unit).trim()))
    if (invalid) {
      setSaveMessage({ tone: 'error', text: `${invalid.material}: enter 0 or more and a unit.` })
      return
    }
    if (items.length === 0) {
      setSaveMessage({ tone: 'error', text: 'Enter the remaining quantity for at least one material.' })
      return
    }
    setSaving(true)
    try {
      const savedDay = await countRepo.saveDay(countDate, items)
      setCounts(prev => [...prev.filter(c => c.date !== countDate), ...savedDay])
      setDrafts(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${countDate}|`))))
      setSaveMessage({ tone: 'success', text: `Saved ${savedDay.length} count(s) for ${formatDate(countDate)}.` })
    } catch (err) {
      setSaveMessage({ tone: 'error', text: errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  const periods = useMemo(() => buildPeriods({ counts, entries, production }), [counts, entries, production])
  const summary = useMemo(() => summarizeUsage(periods, fromDate, toDate), [periods, fromDate, toDate])
  const detailRows = summary.periods
    .filter(p => !detailMaterial || p.material === detailMaterial)
    .sort((a, b) => b.to.localeCompare(a.to) || a.material.localeCompare(b.material))

  if (loading) return <div className="em-root em-plain"><div className="em-card em-center">Loading material counts…</div></div>
  if (loadError) {
    return (
      <div className="em-root em-plain">
        <div className="em-card em-banner em-banner-error" role="alert">
          {loadError}
          <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => { setLoading(true); fetchAll() }}>Try again</button>
        </div>
      </div>
    )
  }

  return (
    <div className="em-root em-plain">
      {/* ---------- Daily remaining count ---------- */}
      <form className="em-card" onSubmit={handleSaveCounts} noValidate>
        <div className="em-card-head">
          <div>
            <h3>📋 Daily Remaining Materials Count</h3>
            <span className="em-muted">At the end of the day, enter how much of each material is left. Blank = not counted.</span>
          </div>
          <div className="em-head-actions">
            <label className="em-filter">
              <span>Count date</span>
              <input type="date" value={countDate} onChange={e => { setCountDate(e.target.value); setSaveMessage(null) }} />
            </label>
          </div>
        </div>

        <div className="em-totals">
          <span>Production logged on {formatDate(countDate)}: <strong>{formatNumber(dozensOnCountDate)} dozens</strong></span>
          <span className="em-muted">Used = last count + received since (Material Entry) − remaining now</span>
        </div>

        {saveMessage && (
          <div className={`em-banner ${saveMessage.tone === 'error' ? 'em-banner-error' : 'em-banner-success'}`} role="status">{saveMessage.text}</div>
        )}

        <div className="em-table-wrap">
          <table className="em-table em-compact">
            <thead>
              <tr>
                <th className="em-th">Material</th>
                <th className="em-th">Last count</th>
                <th className="em-th em-num">Received since</th>
                <th className="em-th">Remaining now</th>
                <th className="em-th em-num">Used</th>
                <th className="em-th em-num">Per dozen</th>
              </tr>
            </thead>
            <tbody>
              {MATERIALS.map(m => {
                const draft = draftFor(m)
                const preview = previewCount({ counts, entries, production, material: m.name, unit: draft.unit, date: countDate, remaining: draft.remaining })
                return (
                  <tr key={m.name}>
                    <td data-label="Material"><span className="em-badge" style={{ '--badge': m.color }}>{m.name}</span></td>
                    <td data-label="Last count">
                      {preview.prev
                        ? <>{formatNumber(preview.prev.remainingQty)} {preview.prev.unit} <span className="em-hint">on {formatDate(preview.prev.date)}</span></>
                        : <span className="em-hint">First count: sets the starting point</span>}
                    </td>
                    <td data-label="Received since" className="em-num">{preview.prev ? `${formatNumber(preview.received)} ${draft.unit}` : '—'}</td>
                    <td data-label="Remaining now">
                      <div className="em-inline">
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="any"
                          placeholder="—"
                          value={draft.remaining}
                          onChange={e => setDraft(m, 'remaining', e.target.value)}
                          aria-label={`${m.name} remaining`}
                        />
                        <input
                          className="em-unit"
                          list="em-unit-list-usage"
                          value={draft.unit}
                          onChange={e => setDraft(m, 'unit', e.target.value)}
                          aria-label={`${m.name} unit`}
                        />
                      </div>
                    </td>
                    <td data-label="Used" className={`em-num ${preview.used < 0 ? 'em-warn' : ''}`}>
                      {preview.used === null || preview.used === undefined ? '—' : `${formatRate(preview.used)} ${draft.unit}`}
                    </td>
                    <td data-label="Per dozen" className="em-num">{formatRate(preview.perDozen)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <datalist id="em-unit-list-usage">
            {['pcs', 'pairs', 'kg', 'g', 'ltr', 'roll', 'bundle', 'meter'].map(u => <option key={u} value={u} />)}
          </datalist>
        </div>

        <div className="em-actions">
          <button type="submit" className="em-btn em-btn-primary" aria-busy={saving}>{saving ? 'Saving…' : 'Save counts'}</button>
        </div>
      </form>

      {/* ---------- Usage report ---------- */}
      <div className="em-card">
        <div className="em-card-head">
          <div>
            <h3>📐 Material Used per Dozen / per Pair</h3>
            <span className="em-muted">Factory-wide: material used ÷ all dozens produced between counts.</span>
          </div>
          <div className="em-head-actions">
            <label className="em-filter"><span>From</span><input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} /></label>
            <label className="em-filter"><span>To</span><input type="date" value={toDate} onChange={e => setToDate(e.target.value)} /></label>
          </div>
        </div>

        <div className="em-table-wrap">
          <table className="em-table em-compact">
            <thead>
              <tr>
                <th className="em-th">Material</th>
                <th className="em-th em-num">Used</th>
                <th className="em-th em-num">Dozens produced</th>
                <th className="em-th em-num">Per dozen</th>
                <th className="em-th em-num">Per pair</th>
                <th className="em-th em-num">Counts</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.length === 0 ? (
                <tr className="em-empty-row">
                  <td colSpan={6}>No usage yet in this range. Usage appears once a material has been counted on two different days.</td>
                </tr>
              ) : summary.rows.map(r => {
                const color = MATERIALS.find(m => m.name === r.material)?.color || '#475569'
                return (
                  <tr key={r.material}>
                    <td data-label="Material">
                      <span className="em-badge" style={{ '--badge': color }}>{r.material}</span>
                      {r.warnings > 0 && <span className="em-warn-tag" title="See the daily detail below">⚠ check</span>}
                    </td>
                    <td data-label="Used" className="em-num">{formatRate(r.used)} {r.unit}</td>
                    <td data-label="Dozens produced" className="em-num">{formatNumber(r.dozens)}</td>
                    <td data-label="Per dozen" className="em-num"><strong>{formatRate(r.perDozen)}</strong> {r.perDozen !== null && r.unit}</td>
                    <td data-label="Per pair" className="em-num"><strong>{formatRate(r.perPair)}</strong> {r.perPair !== null && r.unit}</td>
                    <td data-label="Counts" className="em-num">{r.periods}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {summary.periods.length > 0 && (
          <>
            <div className="em-card-head em-subhead">
              <h3>Daily detail</h3>
              <label className="em-filter">
                <span>Material</span>
                <select value={detailMaterial} onChange={e => setDetailMaterial(e.target.value)}>
                  <option value="">All materials</option>
                  {summary.rows.map(r => <option key={r.material} value={r.material}>{r.material}</option>)}
                </select>
              </label>
            </div>
            <div className="em-table-wrap">
              <table className="em-table em-compact">
                <thead>
                  <tr>
                    <th className="em-th">Count date</th>
                    <th className="em-th">Material</th>
                    <th className="em-th em-num">Last count</th>
                    <th className="em-th em-num">Received</th>
                    <th className="em-th em-num">Remaining</th>
                    <th className="em-th em-num">Used</th>
                    <th className="em-th em-num">Dozens</th>
                    <th className="em-th em-num">Per dozen</th>
                    <th className="em-th">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map(p => (
                    <tr key={`${p.material}|${p.to}`}>
                      <td data-label="Count date">
                        {formatDate(p.to)}
                        {p.from && <div className="em-hint">since {formatDate(p.from)}</div>}
                      </td>
                      <td data-label="Material">{p.material}</td>
                      <td data-label="Last count" className="em-num">{formatNumber(p.opening)}</td>
                      <td data-label="Received" className="em-num">{formatNumber(p.received)}</td>
                      <td data-label="Remaining" className="em-num">{formatNumber(p.remaining)}</td>
                      <td data-label="Used" className={`em-num ${p.used < 0 ? 'em-warn' : ''}`}><strong>{formatRate(p.used)}</strong> {p.unit}</td>
                      <td data-label="Dozens" className="em-num">{formatNumber(p.dozens)}</td>
                      <td data-label="Per dozen" className="em-num">{formatRate(p.perDozen)}</td>
                      <td data-label="Notes" className="em-remarks">{p.warnings.length ? p.warnings.join('; ') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
