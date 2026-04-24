'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Search,
  RefreshCw,
  Users,
  AlertCircle,
  Wallet,
  Coins,
  Eye,
  UserPlus,
  FileDown,
  X,
  Loader2,
  Printer,
  BookOpen,
  Phone,
  CheckCircle,
  Trash2,
  Pencil,
} from 'lucide-react'
import { useI18n } from '@/components/I18nProvider'
import { printPaymentReceipt, type PaymentReceipt, type ReceiptPharmacy } from '@/lib/receipt'

interface CustomerRow {
  id: string
  fullName: string
  phone: string | null
  address: string | null
  notes: string | null
  creditLimit: number
  isActive: boolean
  createdAt: string
  totalDebt: number
  totalPaid: number
  balance: number
}

interface CreditSale {
  id: string
  total: number
  status: string
  createdAt: string
  items: Array<{ id: string; quantity: number; unitPrice: number; total: number; medication: { id: string; name: string } }>
  user: { firstName: string; lastName: string } | null
}

interface CreditPayment {
  id: string
  amount: number
  method: string
  notes: string | null
  createdAt: string
  receivedBy: string | null
}

interface CustomerDetail {
  customer: CustomerRow
  sales: CreditSale[]
  payments: CreditPayment[]
  totalDebt: number
  totalPaid: number
  balance: number
}

const fmtXOF = (n: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
  }).format(n)

const fmtDate = (s: string) => new Date(s).toLocaleDateString('fr-FR', { dateStyle: 'medium' } as Intl.DateTimeFormatOptions)
const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Espèces',
  MOBILE_MONEY: 'Mobile Money',
  CARD: 'Carte',
}

