'use client'

import { useState, useEffect } from 'react'
import { Search, Plus, Minus, Trash2, ShoppingCart, CheckCircle, X, Loader2 } from 'lucide-react'

interface Medication {
  id: string
  name: string
  sellingPrice: number
  quantity: number
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

  const addToCart = (med: Medication) => {
    setCart(prev => {
      const existing = prev.find(i => i.medication.id === med.id)
      if (existing) {
        if (existing.quantity >= med.quantity) return prev
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
      const newQty = Math.max(1, Math.min(i.medication.quantity, i.quantity + delta))
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
          isPrescription,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Erreur lors de la vente')
        return
      }

      setShowSuccess(true)
      setCart([])
      setDiscount(0)
      setCustomerName('')
      setCustomerPhone('')
      setIsPrescription(false)
      setTimeout(() => setShowSuccess(false), 3000)
    } catch {
      setError('Erreur de connexion')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-8rem)] animate-fade-in">
      {/* Left: Products + Cart */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un medicament ou scanner un code-barres..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
            autoFocus
          />
        </div>

        {/* Products grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-3 overflow-y-auto max-h-48 lg:max-h-64">
          {medications.map(med => (
            <button
              key={med.id}
              onClick={() => addToCart(med)}
              disabled={med.quantity <= 0}
              className={`p-3 rounded-xl border text-left transition-all ${
                med.quantity <= 0
                  ? 'bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed'
                  : 'bg-white border-gray-200 hover:border-emerald-400 hover:shadow-md'
              }`}
            >
              <p className="text-sm font-medium text-gray-900 truncate">{med.name}</p>
              <p className="text-xs text-emerald-600 font-semibold mt-1">{formatCurrency(med.sellingPrice)}</p>
              <p className="text-xs text-gray-400">Stock: {med.quantity}</p>
            </button>
          ))}
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
                      <p className="text-xs text-gray-500">{formatCurrency(item.unitPrice)} / unite</p>
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
              placeholder="Telephone" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Mode de paiement</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'CASH', label: 'Especes' },
                { value: 'MOBILE_MONEY', label: 'Mobile Money' },
                { value: 'CARD', label: 'Carte' },
                { value: 'INSURANCE', label: 'Assurance' },
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

      {/* Success modal */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 text-center shadow-xl animate-slide-in">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Vente enregistree !</h3>
            <p className="text-gray-500 mt-2">La vente a ete enregistree avec succes</p>
            <button onClick={() => setShowSuccess(false)} className="mt-4 px-6 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors">
              <X className="w-4 h-4 inline mr-1" /> Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
