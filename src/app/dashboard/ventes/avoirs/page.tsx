'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Search,
  Plus,
  RefreshCw,
  Receipt,
  Eye,
  Printer,
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
  Ban,
  Wallet,
  TrendingDown,
  Coins,
} from 'lucide-react'
import { useI18n } from '@/components/I18nProvider'
import {
  printCreditNoteReceipt,
  type CreditNoteReceipt,
  type ReceiptPharmacy,
} from '@/lib/receipt'
import {
  CREDIT_NOTE_REASON_LABELS_FR,
  CREDIT_NOTE_STATUS_LABELS_FR,
  CREDIT_NOTE_REASONS,
  formatCreditNoteNumber,
  type CreditNoteReason,
  type CreditNoteStatus,
} from '@/lib/credit-note'

interface CreditNoteRow {
  id: string
  amount: number
  usedAmount: number
  remaining: number
  reason: CreditNoteReason
  status: CreditNoteStatus
  effectiveStatus: CreditNoteStatus
  notes: string | null
  expiresAt: string | null
  customerId: string | null
  customerName: string | null
  customerPhone: string | null
  originSaleId: string | null
  createdAt: string
  customer: { id: string; fullName: string; phone: string | null } | null
  originSale: { id: string; total: number; createdAt: string } | null
}

interface CreditNoteUsage {
  id: string
  amount: number
  createdAt: string
  sale: { id: string; total: number; createdAt: string; customerName: string | null; paymentMethod: string } | null
}

interface CreditNoteDetail extends CreditNoteRow {
  usages: CreditNoteUsage[]
  originSale: { id: string; total: number; createdAt: string; customerName: string | null } | null
}

interface CustomerOption {
  id: string
  fullName: string
  phone: string | null
}

const fmtXOF = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(n)

const fmtDate = (s: string) => new Date(s).toLocaleDateString('fr-FR', { dateStyle: 'medium' } as Intl.DateTimeFormatOptions)

const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

const STATUS_BADGE: Record<CreditNoteStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partially_used: 'bg-amber-50 text-amber-700 border-amber-200',
  used: 'bg-gray-100 text-gray-600 border-gray-200',
  expired: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
}

