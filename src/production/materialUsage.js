// Material usage per dozen, worked out from daily remaining counts.
//
// For each material, between two consecutive counts:
//   used = previous remaining + received in between (Material Entry) - new remaining
// and that usage is divided by the dozens produced (all articles) in the same period.
// A period runs from the day after the previous count up to and including the count date,
// so a count is taken at the end of the day, after that day's production and deliveries.
import { MATERIALS } from '../entry/materials'

const day = value => String(value || '').slice(0, 10)
const sameText = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

// Dozens produced per date across all articles (extra pairs count as 1/12 dozen)
export const dozensByDate = production => {
  const map = new Map()
  production.forEach(p => {
    const d = day(p.date)
    map.set(d, (map.get(d) || 0) + (Number(p.dozens) || 0) + (Number(p.pairs) || 0) / 12)
  })
  return map
}

const sumDozens = (dozensMap, after, upTo) => {
  let total = 0
  dozensMap.forEach((dozens, d) => { if (d > after && d <= upTo) total += dozens })
  return total
}

// Deliveries of a material in (after, upTo]. Entries in a different unit can't be added, so they're reported separately.
const receivedBetween = (entries, material, unit, after, upTo) => {
  let qty = 0
  let otherUnits = 0
  entries.forEach(e => {
    if (e.voided || !sameText(e.material, material)) return
    const d = day(e.date)
    if (d <= after || d > upTo) return
    if (sameText(e.unit, unit)) qty += Number(e.quantity) || 0
    else otherUnits += 1
  })
  return { qty, otherUnits }
}

const materialNames = counts => {
  const names = MATERIALS.map(m => m.name)
  counts.forEach(c => { if (!names.some(n => sameText(n, c.material))) names.push(c.material) })
  return names
}

// Every count-to-count period for every material, oldest first
export const buildPeriods = ({ counts, entries, production }) => {
  const dozensMap = dozensByDate(production)
  const periods = []
  materialNames(counts).forEach(material => {
    const series = counts
      .filter(c => sameText(c.material, material))
      .sort((a, b) => day(a.date).localeCompare(day(b.date)))
    for (let i = 1; i < series.length; i++) {
      const prev = series[i - 1]
      const cur = series[i]
      const from = day(prev.date)
      const to = day(cur.date)
      const received = receivedBetween(entries, material, cur.unit, from, to)
      const used = Number(prev.remainingQty) + received.qty - Number(cur.remainingQty)
      const dozens = sumDozens(dozensMap, from, to)
      periods.push({
        material,
        unit: cur.unit,
        from,
        to,
        opening: Number(prev.remainingQty),
        received: received.qty,
        remaining: Number(cur.remainingQty),
        used,
        dozens,
        perDozen: dozens > 0 ? used / dozens : null,
        warnings: [
          ...(used < 0 ? ['More left than before: check the count or a missing delivery'] : []),
          ...(received.otherUnits > 0 ? [`${received.otherUnits} delivery(s) in a different unit not counted`] : []),
          ...(!sameText(prev.unit, cur.unit) ? [`Unit changed from ${prev.unit} to ${cur.unit}`] : []),
          ...(dozens === 0 && used !== 0 ? ['No production logged in this period'] : [])
        ]
      })
    }
  })
  return periods
}

// Totals per material for periods ending within [from, to]
export const summarizeUsage = (periods, from, to) => {
  const inRange = periods.filter(p => (!from || p.to >= from) && (!to || p.to <= to))
  const byMaterial = new Map()
  inRange.forEach(p => {
    const row = byMaterial.get(p.material) || { material: p.material, unit: p.unit, used: 0, dozens: 0, periods: 0, warnings: 0 }
    row.used += p.used
    row.dozens += p.dozens
    row.periods += 1
    row.warnings += p.warnings.length
    byMaterial.set(p.material, row)
  })
  return {
    periods: inRange,
    rows: [...byMaterial.values()].map(r => ({
      ...r,
      perDozen: r.dozens > 0 ? r.used / r.dozens : null,
      perPair: r.dozens > 0 ? r.used / r.dozens / 12 : null
    }))
  }
}

// What saving a count of `remaining` on `date` would mean, for the count form's live preview
export const previewCount = ({ counts, entries, production, material, unit, date, remaining }) => {
  const prev = counts
    .filter(c => sameText(c.material, material) && day(c.date) < date)
    .sort((a, b) => day(b.date).localeCompare(day(a.date)))[0]
  if (!prev) return { prev: null }
  const from = day(prev.date)
  const received = receivedBetween(entries, material, unit, from, date).qty
  const dozens = sumDozens(dozensByDate(production), from, date)
  const hasRemaining = remaining !== '' && remaining !== null && remaining !== undefined
  const used = hasRemaining ? Number(prev.remainingQty) + received - Number(remaining) : null
  return {
    prev,
    received,
    dozens,
    used,
    perDozen: used !== null && dozens > 0 ? used / dozens : null
  }
}
