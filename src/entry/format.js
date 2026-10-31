// Display helpers shared by the Entry module

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

export const formatNumber = value =>
  value === null || value === undefined || value === '' ? '—' : numberFormat.format(Number(value))

export const formatMoney = value =>
  value === null || value === undefined || value === '' ? '—' : `Rs. ${numberFormat.format(Number(value))}`

// 'yyyy-MM-dd' -> 'DD-MM-YYYY'
export const formatDate = iso => {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-')
  return y && m && d ? `${d}-${m}-${y}` : '—'
}

// Today's date in the user's local time zone as 'yyyy-MM-dd' (what <input type="date"> uses)
export const todayISO = () => {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 10)
}

export const dash = value => (value === null || value === undefined || String(value).trim() === '' ? '—' : value)

// Build and download a CSV file. Values are quoted so commas and quotes in remarks are safe.
export const downloadCsv = (filename, headers, rows) => {
  const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`
  const csv = [headers, ...rows].map(row => row.map(quote).join(',')).join('\r\n')
  // BOM so Excel opens Urdu / special characters correctly
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
