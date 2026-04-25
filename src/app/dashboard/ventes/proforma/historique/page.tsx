'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Calendar,
  Printer,
  Eye,
  Loader2,
  X,
  Trash2,
  ShoppingCart,
  FileText,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  XCircle,
} from 'lucide-react'
import { useI18n } from '@/components/I18nProvider'
import {
  printProforma,
  formatProformaNumber,
  PROFORMA_STATUS_LABELS_FR,
  type Proforma as ProformaDoc,
} from '@/lib/proforma'
import type { ReceiptPharmacy } from '@/lib/receipt'

interface ProformaListRow {
  id: string
  createdAt: string
  total: number
  subtotal: number
  discount: number
  discountRate: number
  customerName: string | null
  customerPhone: string | null
  validityDays: number
  status: string
  convertedSaleId: string | null
  _count: { items: number }
}

interface ProformaDetail extends ProformaListRow {
  userId: string
  author: string
  notes: string | null
  items: Array<{
    id: string
    medicationName: string
    medicationRef: string | null
    quantity: number
    unitPrice: number
    total: number
  }>
}

const PAGE_SIZE = 20

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
  }).format(n)

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

const statusBadgeClass: Record<string, string> = {
  active: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  converted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
}

const detailToDoc = (
  d: ProformaDetail,
  pharmacy: ReceiptPharmacy | null
): ProformaDoc => ({
  id: d.id,
  createdAt: d.createdAt,
  subtotal: d.subtotal,
  discount: d.discount,
  discountRate: d.discountRate,
  total: d.total,
  customerName: d.customerName,
  customerPhone: d.customerPhone,
  validityDays: d.validityDays,
  notes: d.notes,
  status: d.status,
  author: d.author,
  items: d.items.map((i) => ({
    name: i.medicationName,
    reference: i.medicationRef,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    total: i.total,
  })),
  pharmacy,
})

