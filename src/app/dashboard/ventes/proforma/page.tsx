'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  Search,
  Plus,
  Minus,
  Trash2,
  FileText,
  CheckCircle,
  X,
  Loader2,
  Printer,
  AlertTriangle,
  History,
  Info,
} from 'lucide-react'
import { useI18n } from '@/components/I18nProvider'
import { useDashboard } from '@/components/DashboardProvider'
import {
  printProforma,
  formatProformaNumber,
  type Proforma as ProformaDoc,
} from '@/lib/proforma'
import type { ReceiptPharmacy } from '@/lib/receipt'

interface Medication {
  id: string
  name: string
  sellingPrice: number
  quantity: number
  shelfQuantity: number
  barcode: string | null
}

interface CartItem {
  medicationId: string | null
  name: string
  reference: string | null
  quantity: number
  unitPrice: number
  total: number
  stockInfo: number | null // stock indicatif au moment de l'ajout
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
  }).format(n)

export default function ProformaPage() {
  const { t } = useI18n()
  const { user } = useDashboard()

  const [medications, setMedications] = useState<Medication[]>([])
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [discountRate, setDiscountRate] = useState(0)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [validityDays, setValidityDays] = useState(15)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [error, setError] = useState('')
  const [pharmacy, setPharmacy] = useState<ReceiptPharmacy | null>(null)
  const [lastProforma, setLastProforma] = useState<ProformaDoc | null>(null)

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
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
    const q = search.length >= 1 ? `search=${encodeURIComponent(search)}&limit=12` : 'limit=20'
    fetch(`/api/medications?${q}`)
      .then((r) => r.json())
      .then((d) => setMedications(d.medications || []))
      .catch(() => {})
  }, [search])

  const addToCart = (med: Medication) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.medicationId === med.id)
      if (existing) {
        return prev.map((i) =>
          i.medicationId === med.id
            ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.unitPrice }
            : i
        )
      }
      return [
        ...prev,
        {
          medicationId: med.id,
          name: med.name,
          reference: med.barcode,
          quantity: 1,
          unitPrice: med.sellingPrice,
          total: med.sellingPrice,
          stockInfo: med.shelfQuantity,
        },
      ]
    })
  }

  const updateQty = (idx: number, value: number) => {
    setCart((prev) =>
      prev.map((i, k) =>
        k === idx
          ? { ...i, quantity: Math.max(1, value), total: Math.max(1, value) * i.unitPrice }
          : i
      )
    )
  }

  const updatePrice = (idx: number, value: number) => {
    setCart((prev) =>
      prev.map((i, k) =>
        k === idx
          ? { ...i, unitPrice: Math.max(0, value), total: i.quantity * Math.max(0, value) }
          : i
      )
    )
  }

  const removeFromCart = (idx: number) => {
    setCart((prev) => prev.filter((_, k) => k !== idx))
  }

  const subtotal = cart.reduce((s, i) => s + i.total, 0)
  const discountAmount = Math.round((subtotal * discountRate) / 100)
  const total = Math.max(0, subtotal - discountAmount)

  const canSave = cart.length > 0 && !submitting

  const authorName = useMemo(
    () => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || '—',
    [user.firstName, user.lastName]
  )

  const resetForm = () => {
    setCart([])
    setDiscountRate(0)
    setCustomerName('')
    setCustomerPhone('')
    setValidityDays(15)
    setNotes('')
  }

  const handleSubmit = async (alsoPrint: boolean) => {
    if (cart.length === 0) {
      setError(t.proforma.errorAtLeastOneItem)
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/proformas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((i) => ({
            medicationId: i.medicationId,
            medicationName: i.name,
            medicationRef: i.reference,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
          discountRate,
          customerName: customerName.trim() || null,
          customerPhone: customerPhone.trim() || null,
          validityDays,
          notes: notes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Erreur')
        return
      }
      const doc: ProformaDoc = {
        id: data.proforma.id,
        createdAt: data.proforma.createdAt,
        subtotal: data.proforma.subtotal,
        discount: data.proforma.discount,
        discountRate: data.proforma.discountRate,
        total: data.proforma.total,
        customerName: data.proforma.customerName,
        customerPhone: data.proforma.customerPhone,
        validityDays: data.proforma.validityDays,
        notes: data.proforma.notes,
        status: data.proforma.status,
        author: authorName,
        items: cart.map((i) => ({
          name: i.name,
          reference: i.reference,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          total: i.total,
        })),
        pharmacy,
      }
      setLastProforma(doc)
      setShowSuccess(true)
      resetForm()
      if (alsoPrint) {
        printProforma(doc)
      }
    } catch {
      setError('Erreur de connexion')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      {/* Bandeau légal permanent */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <p className="text-xs font-medium">{t.proforma.legalBanner}</p>
        <Link
          href="/dashboard/ventes/proforma/historique"
          className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-indigo-300 text-indigo-700 text-xs font-medium hover:bg-indigo-100 transition-colors"
        >
          <History className="w-3 h-3" />
          {t.proforma.history}
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* Left: Products search + Cart */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.proforma.searchMedication}
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
              autoFocus
            />
          </div>

          {/* Grille médicaments — pas de désactivation rupture, c'est juste un devis */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-3 overflow-y-auto max-h-48 lg:max-h-56">
            {medications.map((med) => {
              const stockLabel =
                med.shelfQuantity > 0
                  ? `${t.proforma.inStock}: ${med.shelfQuantity}`
                  : t.proforma.outOfStock
              return (
                <button
                  key={med.id}
                  onClick={() => addToCart(med)}
                  className="p-3 rounded-xl border text-left transition-all bg-white border-gray-200 hover:border-indigo-400 hover:shadow-md"
                >
                  <p className="text-sm font-medium text-gray-900 truncate">{med.name}</p>
                  <p className="text-xs text-indigo-600 font-semibold mt-1">
                    {formatCurrency(med.sellingPrice)}
                  </p>
                  <p
                    className={`text-xs mt-0.5 ${
                      med.shelfQuantity > 0 ? 'text-gray-400' : 'text-orange-500 font-medium'
                    }`}
                  >
                    {stockLabel}
                  </p>
                </button>
              )
            })}
          </div>

          {/* Panier — prix et qté éditables (un devis peut différer du catalogue) */}
          <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col min-h-0">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" /> {t.proforma.items} ({cart.length})
              </h3>
              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  {t.common.delete}
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{t.proforma.emptyCart}</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {cart.map((item, idx) => (
                    <div key={idx} className="p-3 hover:bg-gray-50">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                          {item.reference && (
                            <p className="text-xs text-gray-400">Réf. {item.reference}</p>
                          )}
                          {item.stockInfo !== null && (
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              Stock indicatif : {item.stockInfo}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => removeFromCart(idx)}
                          className="p-1 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex items-center gap-1 border border-gray-200 rounded-lg">
                          <button
                            onClick={() => updateQty(idx, item.quantity - 1)}
                            className="p-1 hover:bg-gray-100"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateQty(idx, Number(e.target.value) || 1)}
                            className="w-12 text-center text-sm bg-transparent border-0 focus:outline-none"
                          />
                          <button
                            onClick={() => updateQty(idx, item.quantity + 1)}
                            className="p-1 hover:bg-gray-100"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <input
                          type="number"
                          min="0"
                          value={item.unitPrice}
                          onChange={(e) => updatePrice(idx, Number(e.target.value) || 0)}
                          className="w-28 px-2 py-1 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                          title={t.proforma.unitPrice}
                        />
                        <p className="flex-1 text-right text-sm font-semibold text-gray-900">
                          {formatCurrency(item.total)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Form + totals */}
        <div className="w-full lg:w-96 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col min-h-0">
          <div className="px-4 py-2.5 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 text-sm">{t.proforma.summary}</h3>
          </div>
          <div className="px-3 py-3 space-y-3 flex-1 overflow-y-auto min-h-0">
            {/* Destinataire */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium text-gray-500">
                {t.proforma.recipientOptional}
              </label>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={t.proforma.recipientName}
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder={t.proforma.recipientPhone}
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>

            {/* Validité + remise inline */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">
                  {t.proforma.validityDays}
                </label>
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={validityDays}
                  onChange={(e) => setValidityDays(Number(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">
                  {t.proforma.discountRate}
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={discountRate}
                  onChange={(e) => setDiscountRate(Number(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
            </div>
            <p className="text-[10px] text-gray-400 -mt-2">{t.proforma.validityHint}</p>

            {/* Notes */}
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">
                {t.proforma.notes}
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t.proforma.notesPlaceholder}
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>

            {/* Hint stock */}
            <div className="flex items-start gap-1.5 p-2 rounded-lg bg-amber-50 border border-amber-200">
              <Info className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-800">{t.proforma.stockWarning}</p>
            </div>
          </div>

          {/* Totals + save */}
          <div className="px-3 py-3 border-t border-gray-100 space-y-2">
            <div className="flex justify-between text-xs text-gray-600">
              <span>{t.proforma.subtotal}</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {discountRate > 0 && (
              <div className="flex justify-between text-xs text-red-600">
                <span>
                  {t.proforma.discount} ({discountRate}%)
                </span>
                <span>-{formatCurrency(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900 pt-1.5 border-t border-gray-100">
              <span>{t.proforma.total}</span>
              <span className="text-indigo-600">{formatCurrency(total)}</span>
            </div>

            {error && (
              <div className="p-1.5 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                onClick={() => handleSubmit(false)}
                disabled={!canSave}
                className="py-2 bg-white border border-indigo-600 text-indigo-700 font-semibold text-xs rounded-xl hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                {t.proforma.save}
              </button>
              <button
                onClick={() => handleSubmit(true)}
                disabled={!canSave}
                className="py-2 bg-indigo-600 text-white font-semibold text-xs rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Printer className="w-4 h-4" />
                )}
                {t.proforma.saveAndPrint}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Success modal */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-8 text-center shadow-xl animate-slide-in max-w-sm">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-indigo-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-indigo-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">{t.proforma.successSaved}</h3>
            {lastProforma && (
              <p className="text-xs text-gray-500 mt-2">
                {formatProformaNumber(lastProforma.id)} • {formatCurrency(lastProforma.total)}
              </p>
            )}
            <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={() => lastProforma && printProforma(lastProforma)}
                disabled={!lastProforma}
                className="px-5 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" /> {t.proforma.print}
              </button>
              <button
                onClick={() => setShowSuccess(false)}
                className="px-5 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-1"
              >
                <X className="w-4 h-4" /> {t.common.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
