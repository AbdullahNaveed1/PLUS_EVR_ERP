import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

const numberOrZero = value => Number.isFinite(Number(value)) ? Number(value) : 0

const getInvoiceNumber = sale => {
  const customer = String(sale.customer || 'Customer').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
  const builty = String(sale.builtyNo || 'N-A').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
  return `${customer || 'Customer'}-${builty || 'N-A'}`
}

const getProductPrice = (product, region) => {
  const regionalPrice = region === 'Sindh' ? product?.priceSindh : product?.pricePunjab
  const fallbackPrice = region === 'Sindh' ? product?.pricePunjab : product?.priceSindh
  return numberOrZero(regionalPrice) > 0 ? numberOrZero(regionalPrice) : numberOrZero(fallbackPrice)
}

const getPairCount = item => {
  const quantity = numberOrZero(item.qty)
  if (quantity > 0) return quantity * (item.unitType === 'pairs' ? 1 : 12)
  return numberOrZero(item.pairs) || 1
}

const parseLegacyDescription = description => {
  const text = String(description || '')
  const articleMatch = text.match(/Article No:\s*([^\]\s]+)/i)
  const quantityMatch = text.match(/-\s*([\d.]+)\s*(dozens|pairs)\s*\(([\d.]+)\s*pairs\)/i)
  const priceMatch = text.match(/@\s*(?:Rs\.?|PKR)?\s*([\d,]+(?:\.\d+)?)\s*\/\s*pair/i)
  const discountMatch = text.match(/Disc(?:ount)?\s*:\s*([\d,]+(?:\.\d+)?)\s*Rs\.?\s*\/\s*pair/i)
  const sizeMatch = text.match(/\(Size:\s*([^\)]+)\)/i)
  const modelMatch = text.match(/Article No:\s*[^\]]+\]\s*(.*?)\s*\(Size:/i)

  return {
    productId: articleMatch?.[1],
    model: modelMatch?.[1],
    qty: quantityMatch?.[1],
    unitType: quantityMatch?.[2]?.toLowerCase(),
    pairs: quantityMatch?.[3],
    price: priceMatch?.[1]?.replace(/,/g, ''),
    discountPerPair: discountMatch?.[1]?.replace(/,/g, ''),
    size: sizeMatch?.[1]
  }
}

const getDiscountPerPair = (item, discountTotal = 0, pairCount = 1) => {
  const explicitDiscount = [
    item.discountPerPair,
    item.discountRate,
    item.discount_per_pair,
    item.pairDiscount,
    item.discount
  ].find(value => numberOrZero(value) > 0)

  if (explicitDiscount !== undefined) return numberOrZero(explicitDiscount)

  const description = String(item.description || '')
  const embeddedDiscount = description.match(/Disc(?:ount)?\s*:\s*([\d,]+(?:\.\d+)?)\s*Rs\.?\s*\/\s*pair/i)
  if (embeddedDiscount) return numberOrZero(embeddedDiscount[1].replace(/,/g, ''))

  return pairCount > 0 ? numberOrZero(discountTotal) / pairCount : 0
}

const normalizeSale = sale => {
  const rawItems = Array.isArray(sale.lineItems) && sale.lineItems.length > 0
    ? sale.lineItems
    : [{
        productId: sale.productId || sale.itemNo || sale.itemNumber || sale.articleNo || 'N/A',
        model: sale.model || sale.description || sale.items || 'General Wholesale Order',
        description: sale.description || sale.items || 'General Wholesale Order',
        qty: sale.qty,
        unitType: sale.unitType,
        pairs: sale.pairs,
        price: sale.price || sale.unitPrice || sale.pricePerPair,
        grossAmount: sale.rawTotal || sale.total,
        netAmount: sale.total,
        discountAmount: sale.discount
      }]

  const saleDiscount = numberOrZero(sale.discount || sale.totalDiscount || sale.discountAmount)
  const items = rawItems.map(item => {
    const parsed = parseLegacyDescription(item.description)
    const quantity = numberOrZero(item.qty) > 0 ? item.qty : parsed.qty
    const unitType = item.unitType === 'pairs' || item.unitType === 'dozens' ? item.unitType : parsed.unitType
    const pairs = numberOrZero(parsed.pairs) || (numberOrZero(quantity) * (unitType === 'pairs' ? 1 : 12)) || getPairCount(item)
    const price = numberOrZero(item.price || item.unitPrice || item.pricePerPair || parsed.price)
    const grossAmount = numberOrZero(item.grossAmount) || (pairs * price)
    const hasSavedNet = item.netAmount !== undefined && item.netAmount !== null && item.netAmount !== ''
    const savedNet = hasSavedNet ? numberOrZero(item.netAmount) : grossAmount
    const savedDiscount = numberOrZero(item.discountAmount || item.totalDiscount || item.discountTotal)
    const discountAmount = savedDiscount || (grossAmount > savedNet ? grossAmount - savedNet : 0)
    const discountPerPair = discountAmount > 0
      ? discountAmount / pairs
      : getDiscountPerPair({ ...item, discountPerPair: item.discountPerPair || parsed.discountPerPair }, discountAmount, pairs)

    return {
      ...item,
      productId: item.productId || item.itemNo || item.itemNumber || item.articleNo || parsed.productId || 'N/A',
      model: item.model || parsed.model || item.description || 'Footwear Article',
      description: item.description || item.model || 'Footwear Article',
      size: item.size || parsed.size || 'N/A',
      qty: quantity || '-',
      unitType: unitType || 'dozens',
      pairs,
      price: price || (pairs > 0 ? grossAmount / pairs : 0),
      discountPerPair,
      grossAmount,
      discountAmount: discountAmount || (discountPerPair * pairs),
      netAmount: savedNet || (grossAmount - (discountAmount || (discountPerPair * pairs)))
    }
  })

  const knownDiscount = items.reduce((total, item) => total + item.discountAmount, 0)
  const remainingDiscount = Math.max(0, saleDiscount - knownDiscount)
  const grossTotal = items.reduce((total, item) => total + item.grossAmount, 0)
  const normalizedItems = items.map(item => {
    if (remainingDiscount <= 0 || item.discountAmount > 0) return item
    const allocated = grossTotal > 0 ? remainingDiscount * (item.grossAmount / grossTotal) : remainingDiscount / items.length
    return { ...item, discountAmount: allocated, discountPerPair: allocated / item.pairs, netAmount: item.grossAmount - allocated }
  })

  return { ...sale, lineItems: normalizedItems, discount: saleDiscount || knownDiscount }
}

