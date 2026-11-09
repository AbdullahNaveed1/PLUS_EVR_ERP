// Validation and payload rules shared by the entry form and the table's inline edit

const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

// The Raw Materials tab item a typed name refers to
export const findRawMaterial = (rawMaterials, name) => rawMaterials.find(m => sameName(m.name, name))

// Only date, material and quantity (plus a unit) can block saving. Optional fields never do.
// Material must be an item on the Raw Materials tab, because receiving it adds to that stock.
export const validateEntry = (entry, rawMaterials = []) => {
  const errors = {}
  if (!entry.date) errors.date = 'Pick the date of entry.'
  if (!entry.material) errors.material = 'Choose a material.'
  else if (!findRawMaterial(rawMaterials, entry.material)) errors.material = 'Choose a material from the Raw Materials list (add new ones on the Raw Materials tab).'
  if (entry.quantity === '' || entry.quantity === null || entry.quantity === undefined) errors.quantity = 'Enter the quantity.'
  else if (!(Number(entry.quantity) > 0)) errors.quantity = 'Quantity must be more than 0.'
  if (!String(entry.unit || '').trim()) errors.unit = 'Enter a unit.'
  return errors
}

const isBlank = value => value === '' || value === null || value === undefined

// Amount is qty × rate when both are filled; otherwise whatever was typed into Amount
export const computeAmount = (quantity, rate, amount) => {
  const qty = Number(quantity)
  if (!isBlank(rate) && qty > 0 && Number(rate) >= 0) return Math.round(qty * Number(rate) * 100) / 100
  return isBlank(amount) ? null : Number(amount)
}

// Convert form strings into the API payload
export const toPayload = (form, rawMaterials = []) => ({
  date: form.date,
  material: findRawMaterial(rawMaterials, form.material)?.name || form.material.trim(),
  supplierId: form.supplierId ? Number(form.supplierId) : null,
  quantity: Number(form.quantity),
  unit: form.unit.trim(),
  articleNo: form.articleNo,
  size: form.size,
  supplier: form.supplier,
  billNo: form.billNo,
  rate: isBlank(form.rate) ? null : Number(form.rate),
  amount: computeAmount(form.quantity, form.rate, form.amount),
  remarks: form.remarks,
  enteredBy: form.enteredBy
})
