'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ShieldPlus,
  Plus,
  Pencil,
  Trash2,
  Users,
  FileText,
  Search,
  X,
  Loader2,
  CheckCircle,
  Mail,
  Printer,
  ChevronRight,
  Building2,
  AlertCircle,
} from 'lucide-react'

const TYPE_LABELS: Record<string, string> = {
  ASSURANCE: 'Assurance',
  MUTUELLE: 'Mutuelle',
  CMU: 'CMU',
  IPM: 'Institution de prévoyance maladie',
  AUTRE: 'Autre',
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  HOLDER: 'Titulaire',
  SPOUSE: 'Conjoint(e)',
  CHILD: 'Enfant',
  PARENT: 'Parent',
  OTHER: 'Autre',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'À facturer',
  billed: 'Facturée',
  paid: 'Réglée',
  rejected: 'Rejetée',
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  billed: 'bg-blue-100 text-blue-800',
  paid: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
}

interface InsuranceListItem {
  id: string
  name: string
  type: string
  code: string | null
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  coverageRate: number
  beneficiaryCount: number
  totals?: {
    salesCount: number
    totalCovered: number
    totalPaid: number
    outstanding: number
  }
}

interface BeneficiaryItem {
  id: string
  fullName: string
  membershipNumber: string | null
  relationship: string
  holderId: string | null
  phone: string | null
  birthDate: string | null
  notes: string | null
}

interface ReportRow {
  saleId: string
  receiptNumber: string
  date: string
  beneficiaryName: string | null
  beneficiaryNumber: string | null
  holderName: string | null
  claimRef: string | null
  claimStatus: 'pending' | 'billed' | 'paid' | 'rejected'
  saleTotal: number
  coverageRate: number | null
  insuranceAmount: number
  patientAmount: number
}

interface ReportTotals {
  salesCount: number
  saleTotal: number
  totalCovered: number
  totalPatient: number
  totalPaid: number
  outstanding: number
  byStatus: Record<string, { count: number; amount: number }>
}

interface ReportPayload {
  institution: InsuranceListItem | null
  rows: ReportRow[]
  totals: ReportTotals
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
  }).format(n)

const formatDate = (s: string) =>
  new Date(s).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

const emptyForm = {
  name: '',
  type: 'ASSURANCE',
  code: '',
  contactName: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
  coverageRate: '80',
}

const emptyBeneficiaryForm = {
  fullName: '',
  membershipNumber: '',
  phone: '',
  relationship: 'HOLDER',
  holderId: '',
  birthDate: '',
  notes: '',
}

