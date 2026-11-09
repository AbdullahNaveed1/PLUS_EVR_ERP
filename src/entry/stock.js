// Material stock from Material Entry rows: "received" adds, "used" (production deduction) subtracts.
// Pure functions so the Material Entry and Production screens show the same numbers.

export const isUsed = entry => entry.kind === 'used'
const live = entries => entries.filter(e => !e.voided)
const keyOf = e => `${String(e.material).trim().toLowerCase()}|${String(e.unit || '').trim().toLowerCase()}`
const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to)

// Per material and unit: received, used and balance. Different units are kept apart
// because 5 kg and 5 pcs of the same material cannot be added together.
export const stockBalance = (entries, { from = '', to = '' } = {}) => {
  const map = new Map()
  for (const e of live(entries)) {
    if (!inRange(e.date, from, to)) continue
    const key = keyOf(e)
    const row = map.get(key) || { material: e.material, unit: e.unit, received: 0, used: 0 }
    if (isUsed(e)) row.used += Number(e.quantity) || 0
    else row.received += Number(e.quantity) || 0
    map.set(key, row)
  }
  return [...map.values()]
    .map(r => ({ ...r, balance: r.received - r.used }))
    .sort((a, b) => a.material.localeCompare(b.material) || a.unit.localeCompare(b.unit))
}

// Current balance of one material in one unit (all dates)
export const balanceOf = (entries, material, unit) => {
  const key = keyOf({ material: String(material || ''), unit })
  return stockBalance(entries).find(r => keyOf(r) === key)?.balance ?? 0
}

// Dozens made in a date range, all articles (extra pairs count as 1/12 dozen)
export const dozensMade = (production, from, to) => production.reduce((acc, p) => {
  const date = String(p.date || '').slice(0, 10)
  if (!inRange(date, from, to)) return acc
  return acc + (Number(p.dozens) || 0) + (Number(p.pairs) || 0) / 12
}, 0)

// What each material was used for in a date range, per dozen and per pair made in that range.
// Balance is the stock left today (all dates), so it matches the Stock section.
export const usageReport = (entries, production, from, to) => {
  const period = stockBalance(entries, { from, to })
  const now = stockBalance(entries)
  const dozens = dozensMade(production, from, to)
  return {
    dozens,
    pairs: dozens * 12,
    rows: now
      .map(total => {
        const p = period.find(r => keyOf(r) === keyOf(total)) || { received: 0, used: 0 }
        return {
          material: total.material,
          unit: total.unit,
          received: p.received,
          used: p.used,
          balance: total.balance,
          perDozen: dozens > 0 && p.used > 0 ? p.used / dozens : null,
          perPair: dozens > 0 && p.used > 0 ? p.used / (dozens * 12) : null
        }
      })
      .filter(r => r.received > 0 || r.used > 0 || r.balance !== 0)
  }
}
