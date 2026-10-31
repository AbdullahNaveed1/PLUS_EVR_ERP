// Materials that can be received into the factory.
// To add or rename a material, edit this list only — the form, filters and totals all read from it.
// `unit` is the default unit (still editable per entry); `color` tints the material badge.
export const MATERIALS = [
  { name: 'Dana Bags', unit: 'pcs', color: '#2563eb' },
  { name: 'Sole', unit: 'pairs', color: '#7c3aed' },
  { name: 'Stationery', unit: 'pcs', color: '#64748b' },
  { name: 'DOP', unit: 'kg', color: '#0891b2' },
  { name: 'Rasen', unit: 'kg', color: '#b45309' },
  { name: 'Strap', unit: 'pcs', color: '#db2777' },
  { name: 'Carton', unit: 'pcs', color: '#a16207' },
  { name: 'Primer', unit: 'kg', color: '#dc2626' },
  { name: 'Silicon', unit: 'kg', color: '#0d9488' },
  { name: 'Sticker', unit: 'pcs', color: '#ea580c' },
  { name: 'EVA DANA BAG', unit: 'pcs', color: '#4f46e5' },
  { name: 'Thelli', unit: 'pcs', color: '#16a34a' }
]

export const UNITS = ['pcs', 'pairs', 'kg', 'g', 'ltr', 'dozen', 'roll', 'bundle', 'meter']

export const findMaterial = name =>
  MATERIALS.find(m => m.name.toLowerCase() === String(name || '').trim().toLowerCase())
