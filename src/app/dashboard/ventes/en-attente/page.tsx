'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Loader2,
  X,
  Clock,
  Eye,
  Play,
  Trash2,
  Pencil,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { useI18n } from '@/components/I18nProvider'

interface PendingSaleRow {
  id: string
  createdAt: string
  total: number
  customerName: string | null
  customerPhone: string | null
  reason: string
  note: string | null
  status: string
  paymentMethod: string | null
  convertedSaleId: string | null
  _count: { items: number }
}

interface PendingSaleDetail extends PendingSaleRow {
  userId: string
  author: string
  subtotal: number
  discount: number
  discountRate: number
  tax: number
  insuranceId: string | null
  beneficiaryId: string | null
  insuranceCoverage: number | null
  isPrescription: boolean
  creditNoteId: string | null
  creditNoteAmount: number | null
  items: Array<{
    id: string
    medicationId: string | null
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

const reasonBadgeClass: Record<string, string> = {
  NO_PAYMENT: 'bg-amber-50 text-amber-700 border-amber-200',
  MISSING_PRESCRIPTION: 'bg-violet-50 text-violet-700 border-violet-200',
  AWAITING_INSURANCE: 'bg-sky-50 text-sky-700 border-sky-200',
  OUT_OF_STOCK: 'bg-rose-50 text-rose-700 border-rose-200',
  OTHER: 'bg-gray-50 text-gray-700 border-gray-200',
}

const statusBadgeClass: Record<string, string> = {
  active: 'bg-orange-50 text-orange-700 border-orange-200',
  converted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
}

export default function PendingSalesPage() {
  const { t } = useI18n()
  const router = useRouter()

  const [rows, setRows] = useState<PendingSaleRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [reasonFilter, setReasonFilter] = useState('')

  const [stats, setStats] = useState({
    activeCount: 0,
    activeAmount: 0,
    oldestAt: null as string | null,
    convertedCount: 0,
  })

  const [detail, setDetail] = useState<PendingSaleDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionPending, setActionPending] = useState<string | null>(null)

  const [editing, setEditing] = useState<PendingSaleRow | null>(null)
  const [editReason, setEditReason] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const reasonLabel = useCallback(
    (code: string) => {
      const map: Record<string, string> = {
        NO_PAYMENT: t.salesPending.reasonNoPayment,
        MISSING_PRESCRIPTION: t.salesPending.reasonMissingPrescription,
        AWAITING_INSURANCE: t.salesPending.reasonAwaitingInsurance,
        OUT_OF_STOCK: t.salesPending.reasonOutOfStock,
        OTHER: t.salesPending.reasonOther,
      }
      return map[code] || code
    },
    [t]
  )

  const statusLabel = useCallback(
    (code: string) => {
      const map: Record<string, string> = {
        active: t.salesPending.statusActive,
        converted: t.salesPending.statusConverted,
        cancelled: t.salesPending.statusCancelled,
      }
      return map[code] || code
    },
    [t]
  )

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
      if (reasonFilter) params.set('reason', reasonFilter)

      const res = await fetch(`/api/sales/pending?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setRows(data.pendingSales || [])
        setTotal(data.pagination?.total || 0)
      }
    } finally {
      setLoading(false)
    }
  }, [page, search, dateFrom, dateTo, statusFilter, reasonFilter])

  // Stats : on charge en parallèle 1 page d'actives + 1 page de converted
  // (on lit juste les agrégats, pas la pagination complète).
  const fetchStats = useCallback(async () => {
    try {
      const [activeRes, convertedRes] = await Promise.all([
        fetch(`/api/sales/pending?status=active&limit=200`),
        fetch(`/api/sales/pending?status=converted&limit=1`),
      ])
      const active = activeRes.ok ? await activeRes.json() : null
      const converted = convertedRes.ok ? await convertedRes.json() : null

      const list: PendingSaleRow[] = active?.pendingSales || []
      const activeAmount = list.reduce((s, r) => s + (r.total || 0), 0)
      const sortedByDate = [...list].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
      setStats({
        activeCount: active?.pagination?.total ?? list.length,
        activeAmount,
        oldestAt: sortedByDate[0]?.createdAt ?? null,
        convertedCount: converted?.pagination?.total ?? 0,
      })
    } catch {
      /* silent */
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  useEffect(() => {
    const handle = setTimeout(() => {
      setPage(1)
      fetchList()
    }, 300)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, dateFrom, dateTo, statusFilter, reasonFilter])

  useEffect(() => {
    fetchList()
  }, [page, fetchList])

  const openDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/sales/pending/${id}`)
      if (res.ok) {
        const data = await res.json()
        setDetail(data.pendingSale)
      }
    } finally {
      setDetailLoading(false)
    }
  }

  const resume = (id: string) => {
    router.push(`/dashboard/ventes?pendingId=${id}`)
  }

  const cancelPending = async (id: string) => {
    if (!confirm(t.salesPending.cancelConfirm)) return
    setActionPending(id)
    try {
      const res = await fetch(`/api/sales/pending/${id}`, { method: 'DELETE' })
      if (res.ok) {
        await Promise.all([fetchList(), fetchStats()])
      }
    } finally {
      setActionPending(null)
    }
  }

  const openEdit = (row: PendingSaleRow) => {
    setEditing(row)
    setEditReason(row.reason)
    setEditNote(row.note || '')
    setEditError('')
  }

  const saveEdit = async () => {
    if (!editing) return
    if (!editReason) {
      setEditError(t.salesPending.reasonRequired)
      return
    }
    setEditSaving(true)
    setEditError('')
    try {
      const res = await fetch(`/api/sales/pending/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: editReason, note: editNote.trim() || null }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setEditError(data.error || 'Erreur')
        return
      }
      setEditing(null)
      await fetchList()
    } finally {
      setEditSaving(false)
    }
  }

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total])

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 overflow-y-auto">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Clock className="w-5 h-5 text-orange-600" />
          {t.salesPending.pageTitle}
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">{t.salesPending.subtitle}</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Hourglass className="w-3.5 h-3.5 text-orange-500" />
            {t.salesPending.statsTotal}
          </div>
          <div className="mt-1 text-xl font-bold text-gray-900">{stats.activeCount}</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500">{t.salesPending.statsTotalAmount}</div>
          <div className="mt-1 text-xl font-bold text-orange-600">
            {formatCurrency(stats.activeAmount)}
          </div>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
          <div className="text-xs text-gray-500">{t.salesPending.statsOldest}</div>
          <div className="mt-1 text-sm font-medium text-gray-900">
            {stats.oldestAt ? formatDate(stats.oldestAt) : '—'}
          </div>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            {t.salesPending.statsConverted}
          </div>
          <div className="mt-1 text-xl font-bold text-emerald-600">{stats.convertedCount}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm grid grid-cols-1 md:grid-cols-5 gap-2">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.salesPending.searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40"
        >
          <option value="active">{t.salesPending.statusActive}</option>
          <option value="converted">{t.salesPending.statusConverted}</option>
          <option value="cancelled">{t.salesPending.statusCancelled}</option>
          <option value="all">{t.salesPending.allStatuses}</option>
        </select>
        <select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40"
        >
          <option value="">{t.salesPending.allReasons}</option>
          <option value="NO_PAYMENT">{t.salesPending.reasonNoPayment}</option>
          <option value="MISSING_PRESCRIPTION">{t.salesPending.reasonMissingPrescription}</option>
          <option value="AWAITING_INSURANCE">{t.salesPending.reasonAwaitingInsurance}</option>
          <option value="OUT_OF_STOCK">{t.salesPending.reasonOutOfStock}</option>
          <option value="OTHER">{t.salesPending.reasonOther}</option>
        </select>
        <div className="flex gap-1">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="flex-1 px-2 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/40"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="flex-1 px-2 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/40"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-medium">{t.salesPending.createdAt}</th>
                <th className="text-left px-3 py-2 font-medium">{t.salesPending.customer}</th>
                <th className="text-center px-3 py-2 font-medium">{t.salesPending.items}</th>
                <th className="text-right px-3 py-2 font-medium">{t.salesPending.total}</th>
                <th className="text-left px-3 py-2 font-medium">{t.salesPending.reasonLabel}</th>
                <th className="text-left px-3 py-2 font-medium">Statut</th>
                <th className="text-right px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-gray-400">
                    {t.salesPending.noPending}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                    <td className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-gray-900 font-medium text-xs">
                        {row.customerName || '—'}
                      </div>
                      {row.customerPhone && (
                        <div className="text-[11px] text-gray-500">{row.customerPhone}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-gray-600">
                      {row._count.items}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900 text-sm">
                      {formatCurrency(row.total)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-medium ${
                          reasonBadgeClass[row.reason] || reasonBadgeClass.OTHER
                        }`}
                      >
                        {reasonLabel(row.reason)}
                      </span>
                      {row.note && (
                        <div
                          className="text-[11px] text-gray-500 truncate max-w-[180px] mt-0.5"
                          title={row.note}
                        >
                          {row.note}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-medium ${
                          statusBadgeClass[row.status] || ''
                        }`}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openDetail(row.id)}
                          title={t.salesPending.viewDetails}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {row.status === 'active' && (
                          <>
                            <button
                              onClick={() => resume(row.id)}
                              title={t.salesPending.resume}
                              className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openEdit(row)}
                              title={t.salesPending.edit}
                              className="p-1.5 rounded-lg text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => cancelPending(row.id)}
                              disabled={actionPending === row.id}
                              title={t.salesPending.discard}
                              className="p-1.5 rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              {actionPending === row.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="border-t border-gray-100 px-3 py-2 flex items-center justify-between text-xs text-gray-600">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {(detail || detailLoading) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => {
            setDetail(null)
            setDetailLoading(false)
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading ? (
              <div className="p-12 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-orange-600" />
              </div>
            ) : detail ? (
              <div className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-orange-600" />
                      {t.salesPending.detailsTitle}
                    </h3>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {formatDate(detail.createdAt)} • {detail.author}
                    </p>
                  </div>
                  <button
                    onClick={() => setDetail(null)}
                    className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="text-gray-500">{t.salesPending.customer}</div>
                    <div className="font-medium text-gray-900 mt-0.5">
                      {detail.customerName || '—'}
                    </div>
                    {detail.customerPhone && (
                      <div className="text-gray-500">{detail.customerPhone}</div>
                    )}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="text-gray-500">{t.salesPending.reasonLabel}</div>
                    <div className="font-medium text-gray-900 mt-0.5">
                      {reasonLabel(detail.reason)}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Statut : {statusLabel(detail.status)}
                    </div>
                  </div>
                </div>

                {detail.note && (
                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-2 text-xs text-amber-800">
                    <div className="font-medium text-[11px] uppercase tracking-wide text-amber-700 mb-0.5">
                      {t.salesPending.note}
                    </div>
                    {detail.note}
                  </div>
                )}

                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="text-left px-2 py-1.5 font-medium">Désignation</th>
                        <th className="text-center px-2 py-1.5 font-medium">Qté</th>
                        <th className="text-right px-2 py-1.5 font-medium">PU</th>
                        <th className="text-right px-2 py-1.5 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map((it) => (
                        <tr key={it.id} className="border-t border-gray-100">
                          <td className="px-2 py-1.5">
                            <div className="text-gray-900">{it.medicationName}</div>
                            {it.medicationRef && (
                              <div className="text-[10px] text-gray-500">{it.medicationRef}</div>
                            )}
                            {!it.medicationId && (
                              <div className="text-[10px] text-amber-700 flex items-center gap-1 mt-0.5">
                                <AlertTriangle className="w-3 h-3" />
                                Médicament supprimé du catalogue
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-center">{it.quantity}</td>
                          <td className="px-2 py-1.5 text-right">{formatCurrency(it.unitPrice)}</td>
                          <td className="px-2 py-1.5 text-right font-medium">
                            {formatCurrency(it.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={3} className="px-2 py-1.5 text-right font-medium text-gray-700">
                          {t.salesPending.total}
                        </td>
                        <td className="px-2 py-1.5 text-right font-bold text-orange-700">
                          {formatCurrency(detail.total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {detail.convertedSaleId && (
                  <div className="text-[11px] text-emerald-700 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    {t.salesPending.convertedSale}: {detail.convertedSaleId}
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <button
                    onClick={() => setDetail(null)}
                    className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
                  >
                    {t.salesPending.discard}
                  </button>
                  {detail.status === 'active' && (
                    <button
                      onClick={() => resume(detail.id)}
                      className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center justify-center gap-1.5"
                    >
                      <Play className="w-4 h-4" /> {t.salesPending.resume}
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Edit modal (reason + note) */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => !editSaving && setEditing(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Pencil className="w-4 h-4 text-blue-600" /> {t.salesPending.edit}
              </h3>
              <button
                onClick={() => !editSaving && setEditing(null)}
                disabled={editSaving}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t.salesPending.reasonLabel} *
                </label>
                <select
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  <option value="NO_PAYMENT">{t.salesPending.reasonNoPayment}</option>
                  <option value="MISSING_PRESCRIPTION">
                    {t.salesPending.reasonMissingPrescription}
                  </option>
                  <option value="AWAITING_INSURANCE">{t.salesPending.reasonAwaitingInsurance}</option>
                  <option value="OUT_OF_STOCK">{t.salesPending.reasonOutOfStock}</option>
                  <option value="OTHER">{t.salesPending.reasonOther}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t.salesPending.noteLabel}
                </label>
                <textarea
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder={t.salesPending.notePlaceholder}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                />
              </div>
              {editError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-1">
                  <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {editError}
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setEditing(null)}
                  disabled={editSaving}
                  className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50"
                >
                  {t.salesPending.discard}
                </button>
                <button
                  onClick={saveEdit}
                  disabled={editSaving}
                  className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
