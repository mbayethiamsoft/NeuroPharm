'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Search,
  Calendar,
  Printer,
  Eye,
  Loader2,
  X,
  RefreshCw,
  FileText,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useI18n } from '@/components/I18nProvider'
import {
  printReceipt,
  formatReceiptNumber,
  PAYMENT_LABELS_FR,
  SALE_STATUS_LABELS_FR,
  type Receipt,
  type ReceiptPharmacy,
} from '@/lib/receipt'

interface SaleListRow {
  id: string
  createdAt: string
  total: number
  subtotal: number
  tax: number
  discount: number
  paymentMethod: string
  status: string
  customerName: string | null
  customerPhone: string | null
  isPrescription: boolean
  user: { id: string; firstName: string; lastName: string } | null
  _count: { items: number }
}

interface SaleDetail extends SaleListRow {
  items: Array<{
    id: string
    quantity: number
    unitPrice: number
    total: number
    medication: { id: string; name: string }
  }>
  user: { id: string; firstName: string; lastName: string; email?: string } | null
}

const PAGE_SIZE = 20

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(n)

const paymentBadgeClass: Record<string, string> = {
  CASH: 'bg-emerald-50 text-emerald-700',
  MOBILE_MONEY: 'bg-blue-50 text-blue-700',
  CARD: 'bg-indigo-50 text-indigo-700',
  INSURANCE: 'bg-purple-50 text-purple-700',
  CREDIT: 'bg-amber-50 text-amber-700',
}

const statusBadgeClass: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  refunded: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
}

const saleToReceipt = (sale: SaleDetail, pharmacy: ReceiptPharmacy | null): Receipt => ({
  id: sale.id,
  createdAt: sale.createdAt,
  subtotal: sale.subtotal,
  discount: sale.discount,
  tax: sale.tax,
  total: sale.total,
  paymentMethod: sale.paymentMethod,
  customerName: sale.customerName,
  customerPhone: sale.customerPhone,
  isPrescription: sale.isPrescription,
  cashier: sale.user
    ? `${sale.user.firstName ?? ''} ${sale.user.lastName ?? ''}`.trim() || '—'
    : '—',
  items: sale.items.map((i) => ({
    name: i.medication.name,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    total: i.total,
  })),
  pharmacy,
  status: sale.status,
})