export default function AvoirsPage() {
  const { t } = useI18n()

  const [rows, setRows] = useState<CreditNoteRow[]>([])
  const [totals, setTotals] = useState({
    totalIssued: 0,
    totalUsed: 0,
    outstanding: 0,
    activeCount: 0,
    totalCount: 0,
  })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | CreditNoteStatus>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedDetail, setSelectedDetail] = useState<CreditNoteDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [pharmacy, setPharmacy] = useState<ReceiptPharmacy | null>(null)

  // Create form state
  const [form, setForm] = useState({
    amount: '',
    reason: 'RETURN' as CreditNoteReason,
    customerId: '',
    customerName: '',
    customerPhone: '',
    originSaleId: '',
    expiresAt: '',
    notes: '',
  })
  const [formError, setFormError] = useState('')
  const [formSaving, setFormSaving] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (statusFilter) params.set('status', statusFilter)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/credit-notes?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setRows(data.creditNotes || [])
        setTotals(data.totals || totals)
      }
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter, dateFrom, dateTo])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Charge la liste des clients (pour le sélecteur de la modale création) et
  // les infos pharmacie (en-tête du bon imprimable). Une seule fois au montage.
  useEffect(() => {
    fetch('/api/customers?limit=500')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCustomers(d?.customers || []))
      .catch(() => {})

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

  const openCreateModal = () => {
    setForm({
      amount: '',
      reason: 'RETURN',
      customerId: '',
      customerName: '',
      customerPhone: '',
      originSaleId: '',
      expiresAt: '',
      notes: '',
    })
    setFormError('')
    setShowCreateModal(true)
  }

  const handleCreate = async () => {
    setFormError('')
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError(t.creditNotes.amountInvalid)
      return
    }
    setFormSaving(true)
    try {
      const res = await fetch('/api/credit-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          reason: form.reason,
          customerId: form.customerId || null,
          customerName: form.customerId ? null : form.customerName.trim() || null,
          customerPhone: form.customerId ? null : form.customerPhone.trim() || null,
          originSaleId: form.originSaleId.trim() || null,
          expiresAt: form.expiresAt || null,
          notes: form.notes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Erreur')
        return
      }
      setShowCreateModal(false)
      await loadData()
      // Imprimer immédiatement le bon nouvellement créé
      if (data.creditNote && pharmacy !== undefined) {
        const cn = data.creditNote
        printCreditNoteReceipt({
          id: cn.id,
          createdAt: cn.createdAt,
          amount: cn.amount,
          usedAmount: cn.usedAmount,
          remaining: cn.remaining,
          reason: cn.reason,
          customerName: cn.customerName,
          customerPhone: cn.customerPhone,
          notes: cn.notes,
          expiresAt: cn.expiresAt,
          originSaleRef: cn.originSaleId ? cn.originSaleId.slice(-8).toUpperCase() : null,
          issuedBy: null,
          pharmacy,
        })
      }
    } finally {
      setFormSaving(false)
    }
  }

  const openDetail = async (id: string) => {
    setShowDetailModal(true)
    setDetailLoading(true)
    setSelectedDetail(null)
    try {
      const res = await fetch(`/api/credit-notes/${id}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedDetail(data.creditNote)
      }
    } finally {
      setDetailLoading(false)
    }
  }

  const handleCancel = async (id: string) => {
    if (!confirm(t.creditNotes.cancelConfirm)) return
    const res = await fetch(`/api/credit-notes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    })
    if (res.ok) {
      setShowDetailModal(false)
      await loadData()
    } else {
      const data = await res.json()
      alert(data.error || 'Erreur')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t.creditNotes.deleteConfirm)) return
    const res = await fetch(`/api/credit-notes/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setShowDetailModal(false)
      await loadData()
    } else {
      const data = await res.json()
      alert(data.error || 'Erreur')
    }
  }

  const reprint = (cn: CreditNoteRow | CreditNoteDetail) => {
    if (!pharmacy) return
    printCreditNoteReceipt({
      id: cn.id,
      createdAt: cn.createdAt,
      amount: cn.amount,
      usedAmount: cn.usedAmount,
      remaining: cn.remaining,
      reason: cn.reason,
      customerName: cn.customerName,
      customerPhone: cn.customerPhone,
      notes: cn.notes,
      expiresAt: cn.expiresAt,
      originSaleRef: cn.originSaleId ? cn.originSaleId.slice(-8).toUpperCase() : null,
      issuedBy: null,
      pharmacy,
    })
  }

  // Quand un client est sélectionné dans la modale création, on synchronise
  // les snapshots nom/téléphone pour qu'ils soient visibles (mais on les
  // ignorera côté API si customerId est défini).
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === form.customerId) || null,
    [customers, form.customerId]
  )

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 overflow-y-auto">
      {/* Header + Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Wallet className="w-4 h-4" />}
          label={t.creditNotes.totalIssued}
          value={fmtXOF(totals.totalIssued)}
          tone="indigo"
        />
        <StatCard
          icon={<TrendingDown className="w-4 h-4" />}
          label={t.creditNotes.totalUsed}
          value={fmtXOF(totals.totalUsed)}
          tone="amber"
        />
        <StatCard
          icon={<Coins className="w-4 h-4" />}
          label={t.creditNotes.outstandingTotal}
          value={fmtXOF(totals.outstanding)}
          tone="emerald"
        />
        <StatCard
          icon={<Receipt className="w-4 h-4" />}
          label={t.creditNotes.activeCount}
          value={String(totals.activeCount)}
          tone="violet"
        />
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.creditNotes.searchPlaceholder}
              className="w-full pl-10 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as '' | CreditNoteStatus)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          >
            <option value="">{t.creditNotes.allStatuses}</option>
            <option value="active">{t.creditNotes.statusActive}</option>
            <option value="partially_used">{t.creditNotes.statusPartiallyUsed}</option>
            <option value="used">{t.creditNotes.statusUsed}</option>
            <option value="expired">{t.creditNotes.statusExpired}</option>
            <option value="cancelled">{t.creditNotes.statusCancelled}</option>
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          />
          <button
            onClick={loadData}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white hover:bg-gray-50 flex items-center gap-1"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 text-sm font-medium bg-violet-600 text-white rounded-xl hover:bg-violet-700 flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> {t.creditNotes.newCreditNote}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex-1 min-h-0 flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t.common.loading}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
            <Receipt className="w-10 h-10 mb-3 opacity-50" />
            <p className="text-sm">{t.creditNotes.noCreditNotes}</p>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm hidden md:table">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">{t.creditNotes.number}</th>
                  <th className="px-3 py-2 text-left">{t.common.date}</th>
                  <th className="px-3 py-2 text-left">{t.creditNotes.reason}</th>
                  <th className="px-3 py-2 text-left">{t.common.name}</th>
                  <th className="px-3 py-2 text-right">{t.creditNotes.initialAmount}</th>
                  <th className="px-3 py-2 text-right">{t.creditNotes.usedAmount}</th>
                  <th className="px-3 py-2 text-right">{t.creditNotes.remainingAmount}</th>
                  <th className="px-3 py-2 text-left">{t.common.status}</th>
                  <th className="px-3 py-2 text-right">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((cn) => (
                  <tr key={cn.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{formatCreditNoteNumber(cn.id)}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{fmtDateTime(cn.createdAt)}</td>
                    <td className="px-3 py-2 text-xs">{CREDIT_NOTE_REASON_LABELS_FR[cn.reason]}</td>
                    <td className="px-3 py-2 text-xs">
                      {cn.customerName || '—'}
                      {cn.customerPhone && (
                        <div className="text-gray-400">{cn.customerPhone}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{fmtXOF(cn.amount)}</td>
                    <td className="px-3 py-2 text-right text-amber-600">
                      {cn.usedAmount > 0 ? fmtXOF(cn.usedAmount) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-700">
                      {fmtXOF(cn.remaining)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] font-medium border rounded-full ${
                          STATUS_BADGE[cn.effectiveStatus]
                        }`}
                      >
                        {CREDIT_NOTE_STATUS_LABELS_FR[cn.effectiveStatus]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openDetail(cn.id)}
                          title={t.sales.viewDetails}
                          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => reprint(cn)}
                          title={t.creditNotes.reprint}
                          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {rows.map((cn) => (
                <div key={cn.id} className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs">{formatCreditNoteNumber(cn.id)}</span>
                    <span
                      className={`inline-block px-2 py-0.5 text-[10px] font-medium border rounded-full ${
                        STATUS_BADGE[cn.effectiveStatus]
                      }`}
                    >
                      {CREDIT_NOTE_STATUS_LABELS_FR[cn.effectiveStatus]}
                    </span>
                  </div>
                  <div className="text-sm font-medium">{cn.customerName || '—'}</div>
                  <div className="text-xs text-gray-500">
                    {fmtDateTime(cn.createdAt)} · {CREDIT_NOTE_REASON_LABELS_FR[cn.reason]}
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t.creditNotes.remainingAmount}</span>
                    <span className="font-bold text-emerald-700">{fmtXOF(cn.remaining)}</span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => openDetail(cn.id)}
                      className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <Eye className="w-3 h-3 inline mr-1" /> {t.sales.viewDetails}
                    </button>
                    <button
                      onClick={() => reprint(cn)}
                      className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <Printer className="w-3 h-3 inline mr-1" /> {t.creditNotes.reprint}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-violet-600" /> {t.creditNotes.newCreditNote}
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t.creditNotes.amount} (XOF) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t.creditNotes.reason} *
                  </label>
                  <select
                    value={form.reason}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, reason: e.target.value as CreditNoteReason }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                  >
                    {CREDIT_NOTE_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {CREDIT_NOTE_REASON_LABELS_FR[r]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t.creditNotes.customerOptional}
                </label>
                <select
                  value={form.customerId}
                  onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/40 mb-2"
                >
                  <option value="">— Avoir anonyme (saisie libre ci-dessous) —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                      {c.phone ? ` · ${c.phone}` : ''}
                    </option>
                  ))}
                </select>
                {!form.customerId && (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      placeholder={t.creditNotes.customerName}
                      value={form.customerName}
                      onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                    />
                    <input
                      placeholder={t.creditNotes.customerPhone}
                      value={form.customerPhone}
                      onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                    />
                  </div>
                )}
                {selectedCustomer && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    Client lié : <strong>{selectedCustomer.fullName}</strong>
                    {selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ''}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t.creditNotes.originSale}
                </label>
                <input
                  placeholder="ID ou n° de vente (optionnel)"
                  value={form.originSaleId}
                  onChange={(e) => setForm((f) => ({ ...f, originSaleId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                />
                <p className="text-[11px] text-gray-400 mt-0.5">{t.creditNotes.originSaleHint}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t.creditNotes.expiresAt}
                </label>
                <input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                />
                <p className="text-[11px] text-gray-400 mt-0.5">{t.creditNotes.expiresAtHint}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t.creditNotes.notes}
                </label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                />
              </div>

              {formError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-gray-200"
                >
                  {t.common.cancel}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={formSaving}
                  className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {formSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {t.creditNotes.create}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {showDetailModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowDetailModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-violet-600" />
                {selectedDetail
                  ? `${t.creditNotes.title} ${formatCreditNoteNumber(selectedDetail.id)}`
                  : t.common.loading}
              </h3>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailLoading ? (
              <div className="py-12 flex items-center justify-center text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t.common.loading}
              </div>
            ) : selectedDetail ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <SmallStat label={t.creditNotes.initialAmount} value={fmtXOF(selectedDetail.amount)} />
                  <SmallStat
                    label={t.creditNotes.usedAmount}
                    value={fmtXOF(selectedDetail.usedAmount)}
                    tone="amber"
                  />
                  <SmallStat
                    label={t.creditNotes.remainingAmount}
                    value={fmtXOF(selectedDetail.remaining)}
                    tone="emerald"
                  />
                </div>

                <div className="rounded-xl border border-gray-100 p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t.creditNotes.reason}</span>
                    <span className="font-medium">
                      {CREDIT_NOTE_REASON_LABELS_FR[selectedDetail.reason]}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t.common.status}</span>
                    <span
                      className={`inline-block px-2 py-0.5 text-[10px] font-medium border rounded-full ${
                        STATUS_BADGE[selectedDetail.effectiveStatus]
                      }`}
                    >
                      {CREDIT_NOTE_STATUS_LABELS_FR[selectedDetail.effectiveStatus]}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t.creditNotes.issuedOn}</span>
                    <span>{fmtDateTime(selectedDetail.createdAt)}</span>
                  </div>
                  {selectedDetail.expiresAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t.creditNotes.expiresAt}</span>
                      <span>{fmtDate(selectedDetail.expiresAt)}</span>
                    </div>
                  )}
                  {(selectedDetail.customerName || selectedDetail.customerPhone) && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t.common.name}</span>
                      <span>
                        {selectedDetail.customerName}
                        {selectedDetail.customerPhone ? ` · ${selectedDetail.customerPhone}` : ''}
                      </span>
                    </div>
                  )}
                  {selectedDetail.originSale && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t.creditNotes.originSale}</span>
                      <span className="font-mono text-xs">
                        {formatCreditNoteNumber(selectedDetail.originSale.id)} ·{' '}
                        {fmtXOF(selectedDetail.originSale.total)}
                      </span>
                    </div>
                  )}
                  {selectedDetail.notes && (
                    <div className="pt-2 border-t border-gray-100">
                      <span className="text-gray-500">{t.common.notes}: </span>
                      {selectedDetail.notes}
                    </div>
                  )}
                </div>

                {selectedDetail.usages.length > 0 && (
                  <div className="rounded-xl border border-gray-100 p-3">
                    <h4 className="text-xs font-semibold text-gray-700 mb-2">
                      {t.creditNotes.usageHistory}
                    </h4>
                    <ul className="space-y-1.5 text-xs">
                      {selectedDetail.usages.map((u) => (
                        <li key={u.id} className="flex justify-between border-b border-gray-50 pb-1.5">
                          <span>
                            {fmtDateTime(u.createdAt)}
                            {u.sale && (
                              <>
                                {' '}
                                · {t.creditNotes.onSale}{' '}
                                <span className="font-mono">
                                  {formatCreditNoteNumber(u.sale.id)}
                                </span>
                              </>
                            )}
                          </span>
                          <span className="font-semibold text-amber-700">
                            -{fmtXOF(u.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <button
                    onClick={() => reprint(selectedDetail)}
                    className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-gray-200 flex items-center gap-1"
                  >
                    <Printer className="w-4 h-4" /> {t.creditNotes.reprint}
                  </button>
                  {selectedDetail.usedAmount <= 0.009 &&
                    selectedDetail.effectiveStatus !== 'cancelled' && (
                      <button
                        onClick={() => handleDelete(selectedDetail.id)}
                        className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-red-50 hover:text-red-700 flex items-center gap-1"
                      >
                        <X className="w-4 h-4" /> {t.common.delete}
                      </button>
                    )}
                  {selectedDetail.effectiveStatus !== 'cancelled' &&
                    selectedDetail.effectiveStatus !== 'used' && (
                      <button
                        onClick={() => handleCancel(selectedDetail.id)}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 flex items-center gap-1"
                      >
                        <Ban className="w-4 h-4" /> {t.creditNotes.cancel}
                      </button>
                    )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone: 'emerald' | 'amber' | 'indigo' | 'violet'
}) {
  const tones: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
      <div
        className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border ${tones[tone]}`}
      >
        {icon}
      </div>
      <div className="text-[11px] text-gray-500 mt-1.5">{label}</div>
      <div className="text-base font-bold text-gray-900">{value}</div>
    </div>
  )
}

function SmallStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'amber' | 'emerald'
}) {
  const cls =
    tone === 'amber'
      ? 'bg-amber-50 border-amber-200 text-amber-800'
      : tone === 'emerald'
        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
        : 'bg-gray-50 border-gray-200 text-gray-800'
  return (
    <div className={`rounded-xl border p-2 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  )
}
