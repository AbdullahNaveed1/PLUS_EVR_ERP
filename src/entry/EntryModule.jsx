import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import EntryForm from './EntryForm'
import EntryTable from './EntryTable'
import { createEntryRepository, errorMessage } from './entryRepository'
import { formatNumber, todayISO } from './format'
import './entry.css'

// Sections of the stores module. Only Entry is built; the rest are placeholders for later rounds.
const SECTIONS = [
  { id: 'entry', label: 'Entry', icon: '📥', ready: true },
  { id: 'issue', label: 'Issue to Production', icon: '🏭', ready: false },
  { id: 'stock', label: 'Stock', icon: '📦', ready: false },
  { id: 'reports', label: 'Reports', icon: '📊', ready: false }
]

const TOAST_MS = 6000

export default function EntryModule({ token, username }) {
  const repo = useMemo(() => createEntryRepository(token), [token])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [toasts, setToasts] = useState([])
  const toastId = useRef(0)

  const dismissToast = useCallback(id => setToasts(prev => prev.filter(t => t.id !== id)), [])

  const showToast = useCallback((message, { tone = 'success', action } = {}) => {
    const id = ++toastId.current
    setToasts(prev => [...prev, { id, message, tone, action }])
    setTimeout(() => dismissToast(id), TOAST_MS)
  }, [dismissToast])

  // Voided rows are loaded too so "Show deleted" and Restore work without another request
  const fetchEntries = useCallback(() => repo.list({ includeVoided: true })
    .then(rows => { setEntries(rows); setLoadError('') })
    .catch(err => setLoadError(errorMessage(err)))
    .finally(() => setLoading(false)), [repo])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const retryLoad = () => {
    setLoading(true)
    fetchEntries()
  }

  const replaceEntry = saved => setEntries(prev => prev.map(e => (e.id === saved.id ? saved : e)))

  const handleCreate = async payload => {
    try {
      const saved = await repo.create(payload)
      setEntries(prev => [saved, ...prev])
      showToast(`Saved: ${formatNumber(saved.quantity)} ${saved.unit} ${saved.material}`)
    } catch (err) {
      throw new Error(errorMessage(err), { cause: err })
    }
  }

  const handleUpdate = async (id, payload) => {
    try {
      replaceEntry(await repo.update(id, payload))
      showToast('Entry updated')
    } catch (err) {
      throw new Error(errorMessage(err), { cause: err })
    }
  }

  const handleRestore = async entry => {
    try {
      replaceEntry(await repo.restore(entry.id))
      showToast('Entry restored')
    } catch (err) {
      showToast(errorMessage(err), { tone: 'error' })
    }
  }

  const handleVoid = async entry => {
    try {
      replaceEntry(await repo.void(entry.id))
      showToast(`Deleted ${entry.material} entry`, {
        tone: 'neutral',
        action: { label: 'Undo', run: () => handleRestore(entry) }
      })
    } catch (err) {
      showToast(errorMessage(err), { tone: 'error' })
    }
  }

  const liveEntries = useMemo(() => entries.filter(e => !e.voided), [entries])

  const suppliers = useMemo(
    () => [...new Set(liveEntries.map(e => e.supplier).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [liveEntries]
  )

  const today = useMemo(() => {
    const iso = todayISO()
    const rows = liveEntries.filter(e => e.date === iso)
    return {
      count: rows.length,
      qty: rows.reduce((acc, e) => acc + (Number(e.quantity) || 0), 0),
      materials: new Set(rows.map(e => e.material)).size
    }
  }, [liveEntries])

  return (
    <div className="em-root">
      <nav className="em-sidebar" aria-label="Stores sections">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            type="button"
            className={`em-nav ${s.id === 'entry' ? 'em-nav-active' : ''}`}
            disabled={!s.ready}
            aria-current={s.id === 'entry' ? 'page' : undefined}
            title={s.ready ? s.label : `${s.label} — coming soon`}
          >
            <span aria-hidden="true">{s.icon}</span>
            <span>{s.label}</span>
            {!s.ready && <span className="em-soon">soon</span>}
          </button>
        ))}
      </nav>

      <div className="em-main">
        <div className="em-title">
          <h2>Material Entry <span className="em-muted">(Goods received)</span></h2>
        </div>

        <div className="em-summary" aria-label="Today's summary">
          <div><span>Entries today</span><strong>{formatNumber(today.count)}</strong></div>
          <div><span>Total qty today</span><strong>{formatNumber(today.qty)}</strong></div>
          <div><span>Materials today</span><strong>{formatNumber(today.materials)}</strong></div>
        </div>

        <EntryForm username={username} suppliers={suppliers} onSave={handleCreate} />

        {loading ? (
          <div className="em-card em-center">Loading entries…</div>
        ) : loadError ? (
          <div className="em-card em-banner em-banner-error" role="alert">
            {loadError}
            <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={retryLoad}>Try again</button>
          </div>
        ) : (
          <EntryTable
            entries={entries}
            suppliers={suppliers}
            onUpdate={handleUpdate}
            onVoid={handleVoid}
            onRestore={handleRestore}
          />
        )}
      </div>

      <div className="em-toasts" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`em-toast em-toast-${t.tone}`}>
            <span>{t.message}</span>
            {t.action && (
              <button type="button" onClick={() => { t.action.run(); dismissToast(t.id) }}>{t.action.label}</button>
            )}
            <button type="button" className="em-toast-close" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}