export default function HistoriquePage() {
  const { t } = useI18n()
  const [sales, setSales] = useState<SaleListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [pharmacy, setPharmacy] = useState<ReceiptPharmacy | null>(null)
  const [detailSale, setDetailSale] = useState<SaleDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [reprintingId, setReprintingId] = useState<string | null>(null)

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

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const loadSales = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(PAGE_SIZE))
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    if (status) params.set('status', status)
    try {
      const res = await fetch(`/api/sales?${params.toString()}`)
      if (!res.ok) {
        setSales([])
        setTotalPages(1)
        setTotalCount(0)
        return
      }
      const data = await res.json()
      let rows: SaleListRow[] = data.sales || []
      // Payment method filter is client-side (API currently doesn't support it)
      if (paymentMethod) rows = rows.filter((s) => s.paymentMethod === paymentMethod)
      setSales(rows)
      setTotalPages(data.pagination?.totalPages || 1)
      setTotalCount(data.pagination?.total || 0)
    } catch {
      setSales([])
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, dateFrom, dateTo, status, paymentMethod])

  useEffect(() => {
    loadSales()
  }, [loadSales])

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, dateFrom, dateTo, status, paymentMethod])

  const resetFilters = () => {
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setStatus('')
    setPaymentMethod('')
  }

  const fetchDetail = async (id: string): Promise<SaleDetail | null> => {
    try {
      const res = await fetch(`/api/sales/${id}`)
      if (!res.ok) return null
      const data = await res.json()
      return (data.sale ?? null) as SaleDetail | null
    } catch {
      return null
    }
  }

  const handleOpenDetail = async (id: string) => {
    setDetailLoading(true)
    setDetailSale(null)
    const sale = await fetchDetail(id)
    if (sale) setDetailSale(sale)
    setDetailLoading(false)
  }

  const handleReprint = async (id: string) => {
    setReprintingId(id)
    try {
      const sale = await fetchDetail(id)
      if (!sale) return
      printReceipt(saleToReceipt(sale, pharmacy))
    } finally {
      setReprintingId(null)
    }
  }

  const filtersActive = useMemo(
    () => Boolean(debouncedSearch || dateFrom || dateTo || status || paymentMethod),
    [debouncedSearch, dateFrom, dateTo, status, paymentMethod]
  )

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      {/* Filters bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
          {/* Search */}
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.sales.searchHistory}
              className="w-full pl-10 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
            />
          </div>

          {/* Date from */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label={t.sales.from}
              className="w-full pl-10 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          {/* Date to */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label={t.sales.to}
              className="w-full pl-10 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          {/* Payment method */}
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="">{t.sales.allPaymentMethods}</option>
            {Object.entries(PAYMENT_LABELS_FR).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          {/* Status */}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="">{t.sales.allStatuses}</option>
            <option value="completed">{t.sales.completed}</option>
            <option value="refunded">{t.sales.refunded}</option>
            <option value="cancelled">{t.sales.cancelled}</option>
          </select>
        </div>

        {filtersActive && (
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-gray-500">
              {totalCount} {t.sales.title.toLowerCase()}
            </p>
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-emerald-600"
            >
              <RefreshCw className="w-3 h-3" /> {t.sales.resetFilters}
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
          </div>
        ) : sales.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
            <ShoppingBag className="w-10 h-10 opacity-40 mb-3" />
            <p className="text-sm">{t.sales.noSalesFound}</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-3">{t.common.date}</th>
                    <th className="px-4 py-3">{t.sales.receiptNumber}</th>
                    <th className="px-4 py-3">{t.sales.customer}</th>
                    <th className="px-4 py-3">{t.sales.cashier}</th>
                    <th className="px-4 py-3">{t.sales.paymentMethod}</th>
                    <th className="px-4 py-3 text-center">{t.sales.itemsCount}</th>
                    <th className="px-4 py-3 text-right">{t.common.total}</th>
                    <th className="px-4 py-3">{t.common.status}</th>
                    <th className="px-4 py-3 text-right">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sales.map((sale) => {
                    const d = new Date(sale.createdAt)
                    return (
                      <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                          <div className="text-sm">{d.toLocaleDateString('fr-FR')}</div>
                          <div className="text-xs text-gray-400">{d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">{formatReceiptNumber(sale.id)}</td>
                        <td className="px-4 py-3 text-gray-700">
                          {sale.customerName || <span className="text-gray-300">—</span>}
                          {sale.customerPhone && (
                            <div className="text-xs text-gray-400">{sale.customerPhone}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {sale.user
                            ? `${sale.user.firstName} ${sale.user.lastName}`
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${paymentBadgeClass[sale.paymentMethod] || 'bg-gray-50 text-gray-600'}`}>
                            {PAYMENT_LABELS_FR[sale.paymentMethod] || sale.paymentMethod}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-700">{sale._count.items}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(sale.total)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadgeClass[sale.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                            {SALE_STATUS_LABELS_FR[sale.status] || sale.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenDetail(sale.id)}
                              title={t.sales.viewDetails}
                              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleReprint(sale.id)}
                              disabled={reprintingId === sale.id}
                              title={t.sales.reprint}
                              className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                            >
                              {reprintingId === sale.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Printer className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden flex-1 overflow-auto divide-y divide-gray-100">
              {sales.map((sale) => {
                const d = new Date(sale.createdAt)
                return (
                  <div key={sale.id} className="p-4 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-gray-500">#{formatReceiptNumber(sale.id)}</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {sale.customerName || <span className="text-gray-400">{t.sales.customer}: —</span>}
                        </p>
                        <p className="text-xs text-gray-500">
                          {d.toLocaleDateString('fr-FR')} · {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-emerald-600 whitespace-nowrap">
                        {formatCurrency(sale.total)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`inline-flex px-2 py-0.5 rounded-full font-medium ${paymentBadgeClass[sale.paymentMethod] || 'bg-gray-50 text-gray-600'}`}>
                        {PAYMENT_LABELS_FR[sale.paymentMethod] || sale.paymentMethod}
                      </span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full font-medium border ${statusBadgeClass[sale.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                        {SALE_STATUS_LABELS_FR[sale.status] || sale.status}
                      </span>
                      <span className="text-gray-400">{sale._count.items} {t.sales.itemsCount}</span>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={() => handleOpenDetail(sale.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200"
                      >
                        <Eye className="w-3.5 h-3.5" /> {t.sales.viewDetails}
                      </button>
                      <button
                        onClick={() => handleReprint(sale.id)}
                        disabled={reprintingId === sale.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {reprintingId === sale.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Printer className="w-3.5 h-3.5" />
                        )}
                        {t.sales.reprint}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50 text-sm">
                <p className="text-xs text-gray-500">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} / {totalCount}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-gray-200"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-3 text-xs text-gray-600">
                    {page} / {totalPages}
                  </span>
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-gray-200"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail modal */}
      {(detailSale || detailLoading) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => {
            setDetailSale(null)
            setDetailLoading(false)
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                <h3 className="font-semibold text-gray-900">
                  {t.sales.saleDetails}
                  {detailSale && (
                    <span className="ml-2 font-mono text-xs text-gray-500">
                      #{formatReceiptNumber(detailSale.id)}
                    </span>
                  )}
                </h3>
              </div>
              <button
                onClick={() => {
                  setDetailSale(null)
                  setDetailLoading(false)
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
              ) : detailSale ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">{t.common.date}</p>
                      <p className="text-gray-900">
                        {new Date(detailSale.createdAt).toLocaleString('fr-FR', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{t.sales.cashier}</p>
                      <p className="text-gray-900">
                        {detailSale.user
                          ? `${detailSale.user.firstName} ${detailSale.user.lastName}`
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{t.sales.paymentMethod}</p>
                      <p className="text-gray-900">
                        {PAYMENT_LABELS_FR[detailSale.paymentMethod] || detailSale.paymentMethod}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{t.common.status}</p>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
                          statusBadgeClass[detailSale.status] || 'bg-gray-50 text-gray-600 border-gray-200'
                        }`}
                      >
                        {SALE_STATUS_LABELS_FR[detailSale.status] || detailSale.status}
                      </span>
                    </div>
                    {(detailSale.customerName || detailSale.customerPhone) && (
                      <div className="col-span-2">
                        <p className="text-xs text-gray-500">{t.sales.customer}</p>
                        <p className="text-gray-900">
                          {detailSale.customerName || '—'}
                          {detailSale.customerPhone && (
                            <span className="text-gray-500"> · {detailSale.customerPhone}</span>
                          )}
                        </p>
                      </div>
                    )}
                    {detailSale.isPrescription && (
                      <div className="col-span-2">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                          {t.sales.prescriptionFlag}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                      {t.sales.cart}
                    </p>
                    <div className="space-y-1.5 text-sm">
                      {detailSale.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-2">
                          <span className="flex-1 truncate text-gray-800">{item.medication.name}</span>
                          <span className="text-gray-500 text-xs whitespace-nowrap">
                            {item.quantity} × {formatCurrency(item.unitPrice)}
                          </span>
                          <span className="text-gray-900 font-medium w-20 text-right">
                            {formatCurrency(item.total)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-4 space-y-1 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>{t.sales.subtotal}</span>
                      <span>{formatCurrency(detailSale.subtotal)}</span>
                    </div>
                    {detailSale.discount > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>{t.sales.discount}</span>
                        <span>-{formatCurrency(detailSale.discount)}</span>
                      </div>
                    )}
                    {detailSale.tax > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>{t.sales.tax}</span>
                        <span>{formatCurrency(detailSale.tax)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-gray-100">
                      <span>{t.common.total}</span>
                      <span className="text-emerald-600">{formatCurrency(detailSale.total)}</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {detailSale && (
              <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setDetailSale(null)
                    setDetailLoading(false)
                  }}
                  className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-gray-200"
                >
                  {t.common.close}
                </button>
                <button
                  onClick={() => printReceipt(saleToReceipt(detailSale, pharmacy))}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                >
                  <Printer className="w-4 h-4" /> {t.sales.reprint}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
