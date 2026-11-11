import { useId, useMemo, useRef, useState } from 'react'
import { articleOf, searchArticles, searchProducts } from './articleSearch'
import './picker.css'

// Searchable picker used wherever an article is chosen.
// mode "product": pick one size/colour of an article (value = product id, onChange(product)).
// mode "article": pick an article number (value = text, onChange(text)); allowNew lets a number
// that isn't in stock yet be typed and kept.
// Keyboard: type to search, ↑ ↓ to move, Enter to pick, Esc to close.

export default function ArticlePicker({
  products, value, onChange, mode = 'product', allowNew = false, extraArticles = [],
  priceOf, placeholder, label, autoFocus = false, invalid = false
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const inputRef = useRef(null)

  const selected = mode === 'product' ? products.find(p => String(p.id) === String(value)) : null
  const shownValue = mode === 'product'
    ? (selected ? `${articleOf(selected)} · Size ${selected.size || 'N/A'}${selected.color ? ` · ${selected.color}` : ''}` : '')
    : String(value || '')

  const results = useMemo(() => (mode === 'product'
    ? searchProducts(products, query)
    : searchArticles(products, query, extraArticles)), [mode, products, query, extraArticles])

  const choose = item => {
    if (mode === 'product') onChange(item)
    else onChange(item.article)
    setOpen(false)
    setQuery('')
  }

  const handleKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(i => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      if (!open) return
      e.preventDefault()
      if (results[active]) choose(results[active])
      else if (mode === 'article' && allowNew && query.trim()) { onChange(query.trim()); setOpen(false); setQuery('') }
    } else if (e.key === 'Escape') { setOpen(false); setQuery('') }
  }

  // While searching the box shows what is typed; otherwise it shows the current choice
  const text = open ? query : shownValue
  const stockOf = p => Number(p.trueStock ?? p.qty) || 0

  return (
    <div className="ap-root">
      {label && <span className="ap-label">{label}</span>}
      <input
        ref={inputRef}
        type="text"
        className={`ap-input ${invalid ? 'ap-invalid' : ''}`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder || (mode === 'product' ? 'Search article no, then size… e.g. 512 8' : 'Search article no…')}
        value={text}
        onFocus={() => { setOpen(true); setQuery(mode === 'article' ? String(value || '') : ''); setActive(0) }}
        onChange={e => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
          // Typing a new article number keeps it without needing Enter
          if (mode === 'article' && allowNew) onChange(e.target.value)
        }}
        onKeyDown={handleKey}
        onBlur={() => setTimeout(() => { setOpen(false); setQuery('') }, 150)}
      />
      {open && (
        <ul className="ap-list" id={listId} role="listbox">
          {results.length === 0 && (
            <li className="ap-empty">
              {mode === 'article' && allowNew && query.trim() ? `New article "${query.trim()}" — press Enter to use it` : 'No matching article'}
            </li>
          )}
          {results.map((item, index) => {
            const isActive = index === active
            if (mode === 'article') {
              return (
                <li key={item.article} role="option" aria-selected={isActive} className={`ap-option ${isActive ? 'ap-active' : ''}`}
                  onMouseDown={e => { e.preventDefault(); choose(item) }} onMouseEnter={() => setActive(index)}>
                  <strong>{item.article}</strong>
                  <span className="ap-meta">{item.sizes ? `${item.sizes} size${item.sizes === 1 ? '' : 's'} · stock ${item.stock.toLocaleString()} pairs` : 'not in stock list'}</span>
                </li>
              )
            }
            const stock = stockOf(item)
            const price = priceOf ? priceOf(item) : null
            return (
              <li key={item.id} role="option" aria-selected={isActive} className={`ap-option ${isActive ? 'ap-active' : ''}`}
                onMouseDown={e => { e.preventDefault(); choose(item) }} onMouseEnter={() => setActive(index)}>
                <span><strong>{articleOf(item)}</strong> · Size <strong>{item.size || 'N/A'}</strong>{item.color ? ` · ${item.color}` : ''}</span>
                <span className="ap-meta">
                  <span className={stock <= 0 ? 'ap-out' : ''}>{stock.toLocaleString()} pairs</span>
                  {price != null && ` · Rs. ${Number(price).toLocaleString()}/pair`} · #{item.id}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
