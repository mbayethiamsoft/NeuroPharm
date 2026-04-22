'use client'

import { useState, useEffect } from 'react'
import { Search, Plus, Minus, Trash2, ShoppingCart, CheckCircle, X, Loader2, Printer } from 'lucide-react'

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

interface PharmacyInfo {
  name: string
  address: string | null
  city: string | null
  phone: string | null
  email: string | null
  taxId: string | null
}

interface ReceiptItem {
  name: string
  quantity: number
  unitPrice: number
  total: number
}

interface Receipt {
  id: string
  createdAt: string
  subtotal: number
  discount: number
  tax: number
  total: number
  paymentMethod: string
  customerName: string | null
  customerPhone: string | null
  isPrescription: boolean
  cashier: string
  items: ReceiptItem[]
  pharmacy: PharmacyInfo | null
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(n)

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Espèces',
  MOBILE_MONEY: 'Mobile Money',
  CARD: 'Carte bancaire',
  INSURANCE: 'Assurance',
  CREDIT: 'Crédit',
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const buildReceiptHtml = (r: Receipt) => {
  const date = new Date(r.createdAt)
  const dateStr = date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
  const shortRef = r.id.slice(-8).toUpperCase()
  const pharmacy = r.pharmacy
  const headerLines: string[] = []
  if (pharmacy) {
    headerLines.push(`<div class="ph-name">${escapeHtml(pharmacy.name)}</div>`)
    const addr = [pharmacy.address, pharmacy.city].filter(Boolean).join(', ')
    if (addr) headerLines.push(`<div>${escapeHtml(addr)}</div>`)
    if (pharmacy.phone) headerLines.push(`<div>Tél : ${escapeHtml(pharmacy.phone)}</div>`)
    if (pharmacy.email) headerLines.push(`<div>${escapeHtml(pharmacy.email)}</div>`)
    if (pharmacy.taxId) headerLines.push(`<div>NINEA : ${escapeHtml(pharmacy.taxId)}</div>`)
  }

  const itemsRows = r.items.map(i => `
    <tr>
      <td class="left">${escapeHtml(i.name)}</td>
      <td class="center">${i.quantity}</td>
      <td class="right">${formatCurrency(i.unitPrice)}</td>
      <td class="right">${formatCurrency(i.total)}</td>
    </tr>`).join('')

  const customerBlock = (r.customerName || r.customerPhone)
    ? `<div class="block">
        <div><strong>Client :</strong> ${escapeHtml(r.customerName || '-')}</div>
        ${r.customerPhone ? `<div><strong>Téléphone :</strong> ${escapeHtml(r.customerPhone)}</div>` : ''}
      </div>`
    : ''

  const discountRow = r.discount > 0
    ? `<tr><td>Remise</td><td class="right">-${formatCurrency(r.discount)}</td></tr>`
    : ''
  const taxRow = r.tax > 0
    ? `<tr><td>TVA</td><td class="right">${formatCurrency(r.tax)}</td></tr>`
    : ''

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Reçu ${shortRef}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; color: #111; margin: 0; padding: 16px; font-size: 12px; }
  .receipt { max-width: 320px; margin: 0 auto; }
  .header { text-align: center; margin-bottom: 12px; }
  .ph-name { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
  .meta { display: flex; justify-content: space-between; font-size: 11px; margin: 8px 0; }
  .block { margin: 8px 0; padding: 8px 0; border-top: 1px dashed #999; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 4px 2px; vertical-align: top; }
  thead th { border-bottom: 1px dashed #999; font-size: 11px; text-align: left; }
  .center { text-align: center; }
  .right { text-align: right; }
  .left { text-align: left; }
  .totals { margin-top: 8px; padding-top: 8px; border-top: 1px dashed #999; }
  .totals td { padding: 2px 0; font-size: 12px; }
  .totals .grand td { font-size: 14px; font-weight: 700; padding-top: 6px; border-top: 1px solid #111; }
  .footer { margin-top: 16px; text-align: center; font-size: 11px; }
  .badge { display: inline-block; margin-top: 6px; padding: 2px 8px; border: 1px solid #111; border-radius: 4px; font-size: 10px; }
  @media print {
    body { padding: 0; }
    @page { margin: 8mm; }
  }
</style>
</head>
<body>
  <div class="receipt">
    <div class="header">${headerLines.join('')}</div>

    <div class="meta">
      <span>Reçu n° ${shortRef}</span>
      <span>${escapeHtml(dateStr)}</span>
    </div>
    <div class="meta">
      <span>Vendeur : ${escapeHtml(r.cashier)}</span>
      <span>Paiement : ${escapeHtml(PAYMENT_LABELS[r.paymentMethod] || r.paymentMethod)}</span>
    </div>

    ${customerBlock}

    <table>
      <thead>
        <tr>
          <th class="left">Article</th>
          <th class="center">Qté</th>
          <th class="right">PU</th>
          <th class="right">Total</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>

    <table class="totals">
      <tr><td>Sous-total</td><td class="right">${formatCurrency(r.subtotal)}</td></tr>
      ${discountRow}
      ${taxRow}
      <tr class="grand"><td>Total à payer</td><td class="right">${formatCurrency(r.total)}</td></tr>
    </table>

    ${r.isPrescription ? '<div class="footer"><span class="badge">Vente sur ordonnance</span></div>' : ''}

    <div class="footer">
      Merci de votre visite !<br/>
      Conservez ce reçu pour tout échange.
    </div>
  </div>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => { window.focus(); window.print(); }, 200);
    });
  </script>
</body>
</html>`
}

const printReceipt = (receipt: Receipt) => {
  const w = window.open('', '_blank', 'width=420,height=640')
  if (!w) return
  w.document.open()
  w.document.write(buildReceiptHtml(receipt))
  w.document.close()
}

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
  const [pharmacy, setPharmacy] = useState<PharmacyInfo | null>(null)
  const [lastReceipt, setLastReceipt] = useState<Receipt | null>(null)

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
      // Dispatch event for dashboard auto-refresh
      window.dispatchEvent(new CustomEvent('neuropharm:sale-complete'))
      // Refresh medication list
      fetch('/api/medications?limit=20').then(r => r.json()).then(d => setMedications(d.medications || []))
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
          <div className="bg-white rounded-2xl p-8 text-center shadow-xl animate-slide-in max-w-sm">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Vente enregistrée !</h3>
            <p className="text-gray-500 mt-2">La vente a été enregistrée avec succès</p>
            {lastReceipt && (
              <p className="text-xs text-gray-400 mt-1">
                Reçu n° {lastReceipt.id.slice(-8).toUpperCase()} • {formatCurrency(lastReceipt.total)}
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