const formatPairs = pairs => numberOrZero(pairs).toLocaleString()

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [role, setRole] = useState(() => localStorage.getItem('role'))
  const [username, setUsername] = useState(() => localStorage.getItem('username'))

  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [activeTab, setActiveTab] = useState('dashboard')

  const [inventory, setInventory] = useState([])
  const [customers, setCustomers] = useState([])
  const [expenses, setExpenses] = useState([])
  const [tours, setTours] = useState([])
  const [workers, setWorkers] = useState([])
  const [wagePayments, setWagePayments] = useState([])

  const [sales, setSales] = useState(() => {
    try {
      const saved = localStorage.getItem('factory_sales')
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.map(s => normalizeSale({
          ...s,
          transportCompany: s.transportCompany || 'N/A',
          builtyNo: s.builtyNo || 'N/A'
        }));
      }
      return [];
    } catch (e) {
      return []
    }
  })

  const [payments, setPayments] = useState(() => {
    try {
      const saved = localStorage.getItem('factory_payments')
      return saved ? JSON.parse(saved) : []
    } catch (e) {
      return []
    }
  })

  const [loading, setLoading] = useState(false)

  const [newItem, setNewItem] = useState({ articleNumber: '', model: '', size: '', color: '', qty: '', pricePunjab: '', priceSindh: '' })
  const [newCust, setNewCust] = useState({ name: '', description: null, region: 'Punjab', balance: '' })
  const [newExp, setNewExp] = useState({ category: '', amount: '', notes: '', date: new Date().toISOString().split('T')[0] })
  const [newTour, setNewTour] = useState({ rep: '', region: '', cost: '', ordersValue: '', date: new Date().toISOString().split('T')[0] })

  const [paymentInputs, setPaymentInputs] = useState({})
  const [updateStockInputs, setUpdateStockInputs] = useState({})
  const [updatePriceInputs, setUpdatePriceInputs] = useState({})
  const [customerDescriptionInputs, setCustomerDescriptionInputs] = useState({})
  const [newWorker, setNewWorker] = useState({ name: '', phone: '', role: '' })
  const [newWagePayment, setNewWagePayment] = useState({ workerId: '', amount: '', paymentDate: new Date().toISOString().split('T')[0], notes: '' })

  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [saleCustomerName, setSaleCustomerName] = useState('')
  const [saleCustomerUniqueId, setSaleCustomerUniqueId] = useState('')
  const [saleCustomerRegion, setSaleCustomerRegion] = useState('Punjab')
  const [transportCompany, setTransportCompany] = useState('')
  const [builtyNo, setBuiltyNo] = useState('')

  const [cartItems, setCartItems] = useState([
    { productId: '', model: '', size: '', qty: '', unitType: 'dozens', price: '' }
  ])

  const [editingSaleId, setEditingSaleId] = useState(null)
  const [editSaleInputs, setEditSaleInputs] = useState({ transportCompany: '', builtyNo: '', discountPerPair: {} })
  const [selectedSaleIds, setSelectedSaleIds] = useState([])

  const [stockReportSearch, setStockReportSearch] = useState('')

  const [reportCustId, setReportCustId] = useState('');
  const [reportStartDate, setReportStartDate] = useState(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [reportEndDate, setReportEndDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  const generateCustomerId = () => {
    return 'CUST-' + Math.floor(1000 + Math.random() * 9000);
  }

  useEffect(() => {
    if (token) {
      fetchAllData()
    }
  }, [token])

  const fetchAllData = async () => {
    setLoading(true)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [prodRes, custRes, expRes, salesRes, paymentsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/products`, { headers }),
        axios.get(`${API_BASE_URL}/api/customers`, { headers }),
        axios.get(`${API_BASE_URL}/api/expenses`, { headers }),
        axios.get(`${API_BASE_URL}/api/sales`, { headers }),
        axios.get(`${API_BASE_URL}/api/payments`, { headers })
      ])
      const [workersRes, wagePaymentsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/wages/workers`, { headers }),
        axios.get(`${API_BASE_URL}/api/wages/payments`, { headers })
      ])
      await axios.get(`${API_BASE_URL}/api/articles`, { headers })
      setInventory(prodRes.data || [])
      setCustomers(custRes.data || [])
      setExpenses(expRes.data || [])
      const savedSales = salesRes.data || []
      const savedPayments = paymentsRes.data || []
      const legacySales = JSON.parse(localStorage.getItem('factory_sales') || '[]')
      const legacyPayments = JSON.parse(localStorage.getItem('factory_payments') || '[]')

      if (savedSales.length === 0 && legacySales.length > 0) {
        const migratedSales = await Promise.all(legacySales.map(sale => axios.post(`${API_BASE_URL}/api/sales`, sale, { headers })))
        localStorage.removeItem('factory_sales')
        setSales(migratedSales.map(response => normalizeSale(response.data)))
      } else {
        setSales(savedSales.map(normalizeSale))
      }

      if (savedPayments.length === 0 && legacyPayments.length > 0) {
        const migratedPayments = await Promise.all(legacyPayments.map(payment => axios.post(`${API_BASE_URL}/api/payments`, payment, { headers })))
        localStorage.removeItem('factory_payments')
        setPayments(migratedPayments.map(response => response.data))
      } else {
        setPayments(savedPayments)
      }
      setWorkers(workersRes.data || [])
      setWagePayments(wagePaymentsRes.data || [])
    } catch (error) {
      console.error("Failed to fetch data or unauthorized:", error)
      if (error.response?.status === 401) {
        handleLogout()
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError('')
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, loginForm)
      const { token, role, username } = response.data

      localStorage.setItem('token', token)
      localStorage.setItem('role', role || 'Admin')
      localStorage.setItem('username', username || loginForm.username)

      setToken(token)
      setRole(role || 'Admin')
      setUsername(username || loginForm.username)
      setLoginForm({ username: '', password: '' })
    } catch (err) {
      setLoginError('Invalid username or password')
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('role')
    localStorage.removeItem('username')
    setToken(null)
    setRole(null)
    setUsername(null)
  }

  // ============================================================
  // COMPUTED STOCK — true remaining = raw qty minus all sold pairs
  // ============================================================
  const totalSoldPairsByProduct = useMemo(() => {
    const map = {}
    sales.forEach(sale => {
      const items = Array.isArray(sale.lineItems) ? sale.lineItems : []
      items.forEach(item => {
        const pid = String(item.productId || '').trim()
        if (!pid || pid === 'N/A') return
        const pairs = numberOrZero(item.pairs) || (numberOrZero(item.qty) * (item.unitType === 'pairs' ? 1 : 12))
        if (pairs <= 0) return
        map[pid] = (map[pid] || 0) + pairs
      })
    })
    return map
  }, [sales])

  const inventoryWithTrueStock = useMemo(() => {
    return inventory.map(item => {
      const rawQty = numberOrZero(item.qty)
      const sold = numberOrZero(totalSoldPairsByProduct[String(item.id)])

      let trueStock
      if (rawQty === 0 && sold > 0) {
        trueStock = -sold
      } else if (rawQty < 0) {
        trueStock = rawQty
      } else {
        trueStock = rawQty
      }

      return { ...item, trueStock, soldPairs: sold, rawQty }
    })
  }, [inventory, totalSoldPairsByProduct])

  const stockTotals = useMemo(() => {
    const totalPairs = inventoryWithTrueStock.reduce((acc, item) => acc + numberOrZero(item.trueStock), 0)
    const totalDozens = totalPairs / 12
    const totalValuePunjab = inventoryWithTrueStock.reduce(
      (acc, item) => acc + (numberOrZero(item.trueStock) * numberOrZero(item.pricePunjab ?? item.price)),
      0
    )
    const totalValueSindh = inventoryWithTrueStock.reduce(
      (acc, item) => acc + (numberOrZero(item.trueStock) * numberOrZero(item.priceSindh ?? item.price)),
      0
    )
    const uniqueArticles = new Set(inventoryWithTrueStock.map(i => i.articleNumber || i.model || 'Unassigned')).size
    return { totalPairs, totalDozens, totalValuePunjab, totalValueSindh, uniqueArticles, variantCount: inventoryWithTrueStock.length }
  }, [inventoryWithTrueStock])

  const totalInventoryValue = stockTotals.totalValuePunjab
  const totalExpenses = expenses.reduce((acc, ex) => acc + Number(ex.amount || 0), 0)
  const totalSalesRevenue = sales.reduce((acc, s) => acc + Number(s.total || 0), 0)
  const totalPaymentsReceived = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0)
  const netProfit = totalSalesRevenue - totalExpenses

  const inventoryByArticle = useMemo(() => {
    return inventoryWithTrueStock.reduce((groups, item) => {
      const articleNumber = item.articleNumber || item.model || 'Unassigned'
      groups[articleNumber] = groups[articleNumber] || []
      groups[articleNumber].push(item)
      return groups
    }, {})
  }, [inventoryWithTrueStock])

  const totalMarketDues = customers.reduce((acc, c) => {
    const customerBills = sales.filter(s => s.customerId === c.phone);
    const customerPayments = payments.filter(p => p.customerId === c.phone || p.customer === c.name);
    const totalBilled = customerBills.reduce((bAcc, b) => bAcc + b.total, 0);
    const totalPaid = customerPayments.reduce((pAcc, p) => pAcc + p.amount, 0);
    return acc + (Number(c.balance) + totalBilled - totalPaid);
  }, 0);

  const handleAddInventory = async (e) => {
    e.preventDefault()
    if (!newItem.articleNumber || !newItem.qty || newItem.pricePunjab === '' || newItem.priceSindh === '') return
    try {
      await axios.post(`${API_BASE_URL}/api/products`, {
        articleNumber: newItem.articleNumber,
        model: newItem.articleNumber,
        size: newItem.size,
        color: newItem.color,
        qty: Number(newItem.qty),
        price: Number(newItem.pricePunjab),
        pricePunjab: Number(newItem.pricePunjab),
        priceSindh: Number(newItem.priceSindh)
      }, { headers: { Authorization: `Bearer ${token}` } })

      setNewItem({ articleNumber: '', model: '', size: '', color: '', qty: '', pricePunjab: '', priceSindh: '' })
      fetchAllData()
    } catch (err) {
      console.error("Error adding product:", err)
    }
  }

  const handleCreateParentArticle = async () => {
    if (!newItem.articleNumber) return
    try {
      await axios.post(`${API_BASE_URL}/api/articles`, { articleNumber: newItem.articleNumber }, { headers: { Authorization: `Bearer ${token}` } })
      fetchAllData()
    } catch (err) {
      alert(err.response?.data || 'Article already exists or could not be created.')
    }
  }

  const handleUpdateInventoryStock = async (item) => {
    const incomingQty = Number(updateStockInputs[item.id] || 0)
    if (incomingQty <= 0) {
      alert("Please enter a valid number of new pairs to add.")
      return
    }

    try {
      const updatedProduct = {
        id: item.id,
        articleNumber: item.articleNumber || item.model,
        model: item.model,
        size: item.size,
        color: item.color,
        qty: Number(item.rawQty || item.qty || 0) + incomingQty,
        price: Number(item.pricePunjab ?? item.price ?? 0),
        pricePunjab: Number(item.pricePunjab ?? item.price ?? 0),
        priceSindh: Number(item.priceSindh ?? item.price ?? 0)
      }
      const headers = { Authorization: `Bearer ${token}` }
      await axios.put(`${API_BASE_URL}/api/products/${item.id}`, updatedProduct, { headers })

      setUpdateStockInputs({ ...updateStockInputs, [item.id]: '' })
      fetchAllData()
    } catch (err) {
      console.error("Error updating stock:", err)
      alert("Failed to update inventory stock.")
    }
  }

  const handleUpdateInventoryPrice = async (item) => {
    const priceInputs = updatePriceInputs[item.id] || {}
    if (priceInputs.punjab === undefined && priceInputs.sindh === undefined) return
    try {
      const headers = { Authorization: `Bearer ${token}` }
      await axios.put(`${API_BASE_URL}/api/products/${item.id}`, {
        id: item.id,
        articleNumber: item.articleNumber || item.model,
        model: item.model,
        size: item.size,
        color: item.color,
        qty: Number(item.rawQty || item.qty || 0),
        pricePunjab: Number(priceInputs.punjab ?? item.pricePunjab ?? item.price ?? 0),
        priceSindh: Number(priceInputs.sindh ?? item.priceSindh ?? item.price ?? 0)
      }, { headers })
      setUpdatePriceInputs({ ...updatePriceInputs, [item.id]: {} })
      fetchAllData()
    } catch (err) {
      console.error('Error updating product price:', err)
      alert('Failed to update product price.')
    }
  }

  const handleAddWorker = async (e) => {
    e.preventDefault()
    if (!newWorker.name) return
    await axios.post(`${API_BASE_URL}/api/wages/workers`, newWorker, { headers: { Authorization: `Bearer ${token}` } })
    setNewWorker({ name: '', phone: '', role: '' })
    fetchAllData()
  }

  const handleAddWagePayment = async (e) => {
    e.preventDefault()
    if (!newWagePayment.workerId || !newWagePayment.amount) return
    await axios.post(`${API_BASE_URL}/api/wages/payments`, {
      workerId: Number(newWagePayment.workerId),
      amount: Number(newWagePayment.amount),
      paymentDate: new Date(newWagePayment.paymentDate).toISOString(),
      notes: newWagePayment.notes
    }, { headers: { Authorization: `Bearer ${token}` } })
    setNewWagePayment({ workerId: '', amount: '', paymentDate: new Date().toISOString().split('T')[0], notes: '' })
    fetchAllData()
  }

  const handleDeleteProduct = async (id) => {
    if (!window.confirm("Are you sure you want to delete this product from stock?")) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      await axios.delete(`${API_BASE_URL}/api/products/${id}`, { headers });
      fetchAllData();
    } catch (err) {
      console.error("Error deleting product:", err);
      alert("Failed to delete product.");
    }
  };

  const handleAddCustomer = async (e) => {
    e.preventDefault()
    if (!newCust.name) return
    try {
      const generatedId = generateCustomerId();
      await axios.post(`${API_BASE_URL}/api/customers`, {
        name: newCust.name,
        phone: generatedId,
        description: newCust.description?.trim() || null,
        region: newCust.region,
        balance: Number(newCust.balance || 0)
      }, { headers: { Authorization: `Bearer ${token}` } })

      setNewCust({ name: '', description: null, region: 'Punjab', balance: '' })
      fetchAllData()
    } catch (err) {
      console.error("Error adding customer:", err)
    }
  }

  const handleUpdateCustomerDescription = async (customer) => {
    try {
      const description = customerDescriptionInputs[customer.id]?.trim() || null
      await axios.put(`${API_BASE_URL}/api/customers/${customer.id}`, {
        ...customer,
        description
      }, { headers: { Authorization: `Bearer ${token}` } })
      setCustomerDescriptionInputs({ ...customerDescriptionInputs, [customer.id]: description || '' })
      fetchAllData()
    } catch (err) {
      console.error('Error updating customer description:', err)
      alert('Failed to update customer description.')
    }
  }

  const handleAddExpense = async (e) => {
    e.preventDefault()
    if (!newExp.category || !newExp.amount) return
    try {
      await axios.post(`${API_BASE_URL}/api/expenses`, {
        category: newExp.category,
        amount: Number(newExp.amount),
        notes: newExp.notes || '',
        date: new Date(newExp.date).toISOString()
      }, { headers: { Authorization: `Bearer ${token}` } })

      setNewExp({ category: '', amount: '', notes: '', date: new Date().toISOString().split('T')[0] })
      fetchAllData()
    } catch (err) {
      console.error("Error adding expense:", err)
    }
  }

  const handleAddTour = (e) => {
    e.preventDefault()
    if (!newTour.rep || !newTour.cost) return
    setTours([...tours, { id: Date.now(), ...newTour, cost: Number(newTour.cost), ordersValue: Number(newTour.ordersValue || 0) }])
    setNewTour({ rep: '', region: '', cost: '', ordersValue: '', date: new Date().toISOString().split('T')[0] })
  }

  const handleCartItemChange = (index, field, value) => {
    const updated = [...cartItems]
    updated[index][field] = value

    if (field === 'productId') {
      const selectedProduct = inventory.find(p => p.id.toString() === value.toString())
      if (selectedProduct) {
        const regionalPrice = getProductPrice(selectedProduct, saleCustomerRegion)

        updated[index].productId = selectedProduct.id
        updated[index].model = selectedProduct.model
        updated[index].size = selectedProduct.size || 'N/A'
        updated[index].price = regionalPrice
      }
    }

    setCartItems(updated)
  }

  const addCartRow = () => {
    setCartItems([...cartItems, { productId: '', model: '', size: '', qty: '', unitType: 'dozens', price: '' }])
  }

  const removeCartRow = (index) => {
    setCartItems(cartItems.filter((_, i) => i !== index))
  }

  // === Stock Deduction — Always runs without blocking bill generation ===
  const deductStockFromInventory = async (lineItems) => {
    const headers = { Authorization: `Bearer ${token}` }

    const soldByProduct = {}
    for (const item of lineItems) {
      const pid = String(item.productId || '').trim()
      if (!pid || pid === 'N/A') continue
      const soldPairs = numberOrZero(item.pairs) || (numberOrZero(item.qty) * (item.unitType === 'pairs' ? 1 : 12))
      if (soldPairs <= 0) continue
      soldByProduct[pid] = (soldByProduct[pid] || 0) + soldPairs
    }

    const updates = Object.entries(soldByProduct).map(async ([productId, soldPairs]) => {
      const current = inventory.find(p => p.id.toString() === productId)
      if (!current) return

      const currentQty = numberOrZero(current.qty)
      const newQty = currentQty - soldPairs // Allows negative stock when oversold

      const updated = {
        id: current.id,
        articleNumber: current.articleNumber || current.model,
        model: current.model,
        size: current.size,
        color: current.color,
        qty: newQty,
        price: Number(current.pricePunjab ?? current.price ?? 0),
        pricePunjab: Number(current.pricePunjab ?? current.price ?? 0),
        priceSindh: Number(current.priceSindh ?? current.price ?? 0)
      }

      try {
        await axios.put(`${API_BASE_URL}/api/products/${current.id}`, updated, { headers })
      } catch (err) {
        console.error(`Failed to deduct stock for product ${productId}:`, err)
      }
    })

    await Promise.all(updates)
  }

  const handleGenerateMultiItemBill = async (e) => {
    e.preventDefault()
    if (!saleCustomerName || !saleCustomerUniqueId || cartItems.length === 0) return

    let grossTotal = 0;

    const evaluatedItems = cartItems.map(row => {
      const selectedProd = inventory.find(p => p.id.toString() === row.productId?.toString());
      const modelName = row.model || selectedProd?.model || 'Article';
      const sizeVal = row.size || selectedProd?.size || 'N/A';

      const multiplier = row.unitType === 'dozens' ? 12 : 1
      const itemPairs = Number(row.qty || 0) * multiplier
      const unitPrice = getProductPrice(selectedProd, saleCustomerRegion)
      const lineGross = itemPairs * unitPrice

      grossTotal += lineGross

      return {
        productId: row.productId,
        model: modelName,
        size: sizeVal,
        qty: row.qty,
        unitType: row.unitType,
        pairs: itemPairs,
        price: unitPrice,
        grossAmount: lineGross,
        discountPerPair: 0,
        discountAmount: 0,
        netAmount: lineGross,
        description: `[Article No: ${row.productId || 'N/A'}] ${modelName} (Size: ${sizeVal}) - ${row.qty} ${row.unitType} (${itemPairs} pairs) @ Rs. ${unitPrice}/pair`
      }
    })

    const newRecord = {
      id: Date.now(),
      customerId: saleCustomerUniqueId,
      customer: saleCustomerName,
      region: saleCustomerRegion,
      lineItems: evaluatedItems,
      total: grossTotal,
      rawTotal: grossTotal,
      discount: 0,
      transportCompany: transportCompany || 'N/A',
      builtyNo: builtyNo || 'N/A',
      date: new Date().toISOString().split('T')[0]
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/api/sales`, newRecord, { headers: { Authorization: `Bearer ${token}` } })
      const normalizedNewSale = normalizeSale(response.data)

      setSales(prevSales => [normalizedNewSale, ...prevSales])

      await deductStockFromInventory(evaluatedItems)
      await fetchAllData()
    } catch (err) {
      console.error('Error saving bill:', err)
      alert('The bill could not be saved to the database.')
      return
    }

    setSelectedCustomerId('')
    setSaleCustomerName('')
    setSaleCustomerUniqueId('')
    setTransportCompany('')
    setBuiltyNo('')
    setCartItems([{ productId: '', model: '', size: '', qty: '', unitType: 'dozens', price: '' }])
  }

  const handleUpdateSaleDetails = async (saleId) => {
    const updatedSales = sales.map(s => {
      if (s.id === saleId) {
        const discountInputs = editSaleInputs.discountPerPair || {}
        const lineItems = (s.lineItems || []).map((item, index) => {
          const pairs = getPairCount(item)
          const grossAmount = numberOrZero(item.grossAmount) || (pairs * numberOrZero(item.price))
          const discountPerPair = Math.max(0, numberOrZero(discountInputs[index]))
          const discountAmount = Math.min(grossAmount, pairs * discountPerPair)
          return {
            ...item,
            grossAmount,
            discountPerPair,
            discountAmount,
            netAmount: grossAmount - discountAmount
          }
        })
        const rawTotal = lineItems.reduce((total, item) => total + numberOrZero(item.grossAmount), 0)
        const discount = lineItems.reduce((total, item) => total + numberOrZero(item.discountAmount), 0)

        return {
          ...s,
          lineItems,
          rawTotal,
          discount,
          total: rawTotal - discount,
          transportCompany: editSaleInputs.transportCompany || s.transportCompany || 'N/A',
          builtyNo: editSaleInputs.builtyNo || s.builtyNo || 'N/A'
        };
      }
      return s;
    });
    const updatedSale = updatedSales.find(s => s.id === saleId)
    try {
      await axios.put(`${API_BASE_URL}/api/sales/${saleId}`, updatedSale, { headers: { Authorization: `Bearer ${token}` } })
      setSales(updatedSales.map(normalizeSale))
      setEditingSaleId(null)
    } catch (err) {
      console.error('Error updating bill:', err)
      alert('Failed to update the bill details.')
    }
  }

  const handleDeleteSelectedBills = async () => {
    const selectedBills = sales.filter(sale => selectedSaleIds.includes(sale.id))
    if (selectedBills.length === 0) {
      alert('Please tick at least one bill to delete.')
      return
    }

    const confirmed = window.confirm(`Delete ${selectedBills.length} selected bill${selectedBills.length === 1 ? '' : 's'}? This cannot be undone.`)
    if (!confirmed) return

    try {
      await Promise.all(selectedBills.map(sale => axios.delete(`${API_BASE_URL}/api/sales/${sale.id}`, { headers: { Authorization: `Bearer ${token}` } })))
      setSales(currentSales => currentSales.filter(sale => !selectedSaleIds.includes(sale.id)))
      setSelectedSaleIds([])
    } catch (err) {
      console.error('Error deleting bills:', err)
      alert('Failed to delete bills from the database.')
    }
  }

  const handlePrintBill = (saleRecord) => {
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    const invoiceNumber = getInvoiceNumber(saleRecord)
    const billItems = saleRecord.lineItems || []
    const quantityTotals = billItems.reduce((totals, item) => {
      const pairs = Number(item.pairs || 0) || (Number(item.qty || 0) * (item.unitType === 'pairs' ? 1 : 12))
      const enteredQuantity = Number(item.qty)
      const dozens = item.unitType === 'pairs'
        ? pairs / 12
        : (enteredQuantity > 0 ? enteredQuantity : pairs / 12)

      return {
        dozens: totals.dozens + (Number.isFinite(dozens) ? dozens : 0),
        pairs: totals.pairs + (Number.isFinite(pairs) ? pairs : 0)
      }
    }, { dozens: 0, pairs: 0 })

    const rowsHtml = saleRecord.lineItems && saleRecord.lineItems.length > 0 ? saleRecord.lineItems.map((item, idx) => {
      const displayModel = item.model || item.description || 'Footwear Article';
      const displaySize = item.size || 'N/A';
      const pairCount = Number(item.pairs || 0);
      const enteredQuantity = Number(item.qty);
      const dozenQuantity = item.unitType === 'pairs'
        ? pairCount / 12
        : (enteredQuantity > 0 ? enteredQuantity : pairCount / 12);
      const displayQty = dozenQuantity > 0
        ? `${dozenQuantity.toLocaleString()} dozens (${pairCount.toLocaleString()} pairs)`
        : '-';
      const unitPriceNum = Number(item.price || item.netAmount || saleRecord.total || 0);
      const lineTotal = Number(item.grossAmount || item.netAmount || saleRecord.total || 0);

      return `
        <tr>
          <td style="text-align: center; width: 30px;">${idx + 1}</td>
          <td style="text-align: center; width: 60px;">#${item.productId || 'N/A'}</td>
          <td>${displayModel} (Size: ${displaySize})</td>
          <td style="text-align: center; width: 110px;">${displayQty}</td>
          <td style="text-align: right; width: 85px;">Rs. ${unitPriceNum.toLocaleString()}</td>
          <td style="text-align: right; width: 110px; font-weight: bold;">Rs. ${lineTotal.toLocaleString()}</td>
        </tr>
      `;
    }).join('') : `
      <tr>
        <td style="text-align: center;">1</td>
        <td style="text-align: center;">#N/A</td>
        <td>${saleRecord.items || 'General Wholesale Order'}</td>
        <td style="text-align: center;">-</td>
        <td style="text-align: right;">-</td>
        <td style="text-align: right; font-weight: bold;">Rs. ${(saleRecord.rawTotal || saleRecord.total).toLocaleString()}</td>
      </tr>
    `;

    printWindow.document.write(`
      <html>
        <head>
          <title>Invoice ${invoiceNumber}</title>
          <style>
            body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 10px; color: #1e293b; background: #fff; margin: 0; font-size: 11px; }
            .invoice-header { display: flex; justify-content: space-between; border-bottom: 2px solid #714B67; padding-bottom: 12px; margin-bottom: 15px; }
            .company-name { font-size: 18px; font-weight: 800; text-transform: uppercase; color: #714B67; margin: 0; }
            .company-sub { font-size: 10px; color: #64748b; }
            .invoice-details { text-align: right; font-size: 11px; line-height: 1.25; }
            .meta-grid { display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; padding: 7px 9px; border-radius: 4px; margin-bottom: 9px; font-size: 11px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 9px; page-break-inside: avoid; }
            tr { page-break-inside: avoid; }
            th, td { border: 1px solid #cbd5e1; padding: 4px 6px; font-size: 10px; line-height: 1.15; }
            th { background-color: #f1f5f9; color: #334155; font-weight: 700; text-transform: uppercase; font-size: 11px; }
            .total-section { width: 250px; margin-left: auto; background: #f8fafc; border: 1px solid #e2e8f0; padding: 7px 9px; border-radius: 4px; font-size: 11px; page-break-inside: avoid; }
            .total-row { display: flex; justify-content: space-between; margin-bottom: 3px; }
            .net-amount { font-size: 13px; font-weight: 800; color: #16a34a; border-top: 1px solid #cbd5e1; padding-top: 4px; margin-top: 4px; }
            .signature-section { margin-top: 18px; display: flex; justify-content: space-between; font-size: 10px; color: #475569; page-break-inside: avoid; }
            .sig-line { width: 160px; border-top: 1px solid #94a3b8; text-align: center; padding-top: 4px; }
            .footer { margin-top: 10px; text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 4px; }
            @media print {
              body { padding: 0; }
              @page { size: A4 portrait; margin: 7mm; }
            }
          </style>
        </head>
        <body>
          <div class="invoice-header">
            <div>
              <h1 class="company-name">PLUS EVR ERP Factory</h1>
              <div class="company-sub">Wholesale Footwear Manufacturing & Ledger</div>
              <div class="company-sub">Lahore, Pakistan</div>
            </div>
            <div class="invoice-details">
              <h3 style="margin: 0 0 4px 0; color: #1e293b;">WHOLESALE INVOICE</h3>
              <div><strong>Invoice No:</strong> ${invoiceNumber}</div>
              <div><strong>Date:</strong> ${saleRecord.date}</div>
              <div><strong>Region:</strong> ${saleRecord.region || 'Punjab'}</div>
            </div>
          </div>

          <div class="meta-grid">
            <div>
              <strong>Customer:</strong> <strong>${saleRecord.customer}</strong> (${saleRecord.customerId || 'N/A'})
            </div>
            <div>
              <strong>Transport:</strong> ${saleRecord.transportCompany || 'N/A'} | <strong>Builty No:</strong> ${saleRecord.builtyNo || 'N/A'}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="text-align: center;">#</th>
                <th style="text-align: center;">Item No.</th>
                <th>Description / Article Details</th>
                <th style="text-align: center;">Quantity (Dozens)</th>
                <th style="text-align: right;">Bill Rate/Pair</th>
                <th style="text-align: right;">Bill Rate (PKR)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr style="font-weight: 800; background-color: #f8fafc;">
                <td colspan="3" style="text-align: right;">TOTAL QUANTITY:</td>
                <td style="text-align: center;">${quantityTotals.dozens.toLocaleString()} dozens (${quantityTotals.pairs.toLocaleString()} pairs)</td>
                <td colspan="3"></td>
              </tr>
            </tfoot>
          </table>

          <div class="total-section">
            <div class="total-row">
              <span>Bill Rate Total:</span>
              <span>Rs. ${(saleRecord.rawTotal || saleRecord.total).toLocaleString()}</span>
            </div>
            ${saleRecord.discount > 0 ? `<div class="total-row" style="color: #dc2626;"><span>Discount Applied Later:</span><span>- Rs. ${saleRecord.discount.toLocaleString()}</span></div><div class="total-row net-amount"><span>Net Payable:</span><span>Rs. ${saleRecord.total.toLocaleString()}</span></div>` : ''}
          </div>

          <div class="signature-section">
            <div class="sig-line">Prepared By</div>
            <div class="sig-line">Receiver Signature</div>
            <div class="sig-line">Authorized Stamp</div>
          </div>

          <div class="footer">
            <p>Thank you for your business! Computer-generated invoice from PLUS EVR ERP System.</p>
          </div>

          <script>
            window.onload = function() {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const handleViewPdfBill = (saleRecord) => {
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    const invoiceNumber = getInvoiceNumber(saleRecord)
    const billItems = saleRecord.lineItems || []
    const quantityTotals = billItems.reduce((totals, item) => {
      const pairs = Number(item.pairs || 0) || (Number(item.qty || 0) * (item.unitType === 'pairs' ? 1 : 12))
      const enteredQuantity = Number(item.qty)
      const dozens = item.unitType === 'pairs'
        ? pairs / 12
        : (enteredQuantity > 0 ? enteredQuantity : pairs / 12)
      return {
        dozens: totals.dozens + (Number.isFinite(dozens) ? dozens : 0),
        pairs: totals.pairs + (Number.isFinite(pairs) ? pairs : 0)
      }
    }, { dozens: 0, pairs: 0 })

    const rowsHtml = saleRecord.lineItems && saleRecord.lineItems.length > 0 ? saleRecord.lineItems.map((item, idx) => {
      const displayModel = item.model || item.description || 'Footwear Article';
      const displaySize = item.size || 'N/A';
      const pairCount = Number(item.pairs || 0);
      const enteredQuantity = Number(item.qty);
      const dozenQuantity = item.unitType === 'pairs'
        ? pairCount / 12
        : (enteredQuantity > 0 ? enteredQuantity : pairCount / 12);
      const displayQty = dozenQuantity > 0
        ? `${dozenQuantity.toLocaleString()} dozens (${pairCount.toLocaleString()} pairs)`
        : '-';
      const unitPriceNum = Number(item.price || item.netAmount || saleRecord.total || 0);
      const lineTotal = Number(item.grossAmount || item.netAmount || saleRecord.total || 0);

      return `
        <tr>
          <td style="text-align: center; width: 30px;">${idx + 1}</td>
          <td style="text-align: center; width: 60px;">#${item.productId || 'N/A'}</td>
          <td>${displayModel} (Size: ${displaySize})</td>
          <td style="text-align: center; width: 110px;">${displayQty}</td>
          <td style="text-align: right; width: 85px;">Rs. ${unitPriceNum.toLocaleString()}</td>
          <td style="text-align: right; width: 110px; font-weight: bold;">Rs. ${lineTotal.toLocaleString()}</td>
        </tr>
      `;
    }).join('') : `
      <tr>
        <td style="text-align: center;">1</td>
        <td style="text-align: center;">#N/A</td>
        <td>${saleRecord.items || 'General Wholesale Order'}</td>
        <td style="text-align: center;">-</td>
        <td style="text-align: right;">-</td>
        <td style="text-align: right; font-weight: bold;">Rs. ${(saleRecord.rawTotal || saleRecord.total).toLocaleString()}</td>
      </tr>
    `;

    printWindow.document.write(`
      <html>
        <head>
          <title>Invoice ${invoiceNumber}</title>
          <style>
            body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 20px; color: #1e293b; background: #fff; margin: 0; font-size: 11px; }
            .invoice-header { display: flex; justify-content: space-between; border-bottom: 2px solid #714B67; padding-bottom: 12px; margin-bottom: 15px; }
            .company-name { font-size: 18px; font-weight: 800; text-transform: uppercase; color: #714B67; margin: 0; }
            .company-sub { font-size: 10px; color: #64748b; }
            .invoice-details { text-align: right; font-size: 11px; line-height: 1.25; }
            .meta-grid { display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; padding: 7px 9px; border-radius: 4px; margin-bottom: 9px; font-size: 11px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 9px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px; font-size: 10px; line-height: 1.15; }
            th { background-color: #f1f5f9; color: #334155; font-weight: 700; text-transform: uppercase; font-size: 11px; }
            .total-section { width: 250px; margin-left: auto; background: #f8fafc; border: 1px solid #e2e8f0; padding: 7px 9px; border-radius: 4px; font-size: 11px; }
            .total-row { display: flex; justify-content: space-between; margin-bottom: 3px; }
            .net-amount { font-size: 13px; font-weight: 800; color: #16a34a; border-top: 1px solid #cbd5e1; padding-top: 4px; margin-top: 4px; }
            .signature-section { margin-top: 18px; display: flex; justify-content: space-between; font-size: 10px; color: #475569; }
            .sig-line { width: 160px; border-top: 1px solid #94a3b8; text-align: center; padding-top: 4px; }
            .footer { margin-top: 10px; text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 4px; }
            .print-btn { display: block; width: 100%; max-width: 200px; margin: 20px auto 0 auto; background: #714B67; color: white; border: none; padding: 10px; border-radius: 6px; font-weight: bold; cursor: pointer; text-align: center; }
            @media print { .print-btn { display: none; } body { padding: 0; } @page { size: A4 portrait; margin: 7mm; } }
          </style>
        </head>
        <body>
          <div class="invoice-header">
            <div>
              <h1 class="company-name">PLUS EVR ERP Factory</h1>
              <div class="company-sub">Wholesale Footwear Manufacturing & Ledger</div>
              <div class="company-sub">Lahore, Pakistan</div>
            </div>
            <div class="invoice-details">
              <h3 style="margin: 0 0 4px 0; color: #1e293b;">WHOLESALE INVOICE</h3>
              <div><strong>Invoice No:</strong> ${invoiceNumber}</div>
              <div><strong>Date:</strong> ${saleRecord.date}</div>
              <div><strong>Region:</strong> ${saleRecord.region || 'Punjab'}</div>
            </div>
          </div>

          <div class="meta-grid">
            <div><strong>Customer:</strong> <strong>${saleRecord.customer}</strong> (${saleRecord.customerId || 'N/A'})</div>
            <div><strong>Transport:</strong> ${saleRecord.transportCompany || 'N/A'} | <strong>Builty No:</strong> ${saleRecord.builtyNo || 'N/A'}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="text-align: center;">#</th>
                <th style="text-align: center;">Item No.</th>
                <th>Description / Article Details</th>
                <th style="text-align: center;">Quantity (Dozens)</th>
                <th style="text-align: right;">Bill Rate/Pair</th>
                <th style="text-align: right;">Bill Rate (PKR)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr style="font-weight: 800; background-color: #f8fafc;">
                <td colspan="3" style="text-align: right;">TOTAL QUANTITY:</td>
                <td style="text-align: center;">${quantityTotals.dozens.toLocaleString()} dozens (${quantityTotals.pairs.toLocaleString()} pairs)</td>
                <td colspan="3"></td>
              </tr>
            </tfoot>
          </table>

          <div class="total-section">
            <div class="total-row"><span>Bill Rate Total:</span><span>Rs. ${(saleRecord.rawTotal || saleRecord.total).toLocaleString()}</span></div>
            ${saleRecord.discount > 0 ? `<div class="total-row" style="color: #dc2626;"><span>Discount Applied Later:</span><span>- Rs. ${saleRecord.discount.toLocaleString()}</span></div><div class="total-row net-amount"><span>Net Payable:</span><span>Rs. ${saleRecord.total.toLocaleString()}</span></div>` : ''}
          </div>

          <div class="signature-section">
            <div class="sig-line">Prepared By</div>
            <div class="sig-line">Receiver Signature</div>
            <div class="sig-line">Authorized Stamp</div>
          </div>

          <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const handlePrintAllBills = (billsToPrint = sales) => {
    if (billsToPrint.length === 0) return

    const billSections = billsToPrint.map(sale => {
      const invoiceNumber = getInvoiceNumber(sale)
      const items = (sale.lineItems || []).map((item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>#${item.productId || 'N/A'}</td>
          <td>${item.model || item.description || 'Footwear Article'} (Size: ${item.size || 'N/A'})</td>
          <td>${item.qty || '-'} ${item.unitType || 'dozens'}</td>
          <td>Rs. ${numberOrZero(item.price).toLocaleString()}</td>
          <td>Rs. ${numberOrZero(item.grossAmount || item.netAmount).toLocaleString()}</td>
        </tr>
      `).join('') || `<tr><td colspan="6">General Wholesale Order</td></tr>`

      return `
        <section class="invoice">
          <header><div><h1>PLUS EVR ERP Factory</h1><div>Wholesale Footwear Manufacturing & Ledger</div></div><div><strong>Invoice No:</strong> ${invoiceNumber}<br><strong>Date:</strong> ${sale.date}<br><strong>Region:</strong> ${sale.region || 'Punjab'}</div></header>
          <div class="meta"><strong>Customer:</strong> ${sale.customer} (${sale.customerId || 'N/A'}) <span><strong>Transport:</strong> ${sale.transportCompany || 'N/A'} | <strong>Builty No:</strong> ${sale.builtyNo || 'N/A'}</span></div>
          <table><thead><tr><th>#</th><th>Item No.</th><th>Description</th><th>Quantity</th><th>Bill Rate/Pair</th><th>Bill Rate</th></tr></thead><tbody>${items}</tbody></table>
          <div class="total"><strong>Bill Rate Total: Rs. ${numberOrZero(sale.rawTotal || sale.total).toLocaleString()}</strong>${sale.discount > 0 ? `<br>Discount Applied Later: - Rs. ${numberOrZero(sale.discount).toLocaleString()}<br><strong>Net Payable: Rs. ${numberOrZero(sale.total).toLocaleString()}</strong>` : ''}</div>
        </section>
      `
    }).join('')

    const printWindow = window.open('', '_blank', 'width=1000,height=800')
    printWindow.document.write(`
      <html><head><title>All Bills</title><style>
        body { font-family: Arial, sans-serif; color: #1e293b; margin: 20px; font-size: 12px; }
        .invoice { page-break-after: always; padding-bottom: 20px; }
        .invoice:last-child { page-break-after: auto; }
        header { display: flex; justify-content: space-between; border-bottom: 2px solid #714B67; padding-bottom: 10px; margin-bottom: 12px; }
        h1 { color: #714B67; font-size: 20px; margin: 0 0 4px; }
        .meta { background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; margin-bottom: 10px; }
        .meta span { float: right; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; }
        th { background: #f1f5f9; }
        .total { margin-left: auto; width: 260px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; line-height: 1.7; }
        @media print { @page { size: A4 portrait; margin: 7mm; } body { margin: 0; } }
      </style></head><body>${billSections}<script>window.onload = function() { window.print(); window.close(); }</script></body></html>
    `)
    printWindow.document.close()
  }

  const handleToggleSaleSelection = saleId => {
    setSelectedSaleIds(currentIds => currentIds.includes(saleId)
      ? currentIds.filter(id => id !== saleId)
      : [...currentIds, saleId]
    )
  }

  const handleToggleAllSales = () => {
    setSelectedSaleIds(selectedSaleIds.length === sales.length ? [] : sales.map(sale => sale.id))
  }

  const handlePrintSelectedBills = () => {
    const selectedBills = sales.filter(sale => selectedSaleIds.includes(sale.id))
    if (selectedBills.length === 0) {
      alert('Please tick at least one bill to print.')
      return
    }
    handlePrintAllBills(selectedBills)
  }

  const handleDownloadSelectedBills = () => {
    const selectedBills = sales.filter(sale => selectedSaleIds.includes(sale.id))
    if (selectedBills.length === 0) {
      alert('Please tick at least one bill to download.')
      return
    }
    handlePrintAllBills(selectedBills)
  }

  const handleSendWhatsAppBill = (saleRecord) => {
    handlePrintBill(saleRecord);

    const matchedCustomer = customers.find(c => c.phone === saleRecord.customerId || c.name === saleRecord.customer);
    const customerPhone = matchedCustomer?.whatsapp || '';

    const message = `*PLUS EVR ERP - Invoice Dispatch* 🧾\n` +
      `-----------------------------------\n` +
      `👤 *Customer:* ${saleRecord.customer} (${saleRecord.customerId || 'N/A'})\n` +
      `📅 *Date:* ${saleRecord.date}\n` +
      `🚚 *Transport:* ${saleRecord.transportCompany || 'N/A'}\n` +
      `📦 *Builty No:* ${saleRecord.builtyNo || 'N/A'}\n` +
      `${saleRecord.discount > 0 ? '🟢 *Net Payable*' : '🟢 *Bill Rate Total*'}: *Rs. ${(saleRecord.discount > 0 ? saleRecord.total : (saleRecord.rawTotal || saleRecord.total)).toLocaleString()}*\n` +
      `-----------------------------------\n` +
      `_Your official PDF invoice print window has opened on our system._ 🙏`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = customerPhone
      ? `https://api.whatsapp.com/send?phone=${customerPhone}&text=${encodedMessage}`
      : `https://api.whatsapp.com/send?text=${encodedMessage}`;

    window.open(whatsappUrl, '_blank');
  };

  const handlePrintStockReport = () => {
    if (inventory.length === 0) {
      alert('No inventory stock available to print.')
      return
    }

    const printWindow = window.open('', '_blank', 'width=1000,height=800')
    if (!printWindow) {
      alert('Please allow pop-ups to print the stock report.')
      return
    }

    const grouped = Object.entries(inventoryByArticle).sort(([a], [b]) => a.localeCompare(b))
    const totalDozensAll = stockTotals.totalDozens

    let rowIndex = 0
    const tableRows = grouped.map(([articleNumber, variants]) => {
      const articlePairs = variants.reduce((acc, v) => acc + numberOrZero(v.trueStock), 0)
      const articleDozens = articlePairs / 12
      const parentNegative = articlePairs < 0

      const parentRow = `
        <tr style="background-color: #ede9fe;">
          <td colspan="4" style="text-align: right; font-weight: 800; color: ${parentNegative ? '#dc2626' : '#5b21b6'};">
            PARENT ARTICLE: ${articleNumber}
            <span style="font-weight: 600; color: #6b7280; margin-left: 6px;">(${variants.length} variant${variants.length === 1 ? '' : 's'})</span>
          </td>
          <td style="text-align: center; font-weight: 800; color: ${parentNegative ? '#dc2626' : '#5b21b6'};">${articleDozens.toFixed(2)} dozens</td>
        </tr>
      `

      const variantRows = variants.map(item => {
        rowIndex += 1
        const pairs = numberOrZero(item.trueStock)
        const dozens = pairs / 12
        const isNegative = pairs < 0

        return `
          <tr>
            <td style="text-align: center;">${rowIndex}</td>
            <td style="text-align: center;">#${item.id}</td>
            <td>${item.articleNumber || item.model || 'N/A'}</td>
            <td style="text-align: center;">${item.size || 'N/A'} | ${item.color || 'N/A'}</td>
            <td style="text-align: center; font-weight: bold; color: ${isNegative ? '#dc2626' : '#16a34a'};">${dozens.toFixed(2)} dozens${isNegative ? ' (NEGATIVE)' : ''}</td>
          </tr>
        `
      }).join('')

      return parentRow + variantRows
    }).join('')

    printWindow.document.write(`
      <html>
        <head>
          <title>Stock Inventory Report (Dozens)</title>
          <style>
            body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 18px; color: #1e293b; background: #fff; margin: 0; font-size: 11px; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #714B67; padding-bottom: 12px; margin-bottom: 15px; }
            .company-name { font-size: 20px; font-weight: 800; text-transform: uppercase; color: #714B67; margin: 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 10.5px; }
            th { background-color: #f1f5f9; color: #334155; font-weight: 700; text-transform: uppercase; }
            .summary-box { display: flex; justify-content: space-between; align-items: center; background: ${totalDozensAll < 0 ? '#fef2f2' : '#f8fafc'}; border: 2px solid ${totalDozensAll < 0 ? '#dc2626' : '#714B67'}; padding: 14px 18px; border-radius: 8px; margin-top: 18px; font-size: 14px; font-weight: bold; page-break-inside: avoid; }
            .footer { margin-top: 22px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
            @media print { body { padding: 0; } @page { size: A4 portrait; margin: 8mm; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="company-name">PLUS EVR ERP Factory</h1>
              <div style="color: #64748b;">Comprehensive Stock Report (Dozens Only)</div>
            </div>
            <div style="text-align: right; font-size: 11px; line-height: 1.6;">
              <div><strong>Date:</strong> ${new Date().toISOString().split('T')[0]}</div>
              <div><strong>Total Articles:</strong> ${grouped.length}</div>
              <div><strong>Total Variants:</strong> ${inventory.length}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="text-align: center; width: 40px;">#</th>
                <th style="text-align: center; width: 60px;">ID</th>
                <th style="text-align: left;">Article Number</th>
                <th style="text-align: center; width: 130px;">Size & Color</th>
                <th style="text-align: center; width: 180px;">Stock (Dozens)</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>

          <div class="summary-box">
            <span>GRAND TOTAL FACTORY STOCK:</span>
            <span style="color: ${totalDozensAll < 0 ? '#dc2626' : '#16a34a'};">${totalDozensAll.toFixed(2)} Dozens</span>
          </div>

          <div class="footer">
            <p>Computer-generated stock inventory report from PLUS EVR ERP System.</p>
          </div>

          <script>
            window.onload = function() {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const handlePrintCustomerReport = (customer, periodSales, periodPayments, openingApprox, netDue) => {
    const printWindow = window.open('', '_blank', 'width=800,height=600');

    const salesRows = periodSales.length === 0
      ? `<tr><td colspan="3" style="text-align:center; color:#94a3b8;">اس مدت میں کوئی نیا بل نہیں بنایا گیا۔</td></tr>`
      : periodSales.map(s => `
          <tr>
            <td>${s.date}</td>
            <td>بل نمبر #${s.id} (${s.region || 'Punjab'}) [ٹرانسپورٹ: ${s.transportCompany || 'N/A'}, بلٹی: ${s.builtyNo || 'N/A'}]</td>
            <td style="color: #16a34a; font-weight: bold;">Rs. ${s.total.toLocaleString()}</td>
          </tr>
        `).join('');

    const paymentsRows = periodPayments.length === 0
      ? `<tr><td colspan="3" style="text-align:center; color:#94a3b8;">اس مدت میں کوئی رقم وصول نہیں ہوئی۔</td></tr>`
      : periodPayments.map(p => `
          <tr>
            <td>${p.date}</td>
            <td>نقد وصولی (Cash Payment)</td>
            <td style="color: #2563eb; font-weight: bold;">Rs. ${p.amount.toLocaleString()}</td>
          </tr>
        `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <meta charset="utf-8">
          <title>Customer Report - ${customer.name}</title>
          <style>
            body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 30px; color: #333; direction: rtl; text-align: right; background: #fff; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #714B67; padding-bottom: 15px; margin-bottom: 20px; }
            .company { font-size: 20px; font-weight: 800; color: #714B67; text-transform: uppercase; }
            .info-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; line-height: 1.6; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 20px; }
            th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: right; font-size: 13px; }
            th { background-color: #f1f5f9; color: #334155; }
            .summary { background: #faf5f8; border: 1px solid #f0d8ec; padding: 15px; border-radius: 8px; font-size: 15px; font-weight: bold; margin-top: 20px; }
            .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="company">PLUS EVR ERP Factory</div>
              <div>ہفتہ وار / کسٹم کھاتہ اسٹیٹمنٹ</div>
            </div>
            <div>
              <p><strong>تاريخ اجراء:</strong> ${new Date().toISOString().split('T')[0]}</p>
            </div>
          </div>

          <div class="info-box">
            <p><strong>گاہک کا نام:</strong> ${customer.name}</p>
            <p><strong>اکاؤنٹ آئی ڈی:</strong> ${customer.phone}</p>
            <p><strong>علاقہ (Region):</strong> ${customer.region || 'Punjab'}</p>
            <p><strong>رپورٹ کی مدت:</strong> ${reportStartDate} سے ${reportEndDate} تک</p>
          </div>

          <h3 style="color: #1e293b; margin-bottom: 5px;">📦 اس مدت کے بلز (Sales / Billed)</h3>
          <table>
            <thead>
              <tr>
                <th>تاریخ</th>
                <th>تفصیل</th>
                <th>رقم (PKR)</th>
              </tr>
            </thead>
            <tbody>
              ${salesRows}
            </tbody>
          </table>

          <h3 style="color: #1e293b; margin-bottom: 5px; margin-top: 25px;">💵 اس مدت میں موصول ہونے والی رقم (Payments Received)</h3>
          <table>
            <thead>
              <tr>
                <th>تاریخ</th>
                <th>تفصیل</th>
                <th>وصول شدہ رقم (PKR)</th>
              </tr>
            </thead>
            <tbody>
              ${paymentsRows}
            </tbody>
          </table>

          <div class="summary">
            <p style="margin: 5px 0; color: #dc2626;">کل واجب الادا رقم (Total Net Dues): Rs. ${netDue.toLocaleString()}</p>
          </div>

          <div class="footer">
            <p>یہ پلس ای وی آر ای آر پی سسٹم سے تیار کردہ کمپیوٹر جنریٹڈ رپورٹ ہے۔</p>
          </div>

          <script>
            window.onload = function() {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleSendReportWhatsApp = (customer, periodSales, periodPayments, netDue) => {
    handlePrintCustomerReport(customer, periodSales, periodPayments, 0, netDue);

    const salesSummary = periodSales.length > 0
      ? periodSales.map(s => `• بل #${s.id} (${s.date}) [ٹرانسپورٹ: ${s.transportCompany || 'N/A'}]: Rs. ${s.total.toLocaleString()}`).join('\n')
      : '• کوئی نیا بل نہیں';

    const paymentsSummary = periodPayments.length > 0
      ? periodPayments.map(p => `• وصولی (${p.date}): Rs. ${p.amount.toLocaleString()}`).join('\n')
      : '• کوئی وصولی نہیں';

    const message = `*PLUS EVR ERP - گاہک کی ہفتہ وار رپورٹ* 📊\n` +
      `-----------------------------------\n` +
      `👤 *گاہک:* ${customer.name} (${customer.phone})\n` +
      `📅 *مدت:* ${reportStartDate} تا ${reportEndDate}\n` +
      `-----------------------------------\n` +
      `📦 *بلز کی تفصیل:*\n${salesSummary}\n\n` +
      `💵 *وصولیوں کی تفصیل:*\n${paymentsSummary}\n` +
      `-----------------------------------\n` +
      `🔴 *کل بقایا جات (Net Dues):* *Rs. ${netDue.toLocaleString()}*\n` +
      `-----------------------------------\n` +
      `_براہ کرم اپنے کھاتے کی تصدیق کریں۔ شکریہ!_ 🙏`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = customer.whatsapp
      ? `https://api.whatsapp.com/send?phone=${customer.whatsapp}&text=${encodedMessage}`
      : `https://api.whatsapp.com/send?text=${encodedMessage}`;

    window.open(whatsappUrl, '_blank');
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'inventory', label: 'Stock & Pricing' },
    { id: 'stockreport', label: '📦 Stock Report' },
    { id: 'search', label: '🔍 Search Article' },
    { id: 'customers', label: 'Khata & Ledger' },
    { id: 'sales', label: 'Billing' },
    { id: 'reports', label: '📊 گاہک کی رپورٹ (Reports)' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'wages', label: 'Daily Wages' },
    { id: 'tours', label: 'Tours' },
    { id: 'pnl', label: 'P&L' },
    { id: 'balancesheet', label: 'Balance Sheet' },
    { id: 'pwa', label: 'Mobile' }
  ]

  const filteredStockInventory = useMemo(() => {
    const q = stockReportSearch.trim().toLowerCase()
    if (!q) return inventoryWithTrueStock
    return inventoryWithTrueStock.filter(item => {
      const haystack = `${item.id} ${item.articleNumber || ''} ${item.model || ''} ${item.size || ''} ${item.color || ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [inventoryWithTrueStock, stockReportSearch])

  const filteredStockTotals = useMemo(() => {
    const totalPairs = filteredStockInventory.reduce((acc, item) => acc + numberOrZero(item.trueStock), 0)
    const totalDozens = totalPairs / 12
    return { totalPairs, totalDozens }
  }, [filteredStockInventory])

  if (!token) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <form onSubmit={handleLogin} style={{ background: '#fff', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px', border: '1px solid #e2e8f0' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <h2 style={{ margin: '10px 0 0 0', color: '#714B67', fontSize: '20px', fontWeight: '800' }}>PLUS EVR ERP</h2>
            <p style={{ margin: '5px 0 0 0', fontSize: '13px', color: '#64748b' }}>Secure Admin Portal</p>
          </div>

          {loginError && <p style={{ color: '#dc2626', marginBottom: '15px', fontSize: '13px', textAlign: 'center', fontWeight: '600' }}>{loginError}</p>}

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Username</label>
            <input
              type="text"
              value={loginForm.username}
              onChange={(e) => setLoginForm({...loginForm, username: e.target.value})}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '14px' }}
              required
            />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Password</label>
            <input
              type="password"
              value={loginForm.password}
              onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '14px' }}
              required
            />
          </div>
          <button type="submit" style={{ width: '100%', backgroundColor: '#714B67', color: '#fff', padding: '12px', border: 'none', borderRadius: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '14px' }}>
            Sign In to ERP
          </button>
        </form>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', width: '100%', margin: 0, padding: 0, backgroundColor: '#f8fafc', color: '#0f172a', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', boxSizing: 'border-box' }}>

      <nav style={{ backgroundColor: '#714B67', color: '#ffffff', padding: '12px 20px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 1000, boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 style={{ fontSize: '15px', fontWeight: '800', margin: 0, letterSpacing: '0.5px' }}>PLUS EVR ERP</h1>
          <span style={{ fontSize: '11px', backgroundColor: 'rgba(255,255,255,0.15)', padding: '3px 8px', borderRadius: '4px', marginLeft: '8px' }}>{username} ({role})</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', backgroundColor: '#5c3c53', padding: '4px', borderRadius: '8px' }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  whiteSpace: 'nowrap',
                  fontWeight: activeTab === tab.id ? '700' : '500',
                  backgroundColor: activeTab === tab.id ? '#ffffff' : 'transparent',
                  color: activeTab === tab.id ? '#714B67' : '#f3e8f2',
                  boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleLogout}
            style={{ backgroundColor: '#dc2626', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}
          >
            Logout
          </button>
        </div>
      </nav>

      <main style={{ width: '100%', padding: '24px 0px', boxSizing: 'border-box' }}>

        {loading && (
          <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '6px', marginBottom: '20px', fontSize: '13px', fontWeight: '600' }}>
            Syncing data with PostgreSQL (.NET API)...
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ backgroundColor: '#ffffff', padding: '18px 24px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>Factory Overview & Metrics</h2>
              <span style={{ fontSize: '12px', backgroundColor: '#dcfce7', color: '#15803d', padding: '4px 12px', borderRadius: '20px', fontWeight: '700', border: '1px solid #bbf7d0' }}>🟢 Live DB Connected</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <p style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', margin: '0 0 8px 0', letterSpacing: '0.5px' }}>TOTAL SALES BILLED</p>
                <p style={{ fontSize: '24px', fontWeight: '800', color: '#16a34a', margin: 0, wordBreak: 'break-all' }}>Rs. {totalSalesRevenue.toLocaleString()}</p>
              </div>
              <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <p style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', margin: '0 0 8px 0', letterSpacing: '0.5px' }}>CASH RECEIVED</p>
                <p style={{ fontSize: '24px', fontWeight: '800', color: '#2563eb', margin: 0, wordBreak: 'break-all' }}>Rs. {totalPaymentsReceived.toLocaleString()}</p>
              </div>
              <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <p style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', margin: '0 0 8px 0', letterSpacing: '0.5px' }}>TOTAL MARKET DUES</p>
                <p style={{ fontSize: '24px', fontWeight: '800', color: '#dc2626', margin: 0, wordBreak: 'break-all' }}>Rs. {totalMarketDues.toLocaleString()}</p>
              </div>
              <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <p style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', margin: '0 0 8px 0', letterSpacing: '0.5px' }}>INVENTORY WORTH</p>
                <p style={{ fontSize: '24px', fontWeight: '800', color: '#714B67', margin: 0, wordBreak: 'break-all' }}>Rs. {totalInventoryValue.toLocaleString()}</p>
              </div>
              <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <p style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', margin: '0 0 8px 0', letterSpacing: '0.5px' }}>TOTAL STOCK IN DOZENS</p>
                <p style={{ fontSize: '24px', fontWeight: '800', color: stockTotals.totalDozens < 0 ? '#dc2626' : '#0f766e', margin: 0, wordBreak: 'break-all' }}>{stockTotals.totalDozens.toFixed(2)} Dozens</p>
                <p style={{ fontSize: '11px', color: '#64748b', margin: '4px 0 0 0' }}>({formatPairs(stockTotals.totalPairs)} pairs)</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '20px' }}>
              <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '20px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>Recent Cash Payments Logged</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '10px' }}>Date</th>
                        <th style={{ padding: '10px' }}>Customer</th>
                        <th style={{ padding: '10px' }}>Amount Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.length === 0 ? (
                        <tr><td colSpan="3" style={{ padding: '15px', textAlign: 'center', color: '#94a3b8' }}>No payments logged yet.</td></tr>
                      ) : (
                        payments.slice(-5).reverse().map(p => (
                          <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px', color: '#64748b' }}>{p.date}</td>
                            <td style={{ padding: '10px', fontWeight: '700', color: '#0f172a' }}>{p.customer} ({p.phone})</td>
                            <td style={{ padding: '10px', color: '#16a34a', fontWeight: '700' }}>Rs. {p.amount.toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '20px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>Recent Factory Expenses</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '10px' }}>Date</th>
                        <th style={{ padding: '10px' }}>Category</th>
                        <th style={{ padding: '10px' }}>Amount (PKR)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.length === 0 ? (
                        <tr><td colSpan="3" style={{ padding: '15px', textAlign: 'center', color: '#94a3b8' }}>No expenses logged yet.</td></tr>
                      ) : (
                        expenses.slice(-5).reverse().map(ex => (
                          <tr key={ex.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px', color: '#64748b' }}>{ex.date ? ex.date.split('T')[0] : '-'}</td>
                            <td style={{ padding: '10px', fontWeight: '700', color: '#0f172a' }}>{ex.category}</td>
                            <td style={{ padding: '10px', color: '#dc2626', fontWeight: '700' }}>Rs. {ex.amount.toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'inventory' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>Stock & Regional Pricing (Stock in Dozens & Pairs)</h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              <div style={{ backgroundColor: stockTotals.totalPairs < 0 ? '#fef2f2' : '#f0fdf4', border: stockTotals.totalPairs < 0 ? '1px solid #fecaca' : '1px solid #bbf7d0', padding: '16px 18px', borderRadius: '8px' }}>
                <p style={{ margin: 0, fontSize: '11px', fontWeight: '700', color: stockTotals.totalPairs < 0 ? '#991b1b' : '#15803d', letterSpacing: '0.5px' }}>TOTAL STOCK (DOZENS)</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '22px', fontWeight: '800', color: stockTotals.totalPairs < 0 ? '#dc2626' : '#16a34a' }}>{stockTotals.totalDozens.toFixed(2)} Dozens</p>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>({stockTotals.totalPairs.toLocaleString()} pairs)</p>
              </div>
              <div style={{ backgroundColor: '#faf5f8', border: '1px solid #f0d8ec', padding: '16px 18px', borderRadius: '8px' }}>
                <p style={{ margin: 0, fontSize: '11px', fontWeight: '700', color: '#714B67', letterSpacing: '0.5px' }}>TOTAL INVENTORY VALUE</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '22px', fontWeight: '800', color: '#714B67' }}>Rs. {totalInventoryValue.toLocaleString()}</p>
              </div>
              <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '16px 18px', borderRadius: '8px' }}>
                <p style={{ margin: 0, fontSize: '11px', fontWeight: '700', color: '#1d4ed8', letterSpacing: '0.5px' }}>ARTICLES / VARIANTS</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '22px', fontWeight: '800', color: '#2563eb' }}>{stockTotals.uniqueArticles} / {stockTotals.variantCount}</p>
              </div>
            </div>

            <form onSubmit={handleAddInventory} style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              <input type="text" placeholder="Article Number" value={newItem.articleNumber} onChange={e=>setNewItem({...newItem, articleNumber: e.target.value})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box' }} required />
              <input type="text" placeholder="Size (e.g. 42)" value={newItem.size} onChange={e=>setNewItem({...newItem, size: e.target.value})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box' }} />
              <input type="text" placeholder="Color" value={newItem.color} onChange={e=>setNewItem({...newItem, color: e.target.value})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box' }} />
              <input type="number" placeholder="Initial Qty (Pairs)" value={newItem.qty} onChange={e=>setNewItem({...newItem, qty: e.target.value})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box' }} required />
              <input type="number" placeholder="Punjab Price / Pair" value={newItem.pricePunjab} onChange={e=>setNewItem({...newItem, pricePunjab: e.target.value})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box' }} required />
              <input type="number" placeholder="Sindh Price / Pair" value={newItem.priceSindh} onChange={e=>setNewItem({...newItem, priceSindh: e.target.value})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box' }} required />
              <div style={{ display: 'flex', gap: '8px', gridColumn: 'span full' }}>
                <button type="button" onClick={handleCreateParentArticle} style={{ backgroundColor: '#0f766e', color: '#ffffff', fontWeight: '700', border: 'none', borderRadius: '6px', padding: '10px', cursor: 'pointer', fontSize: '14px' }}>+ Create Parent Article</button>
                <button type="submit" style={{ flex: 1, backgroundColor: '#714B67', color: '#ffffff', fontWeight: '700', border: 'none', borderRadius: '6px', padding: '10px', cursor: 'pointer', fontSize: '14px' }}>+ Add Child Variant</button>
              </div>
            </form>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '850px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <th style={{ padding: '14px' }}>ID</th>
                    <th style={{ padding: '14px' }}>Article Number</th>
                    <th style={{ padding: '14px' }}>Size & Color</th>
                    <th style={{ padding: '14px' }}>Stock (Dozens & Pairs)</th>
                    <th style={{ padding: '14px' }}>Punjab / Pair</th>
                    <th style={{ padding: '14px' }}>Sindh / Pair</th>
                    <th style={{ padding: '14px', textAlign: 'center' }}>Manage Inventory (Update / Delete)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(inventoryByArticle).flatMap(([articleNumber, variants]) => [
                    <tr key={`article-${articleNumber}`} style={{ backgroundColor: '#ede9fe', borderBottom: '1px solid #ddd6fe' }}>
                      <td colSpan="7" style={{ padding: '10px 14px', fontWeight: '800', color: '#5b21b6' }}>
                        Parent Article: {articleNumber} <span style={{ fontWeight: '600', color: '#6b7280' }}>({variants.length} child variant{variants.length === 1 ? '' : 's'})</span>
                      </td>
                    </tr>,
                    ...variants.map(item => {
                    const inputVal = updateStockInputs[item.id] || '';
                    const totalPairs = numberOrZero(item.trueStock);
                    const dozensCount = (totalPairs / 12).toFixed(2);
                    const isNegative = totalPairs < 0;
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '14px' }}>
                        <td style={{ padding: '14px', fontWeight: '700', color: '#714B67' }}>#{item.id}</td>
                        <td style={{ padding: '14px', fontWeight: '700', color: '#0f172a' }}>{item.articleNumber || item.model}</td>
                        <td style={{ padding: '14px', color: '#475569' }}>{item.size || 'N/A'} | {item.color || 'N/A'}</td>
                        <td style={{ padding: '14px', color: isNegative ? '#dc2626' : '#16a34a', fontWeight: '700' }}>
                          {dozensCount} dozens <span style={{ fontSize: '12px', color: isNegative ? '#dc2626' : '#64748b', fontWeight: 'normal' }}>({totalPairs} pairs)</span>
                          {isNegative && <span style={{ marginLeft: '8px', fontSize: '11px', backgroundColor: '#fee2e2', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>NEGATIVE</span>}
                        </td>
                        <td style={{ padding: '14px', color: '#0f172a', fontWeight: '600' }}>Rs. {(item.pricePunjab !== undefined && item.pricePunjab !== null ? item.pricePunjab : (item.price || 0)).toLocaleString()}</td>
                        <td style={{ padding: '14px', color: '#2563eb', fontWeight: '600' }}>Rs. {(item.priceSindh !== undefined && item.priceSindh !== null ? item.priceSindh : (item.price || 0)).toLocaleString()}</td>
                        <td style={{ padding: '14px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                              type="number"
                              placeholder="+ Pairs"
                              value={inputVal}
                              onChange={e => setUpdateStockInputs({...updateStockInputs, [item.id]: e.target.value})}
                              style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '75px', fontSize: '13px' }}
                            />
                            <input
                              type="number"
                              placeholder="New Punjab"
                              value={updatePriceInputs[item.id]?.punjab || ''}
                              onChange={e => setUpdatePriceInputs({ ...updatePriceInputs, [item.id]: { ...(updatePriceInputs[item.id] || {}), punjab: e.target.value } })}
                              style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '85px', fontSize: '13px' }}
                            />
                            <input
                              type="number"
                              placeholder="New Sindh"
                              value={updatePriceInputs[item.id]?.sindh || ''}
                              onChange={e => setUpdatePriceInputs({ ...updatePriceInputs, [item.id]: { ...(updatePriceInputs[item.id] || {}), sindh: e.target.value } })}
                              style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '85px', fontSize: '13px' }}
                            />
                            <button
                              onClick={() => handleUpdateInventoryStock(item)}
                              style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '7px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}
                            >
                              Update
                            </button>
                            <button
                              onClick={() => handleUpdateInventoryPrice(item)}
                              style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '7px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}
                            >
                              Save Price
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(item.id)}
                              style={{ backgroundColor: '#dc2626', color: '#fff', border: 'none', padding: '7px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                    })
                  ])}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'stockreport' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>📦 Stock Inventory Report (Dozens)</h2>
              <button
                onClick={handlePrintStockReport}
                style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '13px' }}
              >
                🖨️ Print / Save Stock Report PDF
              </button>
            </div>

            <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ marginBottom: '20px' }}>
                <input
                  type="text"
                  placeholder="🔍 Filter by article number, size, or color..."
                  value={stockReportSearch}
                  onChange={e => setStockReportSearch(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ backgroundColor: filteredStockTotals.totalDozens < 0 ? '#fef2f2' : '#f0fdf4', border: filteredStockTotals.totalDozens < 0 ? '1px solid #fecaca' : '1px solid #bbf7d0', padding: '18px', borderRadius: '8px', marginBottom: '25px', maxWidth: '360px' }}>
                <p style={{ margin: '0 0 5px 0', fontSize: '12px', fontWeight: '700', color: filteredStockTotals.totalDozens < 0 ? '#991b1b' : '#15803d' }}>GRAND TOTAL FACTORY STOCK</p>
                <p style={{ margin: 0, fontSize: '24px', fontWeight: '800', color: filteredStockTotals.totalDozens < 0 ? '#dc2626' : '#16a34a' }}>
                  {filteredStockTotals.totalDozens.toFixed(2)} Dozens
                </p>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>({filteredStockTotals.totalPairs.toLocaleString()} pairs)</p>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>
                      <th style={{ padding: '12px' }}>ID</th>
                      <th style={{ padding: '12px' }}>Article Number</th>
                      <th style={{ padding: '12px' }}>Size & Color</th>
                      <th style={{ padding: '12px' }}>Stock (Dozens)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStockInventory.length === 0 ? (
                      <tr><td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No inventory stock matches the filter.</td></tr>
                    ) : (
                      filteredStockInventory.map(item => {
                        const pairs = Number(item.trueStock || 0);
                        const dozens = (pairs / 12).toFixed(2);
                        const isNegative = pairs < 0;
                        return (
                          <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '14px' }}>
                            <td style={{ padding: '12px', fontWeight: '700', color: '#714B67' }}>#{item.id}</td>
                            <td style={{ padding: '12px', fontWeight: '700', color: '#0f172a' }}>{item.articleNumber || item.model}</td>
                            <td style={{ padding: '12px', color: '#475569' }}>{item.size || 'N/A'} | {item.color || 'N/A'}</td>
                            <td style={{ padding: '12px', fontWeight: '800', color: isNegative ? '#dc2626' : '#16a34a' }}>
                              {dozens} Dozens
                              {isNegative && <span style={{ marginLeft: '8px', fontSize: '11px', backgroundColor: '#fee2e2', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>NEGATIVE</span>}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'search' && (
          <div style={{ maxWidth: '700px', margin: '30px auto', backgroundColor: '#ffffff', padding: '30px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '8px', color: '#1e293b' }}>Live Inventory Search</h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>Type an article no, size, or color to check stock availability and regional pricing directly.</p>

            <input
              type="text"
              placeholder="Search by article no, size, or color..."
              onChange={(e) => {
                const query = e.target.value.toLowerCase();
                const resultsContainer = document.getElementById('search-results-list');
                const rows = resultsContainer.getElementsByClassName('search-item-row');

                Array.from(rows).forEach(row => {
                  const text = row.getAttribute('data-search').toLowerCase();
                  row.style.display = text.includes(query) ? '' : 'none';
                });
              }}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px', boxSizing: 'border-box', marginBottom: '20px' }}
            />

            <div style={{ borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>
                    <th style={{ padding: '12px' }}>ID & Article No</th>
                    <th style={{ padding: '12px' }}>Stock (Dozens)</th>
                    <th style={{ padding: '12px' }}>Punjab Price / Pair</th>
                    <th style={{ padding: '12px' }}>Sindh Price / Pair</th>
                  </tr>
                </thead>
                <tbody id="search-results-list">
                  {inventoryWithTrueStock.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No inventory loaded or stock is empty.</td>
                    </tr>
                  ) : (
                    inventoryWithTrueStock.map(item => {
                      const pairs = Number(item.trueStock || 0);
                      const dozens = (pairs / 12).toFixed(2);
                      const isNegative = pairs < 0;
                      return (
                        <tr
                          key={item.id}
                          className="search-item-row"
                          data-search={`${item.id} ${item.articleNumber || item.model} ${item.model} ${item.size} ${item.color}`}
                          style={{ borderBottom: '1px solid #f1f5f9', fontSize: '14px' }}
                        >
                          <td style={{ padding: '12px', fontWeight: '700', color: '#0f172a' }}>#{item.id} - {item.articleNumber || item.model} / {item.model} ({item.size || 'N/A'}{item.color ? `, ${item.color}` : ''})</td>
                          <td style={{ padding: '12px' }}>
                            <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '700', backgroundColor: isNegative ? '#fee2e2' : (pairs > 0 ? '#dcfce7' : '#fef3c7'), color: isNegative ? '#dc2626' : (pairs > 0 ? '#15803d' : '#92400e') }}>
                              {isNegative ? `${dozens} dozens (${pairs} pairs) NEGATIVE` : (pairs > 0 ? `${dozens} dozens (${pairs} pairs)` : 'Out of stock')}
                            </span>
                          </td>
                          <td style={{ padding: '12px', fontWeight: '600', color: '#0f172a' }}>Rs. {(item.pricePunjab !== undefined && item.pricePunjab !== null ? item.pricePunjab : (item.price || 0)).toLocaleString()}</td>
                          <td style={{ padding: '12px', fontWeight: '600', color: '#2563eb' }}>Rs. {(item.priceSindh !== undefined && item.priceSindh !== null ? item.priceSindh : (item.price || 0)).toLocaleString()}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'customers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>Customer Accounts, Unique IDs & Remaining Balance</h2>
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '10px 18px', borderRadius: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#991b1b', textTransform: 'uppercase' }}>Total Money in Market: </span>
                <span style={{ fontSize: '16px', fontWeight: '800', color: '#dc2626' }}>Rs. {totalMarketDues.toLocaleString()}</span>
              </div>
            </div>

            <form onSubmit={handleAddCustomer} style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <input type="text" placeholder="Customer Name / Shop" value={newCust.name} onChange={e=>setNewCust({...newCust, name: e.target.value})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box' }} required />
              <input type="text" placeholder="Description / Reference (optional)" value={newCust.description || ''} onChange={e=>setNewCust({...newCust, description: e.target.value || null})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box' }} />
              <select value={newCust.region} onChange={e=>setNewCust({...newCust, region: e.target.value})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', backgroundColor: '#fff', color: '#0f172a', width: '100%', boxSizing: 'border-box' }}>
                <option value="Punjab">Punjab Region</option>
                <option value="Sindh">Sindh Region</option>
              </select>
              <input type="number" placeholder="Opening Balance" value={newCust.balance} onChange={e=>setNewCust({...newCust, balance: e.target.value})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box' }} />
              <button type="submit" style={{ backgroundColor: '#714B67', color: '#ffffff', fontWeight: '700', border: 'none', borderRadius: '6px', padding: '10px', cursor: 'pointer', fontSize: '14px', gridColumn: 'span full' }}>+ Register Customer (Auto-Generate Unique ID)</button>
            </form>

            <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '850px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <th style={{ padding: '14px' }}>Customer Name</th>
                    <th style={{ padding: '14px' }}>Unique ID</th>
                    <th style={{ padding: '14px' }}>Description / Reference</th>
                    <th style={{ padding: '14px' }}>Region</th>
                    <th style={{ padding: '14px' }}>Total Billed</th>
                    <th style={{ padding: '14px' }}>Total Paid</th>
                    <th style={{ padding: '14px', backgroundColor: '#fdf4ff', color: '#714B67' }}>Remaining Balance (Net Due)</th>
                    <th style={{ padding: '14px', textAlign: 'center' }}>Receive Cash</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map(c => {
                    const customerBills = sales.filter(s => s.customerId === c.phone);
                    const customerPayments = payments.filter(p => p.customerId === c.phone || p.customer === c.name);

                    const totalBilled = customerBills.reduce((acc, b) => acc + b.total, 0);
                    const totalPaid = customerPayments.reduce((acc, p) => acc + p.amount, 0);

                    const remainingBalance = Number(c.balance) + totalBilled - totalPaid;
                    const isAdvance = remainingBalance < 0;
                    const typedAmount = paymentInputs[c.id] || '';

                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '14px' }}>
                        <td style={{ padding: '14px', fontWeight: '700', color: '#0f172a' }}>{c.name}</td>
                        <td style={{ padding: '14px', color: '#2563eb', fontWeight: '600' }}>{c.phone || 'N/A'}</td>
                        <td style={{ padding: '14px' }}>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input
                              type="text"
                              placeholder="Add description / reference"
                              value={customerDescriptionInputs[c.id] ?? c.description ?? ''}
                              onChange={e => setCustomerDescriptionInputs({ ...customerDescriptionInputs, [c.id]: e.target.value })}
                              style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '190px', fontSize: '13px' }}
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateCustomerDescription(c)}
                              style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '7px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}
                            >
                              Save
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: '14px', color: '#475569', fontWeight: '600' }}>{c.region || 'Punjab'}</td>
                        <td style={{ padding: '14px', color: '#1e293b', fontWeight: '600' }}>Rs. {totalBilled.toLocaleString()}</td>
                        <td style={{ padding: '14px', color: '#16a34a', fontWeight: '600' }}>Rs. {totalPaid.toLocaleString()}</td>
                        <td style={{ padding: '14px', backgroundColor: '#faf5f8', fontWeight: '800', color: isAdvance ? '#0284c7' : '#dc2626', fontSize: '15px' }}>
                          {isAdvance ? `Adv: Rs. ${Math.abs(remainingBalance).toLocaleString()}` : `Rs. ${remainingBalance.toLocaleString()}`}
                        </td>
                        <td style={{ padding: '14px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                            <input
                              type="number"
                              placeholder="Amount"
                              value={typedAmount}
                              onChange={e => setPaymentInputs({...paymentInputs, [c.id]: e.target.value})}
                              style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '90px', fontSize: '13px' }}
                            />
                            <button
                              onClick={() => {
                                const amount = Number(typedAmount);
                                if (!amount || isNaN(amount) || amount <= 0) {
                                  alert("Please enter a valid cash amount.");
                                  return;
                                }

                              const newPaymentRecord = {
  customerId: c.phone, // or c.id depending on your Customer model definition
  customer: c.name,
  amount: Number(amount),
  date: new Date().toISOString()
}

axios.post(`${API_BASE_URL}/api/payments`, newPaymentRecord, { headers: { Authorization: `Bearer ${token}` } })
  .then(response => {
    setPayments(prev => [...prev, response.data]);
    setPaymentInputs({...paymentInputs, [c.id]: ''});
    fetchAllData(); // Instantly updates the ledger and balances
  })
  .catch(err => {
    console.error('Error saving payment:', err.response?.data || err)
    alert('Failed to save payment to the database.')
  })
                                axios.post(`${API_BASE_URL}/api/payments`, newPaymentRecord, { headers: { Authorization: `Bearer ${token}` } })
                                  .then(response => {
                                    setPayments(prev => [...prev, response.data]);
                                    setPaymentInputs({...paymentInputs, [c.id]: ''});
                                    fetchAllData(); // Instantly syncs ledger and payments data
                                  })
                                  .catch(err => {
                                    console.error('Error saving payment:', err)
                                    alert('Failed to save payment to the database.')
                                  })
                              }}
                              style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '7px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}
                            >
                              Save
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>گاہک کی ہفتہ وار یا کسٹم رپورٹ جنریٹر (Customer Report Generator)</h2>

            <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>گاہک منتخب کریں (Select Customer)</label>
                  <select
                    value={reportCustId}
                    onChange={e => setReportCustId(e.target.value)}
                    style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', backgroundColor: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="">-- گاہک منتخب کریں --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id.toString()}>{c.name} (ID: {c.phone})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>شروع کی تاریخ (Start Date)</label>
                  <input
                    type="date"
                    value={reportStartDate}
                    onChange={e => setReportStartDate(e.target.value)}
                    style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>آخری تاریخ (End Date)</label>
                  <input
                    type="date"
                    value={reportEndDate}
                    onChange={e => setReportEndDate(e.target.value)}
                    style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {!reportCustId ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                  براہ کرم رپورٹ دیکھنے کے لیے اوپر دیے گئے مینو سے کوئی گاہک منتخب کریں۔
                </div>
              ) : (() => {
                const selectedCust = customers.find(c => c.id.toString() === reportCustId);
                if (!selectedCust) return null;

                const periodSales = sales.filter(s => s.customerId === selectedCust.phone && s.date >= reportStartDate && s.date <= reportEndDate);
                const periodPayments = payments.filter(p => (p.customerId === selectedCust.phone || p.customer === selectedCust.name) && p.date >= reportStartDate && p.date <= reportEndDate);

                const allTimeBills = sales.filter(s => s.customerId === selectedCust.phone).reduce((acc, b) => acc + b.total, 0);
                const allTimePayments = payments.filter(p => p.customerId === selectedCust.phone || p.customer === selectedCust.name).reduce((acc, p) => acc + p.amount, 0);
                const netDue = Number(selectedCust.balance) + allTimeBills - allTimePayments;

                const totalBilledPeriod = periodSales.reduce((acc, s) => acc + s.total, 0);
                const totalPaidPeriod = periodPayments.reduce((acc, p) => acc + p.amount, 0);

                return (
                  <div style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', marginBottom: '20px', backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div>
                        <h3 style={{ margin: '0 0 5px 0', color: '#1e293b' }}>{selectedCust.name} <span style={{ fontSize: '13px', color: '#2563eb' }}>({selectedCust.phone})</span></h3>
                        <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>علاقہ: {selectedCust.region || 'Punjab'} | مدت: {reportStartDate} سے {reportEndDate}</p>
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          onClick={() => handlePrintCustomerReport(selectedCust, periodSales, periodPayments, 0, netDue)}
                          style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '13px' }}
                        >
                          🖨️ پرنٹ / PDF رپورٹ
                        </button>
                        <button
                          onClick={() => handleSendReportWhatsApp(selectedCust, periodSales, periodPayments, netDue)}
                          style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '13px' }}
                        >
                          💬 واٹس ایپ پر بھیجیں
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                      <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '15px', borderRadius: '8px' }}>
                        <p style={{ margin: '0 0 5px 0', fontSize: '12px', fontWeight: '700', color: '#15803d' }}>اس مدت میں کل بلنگ (Billed)</p>
                        <p style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#16a34a' }}>Rs. {totalBilledPeriod.toLocaleString()}</p>
                      </div>
                      <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '15px', borderRadius: '8px' }}>
                        <p style={{ margin: '0 0 5px 0', fontSize: '12px', fontWeight: '700', color: '#1d4ed8' }}>اس مدت میں وصولی (Paid)</p>
                        <p style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#2563eb' }}>Rs. {totalPaidPeriod.toLocaleString()}</p>
                      </div>
                      <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '15px', borderRadius: '8px' }}>
                        <p style={{ margin: '0 0 5px 0', fontSize: '12px', fontWeight: '700', color: '#991b1b' }}>کل بقایا رقم (Total Net Dues)</p>
                        <p style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#dc2626' }}>Rs. {netDue.toLocaleString()}</p>
                      </div>
                    </div>

                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#475569' }}>اس مدت کے تمام بلز اور ادائیگیاں</h4>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f1f5f9', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                            <th style={{ padding: '10px' }}>تاریخ</th>
                            <th style={{ padding: '10px' }}>قسم (Type)</th>
                            <th style={{ padding: '10px' }}>رقم (PKR)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {periodSales.length === 0 && periodPayments.length === 0 ? (
                            <tr><td colSpan="3" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>اس منتخب کردہ مدت میں کوئی لین دین نہیں ہوا۔</td></tr>
                          ) : (
                            <>
                              {periodSales.map(s => (
                                <tr key={`s-${s.id}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '10px' }}>{s.date}</td>
                                  <td style={{ padding: '10px', fontWeight: '600' }}>بل نمبر #${s.id} (${s.region || 'Punjab'}) - ترانسپورٹ: {s.transportCompany || 'N/A'}, بلٹی: {s.builtyNo || 'N/A'}</td>
                                  <td style={{ padding: '10px', color: '#16a34a', fontWeight: '700' }}>+ Rs. {s.total.toLocaleString()}</td>
                                </tr>
                              ))}
                              {periodPayments.map(p => (
                                <tr key={`p-${p.id}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '10px' }}>{p.date}</td>
                                  <td style={{ padding: '10px', fontWeight: '600' }}>نقد وصولی (Cash Payment)</td>
                                  <td style={{ padding: '10px', color: '#2563eb', fontWeight: '700' }}>- Rs. {p.amount.toLocaleString()}</td>
                                </tr>
                              ))}
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {activeTab === 'sales' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>Wholesale Multi-Item Billing & Invoicing</h2>
              <button
                type="button"
                onClick={handleDeleteSelectedBills}
                disabled={selectedSaleIds.length === 0}
                style={{ backgroundColor: selectedSaleIds.length === 0 ? '#cbd5e1' : '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 12px', cursor: selectedSaleIds.length === 0 ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '12px' }}
              >
                Delete Selected Bills ({selectedSaleIds.length})
              </button>
              <button
                type="button"
                onClick={handleDownloadSelectedBills}
                disabled={selectedSaleIds.length === 0}
                style={{ backgroundColor: selectedSaleIds.length === 0 ? '#cbd5e1' : '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 12px', cursor: selectedSaleIds.length === 0 ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '12px' }}
              >
                Download Selected Bills ({selectedSaleIds.length})
              </button>
              <button
                type="button"
                onClick={handlePrintSelectedBills}
                disabled={selectedSaleIds.length === 0}
                style={{ backgroundColor: selectedSaleIds.length === 0 ? '#cbd5e1' : '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 12px', cursor: selectedSaleIds.length === 0 ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '12px' }}
              >
                Print Selected Bills ({selectedSaleIds.length})
              </button>
            </div>

            <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '5px' }}>Select Customer / Shop</label>
                  <select
                    value={selectedCustomerId}
                    onChange={e => {
                      const custId = e.target.value;
                      setSelectedCustomerId(custId);
                      const found = customers.find(c => c.id.toString() === custId.toString());
                      if (found) {
                        setSaleCustomerName(found.name);
                        setSaleCustomerUniqueId(found.phone);
                        setSaleCustomerRegion(found.region || 'Punjab');

                        const updatedCart = cartItems.map(item => {
                          const prod = inventory.find(p => p.id.toString() === item.productId.toString())
                          if (prod) {
                            const p = getProductPrice(prod, found.region || 'Punjab')
                            return { ...item, price: p }
                          }
                          return item
                        })
                        setCartItems(updatedCart);
                      } else {
                        setSaleCustomerName('');
                        setSaleCustomerUniqueId('');
                      }
                    }}
                    style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', backgroundColor: '#fff', color: '#0f172a', width: '100%', boxSizing: 'border-box' }}
                    required
                  >
                    <option value="">-- Choose Customer from Dropdown --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id.toString()}>
                        {c.name} (ID: {c.phone})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '5px' }}>Unique ID (Auto-Filled)</label>
                  <input
                    type="text"
                    placeholder="Auto-filled Unique ID..."
                    value={saleCustomerUniqueId}
                    readOnly
                    style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontWeight: '700', color: '#2563eb' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '5px' }}>Region (Auto-Applies Regional Price)</label>
                  <select
                    value={saleCustomerRegion}
                    onChange={e => {
                      const newReg = e.target.value;
                      setSaleCustomerRegion(newReg);
                      const updatedCart = cartItems.map(item => {
                        const prod = inventory.find(p => p.id.toString() === item.productId.toString())
                        if (prod) {
                          const p = getProductPrice(prod, newReg)
                          return { ...item, price: p }
                        }
                        return item
                      })
                      setCartItems(updatedCart)
                    }}
                    style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', backgroundColor: '#fff', color: '#0f172a', width: '100%', boxSizing: 'border-box' }}
                  >
                    <option value="Punjab">Punjab Region</option>
                    <option value="Sindh">Sindh Region</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '5px' }}>Transport Company</label>
                  <input
                    type="text"
                    placeholder="e.g. Niazi Express / Daewoo"
                    value={transportCompany}
                    onChange={e => setTransportCompany(e.target.value)}
                    style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '5px' }}>Builty Number</label>
                  <input
                    type="text"
                    placeholder="e.g. B-98421"
                    value={builtyNo}
                    onChange={e => setBuiltyNo(e.target.value)}
                    style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <h4 style={{ margin: '15px 0 10px 0', fontSize: '14px', color: '#475569' }}>Cart Line Items (Article, Qty & Bill Rate)</h4>

              {cartItems.map((item, index) => {
                const multiplier = item.unitType === 'dozens' ? 12 : 1;
                const pairs = Number(item.qty || 0) * multiplier;
                const lineTotal = pairs * Number(item.price || 0);

                return (
                  <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <select
                      value={item.productId ? item.productId.toString() : ''}
                      onChange={e => handleCartItemChange(index, 'productId', e.target.value)}
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', flex: '2', minWidth: '200px', backgroundColor: '#fff', color: '#0f172a' }}
                      required
                    >
                      <option value="">-- Select Article No & ID --</option>
                      {inventory.map(p => (
                        <option key={p.id} value={p.id.toString()}>
                          ID: #{p.id} | Article: {p.articleNumber || p.model} | {p.model} (Size: {p.size || 'N/A'}{p.color ? `, ${p.color}` : ''}) — Stock: {p.qty || 0} pairs
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      placeholder="Qty"
                      value={item.qty}
                      onChange={e => handleCartItemChange(index, 'qty', e.target.value)}
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '65px' }}
                      required
                    />
                    <select
                      value={item.unitType}
                      onChange={e => handleCartItemChange(index, 'unitType', e.target.value)}
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', backgroundColor: '#fff', color: '#0f172a' }}
                    >
                      <option value="dozens">Dozens (12x)</option>
                      <option value="pairs">Pairs (1x)</option>
                    </select>

                    <input
                      type="text"
                      value={item.price === '' ? '' : `Rs. ${Number(item.price).toLocaleString()} / pair`}
                      placeholder="Price from product"
                      readOnly
                      aria-label="Product price per pair"
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', color: '#475569', fontSize: '13px', fontWeight: '600', width: '130px' }}
                    />

                    <span style={{ fontSize: '13px', fontWeight: '700', width: '110px', color: '#16a34a' }}>
                      Bill Rate: Rs. {lineTotal.toLocaleString()}
                    </span>

                    {cartItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCartRow(index)}
                        style={{ backgroundColor: '#dc2626', color: '#fff', border: 'none', padding: '8px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )
              })}

              <button
                type="button"
                onClick={addCartRow}
                style={{ backgroundColor: '#f1f5f9', color: '#475569', border: '1px dashed #cbd5e1', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', marginTop: '5px', marginBottom: '20px' }}
              >
                + Add Another Article
              </button>

              <div style={{ textAlign: 'right', borderTop: '1px solid #e2e8f0', paddingTop: '15px' }}>
                <button
                  onClick={handleGenerateMultiItemBill}
                  style={{ backgroundColor: '#714B67', color: '#ffffff', fontWeight: '700', border: 'none', borderRadius: '6px', padding: '12px 24px', cursor: 'pointer', fontSize: '14px' }}
                >
                  Finalize Corporate Bill & Shift to Customer Khata
                </button>
              </div>

            </div>

            <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '750px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <th style={{ padding: '14px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={sales.length > 0 && selectedSaleIds.length === sales.length}
                        onChange={handleToggleAllSales}
                        aria-label="Select all bills"
                      />
                    </th>
                    <th style={{ padding: '14px' }}>Date</th>
                    <th style={{ padding: '14px' }}>Invoice No.</th>
                    <th style={{ padding: '14px' }}>Customer (ID)</th>
                    <th style={{ padding: '14px' }}>Region</th>
                    <th style={{ padding: '14px' }}>Transport & Builty</th>
                    <th style={{ padding: '14px' }}>Bill Rate / Total</th>
                    <th style={{ padding: '14px', textAlign: 'center' }}>Action / Update Info</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map(s => {
                    const isEditing = editingSaleId === s.id;
                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '14px' }}>
                        <td style={{ padding: '14px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedSaleIds.includes(s.id)}
                            onChange={() => handleToggleSaleSelection(s.id)}
                            aria-label={`Select bill ${getInvoiceNumber(s)}`}
                          />
                        </td>
                        <td style={{ padding: '14px', color: '#64748b' }}>{s.date}</td>
                        <td style={{ padding: '14px', color: '#714B67', fontWeight: '700' }}>{getInvoiceNumber(s)}</td>
                        <td style={{ padding: '14px', fontWeight: '700', color: '#0f172a' }}>{s.customer} ({s.customerId})</td>
                        <td style={{ padding: '14px', color: '#475569' }}>{s.region || 'Punjab'}</td>
                        <td style={{ padding: '14px' }}>
                          {isEditing ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <input
                                type="text"
                                placeholder="Transport Company"
                                defaultValue={s.transportCompany}
                                onChange={e => setEditSaleInputs({...editSaleInputs, transportCompany: e.target.value})}
                                style={{ padding: '4px 6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                              />
                              <input
                                type="text"
                                placeholder="Builty No"
                                defaultValue={s.builtyNo}
                                onChange={e => setEditSaleInputs({...editSaleInputs, builtyNo: e.target.value})}
                                style={{ padding: '4px 6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                              />
                              <strong style={{ fontSize: '12px', marginTop: '6px' }}>Apply Discount Later</strong>
                              {(s.lineItems || []).map((item, index) => (
                                <label key={index} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                                  {item.model || `Item ${index + 1}`} (Size: {item.size || 'N/A'}):
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="Rs./pair"
                                    value={editSaleInputs.discountPerPair?.[index] ?? 0}
                                    onChange={e => setEditSaleInputs({
                                      ...editSaleInputs,
                                      discountPerPair: { ...editSaleInputs.discountPerPair, [index]: e.target.value }
                                    })}
                                    style={{ width: '75px', padding: '4px 6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                  />
                                </label>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: '13px', color: '#334155' }}>
                              🚚 <strong>{s.transportCompany || 'N/A'}</strong><br/>
                              📦 Builty: {s.builtyNo || 'N/A'}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '14px', color: '#16a34a', fontWeight: '700' }}>
                          Rs. {(s.discount > 0 ? s.total : (s.rawTotal || s.total)).toLocaleString()}
                          {s.discount > 0 && <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '3px' }}>Discount: Rs. {s.discount.toLocaleString()}</div>}
                        </td>
                        <td style={{ padding: '14px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button
                              onClick={() => handleViewPdfBill(s)}
                              style={{ backgroundColor: '#0f766e', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}
                            >
                              📄 View PDF Bill
                            </button>

                            {isEditing ? (
                              <button
                                onClick={() => handleUpdateSaleDetails(s.id)}
                                style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}
                              >
                                Save
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditingSaleId(s.id);
                                  setEditSaleInputs({
                                    transportCompany: s.transportCompany || '',
                                    builtyNo: s.builtyNo || '',
                                    discountPerPair: Object.fromEntries((s.lineItems || []).map((item, index) => [index, item.discountPerPair || 0]))
                                  });
                                }}
                                style={{ backgroundColor: '#64748b', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}
                              >
                                Edit Bill Details
                              </button>
                            )}
                            <button
                              onClick={() => handlePrintBill(s)}
                              style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}
                            >
                              Download / Print PDF
                            </button>
                            <button
                              onClick={() => handleSendWhatsAppBill(s)}
                              style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}
                            >
                              💬 WhatsApp
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'wages' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>Daily Wages & Worker Ledger</h2>
            <form onSubmit={handleAddWorker} style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <input type="text" placeholder="Worker name" value={newWorker.name} onChange={e => setNewWorker({ ...newWorker, name: e.target.value })} required style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <input type="text" placeholder="Phone" value={newWorker.phone} onChange={e => setNewWorker({ ...newWorker, phone: e.target.value })} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <input type="text" placeholder="Role / Work" value={newWorker.role} onChange={e => setNewWorker({ ...newWorker, role: e.target.value })} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <button type="submit" style={{ backgroundColor: '#714B67', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '700', cursor: 'pointer' }}>+ Add Worker</button>
            </form>

            <form onSubmit={handleAddWagePayment} style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <select value={newWagePayment.workerId} onChange={e => setNewWagePayment({ ...newWagePayment, workerId: e.target.value })} required style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                <option value="">Select worker</option>
                {workers.map(worker => <option key={worker.id} value={worker.id}>{worker.name} {worker.role ? `(${worker.role})` : ''}</option>)}
              </select>
              <input type="number" min="1" placeholder="Amount paid" value={newWagePayment.amount} onChange={e => setNewWagePayment({ ...newWagePayment, amount: e.target.value })} required style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <input type="date" value={newWagePayment.paymentDate} onChange={e => setNewWagePayment({ ...newWagePayment, paymentDate: e.target.value })} required style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <input type="text" placeholder="Notes" value={newWagePayment.notes} onChange={e => setNewWagePayment({ ...newWagePayment, notes: e.target.value })} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <button type="submit" style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '700', cursor: 'pointer' }}>+ Record Payment</button>
            </form>

            <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '650px' }}>
                <thead><tr style={{ backgroundColor: '#f1f5f9', fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}><th style={{ padding: '14px' }}>Date</th><th style={{ padding: '14px' }}>Worker</th><th style={{ padding: '14px' }}>Role</th><th style={{ padding: '14px' }}>Notes</th><th style={{ padding: '14px' }}>Amount Paid</th></tr></thead>
                <tbody>
                  {wagePayments.map(payment => <tr key={payment.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '14px' }}><td style={{ padding: '14px' }}>{payment.paymentDate ? payment.paymentDate.split('T')[0] : '-'}</td><td style={{ padding: '14px', fontWeight: '700' }}>{payment.worker?.name || workers.find(worker => worker.id === payment.workerId)?.name || 'Unknown'}</td><td style={{ padding: '14px' }}>{payment.worker?.role || workers.find(worker => worker.id === payment.workerId)?.role || '-'}</td><td style={{ padding: '14px' }}>{payment.notes || '-'}</td><td style={{ padding: '14px', color: '#dc2626', fontWeight: '700' }}>Rs. {Number(payment.amount || 0).toLocaleString()}</td></tr>)}
                  {wagePayments.length === 0 && <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>No wage payments recorded.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'expenses' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>Factory Expenditure</h2>
            <form onSubmit={handleAddExpense} style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
              <input type="text" placeholder="Category" value={newExp.category} onChange={e=>setNewExp({...newExp, category: e.target.value})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box' }} required />
              <input type="number" placeholder="Amount" value={newExp.amount} onChange={e=>setNewExp({...newExp, amount: e.target.value})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box' }} required />
              <input type="text" placeholder="Notes" value={newExp.notes} onChange={e=>setNewExp({...newExp, notes: e.target.value})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box' }} />
              <input type="date" value={newExp.date} onChange={e=>setNewExp({...newExp, date: e.target.value})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box' }} />
              <button type="submit" style={{ backgroundColor: '#714B67', color: '#ffffff', fontWeight: '700', border: 'none', borderRadius: '6px', padding: '10px', cursor: 'pointer', fontSize: '14px' }}>+ Log Expense</button>
            </form>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '450px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <th style={{ padding: '14px' }}>Date</th>
                    <th style={{ padding: '14px' }}>Category</th>
                    <th style={{ padding: '14px' }}>Notes</th>
                    <th style={{ padding: '14px' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(ex => (
                    <tr key={ex.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '14px' }}>
                      <td style={{ padding: '14px', color: '#64748b' }}>{ex.date ? ex.date.split('T')[0] : '-'}</td>
                      <td style={{ padding: '14px', fontWeight: '700', color: '#0f172a' }}>{ex.category}</td>
                      <td style={{ padding: '14px', color: '#475569' }}>{ex.notes || '-'}</td>
                      <td style={{ padding: '14px', color: '#dc2626', fontWeight: '700' }}>Rs. {ex.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'tours' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>Sales Rep Tour Accounting</h2>
            <form onSubmit={handleAddTour} style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
              <input type="text" placeholder="Representative" value={newTour.rep} onChange={e=>setNewTour({...newTour, rep: e.target.value})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box' }} required />
              <input type="text" placeholder="Region" value={newTour.region} onChange={e=>setNewTour({...newTour, region: e.target.value})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box' }} />
              <input type="number" placeholder="Tour Cost" value={newTour.cost} onChange={e=>setNewTour({...newTour, cost: e.target.value})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box' }} required />
              <input type="number" placeholder="Orders Booked" value={newTour.ordersValue} onChange={e=>setNewTour({...newTour, ordersValue: e.target.value})} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', boxSizing: 'border-box' }} />
              <button type="submit" style={{ backgroundColor: '#714B67', color: '#ffffff', fontWeight: '700', border: 'none', borderRadius: '6px', padding: '10px', cursor: 'pointer', fontSize: '14px' }}>+ Log Tour</button>
            </form>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '500px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: '12px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <th style={{ padding: '14px' }}>Representative</th>
                    <th style={{ padding: '14px' }}>Region</th>
                    <th style={{ padding: '14px' }}>Cost</th>
                    <th style={{ padding: '14px' }}>Orders</th>
                    <th style={{ padding: '14px' }}>ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {tours.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '14px' }}>
                      <td style={{ padding: '14px', fontWeight: '700', color: '#0f172a' }}>{t.rep}</td>
                      <td style={{ padding: '14px', color: '#475569' }}>{t.region}</td>
                      <td style={{ padding: '14px', color: '#dc2626', fontWeight: '600' }}>Rs. {t.cost.toLocaleString()}</td>
                      <td style={{ padding: '14px', color: '#16a34a', fontWeight: '600' }}>Rs. {t.ordersValue.toLocaleString()}</td>
                      <td style={{ padding: '14px', color: '#2563eb', fontWeight: '700' }}>{((t.ordersValue / (t.cost || 1))).toFixed(1)}x</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'pnl' && (
          <div style={{ maxWidth: '600px', margin: '30px auto', backgroundColor: '#ffffff', padding: '30px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
            <h2 style={{ textAlign: 'center', fontSize: '20px', fontWeight: '800', marginBottom: '24px', color: '#1e293b' }}>Profit & Loss Statement</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', fontSize: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#475569', fontWeight: '600' }}>Total Sales Revenue</span>
                <span style={{ fontWeight: '800', color: '#16a34a' }}>Rs. {totalSalesRevenue.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#475569', fontWeight: '600' }}>Total Factory Expenses</span>
                <span style={{ fontWeight: '800', color: '#dc2626' }}>- Rs. {totalExpenses.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '18px', backgroundColor: '#f8fafc', borderRadius: '8px', fontWeight: '800', fontSize: '18px', border: '1px solid #e2e8f0' }}>
                <span style={{ color: '#1e293b' }}>Net Profit / (Loss)</span>
                <span style={{ color: netProfit >= 0 ? '#16a34a' : '#dc2626' }}>Rs. {netProfit.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'balancesheet' && (
          <div style={{ maxWidth: '750px', margin: '30px auto', backgroundColor: '#ffffff', padding: '30px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
            <h2 style={{ textAlign: 'center', fontSize: '20px', fontWeight: '800', marginBottom: '24px', color: '#1e293b' }}>Factory Balance Sheet</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              <div style={{ backgroundColor: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ color: '#2563eb', fontSize: '16px', fontWeight: '800', margin: '0 0 14px 0', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>Assets</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '10px' }}>
                  <span style={{ color: '#64748b', fontWeight: '600' }}>Inventory Stock</span>
                  <span style={{ fontWeight: '700', color: '#0f172a' }}>Rs. {totalInventoryValue.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '10px' }}>
                  <span style={{ color: '#64748b', fontWeight: '600' }}>Stock in Dozens</span>
                  <span style={{ fontWeight: '700', color: stockTotals.totalDozens < 0 ? '#dc2626' : '#16a34a' }}>{stockTotals.totalDozens.toFixed(2)} Dozens</span>
                </div>
              </div>
              <div style={{ backgroundColor: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ color: '#dc2626', fontSize: '16px', fontWeight: '800', margin: '0 0 14px 0', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>Liabilities & Capital</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '10px' }}>
                  <span style={{ color: '#64748b', fontWeight: '600' }}>Advances / Payables</span>
                  <span style={{ fontWeight: '700', color: '#0f172a' }}>Rs. 5,000</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'pwa' && (
          <div style={{ maxWidth: '550px', margin: '40px auto', backgroundColor: '#ffffff', padding: '40px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', textAlign: 'center' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '12px', color: '#1e293b' }}>Mobile-Accessible PWA Ready</h2>
            <p style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.6', margin: 0 }}>
              Access your local network URL on your smartphone browser over Wi-Fi to test your responsive enterprise app on the go.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}