'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search, Plus, Minus, Trash2, ShoppingCart, CheckCircle, X, Loader2, Printer, UserPlus, Wallet, ShieldPlus, FileText, Receipt as ReceiptIcon, Clock, AlertTriangle } from 'lucide-react'
import {
  printReceipt,
  formatReceiptNumber,
  type Receipt,
  type ReceiptPharmacy,
} from '@/lib/receipt'
import { formatProformaNumber } from '@/lib/proforma'
import { formatCreditNoteNumber, CREDIT_NOTE_REASON_LABELS_FR, type CreditNoteReason } from '@/lib/credit-note'
import { useI18n } from '@/components/I18nProvider'

const PENDING_REASONS = [
  'NO_PAYMENT',
  'MISSING_PRESCRIPTION',
  'AWAITING_INSURANCE',
  'OUT_OF_STOCK',
  'OTHER',
] as const
type PendingReason = (typeof PENDING_REASONS)[number]

interface RedeemableCreditNote {
  id: string
  amount: number
  usedAmount: number
  remaining: number
  reason: CreditNoteReason
  customerName: string | null
  customerPhone: string | null
  expiresAt: string | null
}

interface CustomerOption {
  id: string
  fullName: string
  phone: string | null
  creditLimit: number
  balance: number
}

interface InsuranceOption {
  id: string
  name: string
  type: string
  coverageRate: number
  beneficiaryCount: number
}

