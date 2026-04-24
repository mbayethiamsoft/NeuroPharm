'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search, Plus, Minus, Trash2, ShoppingCart, CheckCircle, X, Loader2, Printer, UserPlus } from 'lucide-react'
import {
  printReceipt,
  formatReceiptNumber,
  type Receipt,
  type ReceiptPharmacy,
} from '@/lib/receipt'

interface CustomerOption {
  id: string
  fullName: string
  phone: string | null
  creditLimit: number
  balance: number
}

interface Medication {
  id: string
  name: string
  sellingPrice: number
  quantity: number        // total (warehouse + shelf)
  shelfQuantity: number   // sellable portion (rayons)
  barcode: string | null
}

interface CartItem {
  medication: Medication
  quantity: number
  unitPrice: number
  total: number
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(n)

export default function VentesPage() {
  const [medications, setMedications] = useState<Medication[]>([])
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [discount, setDiscount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [isPrescription, setIsPrescription] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [error, setError] = useState('')
  const [pharmacy, setPharmacy] = useState<ReceiptPharmacy | null>(null)
  const [lastReceipt, setLastReceipt] = useState<Receipt | null>(null)
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [customersLoading, setCustomersLoading] = useState(false)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [newCustomerForm, setNewCustomerForm] = useState({
    fullName: '',
    phone: '',
    creditLimit: '',
  })
  const [newCustomerError, setNewCustomerError] = useState('')
  const [newCustomerSaving, setNewCustomerSaving] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.pharmacy) return
        const p = d.pharmacy
        setPharmacy({
          name: p.name,
          address: p.address ?? null,
          city: p.city ?? null,
          phone: p.phone ?? null,
          email: p.email ?? null,
          taxId: p.taxId ?? null,
        })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (search.length >= 1) {
      fetch(`/api/medications?search=${encodeURIComponent(search)}&limit=10`)
        .then(r => r.json())
        .then(d => setMedications(d.medications || []))
    } else {
      fetch('/api/medications?limit=20')
        .then(r => r.json())
        .then(d => setMedications(d.medications || []))
    }
  }, [search])

  const loadCustomers = async () => {
    setCustomersLoading(true)
    try {
      const res = await fetch('/api/customers?limit=500')
      if (res.ok) {
        const data = await res.json()
        setCustomers(data.customers || [])
      }
    } finally {
      setCustomersLoading(false)
    }
  }

  useEffect(() => {
    if (paymentMethod === 'CREDIT' && customers.length === 0 && !customersLoading) {
      loadCustomers()
    }
    // Reset selection when switching away from CREDIT
    if (paymentMethod !== 'CREDIT') {
      setSelectedCustomerId('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod])

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  )

  // Auto-match an existing customer by phone (or name) when switching to CREDIT
  // so the user doesn't have to re-enter someone they already typed above.
  useEffect(() => {
    if (paymentMethod !== 'CREDIT') return
    if (selectedCustomerId) return
    if (customers.length === 0) return
    const phone = customerPhone.trim()
    const name = customerName.trim().toLowerCase()
    let match: CustomerOption | undefined
    if (phone) match = customers.find((c) => c.phone && c.phone.trim() === phone)
    if (!match && name) match = customers.find((c) => c.fullName.toLowerCase() === name)
    if (match) setSelectedCustomerId(match.id)
  }, [paymentMethod, customers, customerPhone, customerName, selectedCustomerId])

  // Sync the selected customer back into the optional fields above so the
  // receipt carries the right name/phone and the user gets visual confirmation.
  useEffect(() => {
    if (!selectedCustomer) return
    setCustomerName(selectedCustomer.fullName)
    setCustomerPhone(selectedCustomer.phone || '')
  }, [selectedCustomer])

  const openNewCustomerModal = () => {
    setNewCustomerForm({
      fullName: customerName.trim(),
      phone: customerPhone.trim(),
      creditLimit: '',
    })
    setNewCustomerError('')
    setShowCustomerModal(true)
  }

  const handleCreateCustomer = async () => {
    setNewCustomerError('')
    const fullName = newCustomerForm.fullName.trim()
    if (!fullName) {
      setNewCustomerError('Nom requis')
      return
    }
    const phone = newCustomerForm.phone.trim()

    // If a customer with this phone is already loaded, just select it instead of
    // hitting the API for nothing.
    if (phone) {
      const existing = customers.find((c) => c.phone && c.phone.trim() === phone)
      if (existing) {
        setSelectedCustomerId(existing.id)
        setShowCustomerModal(false)
        setNewCustomerForm({ fullName: '', phone: '', creditLimit: '' })
        return
      }
    }

    setNewCustomerSaving(true)
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          phone: phone || null,
          creditLimit: Number(newCustomerForm.creditLimit) || 0,
        }),
      })
      const data = await res.json()

      // Phone conflict (API returns 409) → refresh, find the existing customer,
      // and auto-select it. The user gets the same outcome as creating a fresh one.
      if (res.status === 409 && phone) {
        const refreshed = await fetch('/api/customers?limit=500')
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
        const list: CustomerOption[] = refreshed?.customers || []
        setCustomers(list)
        const existing = list.find((c) => c.phone && c.phone.trim() === phone)
        if (existing) {
          setSelectedCustomerId(existing.id)
          setShowCustomerModal(false)
          setNewCustomerForm({ fullName: '', phone: '', creditLimit: '' })
          return
        }
      }

      if (!res.ok) {
        setNewCustomerError(data.error || 'Erreur')
        return
      }
      await loadCustomers()
      setSelectedCustomerId(data.customer.id)
      setShowCustomerModal(false)
      setNewCustomerForm({ fullName: '', phone: '', creditLimit: '' })
    } finally {
      setNewCustomerSaving(false)
    }
  }

  const addToCart = (med: Medication) => {
    setCart(prev => {
      const existing = prev.find(i => i.medication.id === med.id)
      if (existing) {
        if (existing.quantity >= med.shelfQuantity) return prev
        return prev.map(i =>
          i.medication.id === med.id
            ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.unitPrice }
            : i
        )
      }
      return [...prev, { medication: med, quantity: 1, unitPrice: med.sellingPrice, total: med.sellingPrice }]
    })
  }

  const updateQty = (medId: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.medication.id !== medId) return i
      const newQty = Math.max(1, Math.min(i.medication.shelfQuantity, i.quantity + delta))
      return { ...i, quantity: newQty, total: newQty * i.unitPrice }
    }))
  }

  const removeFromCart = (medId: string) => {
    setCart(prev => prev.filter(i => i.medication.id !== medId))
  }

  const subtotal = cart.reduce((sum, i) => sum + i.total, 0)
  const discountAmount = (subtotal * discount) / 100
  const total = subtotal - discountAmount

  const handleSubmit = async () => {
    if (cart.length === 0) return
    if (paymentMethod === 'CREDIT' && !selectedCustomerId) {
      setError('Sélectionnez un client pour une vente à crédit')
      return
    }
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(i => ({
            medicationId: i.medication.id,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            total: i.total,
          })),
          subtotal,
          tax: 0,
          discount: discountAmount,
          total,
          paymentMethod,
          customerName: customerName || null,
          customerPhone: customerPhone || null,
          customerId: paymentMethod === 'CREDIT' ? selectedCustomerId : null,
          isPrescription,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Erreur lors de la vente')
        return
      }

      const data = await res.json()
      const sale = data?.sale
      const receipt: Receipt = {
        id: sale?.id ?? `local-${Date.now()}`,
        createdAt: sale?.createdAt ?? new Date().toISOString(),
        subtotal,
        discount: discountAmount,
        tax: sale?.tax ?? 0,
        total,
        paymentMethod,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        isPrescription,
        cashier: sale?.user
          ? `${sale.user.firstName ?? ''} ${sale.user.lastName ?? ''}`.trim() || '—'
          : '—',
        items: cart.map(i => ({
          name: i.medication.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          total: i.total,
        })),
        pharmacy,
      }
      setLastReceipt(receipt)
      setShowSuccess(true)
      setCart([])
      setDiscount(0)
      setCustomerName('')
      setCustomerPhone('')
      setIsPrescription(false)
      setSelectedCustomerId('')
      // Refresh customers to update balances after a credit sale
      if (paymentMethod === 'CREDIT') loadCustomers()
      // Dispatch event for dashboard auto-refresh
      window.dispatchEvent(new CustomEvent('neuropharm:sale-complete'))
      // Refresh medication list
      fetch('/api/medications?limit=20').then(r => r.json()).then(d => setMedications(d.medications || []))
      // Modal stays open until the user closes it manually — gives time to print the receipt.
    } catch {
      setError('Erreur de connexion')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full min-h-0">
      {/* Left: Products + Cart */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un médicament ou scanner un code-barres..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
            autoFocus
          />
        </div>

        {/* Products grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-3 overflow-y-auto max-h-48 lg:max-h-64">
          {medications.map(med => {
            const warehouseQty = med.quantity - med.shelfQuantity
            const unavailable = med.shelfQuantity <= 0
            return (
              <button
                key={med.id}
                onClick={() => addToCart(med)}
                disabled={unavailable}
                title={unavailable && warehouseQty > 0 ? `${warehouseQty} en magasin — transferer en rayon d'abord` : undefined}
                className={`p-3 rounded-xl border text-left transition-all ${
                  unavailable
                    ? 'bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed'
                    : 'bg-white border-gray-200 hover:border-emerald-400 hover:shadow-md'
                }`}
              >
                <p className="text-sm font-medium text-gray-900 truncate">{med.name}</p>
                <p className="text-xs text-emerald-600 font-semibold mt-1">{formatCurrency(med.sellingPrice)}</p>
                <p className="text-xs text-gray-400">Rayon: {med.shelfQuantity}</p>
                {warehouseQty > 0 && (
                  <p className="text-[10px] text-indigo-500 mt-0.5">+{warehouseQty} en magasin</p>
                )}
              </button>
            )
          })}
        </div>

        {/* Cart */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col min-h-0">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" /> Panier ({cart.length})
            </h3>
            {cart.length > 0 && (
              <button onClick={() => setCart([])} className="text-xs text-red-500 hover:text-red-700">Vider</button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Ajoutez des produits au panier</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map(item => (
                  <div key={item.medication.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.medication.name}</p>
                      <p className="text-xs text-gray-500">{formatCurrency(item.unitPrice)} / unité</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(item.medication.id, -1)} className="p-1 rounded-lg hover:bg-gray-200"><Minus className="w-3 h-3" /></button>
                      <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                      <button onClick={() => updateQty(item.medication.id, 1)} className="p-1 rounded-lg hover:bg-gray-200"><Plus className="w-3 h-3" /></button>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 w-20 text-right">{formatCurrency(item.total)}</p>
                    <button onClick={() => removeFromCart(item.medication.id)} className="p-1 text-gray-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Payment */}
      <div className="w-full lg:w-80 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Paiement</h3>
        </div>
        <div className="p-4 space-y-4 flex-1">
          {/* Customer info */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Client (optionnel)</label>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)}
              placeholder="Nom du client" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
          </div>
          <div>
            <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
              placeholder="Téléphone" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Mode de paiement</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'CASH', label: 'Espèces' },
                { value: 'MOBILE_MONEY', label: 'Mobile Money' },
                { value: 'CARD', label: 'Carte' },
                { value: 'INSURANCE', label: 'Assurance' },
                { value: 'CREDIT', label: 'Carnet (crédit)' },
              ].map(pm => (
                <button key={pm.value} onClick={() => setPaymentMethod(pm.value)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    paymentMethod === pm.value
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {pm.label}
                </button>
              ))}
            </div>
          </div>

          {/* Customer selector (CREDIT only) */}
          {paymentMethod === 'CREDIT' && (
            <div className="space-y-2 p-3 rounded-lg bg-amber-50 border border-amber-200 min-w-0">
              <label className="block text-xs font-semibold text-amber-800">
                Client (carnet) — obligatoire
              </label>
              <div className="flex gap-2 min-w-0">
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="min-w-0 flex-1 px-2 py-2 text-sm border border-amber-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 truncate"
                >
                  <option value="">— Sélectionner un client —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                      {c.phone ? ` · ${c.phone}` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={openNewCustomerModal}
                  title="Nouveau client (pré-rempli avec le nom/téléphone saisis)"
                  className="shrink-0 p-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              </div>
              {selectedCustomer && (
                <div className="text-xs text-amber-900 space-y-0.5 min-w-0 break-words">
                  <div>
                    Solde actuel :{' '}
                    <strong>{formatCurrency(selectedCustomer.balance)}</strong>
                  </div>
                  {selectedCustomer.creditLimit > 0 && (
                    <div>
                      Plafond :{' '}
                      <strong>{formatCurrency(selectedCustomer.creditLimit)}</strong>
                      {selectedCustomer.balance + total > selectedCustomer.creditLimit && (
                        <div className="text-red-700 font-semibold">
                          Plafond dépassé !
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Discount */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Remise (%)</label>
            <input type="number" min="0" max="100" value={discount} onChange={e => setDiscount(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={isPrescription} onChange={e => setIsPrescription(e.target.checked)}
              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
            Sur ordonnance
          </label>
        </div>

        {/* Totals */}
        <div className="p-4 border-t border-gray-100 space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Sous-total</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm text-red-600">
              <span>Remise ({discount}%)</span>
              <span>-{formatCurrency(discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-gray-100">
            <span>Total</span>
            <span className="text-emerald-600">{formatCurrency(total)}</span>
          </div>

          {error && (
            <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>
          )}

          <button
            onClick={handleSubmit}
            disabled={cart.length === 0 || submitting}
            className="w-full py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
            Valider la vente
          </button>
        </div>
      </div>

      {/* New customer modal */}
      {showCustomerModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowCustomerModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-600" /> Nouveau client (carnet)
              </h3>
              <button
                onClick={() => setShowCustomerModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nom complet *</label>
                <input
                  value={newCustomerForm.fullName}
                  onChange={(e) =>
                    setNewCustomerForm((f) => ({ ...f, fullName: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Téléphone</label>
                <input
                  value={newCustomerForm.phone}
                  onChange={(e) => setNewCustomerForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Plafond de crédit (XOF)
                </label>
                <input
                  type="number"
                  min="0"
                  value={newCustomerForm.creditLimit}
                  onChange={(e) =>
                    setNewCustomerForm((f) => ({ ...f, creditLimit: e.target.value }))
                  }
                  placeholder="0 = pas de limite"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>
              {newCustomerError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {newCustomerError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowCustomerModal(false)}
                  className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-gray-200"
                >
                  Annuler
                </button>
                <button
                  onClick={handleCreateCustomer}
                  disabled={newCustomerSaving}
                  className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {newCustomerSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  Créer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success modal */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 text-center shadow-xl animate-slide-in max-w-sm">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Vente enregistrée !</h3>
            <p className="text-gray-500 mt-2">La vente a été enregistrée avec succès</p>
            {lastReceipt && (
              <p className="text-xs text-gray-400 mt-1">
                Reçu n° {formatReceiptNumber(lastReceipt.id)} • {formatCurrency(lastReceipt.total)}
              </p>
            )}
            <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={() => lastReceipt && printReceipt(lastReceipt)}
                disabled={!lastReceipt}
                className="px-5 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" /> Imprimer le reçu
              </button>
              <button
                onClick={() => setShowSuccess(false)}
                className="px-5 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-1"
              >
                <X className="w-4 h-4" /> Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
