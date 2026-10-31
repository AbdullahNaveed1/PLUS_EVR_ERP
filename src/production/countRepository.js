// Data layer for daily remaining-material counts
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''
const BASE = `${API_BASE_URL}/api/material-counts`

export const createCountRepository = token => {
  const config = { headers: { Authorization: `Bearer ${token}` } }
  return {
    list: async () => (await axios.get(BASE, config)).data,
    // items: [{ material, remainingQty (null removes that day's count), unit }]
    saveDay: async (date, items) => (await axios.put(`${BASE}/${date}`, items, config)).data
  }
}
