// Validation and payload rules shared by the entry form and the table's inline edit
import { findMaterial } from './materials'

// Only date, material and quantity (plus a unit) can block saving. Optional fields never do.
export const validateEntry = entry => {
  const errors = {}
  if (!entry.date) errors.date = 'Pick the date of entry.'
  if (!entry.material) errors.material = 'Choose a material.'
  else if (!findMaterial(entry.material)) errors.material = 'Choose a material from the list.'
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
export const toPayload = form => ({
  date: form.date,
  material: findMaterial(form.material)?.name || form.material.trim(),
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
