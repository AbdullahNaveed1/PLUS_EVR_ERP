import { useState } from 'react'
import '../entry/entry.css'

// Asks why a posted entry is being cancelled. Cancelling keeps the record (who, when, why) and takes it
// out of stock, khata and totals; only Admins can still delete for good.
const REASONS = ['Wrong entry', 'Duplicate entry', 'Customer cancelled', 'Other']

export default function CancelDialog({ title, detail, onConfirm, onClose }) {
  const [reason, setReason] = useState(REASONS[0])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const text = [reason === 'Other' ? '' : reason, note.trim()].filter(Boolean).join(': ')

  const confirm = async () => {
    if (busy) return
    if (!text) { setError('Write why it is being cancelled.'); return }
    setBusy(true)
    setError('')
    try {
      await onConfirm(text)
      onClose()
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not cancel it.')
      setBusy(false)
    }
  }

  const close = () => { if (!busy) onClose() }

  return (
    <div className="em-root em-plain">
      <div className="em-modal-backdrop" role="presentation" onClick={close}>
        <div className="em-modal" role="alertdialog" aria-modal="true" aria-labelledby="cancel-title" onClick={e => e.stopPropagation()}>
          <h4 id="cancel-title">{title}</h4>
          {detail && <p className="em-muted">{detail}</p>}
          <label className="em-field">
            <span>Reason</span>
            <select value={reason} onChange={e => setReason(e.target.value)} autoFocus>
              {REASONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </label>
          <label className="em-field">
            <span>{reason === 'Other' ? 'Why? (required)' : 'Note (optional)'}</span>
            <input type="text" maxLength={250} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. entered twice by mistake" />
          </label>
          <p className="em-hint">The entry stays on record with your name and this reason, and is removed from stock, khata and totals.</p>
          {error && <div className="em-banner em-banner-error" role="alert">{error}</div>}
          <div className="em-actions">
            <button type="button" className="em-btn em-btn-ghost" onClick={close}>Keep it</button>
            <button type="button" className="em-btn em-btn-danger" onClick={confirm} aria-busy={busy}>{busy ? 'Cancelling…' : 'Cancel entry'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
