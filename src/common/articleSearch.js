// Shared article search: every word typed must match the article number, model, size, colour or ID.
// "512" lists every size of article 512; "512 8 black" narrows it to size 8 in black.

const norm = value => String(value ?? '').trim().toLowerCase()
export const articleOf = product => String(product.articleNumber || product.model || 'Unassigned').trim()

const words = query => norm(query).split(/\s+/).filter(Boolean)

export const productMatches = (product, query) => {
  const fields = [articleOf(product), product.model, product.size, product.color, product.id].map(norm)
  return words(query).every(w => fields.some(f => f.includes(w)))
}

// Exact article first, then articles starting with the first word, then the rest; sizes in number order
const rank = (product, first) => {
  const article = norm(articleOf(product))
  if (!first) return 2
  if (article === first) return 0
  return article.startsWith(first) ? 1 : 2
}

export const searchProducts = (products, query, limit = 60) => {
  const first = words(query)[0] || ''
  return products
    .filter(p => productMatches(p, query))
    .sort((a, b) => rank(a, first) - rank(b, first) ||
      articleOf(a).localeCompare(articleOf(b), undefined, { numeric: true }) ||
      String(a.color || '').localeCompare(String(b.color || '')) ||
      String(a.size || '').localeCompare(String(b.size || ''), undefined, { numeric: true }))
    .slice(0, limit)
}

// Distinct article numbers matching what was typed, with how many sizes and pairs each has
export const searchArticles = (products, query, extraArticles = [], limit = 40) => {
  const map = new Map()
  for (const p of products) {
    const key = articleOf(p)
    const row = map.get(key.toLowerCase()) || { article: key, sizes: 0, stock: 0 }
    row.sizes += 1
    row.stock += Number(p.trueStock ?? p.qty) || 0
    map.set(key.toLowerCase(), row)
  }
  for (const a of extraArticles) {
    const key = String(a || '').trim()
    if (key && !map.has(key.toLowerCase())) map.set(key.toLowerCase(), { article: key, sizes: 0, stock: 0 })
  }
  const first = words(query)[0] || ''
  return [...map.values()]
    .filter(r => words(query).every(w => norm(r.article).includes(w)))
    .sort((a, b) => rank({ articleNumber: a.article }, first) - rank({ articleNumber: b.article }, first) ||
      a.article.localeCompare(b.article, undefined, { numeric: true }))
    .slice(0, limit)
}
