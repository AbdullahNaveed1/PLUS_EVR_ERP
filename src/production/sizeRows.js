// Size-breakdown helpers for production entries (shared by the form and the production list)

export const emptySize = () => ({ productId: '', dozens: '', pairs: '' })

export const pairsOf = row => (Number(row.dozens) || 0) * 12 + (Number(row.pairs) || 0)

export const sizeTotals = rows => {
  const filled = rows.filter(r => r.productId && pairsOf(r) > 0)
  return {
    dozens: filled.reduce((acc, r) => acc + (Number(r.dozens) || 0), 0),
    pairs: filled.reduce((acc, r) => acc + (Number(r.pairs) || 0), 0),
    totalPairs: filled.reduce((acc, r) => acc + pairsOf(r), 0)
  }
}

// API payload: only rows with a size and a quantity
export const toSizePayload = (rows, variants) => rows
  .filter(r => r.productId && pairsOf(r) > 0)
  .map(r => {
    const product = variants.find(p => String(p.id) === String(r.productId))
    return {
      productId: Number(r.productId),
      size: product?.size || '',
      color: product?.color || null,
      dozens: Number(r.dozens) || 0,
      pairs: Number(r.pairs) || 0
    }
  })

// "7: 2 dz · 8: 1 dz 6 pr" for the production list
export const describeSizes = sizes => (sizes || [])
  .map(s => {
    const qty = [Number(s.dozens) ? `${Number(s.dozens)} dz` : '', Number(s.pairs) ? `${Number(s.pairs)} pr` : ''].filter(Boolean).join(' ')
    return `${s.size || '?'}${s.color ? ` ${s.color}` : ''}: ${qty}`
  })
  .join(' · ')