interface BeneficiaryOption {
  id: string
  fullName: string
  membershipNumber: string | null
  relationship: string
  holderId: string | null
  phone: string | null
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  HOLDER: 'Titulaire',
  SPOUSE: 'Conjoint(e)',
  CHILD: 'Enfant',
  PARENT: 'Parent',
  OTHER: 'Autre',
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
  const { t } = useI18n()
  const [medications, setMedications] = useState<Medication[]>([])
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [discount, setDiscount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [amountPaidInput, setAmountPaidInput] = useState('')
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

  // Insurance / tiers payant
  const [insurances, setInsurances] = useState<InsuranceOption[]>([])
  const [insurancesLoading, setInsurancesLoading] = useState(false)
  const [selectedInsuranceId, setSelectedInsuranceId] = useState('')
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryOption[]>([])
  const [beneficiariesLoading, setBeneficiariesLoading] = useState(false)
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState('')
  const [coverageOverride, setCoverageOverride] = useState('') // empty = use institution default
  const [insuranceClaimRef, setInsuranceClaimRef] = useState('')
  const [showBeneficiaryModal, setShowBeneficiaryModal] = useState(false)
  const [newBeneficiaryForm, setNewBeneficiaryForm] = useState({
    fullName: '',
    membershipNumber: '',
    phone: '',
    relationship: 'HOLDER',
    holderId: '',
  })
  const [newBeneficiaryError, setNewBeneficiaryError] = useState('')
  const [newBeneficiarySaving, setNewBeneficiarySaving] = useState(false)

  // Credit notes (avoirs) — apply a redeemable credit note to reduce the amount
  // the customer owes. Forbidden with INSURANCE in v1 (split is too ambiguous).
  const [creditNoteSearch, setCreditNoteSearch] = useState('')
  const [creditNoteResults, setCreditNoteResults] = useState<RedeemableCreditNote[]>([])
  const [creditNoteSearching, setCreditNoteSearching] = useState(false)
  const [appliedCreditNote, setAppliedCreditNote] = useState<RedeemableCreditNote | null>(null)
  const [appliedCreditAmountInput, setAppliedCreditAmountInput] = useState('')

  // Pro forma conversion: when the POS is opened with ?proformaId=X, we hydrate
  // the cart from the saved quote and, after the sale is validated, mark the
  // proforma as converted (linking it to the resulting Sale).
  const [fromProformaId, setFromProformaId] = useState<string | null>(null)
  const [fromProformaRef, setFromProformaRef] = useState<string | null>(null)
  const [proformaHydrating, setProformaHydrating] = useState(false)
  const [proformaError, setProformaError] = useState('')

  // Pending sale resume: ?pendingId=X — hydrate the cart from a saved pending
  // sale and, after finalization, mark it as converted.
  const [fromPendingId, setFromPendingId] = useState<string | null>(null)
  const [pendingHydrating, setPendingHydrating] = useState(false)
  const [pendingError, setPendingError] = useState('')
  const [pendingStockWarning, setPendingStockWarning] = useState(false)

  // Hold-sale modal state
  const [showHoldModal, setShowHoldModal] = useState(false)
  const [holdReason, setHoldReason] = useState<PendingReason>('NO_PAYMENT')
  const [holdNote, setHoldNote] = useState('')
  const [holdSubmitting, setHoldSubmitting] = useState(false)
  const [holdError, setHoldError] = useState('')

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

  // Hydrate the cart from a pro forma passed via ?proformaId=X.
  // We fetch the quote, then resolve each item's medication from the catalog
  // to reuse the existing Cart shape (which needs full Medication objects).
  // Items whose medication has been deleted (or never linked) are skipped with
  // a warning so the cashier knows to add them manually.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const pid = params.get('proformaId')
    if (!pid) return

    setFromProformaId(pid)
    setProformaHydrating(true)
    setProformaError('')

    ;(async () => {
      try {
        const res = await fetch(`/api/proformas/${pid}`)
        if (!res.ok) {
          setProformaError('Devis introuvable')
          return
        }
        const data = await res.json()
        const pf = data.proforma
        if (!pf) return
        setFromProformaRef(formatProformaNumber(pf.id))
        setCustomerName(pf.customerName || '')
        setCustomerPhone(pf.customerPhone || '')

        const items = (pf.items || []) as Array<{
          medicationId: string | null
          medicationName: string
          quantity: number
          unitPrice: number
        }>

        const withId = items.filter((i) => i.medicationId)
        if (withId.length === 0) {
          setProformaError(
            'Les médicaments du devis ne sont plus disponibles dans le catalogue. Ajoutez-les manuellement.'
          )
          return
        }

        const medsRes = await fetch(
          `/api/medications?ids=${withId.map((i) => i.medicationId).join(',')}&limit=200`
        )
        // Fallback: the /api/medications route may not support `ids`; fetch
        // each one individually via the list endpoint as a second attempt.
        let meds: Medication[] = []
        if (medsRes.ok) {
          const d = await medsRes.json()
          meds = (d.medications || []) as Medication[]
        }
        if (meds.length === 0) {
          // Second chance: fetch by searching each name. Not efficient but
          // keeps the UX working without API changes.
          const results = await Promise.all(
            withId.map((i) =>
              fetch(`/api/medications?search=${encodeURIComponent(i.medicationName)}&limit=5`)
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => (d?.medications || []) as Medication[])
                .catch(() => [] as Medication[])
            )
          )
          const byId = new Map<string, Medication>()
          results.flat().forEach((m) => byId.set(m.id, m))
          meds = Array.from(byId.values())
        }

        const medMap = new Map(meds.map((m) => [m.id, m]))
        const nextCart: CartItem[] = []
        const missing: string[] = []
        for (const it of items) {
          const med = it.medicationId ? medMap.get(it.medicationId) : undefined
          if (!med) {
            missing.push(it.medicationName)
            continue
          }
          nextCart.push({
            medication: med,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            total: it.quantity * it.unitPrice,
          })
        }
        setCart(nextCart)
        if (pf.discountRate) setDiscount(pf.discountRate)
        if (missing.length > 0) {
          setProformaError(
            `Articles non disponibles dans le catalogue (à ajouter manuellement) : ${missing.join(', ')}`
          )
        }
      } finally {
        setProformaHydrating(false)
      }
    })()
  }, [])

  // Hydrate the cart from a pending sale passed via ?pendingId=X. The flow is
  // similar to the proforma one, but we also restore payment context (method,
  // customer, insurance, applied credit note) so the cashier can finalize in a
  // single click. Stock is re-checked against the current shelfQuantity and a
  // non-blocking warning is raised if any item no longer has enough.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const pid = params.get('pendingId')
    if (!pid) return

    setFromPendingId(pid)
    setPendingHydrating(true)
    setPendingError('')
    setPendingStockWarning(false)

    ;(async () => {
      try {
        const res = await fetch(`/api/sales/pending/${pid}`)
        if (!res.ok) {
          setPendingError(t.salesPending.noPending)
          return
        }
        const data = await res.json()
        const ps = data.pendingSale
        if (!ps) return

        setCustomerName(ps.customerName || '')
        setCustomerPhone(ps.customerPhone || '')
        if (ps.paymentMethod) setPaymentMethod(ps.paymentMethod)
        if (ps.customerId) setSelectedCustomerId(ps.customerId)
        if (ps.insuranceId) setSelectedInsuranceId(ps.insuranceId)
        if (ps.beneficiaryId) setSelectedBeneficiaryId(ps.beneficiaryId)
        if (ps.insuranceCoverage != null) setCoverageOverride(String(ps.insuranceCoverage))
        if (ps.isPrescription) setIsPrescription(true)
        if (ps.discountRate) setDiscount(ps.discountRate)

        const items = (ps.items || []) as Array<{
          medicationId: string | null
          medicationName: string
          quantity: number
          unitPrice: number
        }>

        const withId = items.filter((i) => i.medicationId)
        if (withId.length === 0) {
          setPendingError(
            'Les médicaments de cette vente en attente ne sont plus disponibles dans le catalogue. Ajoutez-les manuellement.'
          )
          return
        }

        const medsRes = await fetch(
          `/api/medications?ids=${withId.map((i) => i.medicationId).join(',')}&limit=200`
        )
        let meds: Medication[] = []
        if (medsRes.ok) {
          const d = await medsRes.json()
          meds = (d.medications || []) as Medication[]
        }
        if (meds.length === 0) {
          const results = await Promise.all(
            withId.map((i) =>
              fetch(`/api/medications?search=${encodeURIComponent(i.medicationName)}&limit=5`)
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => (d?.medications || []) as Medication[])
                .catch(() => [] as Medication[])
            )
          )
          const byId = new Map<string, Medication>()
          results.flat().forEach((m) => byId.set(m.id, m))
          meds = Array.from(byId.values())
        }

        const medMap = new Map(meds.map((m) => [m.id, m]))
        const nextCart: CartItem[] = []
        const missing: string[] = []
        let stockShort = false
        for (const it of items) {
          const med = it.medicationId ? medMap.get(it.medicationId) : undefined
          if (!med) {
            missing.push(it.medicationName)
            continue
          }
          if (med.shelfQuantity < it.quantity) stockShort = true
          nextCart.push({
            medication: med,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            total: it.quantity * it.unitPrice,
          })
        }
        setCart(nextCart)
        setPendingStockWarning(stockShort)
        if (missing.length > 0) {
          setPendingError(
            `Articles non disponibles dans le catalogue (à ajouter manuellement) : ${missing.join(', ')}`
          )
        }
      } finally {
        setPendingHydrating(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const loadInsurances = async () => {
    setInsurancesLoading(true)
    try {
      const res = await fetch('/api/insurances')
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

  // Lazy-load institutions when the cashier picks the INSURANCE method.
  useEffect(() => {
    if (paymentMethod === 'INSURANCE' && insurances.length === 0 && !insurancesLoading) {
      loadInsurances()
    }
    if (paymentMethod !== 'INSURANCE') {
      setSelectedInsuranceId('')
      setSelectedBeneficiaryId('')
      setCoverageOverride('')
      setInsuranceClaimRef('')
      setBeneficiaries([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod])

  // Whenever the institution changes, refresh beneficiaries and reset selection.
  useEffect(() => {
    setSelectedBeneficiaryId('')
    setCoverageOverride('')
    if (selectedInsuranceId) {
      loadBeneficiaries(selectedInsuranceId)
    } else {
      setBeneficiaries([])
    }
  }, [selectedInsuranceId])

  // Debounced search for redeemable credit notes (by number suffix, name, phone).
  // Only meaningful while no avoir is currently applied — once one is picked we
  // stop searching to avoid noise.
  useEffect(() => {
    if (paymentMethod === 'INSURANCE') {
      setCreditNoteResults([])
      return
    }
    if (appliedCreditNote) {
      setCreditNoteResults([])
      return
    }
    const term = creditNoteSearch.trim()
    if (term.length < 2) {
      setCreditNoteResults([])
      return
    }
    let cancelled = false
    setCreditNoteSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/credit-notes/redeemable?search=${encodeURIComponent(term)}`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setCreditNoteResults((data.creditNotes || []) as RedeemableCreditNote[])
      } finally {
        if (!cancelled) setCreditNoteSearching(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [creditNoteSearch, appliedCreditNote, paymentMethod])

  // Switching to INSURANCE forbids applying an avoir (V1 limitation).
  useEffect(() => {
    if (paymentMethod === 'INSURANCE') {
      setAppliedCreditNote(null)
      setAppliedCreditAmountInput('')
      setCreditNoteSearch('')
      setCreditNoteResults([])
    }
  }, [paymentMethod])

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  )

  const selectedInsurance = useMemo(
    () => insurances.find((i) => i.id === selectedInsuranceId) || null,
    [insurances, selectedInsuranceId]
  )

  const selectedBeneficiary = useMemo(
    () => beneficiaries.find((b) => b.id === selectedBeneficiaryId) || null,
    [beneficiaries, selectedBeneficiaryId]
  )

  // Holders eligible to receive a new dependent (used in the beneficiary modal).
  const holderOptions = useMemo(
    () => beneficiaries.filter((b) => b.relationship === 'HOLDER'),
    [beneficiaries]
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

  const openNewBeneficiaryModal = () => {
    setNewBeneficiaryForm({
      fullName: customerName.trim(),
      membershipNumber: '',
      phone: customerPhone.trim(),
      relationship: 'HOLDER',
      holderId: '',
    })
    setNewBeneficiaryError('')
    setShowBeneficiaryModal(true)
  }

  const handleCreateBeneficiary = async () => {
    setNewBeneficiaryError('')
    if (!selectedInsuranceId) {
      setNewBeneficiaryError('Sélectionnez d\'abord une institution')
      return
    }
    const fullName = newBeneficiaryForm.fullName.trim()
    if (!fullName) {
      setNewBeneficiaryError('Nom requis')
      return
    }
    if (newBeneficiaryForm.relationship !== 'HOLDER' && !newBeneficiaryForm.holderId) {
      setNewBeneficiaryError("Sélectionnez le titulaire associé")
      return
    }
    setNewBeneficiarySaving(true)
    try {
      const res = await fetch(`/api/insurances/${selectedInsuranceId}/beneficiaries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          membershipNumber: newBeneficiaryForm.membershipNumber.trim() || null,
          phone: newBeneficiaryForm.phone.trim() || null,
          relationship: newBeneficiaryForm.relationship,
          holderId:
            newBeneficiaryForm.relationship !== 'HOLDER'
              ? newBeneficiaryForm.holderId
              : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setNewBeneficiaryError(data.error || 'Erreur')
        return
      }
      await loadBeneficiaries(selectedInsuranceId)
      setSelectedBeneficiaryId(data.beneficiary.id)
      setShowBeneficiaryModal(false)
      setNewBeneficiaryForm({
        fullName: '',
        membershipNumber: '',
        phone: '',
        relationship: 'HOLDER',
        holderId: '',
      })
    } finally {
      setNewBeneficiarySaving(false)
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

  // Effective credit-note amount applied to this sale. Capped at min(remaining, total)
  // and parsed defensively from the user-editable input.
  const appliedCreditAmount = useMemo(() => {
    if (!appliedCreditNote) return 0
    if (paymentMethod === 'INSURANCE') return 0
    const cap = Math.min(appliedCreditNote.remaining, Math.max(0, total))
    if (appliedCreditAmountInput.trim() === '') return cap
    const v = Number(appliedCreditAmountInput)
    if (!Number.isFinite(v) || v <= 0) return 0
    return Math.min(cap, v)
  }, [appliedCreditNote, appliedCreditAmountInput, total, paymentMethod])

  const dueAfterCreditNote = Math.max(0, total - appliedCreditAmount)

  // Tiers payant — coverage split. The override field is meaningful only when
  // INSURANCE is selected and the user has typed something, otherwise we fall
  // back to the institution's default rate.
  const effectiveCoverageRate = useMemo(() => {
    if (paymentMethod !== 'INSURANCE') return 0
    if (coverageOverride !== '' && coverageOverride !== null) {
      const v = Number(coverageOverride)
      if (Number.isFinite(v) && v >= 0 && v <= 100) return v
    }
    return selectedInsurance?.coverageRate ?? 0
  }, [paymentMethod, coverageOverride, selectedInsurance])

  const insuranceAmountPreview =
    paymentMethod === 'INSURANCE'
      ? Math.round(((total * effectiveCoverageRate) / 100) * 100) / 100
      : 0
  const patientAmountPreview =
    paymentMethod === 'INSURANCE' ? Math.max(0, total - insuranceAmountPreview) : 0

  // Cash register: parse the amount handed over and compute the change to return.
  // Only meaningful for CASH payments; other methods don't use these values.
  const amountPaidValue = Number(amountPaidInput)
  const amountPaidParsed =
    amountPaidInput.trim() !== '' && Number.isFinite(amountPaidValue) && amountPaidValue >= 0
      ? amountPaidValue
      : null
  const changeDue =
    paymentMethod === 'CASH' && amountPaidParsed !== null
      ? Math.max(0, amountPaidParsed - dueAfterCreditNote)
      : 0
  const cashShort =
    paymentMethod === 'CASH' &&
    amountPaidParsed !== null &&
    amountPaidParsed + 0.009 < dueAfterCreditNote

  // Reset the cash-received field whenever we leave CASH so it doesn't silently
  // persist across payment-method switches.
  useEffect(() => {
    if (paymentMethod !== 'CASH') setAmountPaidInput('')
  }, [paymentMethod])

  const openHoldModal = () => {
    if (cart.length === 0) return
    setHoldReason('NO_PAYMENT')
    setHoldNote('')
    setHoldError('')
    setShowHoldModal(true)
  }

  const handleHoldSale = async () => {
    if (cart.length === 0) return
    setHoldSubmitting(true)
    setHoldError('')

    try {
      const res = await fetch('/api/sales/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((i) => ({
            medicationId: i.medication.id,
            medicationName: i.medication.name,
            medicationRef: i.medication.barcode,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
          discountRate: discount,
          tax: 0,
          customerName: customerName || null,
          customerPhone: customerPhone || null,
          customerId: paymentMethod === 'CREDIT' && selectedCustomerId ? selectedCustomerId : null,
          paymentMethod,
          insuranceId: paymentMethod === 'INSURANCE' && selectedInsuranceId ? selectedInsuranceId : null,
          beneficiaryId:
            paymentMethod === 'INSURANCE' && selectedBeneficiaryId ? selectedBeneficiaryId : null,
          insuranceCoverage:
            paymentMethod === 'INSURANCE' ? effectiveCoverageRate : null,
          isPrescription,
          creditNoteId:
            appliedCreditNote && appliedCreditAmount > 0 && paymentMethod !== 'INSURANCE'
              ? appliedCreditNote.id
              : null,
          creditNoteAmount:
            appliedCreditNote && appliedCreditAmount > 0 && paymentMethod !== 'INSURANCE'
              ? appliedCreditAmount
              : null,
          reason: holdReason,
          note: holdNote.trim() || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setHoldError(data.error || 'Erreur')
        return
      }

      // Reset cart + payment context (mirror handleSubmit cleanup)
      setShowHoldModal(false)
      setCart([])
      setDiscount(0)
      setCustomerName('')
      setCustomerPhone('')
      setIsPrescription(false)
      setSelectedCustomerId('')
      setAmountPaidInput('')
      setSelectedInsuranceId('')
      setSelectedBeneficiaryId('')
      setCoverageOverride('')
      setInsuranceClaimRef('')
      setAppliedCreditNote(null)
      setAppliedCreditAmountInput('')
      setCreditNoteSearch('')
      setCreditNoteResults([])
      setError('')
      // If we were resuming a pending sale and the cashier puts it back on hold,
      // detach the previous one — we just created a new pending record.
      if (fromPendingId) {
        setFromPendingId(null)
        setPendingError('')
        setPendingStockWarning(false)
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.searchParams.delete('pendingId')
          window.history.replaceState(null, '', url.toString())
        }
      }
    } catch {
      setHoldError('Erreur de connexion')
    } finally {
      setHoldSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    if (cart.length === 0) return
    if (paymentMethod === 'CREDIT' && !selectedCustomerId) {
      setError('Sélectionnez un client pour une vente à crédit')
      return
    }
    if (paymentMethod === 'INSURANCE') {
      if (!selectedInsuranceId) {
        setError('Sélectionnez une institution pour une vente assurance')
        return
      }
      if (!selectedBeneficiaryId) {
        setError('Sélectionnez un bénéficiaire pour une vente assurance')
        return
      }
    }
    if (paymentMethod === 'CASH' && amountPaidParsed !== null && cashShort) {
      setError('Montant reçu insuffisant pour couvrir le total')
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
          amountPaid: paymentMethod === 'CASH' ? amountPaidParsed : null,
          insuranceId: paymentMethod === 'INSURANCE' ? selectedInsuranceId : null,
          beneficiaryId: paymentMethod === 'INSURANCE' ? selectedBeneficiaryId : null,
          insuranceCoverage:
            paymentMethod === 'INSURANCE' ? effectiveCoverageRate : null,
          insuranceClaimRef:
            paymentMethod === 'INSURANCE' && insuranceClaimRef.trim()
              ? insuranceClaimRef.trim()
              : null,
          creditNoteId:
            appliedCreditNote && appliedCreditAmount > 0 && paymentMethod !== 'INSURANCE'
              ? appliedCreditNote.id
              : null,
          creditNoteAmount:
            appliedCreditNote && appliedCreditAmount > 0 && paymentMethod !== 'INSURANCE'
              ? appliedCreditAmount
              : null,
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
        amountPaid: paymentMethod === 'CASH' ? amountPaidParsed : null,
        change: paymentMethod === 'CASH' && amountPaidParsed !== null ? changeDue : null,
        creditNoteAmount: appliedCreditAmount > 0 ? appliedCreditAmount : null,
        creditNoteRef: appliedCreditNote ? formatCreditNoteNumber(appliedCreditNote.id) : null,
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

      // If this sale was converted from a pro forma, mark the quote as converted
      // (best-effort — ignore failures since the sale itself already succeeded).
      if (fromProformaId && sale?.id) {
        fetch(`/api/proformas/${fromProformaId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'converted', convertedSaleId: sale.id }),
        }).catch(() => {})
        setFromProformaId(null)
        setFromProformaRef(null)
        // Clean the ?proformaId=X from the URL so a refresh doesn't re-hydrate.
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.searchParams.delete('proformaId')
          window.history.replaceState(null, '', url.toString())
        }
      }

      // Same logic for a resumed pending sale.
      if (fromPendingId && sale?.id) {
        fetch(`/api/sales/pending/${fromPendingId}/convert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ convertedSaleId: sale.id }),
        }).catch(() => {})
        setFromPendingId(null)
        setPendingError('')
        setPendingStockWarning(false)
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.searchParams.delete('pendingId')
          window.history.replaceState(null, '', url.toString())
        }
      }

      setCart([])
      setDiscount(0)
      setCustomerName('')
      setCustomerPhone('')
      setIsPrescription(false)
      setSelectedCustomerId('')
      setAmountPaidInput('')
      setSelectedInsuranceId('')
      setSelectedBeneficiaryId('')
      setCoverageOverride('')
      setInsuranceClaimRef('')
      setAppliedCreditNote(null)
      setAppliedCreditAmountInput('')
      setCreditNoteSearch('')
      setCreditNoteResults([])
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
    <div className="flex flex-col h-full min-h-0 gap-3">
      {(fromProformaRef || proformaHydrating || proformaError) && (
        <div
          className={`flex items-start gap-2 px-4 py-2 rounded-xl border ${
            proformaError
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-indigo-50 border-indigo-200 text-indigo-800'
          }`}
        >
          {proformaHydrating ? (
            <Loader2 className="w-4 h-4 mt-0.5 shrink-0 animate-spin" />
          ) : (
            <FileText className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <div className="flex-1 text-xs">
            {proformaHydrating ? (
              <span>Chargement du devis…</span>
            ) : proformaError ? (
              <span>{proformaError}</span>
            ) : (
              <span>
                Vente en provenance du devis{' '}
                <strong className="font-mono">{fromProformaRef}</strong>. Le panier a été
                pré-rempli — validez pour convertir.
              </span>
            )}
          </div>
          {fromProformaRef && !proformaHydrating && (
            <button
              onClick={() => {
                setFromProformaId(null)
                setFromProformaRef(null)
                setProformaError('')
                if (typeof window !== 'undefined') {
                  const url = new URL(window.location.href)
                  url.searchParams.delete('proformaId')
                  window.history.replaceState(null, '', url.toString())
                }
              }}
              className="shrink-0 p-1 rounded hover:bg-white/40"
              title="Détacher du devis"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      {(fromPendingId || pendingHydrating || pendingError) && (
        <div
          className={`flex items-start gap-2 px-4 py-2 rounded-xl border ${
            pendingError
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-orange-50 border-orange-200 text-orange-800'
          }`}
        >
          {pendingHydrating ? (
            <Loader2 className="w-4 h-4 mt-0.5 shrink-0 animate-spin" />
          ) : (
            <Clock className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <div className="flex-1 text-xs">
            {pendingHydrating ? (
              <span>{t.salesPending.resumeHint}…</span>
            ) : pendingError ? (
              <span>{pendingError}</span>
            ) : (
              <span>{t.salesPending.resumeHint}</span>
            )}
            {pendingStockWarning && !pendingHydrating && (
              <div className="mt-1 flex items-start gap-1 text-[11px] text-amber-800">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                <span>{t.salesPending.resumeStockWarning}</span>
              </div>
            )}
          </div>
          {fromPendingId && !pendingHydrating && (
            <button
              onClick={() => {
                setFromPendingId(null)
                setPendingError('')
                setPendingStockWarning(false)
                if (typeof window !== 'undefined') {
                  const url = new URL(window.location.href)
                  url.searchParams.delete('pendingId')
                  window.history.replaceState(null, '', url.toString())
                }
              }}
              className="shrink-0 p-1 rounded hover:bg-white/40"
              title="Détacher"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
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
      <div className="w-full lg:w-80 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col min-h-0">
        <div className="px-4 py-2.5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 text-sm">Paiement</h3>
        </div>
        <div className="px-3 py-3 space-y-2.5 flex-1 overflow-y-auto min-h-0">
          {/* Customer info */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-gray-500">Client (optionnel)</label>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)}
              placeholder="Nom du client" className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
              placeholder="Téléphone" className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Mode de paiement</label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { value: 'CASH', label: 'Espèces' },
                { value: 'MOBILE_MONEY', label: 'Mobile Money' },
                { value: 'CARD', label: 'Carte' },
                { value: 'INSURANCE', label: 'Assurance' },
                { value: 'CREDIT', label: 'Carnet (crédit)' },
              ].map(pm => (
                <button key={pm.value} onClick={() => setPaymentMethod(pm.value)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
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
            <div className="space-y-1.5 p-2 rounded-lg bg-amber-50 border border-amber-200 min-w-0">
              <label className="block text-[11px] font-semibold text-amber-800">
                Client (carnet) — obligatoire
              </label>
              <div className="flex gap-1.5 min-w-0">
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="min-w-0 flex-1 px-2 py-1.5 text-xs border border-amber-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 truncate"
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
                  className="shrink-0 p-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                </button>
              </div>
              {selectedCustomer && (
                <div className="text-[11px] text-amber-900 space-y-0.5 min-w-0 break-words">
                  <div>
                    Solde : <strong>{formatCurrency(selectedCustomer.balance)}</strong>
                  </div>
                  {selectedCustomer.creditLimit > 0 && (
                    <div>
                      Plafond : <strong>{formatCurrency(selectedCustomer.creditLimit)}</strong>
                      {selectedCustomer.balance + dueAfterCreditNote > selectedCustomer.creditLimit && (
                        <div className="text-red-700 font-semibold">Plafond dépassé !</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Insurance / tiers payant panel — INSURANCE only */}
          {paymentMethod === 'INSURANCE' && (
            <div className="space-y-1.5 p-2 rounded-lg bg-blue-50 border border-blue-200 min-w-0">
              <label className="block text-[11px] font-semibold text-blue-800">
                Tiers payant — institution & bénéficiaire
              </label>
              {insurancesLoading ? (
                <div className="text-[11px] text-blue-700 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Chargement…
                </div>
              ) : insurances.length === 0 ? (
                <div className="text-[11px] text-blue-900">
                  Aucune institution. Créez-en une dans l&apos;onglet{' '}
                  <strong>Assurances</strong>.
                </div>
              ) : (
                <>
                  <select
                    value={selectedInsuranceId}
                    onChange={(e) => setSelectedInsuranceId(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-blue-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  >
                    <option value="">— Sélectionner une institution —</option>
                    {insurances.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.coverageRate}%)
                      </option>
                    ))}
                  </select>

                  {selectedInsuranceId && (
                    <>
                      <div className="flex gap-1.5 min-w-0">
                        <select
                          value={selectedBeneficiaryId}
                          onChange={(e) => setSelectedBeneficiaryId(e.target.value)}
                          disabled={beneficiariesLoading}
                          className="min-w-0 flex-1 px-2 py-1.5 text-xs border border-blue-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 truncate"
                        >
                          <option value="">— Bénéficiaire —</option>
                          {beneficiaries.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.fullName}
                              {b.membershipNumber ? ` · ${b.membershipNumber}` : ''}
                              {' · '}
                              {RELATIONSHIP_LABELS[b.relationship] || b.relationship}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={openNewBeneficiaryModal}
                          title="Ajouter un bénéficiaire (titulaire ou ayant droit)"
                          className="shrink-0 p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-end gap-1.5">
                        <div className="flex-1 min-w-0">
                          <label className="block text-[10px] text-blue-800">
                            Taux pour cette vente (%)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="any"
                            value={coverageOverride}
                            onChange={(e) => setCoverageOverride(e.target.value)}
                            placeholder={`défaut ${selectedInsurance?.coverageRate ?? 0}%`}
                            className="w-full px-2 py-1 text-xs border border-blue-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <label className="block text-[10px] text-blue-800">
                            N° bon (optionnel)
                          </label>
                          <input
                            type="text"
                            value={insuranceClaimRef}
                            onChange={(e) => setInsuranceClaimRef(e.target.value)}
                            placeholder="ordonnance / bon"
                            className="w-full px-2 py-1 text-xs border border-blue-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                          />
                        </div>
                      </div>

                      {selectedBeneficiary && total > 0 && (
                        <div className="grid grid-cols-2 gap-1.5 mt-1">
                          <div className="p-1.5 rounded-md bg-white border border-blue-300">
                            <div className="text-[10px] text-blue-700">Part institution ({effectiveCoverageRate}%)</div>
                            <div className="text-sm font-bold text-blue-700">
                              {formatCurrency(insuranceAmountPreview)}
                            </div>
                          </div>
                          <div className="p-1.5 rounded-md bg-white border border-amber-300">
                            <div className="text-[10px] text-amber-700">Reste patient</div>
                            <div className="text-sm font-bold text-amber-700">
                              {formatCurrency(patientAmountPreview)}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Credit note (avoir) — applicable on every method except INSURANCE */}
          {paymentMethod !== 'INSURANCE' && (
            <div className="space-y-1.5 p-2 rounded-lg bg-violet-50 border border-violet-200 min-w-0">
              <label className="flex items-center gap-1 text-[11px] font-semibold text-violet-800">
                <ReceiptIcon className="w-3 h-3" /> Avoir (optionnel)
              </label>
              {appliedCreditNote ? (
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2 p-1.5 rounded-md bg-white border border-violet-300 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-mono font-semibold text-violet-700 truncate">
                        N° {formatCreditNoteNumber(appliedCreditNote.id)}
                      </div>
                      <div className="text-[10px] text-violet-900 truncate">
                        Solde dispo : {formatCurrency(appliedCreditNote.remaining)}
                      </div>
                      {appliedCreditNote.customerName && (
                        <div className="text-[10px] text-gray-500 truncate">
                          {appliedCreditNote.customerName}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAppliedCreditNote(null)
                        setAppliedCreditAmountInput('')
                      }}
                      className="shrink-0 p-1 rounded text-violet-700 hover:bg-violet-100"
                      title="Retirer l'avoir"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div>
                    <label className="block text-[10px] text-violet-800">Montant à utiliser</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={appliedCreditAmountInput}
                      onChange={(e) => setAppliedCreditAmountInput(e.target.value)}
                      placeholder={`défaut ${formatCurrency(Math.min(appliedCreditNote.remaining, Math.max(0, total)))}`}
                      className="w-full px-2 py-1 text-xs border border-violet-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                    />
                  </div>
                  {appliedCreditAmount > 0 && (
                    <div className="flex items-baseline justify-between p-1.5 rounded-md bg-white border border-violet-300">
                      <span className="text-[11px] font-medium text-violet-800">Avoir appliqué</span>
                      <span className="text-sm font-bold text-violet-700">−{formatCurrency(appliedCreditAmount)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={creditNoteSearch}
                    onChange={(e) => setCreditNoteSearch(e.target.value)}
                    placeholder="N° d'avoir, nom ou téléphone…"
                    className="w-full px-2.5 py-1.5 text-xs border border-violet-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                  />
                  {creditNoteSearching && (
                    <div className="flex items-center gap-1 text-[11px] text-violet-700">
                      <Loader2 className="w-3 h-3 animate-spin" /> Recherche…
                    </div>
                  )}
                  {!creditNoteSearching && creditNoteSearch.trim().length >= 2 && creditNoteResults.length === 0 && (
                    <div className="text-[11px] text-violet-900">Aucun avoir réutilisable.</div>
                  )}
                  {creditNoteResults.length > 0 && (
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {creditNoteResults.map((cn) => (
                        <button
                          key={cn.id}
                          type="button"
                          onClick={() => {
                            setAppliedCreditNote(cn)
                            setAppliedCreditAmountInput('')
                            setCreditNoteSearch('')
                            setCreditNoteResults([])
                          }}
                          className="w-full text-left p-1.5 rounded-md bg-white border border-violet-200 hover:border-violet-400 hover:bg-violet-50 transition-colors min-w-0"
                        >
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <span className="text-[11px] font-mono font-semibold text-violet-700 truncate">
                              N° {formatCreditNoteNumber(cn.id)}
                            </span>
                            <span className="text-[11px] font-bold text-violet-700 shrink-0">
                              {formatCurrency(cn.remaining)}
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-600 truncate">
                            {cn.customerName || 'Avoir anonyme'}
                            {' · '}
                            {CREDIT_NOTE_REASON_LABELS_FR[cn.reason] || cn.reason}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Discount + Prescription (inline) */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Remise (%)</label>
              <input type="number" min="0" max="100" value={discount} onChange={e => setDiscount(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 pb-1.5 whitespace-nowrap">
              <input type="checkbox" checked={isPrescription} onChange={e => setIsPrescription(e.target.checked)}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
              Ordonnance
            </label>
          </div>

          {/* Cash register — CASH only */}
          {paymentMethod === 'CASH' && (
            <div className="space-y-1.5 p-2 rounded-lg bg-emerald-50 border border-emerald-200">
              <label className="flex items-center gap-1 text-[11px] font-semibold text-emerald-800">
                <Wallet className="w-3 h-3" /> Caisse — espèces reçues
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={amountPaidInput}
                onChange={(e) => setAmountPaidInput(e.target.value)}
                placeholder="Montant remis par le client"
                className="w-full px-2.5 py-1.5 border border-emerald-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <div className="flex flex-wrap gap-1">
                {[1000, 2000, 5000, 10000].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setAmountPaidInput(String(amount))}
                    className="px-1.5 py-0.5 text-[10px] rounded-md bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                  >
                    {formatCurrency(amount)}
                  </button>
                ))}
                {dueAfterCreditNote > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmountPaidInput(String(Math.round(dueAfterCreditNote)))}
                    className="px-1.5 py-0.5 text-[10px] rounded-md bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                    title="Compte juste"
                  >
                    Exact
                  </button>
                )}
                {amountPaidInput !== '' && (
                  <button
                    type="button"
                    onClick={() => setAmountPaidInput('')}
                    className="px-1.5 py-0.5 text-[10px] rounded-md bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
                  >
                    Effacer
                  </button>
                )}
              </div>
              {amountPaidParsed !== null && (
                cashShort ? (
                  <div className="p-1.5 rounded-md bg-red-50 border border-red-200 text-[11px] text-red-700 font-medium">
                    Manque {formatCurrency(dueAfterCreditNote - amountPaidParsed)} pour couvrir le total
                  </div>
                ) : (
                  <div className="flex items-baseline justify-between px-2 py-1 rounded-md bg-white border border-emerald-300">
                    <span className="text-[11px] font-medium text-emerald-800">Monnaie à rendre</span>
                    <span className="text-base font-bold text-emerald-700">{formatCurrency(changeDue)}</span>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="px-3 py-2.5 border-t border-gray-100 space-y-1.5">
          <div className="flex justify-between text-xs text-gray-600">
            <span>Sous-total</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-xs text-red-600">
              <span>Remise ({discount}%)</span>
              <span>-{formatCurrency(discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-gray-900 pt-1.5 border-t border-gray-100">
            <span>Total</span>
            <span className="text-emerald-600">{formatCurrency(total)}</span>
          </div>
          {appliedCreditAmount > 0 && (
            <>
              <div className="flex justify-between text-xs text-violet-700">
                <span>Avoir appliqué</span>
                <span>−{formatCurrency(appliedCreditAmount)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-gray-900">
                <span>Net à payer</span>
                <span className="text-violet-700">{formatCurrency(dueAfterCreditNote)}</span>
              </div>
            </>
          )}

          {error && (
            <div className="p-1.5 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-700">{error}</div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={cart.length === 0 || submitting || cashShort}
              className="flex-1 py-2.5 bg-emerald-600 text-white font-semibold text-sm rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Valider la vente
            </button>
            <button
              onClick={openHoldModal}
              disabled={cart.length === 0 || submitting}
              title={t.salesPending.holdSaleHint}
              className="px-3 py-2.5 bg-orange-50 text-orange-700 border border-orange-200 font-semibold text-sm rounded-xl hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">{t.salesPending.holdSaleShort}</span>
            </button>
          </div>
        </div>
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

      {/* New beneficiary modal (insurance) */}
      {showBeneficiaryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowBeneficiaryModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <ShieldPlus className="w-5 h-5 text-blue-600" /> Nouveau bénéficiaire
                {selectedInsurance && (
                  <span className="text-xs font-normal text-gray-500">
                    · {selectedInsurance.name}
                  </span>
                )}
              </h3>
              <button
                onClick={() => setShowBeneficiaryModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nom complet *</label>
                <input
                  value={newBeneficiaryForm.fullName}
                  onChange={(e) =>
                    setNewBeneficiaryForm((f) => ({ ...f, fullName: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  N° d&apos;affiliation
                </label>
                <input
                  value={newBeneficiaryForm.membershipNumber}
                  onChange={(e) =>
                    setNewBeneficiaryForm((f) => ({ ...f, membershipNumber: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Téléphone</label>
                <input
                  value={newBeneficiaryForm.phone}
                  onChange={(e) =>
                    setNewBeneficiaryForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Lien</label>
                <select
                  value={newBeneficiaryForm.relationship}
                  onChange={(e) =>
                    setNewBeneficiaryForm((f) => ({
                      ...f,
                      relationship: e.target.value,
                      holderId: e.target.value === 'HOLDER' ? '' : f.holderId,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  {Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {newBeneficiaryForm.relationship !== 'HOLDER' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Titulaire associé *
                  </label>
                  {holderOptions.length === 0 ? (
                    <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                      Aucun titulaire enregistré pour cette institution. Créez d&apos;abord un titulaire.
                    </div>
                  ) : (
                    <select
                      value={newBeneficiaryForm.holderId}
                      onChange={(e) =>
                        setNewBeneficiaryForm((f) => ({ ...f, holderId: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    >
                      <option value="">— Sélectionner —</option>
                      {holderOptions.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.fullName}
                          {h.membershipNumber ? ` · ${h.membershipNumber}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              {newBeneficiaryError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {newBeneficiaryError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowBeneficiaryModal(false)}
                  className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-gray-200"
                >
                  Annuler
                </button>
                <button
                  onClick={handleCreateBeneficiary}
                  disabled={newBeneficiarySaving}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {newBeneficiarySaving ? (
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
            {lastReceipt?.paymentMethod === 'CASH' &&
              lastReceipt.amountPaid != null &&
              lastReceipt.change != null &&
              lastReceipt.change > 0 && (
                <div className="mt-3 mx-auto max-w-xs p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-left">
                  <div className="flex justify-between text-xs text-emerald-800">
                    <span>Espèces reçues</span>
                    <span className="font-medium">{formatCurrency(lastReceipt.amountPaid)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-emerald-700 font-bold mt-1 pt-1 border-t border-emerald-200">
                    <span>Monnaie à rendre</span>
                    <span>{formatCurrency(lastReceipt.change)}</span>
                  </div>
                </div>
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

      {/* Hold-sale modal */}
      {showHoldModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => !holdSubmitting && setShowHoldModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-orange-600" /> {t.salesPending.holdConfirm}
              </h3>
              <button
                onClick={() => !holdSubmitting && setShowHoldModal(false)}
                disabled={holdSubmitting}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="text-xs text-gray-500">{t.salesPending.holdSaleHint}</div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t.salesPending.reasonLabel} *
                </label>
                <select
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value as PendingReason)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                >
                  <option value="NO_PAYMENT">{t.salesPending.reasonNoPayment}</option>
                  <option value="MISSING_PRESCRIPTION">{t.salesPending.reasonMissingPrescription}</option>
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
                  value={holdNote}
                  onChange={(e) => setHoldNote(e.target.value)}
                  placeholder={t.salesPending.notePlaceholder}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 resize-none"
                />
              </div>

              <div className="flex justify-between text-xs text-gray-600 pt-2 border-t border-gray-100">
                <span>{t.salesPending.items}</span>
                <span className="font-medium text-gray-900">
                  {cart.length} • {formatCurrency(total)}
                </span>
              </div>

              {holdError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {holdError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowHoldModal(false)}
                  disabled={holdSubmitting}
                  className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50 transition-colors"
                >
                  {t.salesPending.discard}
                </button>
                <button
                  onClick={handleHoldSale}
                  disabled={holdSubmitting || cart.length === 0}
                  className="flex-1 px-3 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                >
                  {holdSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Clock className="w-4 h-4" />
                  )}
                  {t.salesPending.holdSale}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
