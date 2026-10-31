// Data layer for Material Entries. The UI only calls these functions, so moving to a
// different backend (or back to localStorage) means changing this one file.
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''
const BASE = `${API_BASE_URL}/api/material-entries`

const authHeaders = token => ({ headers: { Authorization: `Bearer ${token}` } })

// Turn an API error into a short message the form can show inline
export const errorMessage = err =>
  err?.response?.data?.message ||
  (err?.response ? `Server error (HTTP ${err.response.status})` : 'Could not reach the server. Check your connection.')

export const createEntryRepository = token => ({
  list: async ({ includeVoided = false } = {}) =>
    (await axios.get(BASE, { ...authHeaders(token), params: { includeVoided } })).data,

  create: async entry =>
    (await axios.post(BASE, entry, authHeaders(token))).data,

  update: async (id, entry) =>
    (await axios.put(`${BASE}/${id}`, entry, authHeaders(token))).data,

  // Soft delete: the row is kept with voided = true and can be restored
  void: async id =>
    (await axios.post(`${BASE}/${id}/void`, null, authHeaders(token))).data,

  restore: async id =>
    (await axios.post(`${BASE}/${id}/restore`, null, authHeaders(token))).data
})