export default function ProformaHistoriquePage() {
  const { t } = useI18n()
  const router = useRouter()

  const [rows, setRows] = useState<ProformaListRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [pharmacy, setPharmacy] = useState<ReceiptPharmacy | null>(null)
  const [detail, setDetail] = useState<ProformaDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionPending, setActionPending] = useState<string | null>(null)

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

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(PAGE_SIZE))
      if (search.trim()) params.set('search', search.trim())
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (statusFilter) params.set('status', statusFilter)

      const res = await fetch(`/api/proformas?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setRows(data.proformas || [])
        setTotal(data.pagination?.total || 0)
      }
    } finally {
      setLoading(false)
    }
  }, [page, search, dateFrom, dateTo, statusFilter])

  // Debounce de la recherche
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1)
      fetchList()
    }, 300)
    return () => clearTimeout(t)
  }, [search, dateFrom, dateTo, statusFilter, fetchList])

  useEffect(() => {
    fetchList()
  }, [page, fetchList])

  const openDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/proformas/${id}`)
      if (res.ok) {
        const data = await res.json()
        setDetail(data.proforma)
      }
    } finally {
      setDetailLoading(false)
    }
  }

  const reprint = async (id: string) => {
    setActionPending(id)
    try {
      const res = await fetch(`/api/proformas/${id}`)
      if (!res.ok) return
      const data = await res.json()
      printProforma(detailToDoc(data.proforma, pharmacy))
    } finally {
      setActionPending(null)
    }
  }

  const convertToSale = (id: string) => {
    if (!confirm(t.proforma.convertConfirm)) return
    router.push(`/dashboard/ventes?proformaId=${id}`)
  }

  const cancelProforma = async (id: string) => {
    if (!confirm(t.proforma.cancelConfirm)) return
    setActionPending(id)
    try {
      const res = await fetch(`/api/proformas/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (res.ok) {
        await fetchList()
        if (detail?.id === id) setDetail(null)
      }
    } finally {
      setActionPending(null)
    }
  }

  const deleteProforma = async (id: string) => {
    if (!confirm(t.proforma.deleteConfirm)) return
    setActionPending(id)
    try {
      const res = await fetch(`/api/proformas/${id}`, { method: 'DELETE' })
      if (res.ok) {
        await fetchList()
        if (detail?.id === id) setDetail(null)
      }
    } finally {
      setActionPending(null)
    }
  }

  const resetFilters = () => {
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setStatusFilter('')
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      {/* Bandeau légal */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <p className="text-xs font-medium">{t.proforma.legalBanner}</p>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 grid grid-cols-1 sm:grid-cols-5 gap-2">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.proforma.searchPlaceholder}
            className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>
        <div className="flex gap-1.5">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            <option value="">{t.proforma.allStatuses}</option>
            <option value="active">{t.proforma.statusActive}</option>
            <option value="converted">{t.proforma.statusConverted}</option>
            <option value="cancelled">{t.proforma.statusCancelled}</option>
          </select>
          {(search || dateFrom || dateTo || statusFilter) && (
            <button
              onClick={resetFilters}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
              title={t.sales.resetFilters}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 min-h-0 overflow-auto bg-white rounded-2xl border border-gray-100 shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-gray-500">
            <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
            {t.common.loading}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">{t.proforma.noProformas}</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden md:table w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3">{t.common.date}</th>
                  <th className="px-4 py-3">{t.proforma.number}</th>
                  <th className="px-4 py-3">{t.proforma.recipient}</th>
                  <th className="px-4 py-3 text-center">{t.proforma.items}</th>
                  <th className="px-4 py-3 text-right">{t.proforma.total}</th>
                  <th className="px-4 py-3">{t.common.status}</th>
                  <th className="px-4 py-3 text-right">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(r.createdAt)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{formatProformaNumber(r.id)}</td>
                    <td className="px-4 py-3 text-gray-900">
                      {r.customerName || <span className="text-gray-400">—</span>}
                      {r.customerPhone && (
                        <div className="text-xs text-gray-400">{r.customerPhone}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{r._count.items}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatCurrency(r.total)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs border ${
                          statusBadgeClass[r.status] || 'bg-gray-50 text-gray-700'
                        }`}
                      >
                        {PROFORMA_STATUS_LABELS_FR[r.status] || r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openDetail(r.id)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-indigo-50"
                          title={t.sales.viewDetails}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => reprint(r.id)}
                          disabled={actionPending === r.id}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                          title={t.proforma.reprint}
                        >
                          {actionPending === r.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Printer className="w-4 h-4" />
                          )}
                        </button>
                        {r.status === 'active' && (
                          <>
                            <button
                              onClick={() => convertToSale(r.id)}
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50"
                              title={t.proforma.convertToSale}
                            >
                              <ShoppingCart className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => cancelProforma(r.id)}
                              disabled={actionPending === r.id}
                              className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50"
                              title={t.proforma.cancel}
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => deleteProforma(r.id)}
                          disabled={actionPending === r.id}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                          title={t.proforma.delete}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {rows.map((r) => (
                <div key={r.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-500">
                          {formatProformaNumber(r.id)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs border ${
                            statusBadgeClass[r.status] || 'bg-gray-50 text-gray-700'
                          }`}
                        >
                          {PROFORMA_STATUS_LABELS_FR[r.status] || r.status}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 mt-1 truncate">
                        {r.customerName || '—'}
                      </p>
                      <p className="text-xs text-gray-400">{formatDate(r.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-indigo-600">
                        {formatCurrency(r.total)}
                      </p>
                      <p className="text-xs text-gray-400">{r._count.items} art.</p>
                    </div>
                  </div>
                  <div className="flex gap-1 mt-2">
                    <button
                      onClick={() => openDetail(r.id)}
                      className="flex-1 py-1 text-xs bg-gray-100 rounded-lg"
                    >
                      <Eye className="w-3 h-3 inline mr-1" />
                      {t.sales.viewDetails}
                    </button>
                    <button
                      onClick={() => reprint(r.id)}
                      className="flex-1 py-1 text-xs bg-indigo-100 text-indigo-700 rounded-lg"
                    >
                      <Printer className="w-3 h-3 inline mr-1" />
                      {t.proforma.reprint}
                    </button>
                    {r.status === 'active' && (
                      <button
                        onClick={() => convertToSale(r.id)}
                        className="flex-1 py-1 text-xs bg-emerald-100 text-emerald-700 rounded-lg"
                      >
                        <ShoppingCart className="w-3 h-3 inline mr-1" />
                        {t.proforma.convertToSale}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {total} {t.proforma.item}(s) • {t.common.period} {page}/{totalPages}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white px-5 py-3 border-b border-gray-100 flex items-center justify-between z-10">
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  {t.proforma.detailsTitle}
                </h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">
                  {formatProformaNumber(detail.id)}
                </p>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500">{t.proforma.emitted}</p>
                  <p className="font-medium">{formatDate(detail.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t.proforma.author}</p>
                  <p className="font-medium">{detail.author}</p>
                </div>
                {detail.customerName && (
                  <div>
                    <p className="text-xs text-gray-500">{t.proforma.recipient}</p>
                    <p className="font-medium">{detail.customerName}</p>
                    {detail.customerPhone && (
                      <p className="text-xs text-gray-500">{detail.customerPhone}</p>
                    )}
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500">{t.proforma.validity}</p>
                  <p className="font-medium">
                    {detail.validityDays > 0
                      ? `${detail.validityDays} j`
                      : '—'}
                  </p>
                </div>
              </div>

              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">{t.proforma.designation}</th>
                    <th className="px-3 py-2 text-center">{t.proforma.quantity}</th>
                    <th className="px-3 py-2 text-right">{t.proforma.unitPrice}</th>
                    <th className="px-3 py-2 text-right">{t.proforma.lineTotal}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detail.items.map((i) => (
                    <tr key={i.id}>
                      <td className="px-3 py-2">
                        <p className="font-medium">{i.medicationName}</p>
                        {i.medicationRef && (
                          <p className="text-xs text-gray-400">Réf. {i.medicationRef}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">{i.quantity}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(i.unitPrice)}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatCurrency(i.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end">
                <table className="text-sm">
                  <tbody>
                    <tr>
                      <td className="pr-4 text-gray-600">{t.proforma.subtotal}</td>
                      <td className="text-right">{formatCurrency(detail.subtotal)}</td>
                    </tr>
                    {detail.discount > 0 && (
                      <tr>
                        <td className="pr-4 text-gray-600">
                          {t.proforma.discount} ({detail.discountRate}%)
                        </td>
                        <td className="text-right text-red-600">
                          -{formatCurrency(detail.discount)}
                        </td>
                      </tr>
                    )}
                    <tr className="border-t border-gray-300">
                      <td className="pr-4 pt-2 font-bold">{t.proforma.total}</td>
                      <td className="text-right pt-2 font-bold text-indigo-600 text-base">
                        {formatCurrency(detail.total)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {detail.notes && (
                <div className="p-3 bg-amber-50 border-l-4 border-amber-400 rounded-lg">
                  <p className="text-xs font-semibold text-amber-800 mb-1">
                    {t.proforma.notes}
                  </p>
                  <p className="text-sm text-amber-900 whitespace-pre-wrap">{detail.notes}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                <button
                  onClick={() => printProforma(detailToDoc(detail, pharmacy))}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" /> {t.proforma.print}
                </button>
                {detail.status === 'active' && (
                  <button
                    onClick={() => convertToSale(detail.id)}
                    className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 flex items-center gap-2"
                  >
                    <ShoppingCart className="w-4 h-4" /> {t.proforma.convertToSale}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {detailLoading && !detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      )}
    </div>
  )
}