export default function AssurancesPage() {
  const [tab, setTab] = useState<'institutions' | 'beneficiaries' | 'reports'>('institutions')
  const [insurances, setInsurances] = useState<InsuranceListItem[]>([])
  const [insurancesLoading, setInsurancesLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string>('')

  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryItem[]>([])
  const [beneficiariesLoading, setBeneficiariesLoading] = useState(false)

  const [report, setReport] = useState<ReportPayload | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportFilters, setReportFilters] = useState({
    status: '' as '' | 'pending' | 'billed' | 'paid' | 'rejected',
    dateFrom: '',
    dateTo: '',
    search: '',
  })
  const [updatingClaims, setUpdatingClaims] = useState(false)
  const [selectedClaims, setSelectedClaims] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<'pending' | 'billed' | 'paid' | 'rejected'>('billed')

  // Modals
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [formSaving, setFormSaving] = useState(false)

  const [showBeneficiaryForm, setShowBeneficiaryForm] = useState(false)
  const [editingBeneficiaryId, setEditingBeneficiaryId] = useState<string | null>(null)
  const [beneficiaryForm, setBeneficiaryForm] = useState(emptyBeneficiaryForm)
  const [beneficiaryError, setBeneficiaryError] = useState('')
  const [beneficiarySaving, setBeneficiarySaving] = useState(false)

  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailForm, setEmailForm] = useState({ to: '', subject: '', body: '' })

  const loadInsurances = async (withTotals = true) => {
    setInsurancesLoading(true)
    try {
      const qs = new URLSearchParams()
      if (withTotals) qs.set('withTotals', '1')
      if (search.trim()) qs.set('search', search.trim())
      const res = await fetch(`/api/insurances?${qs.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setInsurances(data.insurances || [])
      }
    } finally {
      setInsurancesLoading(false)
    }
  }

  const loadBeneficiaries = async (insuranceId: string) => {
    if (!insuranceId) {
      setBeneficiaries([])
      return
    }
    setBeneficiariesLoading(true)
    try {
      const res = await fetch(`/api/insurances/${insuranceId}`)
      if (res.ok) {
        const data = await res.json()
        setBeneficiaries(data.beneficiaries || [])
      }
    } finally {
      setBeneficiariesLoading(false)
    }
  }

  const loadReport = async () => {
    if (!selectedId) {
      setReport(null)
      return
    }
    setReportLoading(true)
    try {
      const qs = new URLSearchParams({ insuranceId: selectedId })
      if (reportFilters.status) qs.set('status', reportFilters.status)
      if (reportFilters.dateFrom) qs.set('dateFrom', reportFilters.dateFrom)
      if (reportFilters.dateTo) qs.set('dateTo', reportFilters.dateTo)
      if (reportFilters.search.trim()) qs.set('search', reportFilters.search.trim())
      const res = await fetch(`/api/insurances/report?${qs.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setReport(data)
        setSelectedClaims(new Set())
      }
    } finally {
      setReportLoading(false)
    }
  }

  useEffect(() => {
    loadInsurances()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedId && (tab === 'beneficiaries' || tab === 'reports')) {
      if (tab === 'beneficiaries') loadBeneficiaries(selectedId)
      if (tab === 'reports') loadReport()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, tab])

  const selectedInsurance = useMemo(
    () => insurances.find((i) => i.id === selectedId) || null,
    [insurances, selectedId]
  )

  const holderOptions = useMemo(
    () => beneficiaries.filter((b) => b.relationship === 'HOLDER'),
    [beneficiaries]
  )

  const openCreateInsurance = () => {
    setEditingId(null)
    setForm(emptyForm)
    setFormError('')
    setShowForm(true)
  }

  const openEditInsurance = (ins: InsuranceListItem) => {
    setEditingId(ins.id)
    setForm({
      name: ins.name,
      type: ins.type,
      code: ins.code || '',
      contactName: ins.contactName || '',
      phone: ins.phone || '',
      email: ins.email || '',
      address: ins.address || '',
      notes: ins.notes || '',
      coverageRate: String(ins.coverageRate),
    })
    setFormError('')
    setShowForm(true)
  }

  const handleSaveInsurance = async () => {
    setFormError('')
    if (!form.name.trim()) {
      setFormError('Nom requis')
      return
    }
    setFormSaving(true)
    try {
      const url = editingId ? `/api/insurances/${editingId}` : '/api/insurances'
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type,
          code: form.code.trim() || null,
          contactName: form.contactName.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          address: form.address.trim() || null,
          notes: form.notes.trim() || null,
          coverageRate: Number(form.coverageRate) || 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Erreur')
        return
      }
      await loadInsurances()
      setShowForm(false)
    } finally {
      setFormSaving(false)
    }
  }

  const handleDeleteInsurance = async (id: string) => {
    if (
      !confirm('Désactiver cette institution ? Les ventes historiques seront conservées.')
    )
      return
    const res = await fetch(`/api/insurances/${id}`, { method: 'DELETE' })
    if (res.ok) {
      if (selectedId === id) setSelectedId('')
      await loadInsurances()
    }
  }

  const openCreateBeneficiary = () => {
    setEditingBeneficiaryId(null)
    setBeneficiaryForm(emptyBeneficiaryForm)
    setBeneficiaryError('')
    setShowBeneficiaryForm(true)
  }

  const openEditBeneficiary = (b: BeneficiaryItem) => {
    setEditingBeneficiaryId(b.id)
    setBeneficiaryForm({
      fullName: b.fullName,
      membershipNumber: b.membershipNumber || '',
      phone: b.phone || '',
      relationship: b.relationship,
      holderId: b.holderId || '',
      birthDate: b.birthDate ? b.birthDate.slice(0, 10) : '',
      notes: b.notes || '',
    })
    setBeneficiaryError('')
    setShowBeneficiaryForm(true)
  }

  const handleSaveBeneficiary = async () => {
    setBeneficiaryError('')
    if (!selectedId) return
    if (!beneficiaryForm.fullName.trim()) {
      setBeneficiaryError('Nom requis')
      return
    }
    if (beneficiaryForm.relationship !== 'HOLDER' && !beneficiaryForm.holderId) {
      setBeneficiaryError("Sélectionnez le titulaire associé")
      return
    }
    setBeneficiarySaving(true)
    try {
      const url = editingBeneficiaryId
        ? `/api/insurances/${selectedId}/beneficiaries/${editingBeneficiaryId}`
        : `/api/insurances/${selectedId}/beneficiaries`
      const method = editingBeneficiaryId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: beneficiaryForm.fullName.trim(),
          membershipNumber: beneficiaryForm.membershipNumber.trim() || null,
          phone: beneficiaryForm.phone.trim() || null,
          relationship: beneficiaryForm.relationship,
          holderId:
            beneficiaryForm.relationship !== 'HOLDER' ? beneficiaryForm.holderId : null,
          birthDate: beneficiaryForm.birthDate || null,
          notes: beneficiaryForm.notes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setBeneficiaryError(data.error || 'Erreur')
        return
      }
      await loadBeneficiaries(selectedId)
      setShowBeneficiaryForm(false)
    } finally {
      setBeneficiarySaving(false)
    }
  }

  const handleDeleteBeneficiary = async (id: string) => {
    if (!selectedId) return
    if (!confirm('Désactiver ce bénéficiaire ?')) return
    const res = await fetch(`/api/insurances/${selectedId}/beneficiaries/${id}`, {
      method: 'DELETE',
    })
    if (res.ok) await loadBeneficiaries(selectedId)
  }

  const toggleClaim = (id: string) => {
    setSelectedClaims((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllClaims = () => {
    if (!report) return
    if (selectedClaims.size === report.rows.length) {
      setSelectedClaims(new Set())
    } else {
      setSelectedClaims(new Set(report.rows.map((r) => r.saleId)))
    }
  }

  const handleBulkUpdate = async () => {
    if (selectedClaims.size === 0) return
    setUpdatingClaims(true)
    try {
      const res = await fetch('/api/insurances/sales/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleIds: Array.from(selectedClaims),
          status: bulkStatus,
        }),
      })
      if (res.ok) {
        await loadReport()
      }
    } finally {
      setUpdatingClaims(false)
    }
  }

  const buildPdfUrl = () => {
    if (!selectedId) return ''
    const qs = new URLSearchParams({ insuranceId: selectedId })
    if (reportFilters.status) qs.set('status', reportFilters.status)
    if (reportFilters.dateFrom) qs.set('dateFrom', reportFilters.dateFrom)
    if (reportFilters.dateTo) qs.set('dateTo', reportFilters.dateTo)
    if (reportFilters.search.trim()) qs.set('search', reportFilters.search.trim())
    return `/api/insurances/report/pdf?${qs.toString()}`
  }

  const openPdf = () => {
    const url = buildPdfUrl()
    if (url) window.open(url, '_blank')
  }

  const openEmailModal = () => {
    if (!report || !selectedInsurance) return
    const periodStr =
      reportFilters.dateFrom || reportFilters.dateTo
        ? `du ${reportFilters.dateFrom || '…'} au ${reportFilters.dateTo || '…'}`
        : 'toutes périodes'
    const subject = `État de créances tiers payant — ${selectedInsurance.name}`
    const body = `Bonjour,

Veuillez trouver ci-joint l'état de créances tiers payant à régler par ${selectedInsurance.name} (${periodStr}).

Récapitulatif :
• ${report.totals.salesCount} vente(s)
• Pris en charge : ${formatCurrency(report.totals.totalCovered)}
• Déjà réglé : ${formatCurrency(report.totals.totalPaid)}
• Reste à recouvrer : ${formatCurrency(report.totals.outstanding)}

Le détail complet est disponible dans le PDF joint. Merci de bien vouloir procéder au règlement à votre convenance.

Cordialement,`
    setEmailForm({
      to: selectedInsurance.email || '',
      subject,
      body,
    })
    setShowEmailModal(true)
  }

  const sendEmail = () => {
    const params = new URLSearchParams()
    if (emailForm.subject) params.set('subject', emailForm.subject)
    if (emailForm.body) params.set('body', emailForm.body)
    const mailto = `mailto:${emailForm.to}?${params.toString()}`
    // Open the PDF in a sibling tab so the pharmacist can save & attach it.
    const pdfUrl = buildPdfUrl()
    if (pdfUrl) window.open(pdfUrl, '_blank')
    window.location.href = mailto
    setShowEmailModal(false)
  }

  const totals = report?.totals

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShieldPlus className="w-5 h-5 text-blue-600" />
          <div>
            <h2 className="font-semibold text-gray-900">Assurances / Tiers payant</h2>
            <p className="text-xs text-gray-500">
              Institutions, bénéficiaires et créances tiers payant
            </p>
          </div>
        </div>
        <button
          onClick={openCreateInsurance}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Nouvelle institution
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
        {[
          { key: 'institutions', label: 'Institutions', icon: Building2 },
          { key: 'beneficiaries', label: 'Bénéficiaires', icon: Users },
          { key: 'reports', label: 'Créances & rapport', icon: FileText },
        ].map((t) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key as typeof tab)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          )
        })}
      </div>

      {/* Institution selector — visible on beneficiaries / reports tabs */}
      {tab !== 'institutions' && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
          <Building2 className="w-4 h-4 text-blue-700 shrink-0" />
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="flex-1 px-2 py-1.5 text-sm border border-blue-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            <option value="">— Sélectionner une institution —</option>
            {insurances.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({TYPE_LABELS[i.type] || i.type}) · {i.coverageRate}%
              </option>
            ))}
          </select>
          {selectedInsurance && (
            <span className="text-xs text-blue-800 hidden md:inline">
              {selectedInsurance.beneficiaryCount} bénéficiaire(s)
            </span>
          )}
        </div>
      )}

      {/* === Institutions tab === */}
      {tab === 'institutions' && (
        <div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') loadInsurances()
              }}
              onBlur={() => loadInsurances()}
              placeholder="Rechercher une institution…"
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          {insurancesLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Chargement…
            </div>
          ) : insurances.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Building2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Aucune institution enregistrée</p>
              <button
                onClick={openCreateInsurance}
                className="mt-3 text-sm text-blue-600 font-medium hover:underline"
              >
                Créer la première institution
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {insurances.map((ins) => (
                <div
                  key={ins.id}
                  className="p-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:shadow-sm transition-all bg-white"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 truncate">{ins.name}</h3>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                          {TYPE_LABELS[ins.type] || ins.type}
                        </span>
                      </div>
                      {ins.code && (
                        <p className="text-xs text-gray-500 mt-0.5">N° {ins.code}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEditInsurance(ins)}
                        className="p-1 text-gray-400 hover:text-blue-600"
                        title="Modifier"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteInsurance(ins.id)}
                        className="p-1 text-gray-400 hover:text-red-600"
                        title="Désactiver"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="px-2 py-1 rounded bg-gray-50">
                      <div className="text-gray-500">Taux</div>
                      <div className="font-bold text-gray-800">{ins.coverageRate}%</div>
                    </div>
                    <div className="px-2 py-1 rounded bg-gray-50">
                      <div className="text-gray-500">Bénéficiaires</div>
                      <div className="font-bold text-gray-800">{ins.beneficiaryCount}</div>
                    </div>
                  </div>

                  {ins.totals && ins.totals.salesCount > 0 && (
                    <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
                      <div className="px-1.5 py-1 rounded bg-blue-50">
                        <div className="text-blue-700">Pris en charge</div>
                        <div className="font-semibold text-blue-800">
                          {formatCurrency(ins.totals.totalCovered)}
                        </div>
                      </div>
                      <div className="px-1.5 py-1 rounded bg-emerald-50">
                        <div className="text-emerald-700">Réglé</div>
                        <div className="font-semibold text-emerald-800">
                          {formatCurrency(ins.totals.totalPaid)}
                        </div>
                      </div>
                      <div className="px-1.5 py-1 rounded bg-red-50">
                        <div className="text-red-700">Reste dû</div>
                        <div className="font-semibold text-red-800">
                          {formatCurrency(ins.totals.outstanding)}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex gap-1">
                    <button
                      onClick={() => {
                        setSelectedId(ins.id)
                        setTab('beneficiaries')
                      }}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700"
                    >
                      <Users className="w-3 h-3" /> Bénéficiaires
                    </button>
                    <button
                      onClick={() => {
                        setSelectedId(ins.id)
                        setTab('reports')
                      }}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700"
                    >
                      <FileText className="w-3 h-3" /> Rapport
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* === Beneficiaries tab === */}
      {tab === 'beneficiaries' && (
        <div>
          {!selectedId ? (
            <div className="text-center py-12 text-gray-400">
              <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Sélectionnez une institution</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-800">
                  Bénéficiaires — {selectedInsurance?.name}
                </h3>
                <button
                  onClick={openCreateBeneficiary}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
                >
                  <Plus className="w-3.5 h-3.5" /> Ajouter
                </button>
              </div>

              {beneficiariesLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Chargement…
                </div>
              ) : beneficiaries.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Aucun bénéficiaire enregistré</p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-4">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">Nom</th>
                        <th className="text-left px-4 py-2 font-medium">N° affilié</th>
                        <th className="text-left px-4 py-2 font-medium">Lien</th>
                        <th className="text-left px-4 py-2 font-medium">Titulaire</th>
                        <th className="text-left px-4 py-2 font-medium">Téléphone</th>
                        <th className="text-right px-4 py-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {beneficiaries.map((b) => {
                        const holder = holderOptions.find((h) => h.id === b.holderId)
                        return (
                          <tr key={b.id} className="border-t border-gray-100">
                            <td className="px-4 py-2 font-medium text-gray-900">
                              {b.fullName}
                            </td>
                            <td className="px-4 py-2 text-gray-700">
                              {b.membershipNumber || '—'}
                            </td>
                            <td className="px-4 py-2">
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                  b.relationship === 'HOLDER'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {RELATIONSHIP_LABELS[b.relationship] || b.relationship}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-gray-700">
                              {holder ? holder.fullName : '—'}
                            </td>
                            <td className="px-4 py-2 text-gray-700">{b.phone || '—'}</td>
                            <td className="px-4 py-2 text-right">
                              <button
                                onClick={() => openEditBeneficiary(b)}
                                className="p-1 text-gray-400 hover:text-blue-600"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteBeneficiary(b.id)}
                                className="p-1 text-gray-400 hover:text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* === Reports tab === */}
      {tab === 'reports' && (
        <div>
          {!selectedId ? (
            <div className="text-center py-12 text-gray-400">
              <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Sélectionnez une institution</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
                <select
                  value={reportFilters.status}
                  onChange={(e) =>
                    setReportFilters((f) => ({ ...f, status: e.target.value as typeof f.status }))
                  }
                  className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white"
                >
                  <option value="">Tous statuts</option>
                  <option value="pending">À facturer</option>
                  <option value="billed">Facturée</option>
                  <option value="paid">Réglée</option>
                  <option value="rejected">Rejetée</option>
                </select>
                <input
                  type="date"
                  value={reportFilters.dateFrom}
                  onChange={(e) =>
                    setReportFilters((f) => ({ ...f, dateFrom: e.target.value }))
                  }
                  className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
                />
                <input
                  type="date"
                  value={reportFilters.dateTo}
                  onChange={(e) =>
                    setReportFilters((f) => ({ ...f, dateTo: e.target.value }))
                  }
                  className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
                />
                <input
                  value={reportFilters.search}
                  onChange={(e) =>
                    setReportFilters((f) => ({ ...f, search: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') loadReport()
                  }}
                  placeholder="Bénéficiaire, n° bon, reçu…"
                  className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg md:col-span-1"
                />
                <button
                  onClick={loadReport}
                  className="px-3 py-1.5 text-xs bg-gray-800 text-white rounded-lg font-medium hover:bg-gray-900"
                >
                  Appliquer
                </button>
              </div>

              {reportLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Calcul du rapport…
                </div>
              ) : !report ? null : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                    <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
                      <div className="text-[10px] text-gray-500 uppercase">Ventes</div>
                      <div className="text-base font-bold text-gray-900">
                        {totals?.salesCount || 0}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-blue-50 border border-blue-200">
                      <div className="text-[10px] text-blue-700 uppercase">Pris en charge</div>
                      <div className="text-base font-bold text-blue-800">
                        {formatCurrency(totals?.totalCovered || 0)}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                      <div className="text-[10px] text-emerald-700 uppercase">Réglé</div>
                      <div className="text-base font-bold text-emerald-800">
                        {formatCurrency(totals?.totalPaid || 0)}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-red-50 border border-red-200">
                      <div className="text-[10px] text-red-700 uppercase">Reste dû</div>
                      <div className="text-base font-bold text-red-800">
                        {formatCurrency(totals?.outstanding || 0)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <button
                      onClick={openPdf}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
                    >
                      <Printer className="w-3.5 h-3.5" /> Imprimer / PDF
                    </button>
                    <button
                      onClick={openEmailModal}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50"
                    >
                      <Mail className="w-3.5 h-3.5" /> Envoyer par e-mail
                    </button>

                    {selectedClaims.size > 0 && (
                      <div className="flex items-center gap-1.5 ml-auto px-2 py-1 rounded-lg bg-amber-50 border border-amber-200">
                        <span className="text-xs text-amber-800">
                          {selectedClaims.size} sélection(s)
                        </span>
                        <select
                          value={bulkStatus}
                          onChange={(e) =>
                            setBulkStatus(e.target.value as typeof bulkStatus)
                          }
                          className="text-xs px-1.5 py-0.5 rounded border border-amber-300 bg-white"
                        >
                          <option value="pending">À facturer</option>
                          <option value="billed">Facturée</option>
                          <option value="paid">Réglée</option>
                          <option value="rejected">Rejetée</option>
                        </select>
                        <button
                          disabled={updatingClaims}
                          onClick={handleBulkUpdate}
                          className="text-xs px-2 py-0.5 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1"
                        >
                          {updatingClaims ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <CheckCircle className="w-3 h-3" />
                          )}
                          Appliquer
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto -mx-4">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-[10px] text-gray-600 uppercase">
                        <tr>
                          <th className="px-2 py-2 text-left">
                            <input
                              type="checkbox"
                              checked={
                                report.rows.length > 0 &&
                                selectedClaims.size === report.rows.length
                              }
                              onChange={toggleAllClaims}
                            />
                          </th>
                          <th className="px-2 py-2 text-left">Date</th>
                          <th className="px-2 py-2 text-left">N° reçu</th>
                          <th className="px-2 py-2 text-left">Bénéficiaire</th>
                          <th className="px-2 py-2 text-left">Bon</th>
                          <th className="px-2 py-2 text-right">Total</th>
                          <th className="px-2 py-2 text-right">Part inst.</th>
                          <th className="px-2 py-2 text-right">Patient</th>
                          <th className="px-2 py-2 text-center">Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.rows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={9}
                              className="text-center py-8 text-gray-400 italic"
                            >
                              Aucune créance pour les filtres choisis
                            </td>
                          </tr>
                        ) : (
                          report.rows.map((r) => (
                            <tr
                              key={r.saleId}
                              className="border-t border-gray-100 hover:bg-gray-50"
                            >
                              <td className="px-2 py-1.5">
                                <input
                                  type="checkbox"
                                  checked={selectedClaims.has(r.saleId)}
                                  onChange={() => toggleClaim(r.saleId)}
                                />
                              </td>
                              <td className="px-2 py-1.5 text-gray-700">
                                {formatDate(r.date)}
                              </td>
                              <td className="px-2 py-1.5 font-mono text-[11px] text-gray-600">
                                {r.receiptNumber}
                              </td>
                              <td className="px-2 py-1.5">
                                <div className="font-medium text-gray-900">
                                  {r.beneficiaryName || '—'}
                                </div>
                                {r.beneficiaryNumber && (
                                  <div className="text-[10px] text-gray-500">
                                    N° {r.beneficiaryNumber}
                                  </div>
                                )}
                                {r.holderName && (
                                  <div className="text-[10px] text-gray-500">
                                    Titulaire : {r.holderName}
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-gray-700">
                                {r.claimRef || '—'}
                              </td>
                              <td className="px-2 py-1.5 text-right text-gray-700">
                                {formatCurrency(r.saleTotal)}
                              </td>
                              <td className="px-2 py-1.5 text-right font-semibold text-blue-700">
                                {formatCurrency(r.insuranceAmount)}
                                {r.coverageRate != null && (
                                  <div className="text-[9px] text-gray-500">
                                    {r.coverageRate}%
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-right text-amber-700">
                                {formatCurrency(r.patientAmount)}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    STATUS_BADGE[r.claimStatus]
                                  }`}
                                >
                                  {STATUS_LABELS[r.claimStatus]}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* === Institution form modal === */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowForm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <ShieldPlus className="w-5 h-5 text-blue-600" />
                {editingId ? "Modifier l'institution" : 'Nouvelle institution'}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Taux de prise en charge (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.coverageRate}
                  onChange={(e) => setForm((f) => ({ ...f, coverageRate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Code / N° convention
                </label>
                <input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contact</label>
                <input
                  value={form.contactName}
                  onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Téléphone</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Adresse</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
            </div>
            {formError && (
              <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {formError}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-gray-200"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveInsurance}
                disabled={formSaving}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {formSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                {editingId ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === Beneficiary form modal === */}
      {showBeneficiaryForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowBeneficiaryForm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                {editingBeneficiaryId ? 'Modifier le bénéficiaire' : 'Nouveau bénéficiaire'}
              </h3>
              <button
                onClick={() => setShowBeneficiaryForm(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nom complet *</label>
                <input
                  value={beneficiaryForm.fullName}
                  onChange={(e) =>
                    setBeneficiaryForm((f) => ({ ...f, fullName: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">N° affilié</label>
                  <input
                    value={beneficiaryForm.membershipNumber}
                    onChange={(e) =>
                      setBeneficiaryForm((f) => ({
                        ...f,
                        membershipNumber: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Téléphone</label>
                  <input
                    value={beneficiaryForm.phone}
                    onChange={(e) =>
                      setBeneficiaryForm((f) => ({ ...f, phone: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Lien</label>
                  <select
                    value={beneficiaryForm.relationship}
                    onChange={(e) =>
                      setBeneficiaryForm((f) => ({
                        ...f,
                        relationship: e.target.value,
                        holderId: e.target.value === 'HOLDER' ? '' : f.holderId,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  >
                    {Object.entries(RELATIONSHIP_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Date de naissance
                  </label>
                  <input
                    type="date"
                    value={beneficiaryForm.birthDate}
                    onChange={(e) =>
                      setBeneficiaryForm((f) => ({ ...f, birthDate: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </div>
              </div>
              {beneficiaryForm.relationship !== 'HOLDER' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Titulaire associé *
                  </label>
                  {holderOptions.length === 0 ? (
                    <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                      Aucun titulaire enregistré. Créez d&apos;abord un titulaire.
                    </div>
                  ) : (
                    <select
                      value={beneficiaryForm.holderId}
                      onChange={(e) =>
                        setBeneficiaryForm((f) => ({ ...f, holderId: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    >
                      <option value="">— Sélectionner —</option>
                      {holderOptions
                        .filter((h) => h.id !== editingBeneficiaryId)
                        .map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.fullName}
                            {h.membershipNumber ? ` · ${h.membershipNumber}` : ''}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={beneficiaryForm.notes}
                  onChange={(e) =>
                    setBeneficiaryForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              {beneficiaryError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {beneficiaryError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowBeneficiaryForm(false)}
                  className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-gray-200"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSaveBeneficiary}
                  disabled={beneficiarySaving}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {beneficiarySaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {editingBeneficiaryId ? 'Enregistrer' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === Email modal === */}
      {showEmailModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowEmailModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-600" /> Envoyer le rapport par e-mail
              </h3>
              <button
                onClick={() => setShowEmailModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Destinataire
                </label>
                <input
                  type="email"
                  value={emailForm.to}
                  onChange={(e) => setEmailForm((f) => ({ ...f, to: e.target.value }))}
                  placeholder="contact@institution.com"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Objet</label>
                <input
                  value={emailForm.subject}
                  onChange={(e) => setEmailForm((f) => ({ ...f, subject: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
                <textarea
                  rows={10}
                  value={emailForm.body}
                  onChange={(e) => setEmailForm((f) => ({ ...f, body: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                Votre client e-mail s&apos;ouvrira avec le message pré-rempli. Le PDF du rapport
                s&apos;ouvrira dans un onglet — joignez-le manuellement à l&apos;e-mail.
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowEmailModal(false)}
                  className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-gray-200"
                >
                  Annuler
                </button>
                <button
                  onClick={sendEmail}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  Ouvrir e-mail + PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
