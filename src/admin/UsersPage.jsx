import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import '../entry/entry.css'

// Admin page for logins: add users, set Admin / Staff and which tabs Staff can open,
// reset passwords and remove users. Users cannot change their own password.

const API_BASE_URL = import.meta.env.VITE_API_URL || ''
const MIN_PASSWORD = 6
const errorText = err => err?.response?.data?.message || (err?.response ? `Server error (HTTP ${err.response.status})` : 'Could not reach the server.')

const emptyForm = () => ({ username: '', password: '', role: 'Staff', allowedTabs: [] })

function TabPicker({ tabs, value, onChange }) {
  const toggle = id => onChange(value.includes(id) ? value.filter(t => t !== id) : [...value, id])
  return (
    <div className="em-tab-picker">
      {tabs.map(t => (
        <label key={t.id} className="em-check">
          <input type="checkbox" checked={value.includes(t.id)} onChange={() => toggle(t.id)} />
          {t.label}
        </label>
      ))}
    </div>
  )
}

export default function UsersPage({ token, currentUser, tabs }) {
  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null) // { tone, text }
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null) // { id, role, allowedTabs }
  const [resetFor, setResetFor] = useState(null) // { id, username, password }
  const [deleteFor, setDeleteFor] = useState(null)

  const tabLabel = id => tabs.find(t => t.id === id)?.label || id

  const load = useCallback(() => axios.get(`${API_BASE_URL}/api/users`, headers)
    .then(res => setUsers(res.data))
    .catch(err => setMessage({ tone: 'error', text: errorText(err) }))
    .finally(() => setLoading(false)), [headers])

  useEffect(() => { load() }, [load])

  const run = async (action, success) => {
    setMessage(null)
    try {
      await action()
      setMessage({ tone: 'success', text: success })
      await load()
      return true
    } catch (err) {
      setMessage({ tone: 'error', text: errorText(err) })
      return false
    }
  }

  const handleCreate = async e => {
    e.preventDefault()
    if (saving) return
    if (!form.username.trim()) return setMessage({ tone: 'error', text: 'Enter a username.' })
    if (form.password.length < MIN_PASSWORD) return setMessage({ tone: 'error', text: `Password must be at least ${MIN_PASSWORD} characters.` })
    if (form.role === 'Staff' && form.allowedTabs.length === 0) return setMessage({ tone: 'error', text: 'Tick at least one tab this Staff user can open.' })
    setSaving(true)
    const ok = await run(() => axios.post(`${API_BASE_URL}/api/users`, form, headers), `User ${form.username.trim()} added.`)
    if (ok) setForm(emptyForm())
    setSaving(false)
  }

  const saveEdit = async () => {
    if (editing.role === 'Staff' && editing.allowedTabs.length === 0) return setMessage({ tone: 'error', text: 'Tick at least one tab.' })
    const ok = await run(() => axios.put(`${API_BASE_URL}/api/users/${editing.id}`, editing, headers), 'Access updated. It applies straight away.')
    if (ok) setEditing(null)
  }

  const saveReset = async () => {
    if (resetFor.password.length < MIN_PASSWORD) return setMessage({ tone: 'error', text: `Password must be at least ${MIN_PASSWORD} characters.` })
    const ok = await run(() => axios.post(`${API_BASE_URL}/api/users/${resetFor.id}/reset-password`, { password: resetFor.password }, headers), `Password reset for ${resetFor.username}.`)
    if (ok) setResetFor(null)
  }

  const confirmDelete = async () => {
    const ok = await run(() => axios.delete(`${API_BASE_URL}/api/users/${deleteFor.id}`, headers), `User ${deleteFor.username} removed.`)
    if (ok) setDeleteFor(null)
  }

  return (
    <div className="em-root em-plain">
      <div className="em-title"><h2>👥 Users <span className="em-muted">(Admins only)</span></h2></div>

      {message && (
        <div className={`em-banner ${message.tone === 'error' ? 'em-banner-error' : 'em-banner-success'}`} role={message.tone === 'error' ? 'alert' : 'status'}>
          {message.text}
        </div>
      )}

      <form className="em-card em-form" onSubmit={handleCreate} noValidate>
        <div className="em-card-head">
          <h3>Add user</h3>
          <span className="em-muted">Admins can open every tab. Staff only see the tabs you tick.</span>
        </div>
        <div className="em-grid">
          <label className="em-field">
            <span className="em-label">Username</span>
            <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} autoComplete="off" />
          </label>
          <label className="em-field">
            <span className="em-label">Password</span>
            <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
            <span className="em-hint">At least {MIN_PASSWORD} characters. Tell the user privately.</span>
          </label>
          <label className="em-field">
            <span className="em-label">Role</span>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="Staff">Staff</option>
              <option value="Admin">Admin</option>
            </select>
          </label>
        </div>
        {form.role === 'Staff' && (
          <div className="em-field" style={{ marginTop: 14 }}>
            <span className="em-label">Tabs this user can open</span>
            <TabPicker tabs={tabs} value={form.allowedTabs} onChange={allowedTabs => setForm({ ...form, allowedTabs })} />
          </div>
        )}
        <div className="em-actions">
          <button type="submit" className="em-btn em-btn-primary" aria-busy={saving}>{saving ? 'Adding…' : 'Add user'}</button>
        </div>
      </form>

      <div className="em-card">
        <div className="em-card-head"><h3>All users</h3></div>
        {loading ? <div className="em-center">Loading…</div> : (
          <div className="em-table-wrap">
            <table className="em-table">
              <thead><tr><th>Username</th><th>Role</th><th>Can open</th><th>Actions</th></tr></thead>
              <tbody>
                {users.map(u => {
                  const isEditing = editing?.id === u.id
                  const isMe = u.username.toLowerCase() === String(currentUser || '').toLowerCase()
                  return (
                    <tr key={u.id}>
                      <td data-label="Username"><strong>{u.username}</strong>{isMe && <span className="em-hint"> (you)</span>}</td>
                      <td data-label="Role">
                        {isEditing ? (
                          <select value={editing.role} onChange={e => setEditing({ ...editing, role: e.target.value })}>
                            <option value="Staff">Staff</option>
                            <option value="Admin">Admin</option>
                          </select>
                        ) : u.role}
                      </td>
                      <td data-label="Can open">
                        {isEditing ? (
                          editing.role === 'Admin'
                            ? <span className="em-hint">Every tab</span>
                            : <TabPicker tabs={tabs} value={editing.allowedTabs} onChange={allowedTabs => setEditing({ ...editing, allowedTabs })} />
                        ) : u.role === 'Admin' ? 'Every tab' : (u.allowedTabs || []).map(tabLabel).join(', ') || '—'}
                      </td>
                      <td data-label="Actions">
                        <div className="em-row-actions">
                          {isEditing ? (
                            <>
                              <button type="button" className="em-btn em-btn-primary em-btn-sm" onClick={saveEdit}>Save</button>
                              <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => setEditing({ id: u.id, role: u.role, allowedTabs: u.allowedTabs || [] })}>Edit access</button>
                              <button type="button" className="em-btn em-btn-ghost em-btn-sm" onClick={() => setResetFor({ id: u.id, username: u.username, password: '' })}>Reset password</button>
                              {!isMe && <button type="button" className="em-btn em-btn-danger em-btn-sm" onClick={() => setDeleteFor(u)}>Delete</button>}
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
        )}
      </div>

      {resetFor && (
        <div className="em-modal-backdrop" role="presentation" onClick={() => setResetFor(null)}>
          <div className="em-modal" role="dialog" aria-modal="true" aria-labelledby="reset-title" onClick={e => e.stopPropagation()}>
            <h4 id="reset-title">Reset password — {resetFor.username}</h4>
            <label className="em-field">
              <span className="em-label">New password</span>
              <input type="password" autoFocus autoComplete="new-password" value={resetFor.password} onChange={e => setResetFor({ ...resetFor, password: e.target.value })} />
              <span className="em-hint">At least {MIN_PASSWORD} characters. Their old password stops working.</span>
            </label>
            <div className="em-actions">
              <button type="button" className="em-btn em-btn-ghost" onClick={() => setResetFor(null)}>Cancel</button>
              <button type="button" className="em-btn em-btn-primary" onClick={saveReset}>Reset password</button>
            </div>
          </div>
        </div>
      )}

      {deleteFor && (
        <div className="em-modal-backdrop" role="presentation" onClick={() => setDeleteFor(null)}>
          <div className="em-modal" role="alertdialog" aria-modal="true" aria-labelledby="del-user-title" onClick={e => e.stopPropagation()}>
            <h4 id="del-user-title">Delete {deleteFor.username}?</h4>
            <p className="em-muted">They are signed out at once and can't sign in again. Their past changes stay in the audit log.</p>
            <div className="em-actions">
              <button type="button" className="em-btn em-btn-ghost" onClick={() => setDeleteFor(null)} autoFocus>Keep</button>
              <button type="button" className="em-btn em-btn-danger" onClick={confirmDelete}>Delete user</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