export default function CarnetPage() {
  const { t } = useI18n()

  const [rows, setRows] = useState<CustomerRow[]>([])
  const [totals, setTotals] = useState({
    totalCount: 0,
    inDebtCount: 0,
    totalDebt: 0,
    totalPaid: 0,
    balance: 0,
  })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filter, setFilter] = useState<'' | 'inDebt' | 'settled'>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [pharmacy, setPharmacy] = useState<ReceiptPharmacy | null>(null)

  // Detail modal
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Create/edit modal
  const [customerModalOpen, setCustomerModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ fullName: '', phone: '', address: '', notes: '', creditLimit: '' })
  const [formError, setFormError] = useState('')
  const [formSaving, setFormSaving] = useState(false)

  // Payment modal
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const [paymentSaving, setPaymentSaving] = useState(false)

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
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const loadCustomers = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (filter) params.set('filter', filter)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    params.set('limit', '500')
    try {
      const res = await fetch(`/api/customers?${params.toString()}`)
      if (!res.ok) {
        setRows([])
        return
      }
      const data = await res.json()
      setRows(data.customers || [])
      setTotals(data.totals || { totalCount: 0, inDebtCount: 0, totalDebt: 0, totalPaid: 0, balance: 0 })
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, filter, dateFrom, dateTo])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  const resetFilters = () => {
    setSearch('')
    setFilter('')
    setDateFrom('')
    setDateTo('')
  }

  const exportPdf = () => {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (filter) params.set('filter', filter)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    window.open(`/api/carnet/report/pdf?${params.toString()}`, '_blank')
  }

  // ---- Detail modal ----
  const openDetail = async (id: string) => {
    setDetailCustomerId(id)
    setDetail(null)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/customers/${id}`)
      if (res.ok) {
        const data = await res.json()
        setDetail(data)
      }
    } finally {
      setDetailLoading(false)
    }
  }

  const refreshDetail = async () => {
    if (!detailCustomerId) return
    const res = await fetch(`/api/customers/${detailCustomerId}`)
    if (res.ok) setDetail(await res.json())
  }

  // ---- Customer CRUD ----
  const openCreate = () => {
    setEditingId(null)
    setForm({ fullName: '', phone: '', address: '', notes: '', creditLimit: '' })
    setFormError('')
    setCustomerModalOpen(true)
  }
  const openEdit = (row: CustomerRow) => {
    setEditingId(row.id)
    setForm({
      fullName: row.fullName,
      phone: row.phone ?? '',
      address: row.address ?? '',
      notes: row.notes ?? '',
      creditLimit: row.creditLimit ? String(row.creditLimit) : '',
    })
    setFormError('')
    setCustomerModalOpen(true)
  }

  const saveCustomer = async () => {
    setFormError('')
    if (!form.fullName.trim()) {
      setFormError('Nom requis')
      return
    }
    setFormSaving(true)
    try {
      const url = editingId ? `/api/customers/${editingId}` : '/api/customers'
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          notes: form.notes.trim() || null,
          creditLimit: Number(form.creditLimit) || 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Erreur')
        return
      }
      setCustomerModalOpen(false)
      await loadCustomers()
      if (editingId && detailCustomerId === editingId) await refreshDetail()
    } finally {
      setFormSaving(false)
    }
  }

  const deactivateCustomer = async (id: string) => {
    if (!window.confirm(t.carnet.deleteCustomerConfirm)) return
    const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' })
    if (res.ok) {
      if (detailCustomerId === id) {
        setDetailCustomerId(null)
        setDetail(null)
      }
      await loadCustomers()
    }
  }

  // ---- Payment ----
  const openPayment = () => {
    setPaymentAmount('')
    setPaymentMethod('CASH')
    setPaymentNotes('')
    setPaymentError('')
    setPaymentOpen(true)
  }

  const savePayment = async () => {
    if (!detailCustomerId || !detail) return
    setPaymentError('')
    const amount = Number(paymentAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError('Montant invalide')
      return
    }
    if (amount > detail.balance + 0.009) {
      setPaymentError(t.carnet.amountExceedsBalance)
      return
    }
    setPaymentSaving(true)
    try {
      const res = await fetch(`/api/customers/${detailCustomerId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, method: paymentMethod, notes: paymentNotes || null }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPaymentError(data.error || 'Erreur')
        return
      }
      // Build + print receipt
      const receipt: PaymentReceipt = {
        id: data.payment.id,
        createdAt: data.payment.createdAt,
        amount: data.payment.amount,
        method: data.payment.method,
        notes: data.payment.notes,
        customerName: detail.customer.fullName,
        customerPhone: detail.customer.phone,
        previousBalance: data.previousBalance,
        newBalance: data.balance,
        cashier: data.cashier || '—',
        pharmacy,
      }
      printPaymentReceipt(receipt)

      setPaymentOpen(false)
      await Promise.all([loadCustomers(), refreshDetail()])
    } finally {
      setPaymentSaving(false)
    }
  }

  const filtersActive = useMemo(
    () => Boolean(debouncedSearch || filter || dateFrom || dateTo),
    [debouncedSearch, filter, dateFrom, dateTo]
  )

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          icon={Users}
          label={t.carnet.activeCustomers}
          value={String(totals.totalCount)}
          color="emerald"
        />
        <KpiCard
          icon={AlertCircle}
          label={t.carnet.customersInDebt}
          value={String(totals.inDebtCount)}
          color="amber"
        />
        <KpiCard
          icon={Wallet}
          label={t.carnet.totalDebt}
          value={fmtXOF(totals.totalDebt)}
          color="rose"
        />
        <KpiCard
          icon={Coins}
          label={t.carnet.balance}
          value={fmtXOF(totals.balance)}
          color={totals.balance > 0 ? 'rose' : 'emerald'}
        />
      </div>

      {/* Filters + actions */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.carnet.searchCustomer}
              className="w-full pl-10 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as '' | 'inDebt' | 'settled')}
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="">{t.carnet.allCustomers}</option>
            <option value="inDebt">{t.carnet.inDebtOnly}</option>
            <option value="settled">{t.carnet.settledOnly}</option>
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label={t.sales.from}
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label={t.sales.to}
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
          <div className="flex items-center gap-2">
            {filtersActive && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-100 text-gray-600 text-xs hover:bg-gray-200"
              >
                <RefreshCw className="w-3 h-3" /> {t.sales.resetFilters}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-gray-500">
            {totals.totalCount} {t.carnet.activeCustomers.toLowerCase()}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={exportPdf}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800"
            >
              <FileDown className="w-3.5 h-3.5" /> {t.carnet.exportPdf}
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700"
            >
              <UserPlus className="w-3.5 h-3.5" /> {t.carnet.newCustomer}
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
            <BookOpen className="w-10 h-10 opacity-40 mb-3" />
            <p className="text-sm">{t.carnet.noCustomers}</p>
          </div>
        ) : (
          <>
            <div className="hidden md:block flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-3">{t.carnet.customerName}</th>
                    <th className="px-4 py-3">{t.common.phone}</th>
                    <th className="px-4 py-3 text-right">{t.carnet.creditLimit}</th>
                    <th className="px-4 py-3 text-right">{t.carnet.totalDebt}</th>
                    <th className="px-4 py-3 text-right">{t.carnet.totalPaid}</th>
                    <th className="px-4 py-3 text-right">{t.carnet.balance}</th>
                    <th className="px-4 py-3 text-center">{t.common.status}</th>
                    <th className="px-4 py-3 text-right">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{r.fullName}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {r.phone || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {r.creditLimit > 0 ? fmtXOF(r.creditLimit) : <span className="text-gray-400 text-xs">{t.carnet.noLimit}</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmtXOF(r.totalDebt)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmtXOF(r.totalPaid)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${r.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {fmtXOF(r.balance)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
                            r.balance > 0
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {r.balance > 0 ? t.carnet.inDebt : t.carnet.settled}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openDetail(r.id)}
                            title={t.sales.viewDetails}
                            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEdit(r)}
                            title={t.common.edit}
                            className="p-2 rounded-lg text-blue-600 hover:bg-blue-50"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deactivateCustomer(r.id)}
                            title={t.common.delete}
                            className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden flex-1 overflow-auto divide-y divide-gray-100">
              {rows.map((r) => (
                <div key={r.id} className="p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{r.fullName}</p>
                      {r.phone && (
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {r.phone}
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
                        r.balance > 0
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {r.balance > 0 ? t.carnet.inDebt : t.carnet.settled}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t.carnet.balance}</span>
                    <span className={`font-semibold ${r.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {fmtXOF(r.balance)}
                    </span>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => openDetail(r.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium"
                    >
                      <Eye className="w-3.5 h-3.5" /> {t.sales.viewDetails}
                    </button>
                    <button
                      onClick={() => openEdit(r)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium"
                    >
                      <Pencil className="w-3.5 h-3.5" /> {t.common.edit}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Customer detail modal */}
      {detailCustomerId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => {
            setDetailCustomerId(null)
            setDetail(null)
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-600" />
                <h3 className="font-semibold text-gray-900">{t.carnet.customerDetails}</h3>
              </div>
              <button
                onClick={() => {
                  setDetailCustomerId(null)
                  setDetail(null)
                }}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-5">
              {detailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                </div>
              ) : detail ? (
                <div className="space-y-5">
                  <div>
                    <p className="text-xl font-bold text-gray-900">{detail.customer.fullName}</p>
                    {detail.customer.phone && (
                      <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3.5 h-3.5" /> {detail.customer.phone}
                      </p>
                    )}
                    {detail.customer.address && (
                      <p className="text-sm text-gray-500">{detail.customer.address}</p>
                    )}
                    {detail.customer.notes && (
                      <p className="text-xs text-gray-500 mt-1 italic">{detail.customer.notes}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <SummaryBox label={t.carnet.totalDebt} value={fmtXOF(detail.totalDebt)} />
                    <SummaryBox label={t.carnet.totalPaid} value={fmtXOF(detail.totalPaid)} />
                    <SummaryBox
                      label={t.carnet.balance}
                      value={fmtXOF(detail.balance)}
                      color={detail.balance > 0 ? 'rose' : 'emerald'}
                    />
                  </div>

                  {detail.customer.creditLimit > 0 && (
                    <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
                      <strong>{t.carnet.creditLimit} :</strong> {fmtXOF(detail.customer.creditLimit)}
                    </div>
                  )}

                  {/* Payments */}
                  <section>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-gray-700">
                        {t.carnet.payments} ({detail.payments.length})
                      </h4>
                      {detail.balance > 0 && (
                        <button
                          onClick={openPayment}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700"
                        >
                          <Coins className="w-3.5 h-3.5" /> {t.carnet.recordPayment}
                        </button>
                      )}
                    </div>
                    {detail.payments.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">Aucun paiement</p>
                    ) : (
                      <div className="space-y-1">
                        {detail.payments.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 text-sm"
                          >
                            <div>
                              <p className="text-emerald-800 font-medium">{fmtXOF(p.amount)}</p>
                              <p className="text-xs text-emerald-700">
                                {fmtDateTime(p.createdAt)} ·{' '}
                                {PAYMENT_METHOD_LABELS[p.method] || p.method}
                                {p.notes ? ` · ${p.notes}` : ''}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Credit sales */}
                  <section>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">
                      {t.carnet.creditSales} ({detail.sales.length})
                    </h4>
                    {detail.sales.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">Aucune vente à crédit</p>
                    ) : (
                      <div className="space-y-1">
                        {detail.sales.map((s) => (
                          <div
                            key={s.id}
                            className="p-2 rounded-lg bg-gray-50 text-sm"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-gray-800">
                                  {fmtDate(s.createdAt)} ·{' '}
                                  <span className="font-mono text-xs text-gray-500">
                                    #{s.id.slice(-8).toUpperCase()}
                                  </span>
                                </p>
                                <p className="text-xs text-gray-500">
                                  {s.items.length} article{s.items.length > 1 ? 's' : ''}
                                  {s.user && ` · ${s.user.firstName} ${s.user.lastName}`}
                                </p>
                              </div>
                              <p className="font-semibold text-gray-900">{fmtXOF(s.total)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Create/edit customer modal */}
      {customerModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setCustomerModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-600" />
                {editingId ? t.carnet.editCustomer : t.carnet.newCustomer}
              </h3>
              <button
                onClick={() => setCustomerModalOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <Field label={`${t.carnet.customerName} *`}>
                <input
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  autoFocus
                />
              </Field>
              <Field label={t.carnet.customerPhone}>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </Field>
              <Field label={t.carnet.customerAddress}>
                <input
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </Field>
              <Field label={`${t.carnet.creditLimit} (XOF)`} hint={t.carnet.creditLimitHint}>
                <input
                  type="number"
                  min="0"
                  value={form.creditLimit}
                  onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </Field>
              <Field label={t.carnet.customerNotes}>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </Field>
              {formError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {formError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setCustomerModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-gray-200"
                >
                  {t.common.cancel}
                </button>
                <button
                  onClick={saveCustomer}
                  disabled={formSaving}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {formSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {t.common.save}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {paymentOpen && detail && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setPaymentOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Coins className="w-5 h-5 text-emerald-600" />
                {t.carnet.recordPayment}
              </h3>
              <button
                onClick={() => setPaymentOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
                <p className="text-amber-800">
                  <strong>{detail.customer.fullName}</strong>
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  Solde dû : <strong>{fmtXOF(detail.balance)}</strong>
                </p>
              </div>
              <Field label={`${t.carnet.paymentAmount} (XOF) *`}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </Field>
              <Field label={t.carnet.paymentMethod}>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  <option value="CASH">{t.sales.cash}</option>
                  <option value="MOBILE_MONEY">{t.sales.mobileMoney}</option>
                  <option value="CARD">{t.sales.card}</option>
                </select>
              </Field>
              <Field label={t.carnet.paymentNotes}>
                <input
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </Field>
              {paymentError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {paymentError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setPaymentOpen(false)}
                  className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-gray-200"
                >
                  {t.common.cancel}
                </button>
                <button
                  onClick={savePayment}
                  disabled={paymentSaving}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {paymentSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Printer className="w-4 h-4" />
                  )}
                  {t.carnet.savePayment}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Users
  label: string
  value: string
  color: 'emerald' | 'amber' | 'rose'
}) {
  const colorMap = {
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 truncate">{label}</p>
          <p className="text-lg font-bold text-gray-900 truncate">{value}</p>
        </div>
      </div>
    </div>
  )
}

function SummaryBox({
  label,
  value,
  color = 'gray',
}: {
  label: string
  value: string
  color?: 'gray' | 'emerald' | 'rose'
}) {
  const colorMap = {
    gray: 'text-gray-900',
    emerald: 'text-emerald-700',
    rose: 'text-rose-700',
  }
  return (
    <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`text-base font-bold ${colorMap[color]} mt-0.5`}>{value}</p>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}
