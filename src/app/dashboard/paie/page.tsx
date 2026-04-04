'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDashboard } from '@/components/DashboardProvider'
import {
  Plus, X, Loader2, Check, FileText, Trash2,
  Play, RotateCcw, ChevronDown, ChevronUp, Banknote, Users, Clock,
} from 'lucide-react'

interface Payroll {
  id: string
  employeeName: string
  employeeRole: string | null
  month: number
  year: number
  baseSalary: number
  seniority: number
  transportAllowance: number
  housingAllowance: number
  bonuses: number
  overtime: number
  grossSalary: number
  ipresGeneral: number
  ipresCadre: number
  cssMaladie: number
  incomeTax: number
  trimf: number
  cfce: number
  employerIpres: number
  employerCss: number
  employerCfce: number
  totalGross: number
  totalDeductions: number
  netSalary: number
  status: string
  validatedBy: string | null
  validatedAt: string | null
  paidAt: string | null
  notes: string | null
  createdAt: string
}

interface PayrollStats {
  totalGross: number
  totalNet: number
  totalEmployerCharges: number
  draftCount: number
  validatedCount: number
  paidCount: number
  total: number
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(n)

const monthNames = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

const statusLabels: Record<string, { label: string; bg: string; text: string }> = {
  draft: { label: 'Brouillon', bg: 'bg-gray-100', text: 'text-gray-700' },
  validated: { label: 'Validé', bg: 'bg-blue-100', text: 'text-blue-700' },
  paid: { label: 'Payé', bg: 'bg-emerald-100', text: 'text-emerald-700' },
}

function generatePaySlipPDF(p: Payroll, pharmacyName?: string) {
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) return
  const st = statusLabels[p.status] || statusLabels.draft
  w.document.write(`<!DOCTYPE html><html><head><title>Bulletin de paie - ${p.employeeName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #1e293b; font-size: 13px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #059669; padding-bottom: 20px; margin-bottom: 20px; }
  .header-left h1 { color: #059669; font-size: 22px; }
  .header-left p { color: #64748b; font-size: 12px; margin-top: 2px; }
  .header-right { text-align: right; font-size: 12px; color: #475569; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; padding: 15px; background: #f8fafc; border-radius: 8px; }
  .info-grid .label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
  .info-grid .value { font-weight: 600; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  th { padding: 10px 12px; text-align: left; background: #f1f5f9; font-weight: 600; color: #475569; font-size: 12px; border-bottom: 2px solid #e2e8f0; }
  td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
  .amount { text-align: right; font-variant-numeric: tabular-nums; }
  .section-title { font-weight: 700; color: #059669; padding: 10px 12px; background: #ecfdf5; border-bottom: 1px solid #d1fae5; }
  .total-row td { font-weight: 700; border-top: 2px solid #e2e8f0; padding-top: 12px; }
  .net-box { margin: 20px 0; padding: 16px; background: linear-gradient(135deg, #059669, #0d9488); color: white; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; }
  .net-box .label { font-size: 16px; font-weight: 600; }
  .net-box .amount { font-size: 24px; font-weight: 800; }
  .employer-section { margin: 15px 0; padding: 12px; background: #eff6ff; border-radius: 8px; }
  .employer-section h3 { color: #1d4ed8; font-size: 13px; margin-bottom: 8px; }
  .employer-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
  .footer { text-align: center; margin-top: 30px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  @media print { body { padding: 15px; } }
</style></head><body>
  <div class="header">
    <div class="header-left">
      <h1>${pharmacyName || 'NeuroPharm'}</h1>
      <p>Bulletin de Paie</p>
    </div>
    <div class="header-right">
      <strong>${monthNames[p.month - 1]} ${p.year}</strong><br>
      <span class="badge" style="background:${p.status === 'paid' ? '#dcfce7;color:#166534' : p.status === 'validated' ? '#dbeafe;color:#1e40af' : '#f1f5f9;color:#475569'}">${st.label}</span>
    </div>
  </div>

  <div class="info-grid">
    <div><div class="label">Employé</div><div class="value">${p.employeeName}</div></div>
    <div><div class="label">Poste</div><div class="value">${p.employeeRole || '-'}</div></div>
    <div><div class="label">Période</div><div class="value">${monthNames[p.month - 1]} ${p.year}</div></div>
    <div><div class="label">Date du bulletin</div><div class="value">${new Date(p.createdAt).toLocaleDateString('fr-FR')}</div></div>
  </div>

  <table>
    <thead><tr><th>Désignation</th><th class="amount">Base</th><th class="amount">Taux</th><th class="amount">Montant</th></tr></thead>
    <tbody>
      <tr><td colspan="4" class="section-title">GAINS</td></tr>
      <tr><td>Salaire de base</td><td class="amount">${formatCurrency(p.baseSalary)}</td><td class="amount">-</td><td class="amount">${formatCurrency(p.baseSalary)}</td></tr>
      ${p.seniority ? `<tr><td>Prime d'ancienneté</td><td class="amount">-</td><td class="amount">-</td><td class="amount">${formatCurrency(p.seniority)}</td></tr>` : ''}
      ${p.transportAllowance ? `<tr><td>Indemnité de transport</td><td class="amount">-</td><td class="amount">-</td><td class="amount">${formatCurrency(p.transportAllowance)}</td></tr>` : ''}
      ${p.housingAllowance ? `<tr><td>Indemnité de logement</td><td class="amount">-</td><td class="amount">-</td><td class="amount">${formatCurrency(p.housingAllowance)}</td></tr>` : ''}
      ${p.bonuses ? `<tr><td>Primes diverses</td><td class="amount">-</td><td class="amount">-</td><td class="amount">${formatCurrency(p.bonuses)}</td></tr>` : ''}
      ${p.overtime ? `<tr><td>Heures supplémentaires</td><td class="amount">-</td><td class="amount">-</td><td class="amount">${formatCurrency(p.overtime)}</td></tr>` : ''}
      <tr class="total-row"><td><strong>SALAIRE BRUT</strong></td><td></td><td></td><td class="amount"><strong>${formatCurrency(p.grossSalary)}</strong></td></tr>

      <tr><td colspan="4" class="section-title">RETENUES SALARIALES</td></tr>
      <tr><td>IPRES Régime général</td><td class="amount">${formatCurrency(Math.min(p.grossSalary, 432000))}</td><td class="amount">5,6%</td><td class="amount" style="color:#ef4444">-${formatCurrency(p.ipresGeneral)}</td></tr>
      ${p.ipresCadre ? `<tr><td>IPRES Régime cadre</td><td class="amount">-</td><td class="amount">2,4%</td><td class="amount" style="color:#ef4444">-${formatCurrency(p.ipresCadre)}</td></tr>` : ''}
      <tr><td>CSS Maladie</td><td class="amount">${formatCurrency(p.grossSalary)}</td><td class="amount">3%</td><td class="amount" style="color:#ef4444">-${formatCurrency(p.cssMaladie)}</td></tr>
      <tr><td>Impôt sur le Revenu (IR)</td><td class="amount">-</td><td class="amount">barème</td><td class="amount" style="color:#ef4444">-${formatCurrency(p.incomeTax)}</td></tr>
      <tr><td>TRIMF</td><td class="amount">-</td><td class="amount">forfait</td><td class="amount" style="color:#ef4444">-${formatCurrency(p.trimf)}</td></tr>
      <tr class="total-row"><td><strong>TOTAL RETENUES</strong></td><td></td><td></td><td class="amount" style="color:#ef4444"><strong>-${formatCurrency(p.totalDeductions)}</strong></td></tr>
    </tbody>
  </table>

  <div class="net-box">
    <span class="label">NET A PAYER</span>
    <span class="amount">${formatCurrency(p.netSalary)}</span>
  </div>

  <div class="employer-section">
    <h3>Charges patronales (pour information)</h3>
    <div class="employer-row"><span>IPRES patronal (8,4%)</span><span>${formatCurrency(p.employerIpres)}</span></div>
    <div class="employer-row"><span>CSS patronal (AT + PF)</span><span>${formatCurrency(p.employerCss)}</span></div>
    <div class="employer-row"><span>CFCE (3%)</span><span>${formatCurrency(p.employerCfce)}</span></div>
    <div class="employer-row" style="font-weight:700;border-top:1px solid #bfdbfe;padding-top:6px;margin-top:4px"><span>Total charges patronales</span><span>${formatCurrency(p.employerIpres + p.employerCss + p.employerCfce)}</span></div>
  </div>

  ${p.paidAt ? `<p style="margin-top:15px;font-size:12px;color:#059669;">Payé le : ${new Date(p.paidAt).toLocaleDateString('fr-FR')}</p>` : ''}
  ${p.notes ? `<p style="margin-top:10px;font-size:12px;color:#64748b;"><em>Notes : ${p.notes}</em></p>` : ''}

  <div class="footer">
    <p>Document généré par NeuroPharm - Gestion Pharmaceutique Intelligente</p>
    <p>Ce bulletin est établi conformément à la réglementation sénégalaise en vigueur</p>
    <p style="margin-top:5px">Ce document est confidentiel</p>
  </div>
  <script>window.onload=function(){window.print();}</script>
</body></html>`)
  w.document.close()
}

const defaultForm = {
  employeeName: '',
  employeeRole: '',
  baseSalary: '',
  seniority: '0',
  transportAllowance: '0',
  housingAllowance: '0',
  bonuses: '0',
  overtime: '0',
  isCadre: false,
  month: String(new Date().getMonth() + 1),
  year: String(new Date().getFullYear()),
  notes: '',
}

export default function PaiePage() {
  const { user } = useDashboard()
  const [payrolls, setPayrolls] = useState<Payroll[]>([])
  const [stats, setStats] = useState<PayrollStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()))
  const [form, setForm] = useState(defaultForm)
  const [error, setError] = useState('')

  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role)

  const fetchPayrolls = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filterStatus) params.set('status', filterStatus)
      if (filterMonth) params.set('month', filterMonth)
      if (filterYear) params.set('year', filterYear)
      const res = await fetch(`/api/payroll?${params}`)
      const data = await res.json()
      setPayrolls(data.payrolls || [])
      setStats(data.stats || null)
    } catch (err) {
      console.error('Failed to fetch payrolls:', err)
    } finally {
      setLoading(false)
    }
  }, [filterStatus, filterMonth, filterYear])

  useEffect(() => { fetchPayrolls() }, [fetchPayrolls])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      employeeName: form.employeeName,
      employeeRole: form.employeeRole || null,
      baseSalary: Number(form.baseSalary),
      seniority: Number(form.seniority),
      transportAllowance: Number(form.transportAllowance),
      housingAllowance: Number(form.housingAllowance),
      bonuses: Number(form.bonuses),
      overtime: Number(form.overtime),
      isCadre: form.isCadre,
      month: Number(form.month),
      year: Number(form.year),
      notes: form.notes || null,
    }

    try {
      const url = editId ? `/api/payroll/${editId}` : '/api/payroll'
      const res = await fetch(url, {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Erreur')
        setSaving(false)
        return
      }
      setShowModal(false)
      setEditId(null)
      fetchPayrolls()
    } catch {
      setError('Erreur réseau')
    }
    setSaving(false)
  }

  const handleAction = async (id: string, action: string) => {
    await fetch(`/api/payroll/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    fetchPayrolls()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce bulletin de paie ?')) return
    await fetch(`/api/payroll/${id}`, { method: 'DELETE' })
    fetchPayrolls()
  }

  const handleEdit = (p: Payroll) => {
    setEditId(p.id)
    setForm({
      employeeName: p.employeeName,
      employeeRole: p.employeeRole || '',
      baseSalary: String(p.baseSalary),
      seniority: String(p.seniority),
      transportAllowance: String(p.transportAllowance),
      housingAllowance: String(p.housingAllowance),
      bonuses: String(p.bonuses),
      overtime: String(p.overtime),
      isCadre: p.ipresCadre > 0,
      month: String(p.month),
      year: String(p.year),
      notes: p.notes || '',
    })
    setError('')
    setShowModal(true)
  }

  const handleGenerate = async () => {
    if (!confirm(`Générer les bulletins pour ${monthNames[Number(filterMonth || new Date().getMonth() + 1) - 1]} ${filterYear || new Date().getFullYear()} ?`)) return
    setGenerating(true)
    try {
      const res = await fetch('/api/payroll/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: Number(filterMonth || new Date().getMonth() + 1),
          year: Number(filterYear || new Date().getFullYear()),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        alert(data.message)
        fetchPayrolls()
      } else {
        alert(data.error || 'Erreur')
      }
    } catch {
      alert('Erreur réseau')
    }
    setGenerating(false)
  }

  const openNewForm = () => {
    setEditId(null)
    setForm(defaultForm)
    setError('')
    setShowModal(true)
  }

  // Estimate net from form (simplified preview)
  const grossPreview = Number(form.baseSalary || 0) + Number(form.seniority || 0) +
    Number(form.transportAllowance || 0) + Number(form.housingAllowance || 0) +
    Number(form.bonuses || 0) + Number(form.overtime || 0)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50"><Banknote className="w-5 h-5 text-emerald-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Masse salariale nette</p>
              <p className="text-xl font-bold text-gray-900">{stats ? formatCurrency(stats.totalNet) : '...'}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50"><Users className="w-5 h-5 text-blue-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Charges patronales</p>
              <p className="text-xl font-bold text-gray-900">{stats ? formatCurrency(stats.totalEmployerCharges) : '...'}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50"><Clock className="w-5 h-5 text-amber-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Brouillons</p>
              <p className="text-xl font-bold text-amber-600">{stats?.draftCount ?? '...'}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50"><Check className="w-5 h-5 text-emerald-600" /></div>
            <div>
              <p className="text-sm text-gray-500">Payés</p>
              <p className="text-xl font-bold text-emerald-600">{stats?.paidCount ?? '...'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Header + Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Bulletins de paie</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
            <option value="">Tous les mois</option>
            {monthNames.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <input type="number" value={filterYear} onChange={e => setFilterYear(e.target.value)} placeholder="Année"
            className="w-24 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
            <option value="">Tous statuts</option>
            <option value="draft">Brouillon</option>
            <option value="validated">Validé</option>
            <option value="paid">Payé</option>
          </select>
          {isAdmin && (
            <button onClick={handleGenerate} disabled={generating}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Auto-générer
            </button>
          )}
          <button onClick={openNewForm}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors">
            <Plus className="w-4 h-4" /> Nouveau
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Employé</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Période</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Brut</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Retenues</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Net</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Statut</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-600" /></td></tr>
            ) : payrolls.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">Aucun bulletin de paie</td></tr>
            ) : payrolls.map(p => {
              const st = statusLabels[p.status] || statusLabels.draft
              const isExpanded = expandedId === p.id
              return (
                <tr key={p.id} className="group">
                  <td className="px-4 py-3" colSpan={7}>
                    {/* Main row */}
                    <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center text-sm font-semibold text-emerald-700">
                          {p.employeeName.split(' ').map(w => w[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{p.employeeName}</p>
                          <p className="text-xs text-gray-500">{p.employeeRole || '-'}</p>
                        </div>
                      </div>
                      <div className="hidden md:block text-gray-500 w-28">{monthNames[p.month - 1]} {p.year}</div>
                      <div className="hidden lg:block text-right text-gray-600 w-28">{formatCurrency(p.grossSalary)}</div>
                      <div className="hidden lg:block text-right text-red-600 w-28">-{formatCurrency(p.totalDeductions)}</div>
                      <div className="text-right font-semibold text-gray-900 w-32">{formatCurrency(p.netSalary)}</div>
                      <div className="text-center w-24">
                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
                      </div>
                      <div className="flex items-center justify-end gap-1 w-36" onClick={e => e.stopPropagation()}>
                        {p.status === 'draft' && isAdmin && (
                          <button onClick={() => handleAction(p.id, 'validate')} title="Valider" className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors">
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        {p.status === 'validated' && isAdmin && (
                          <>
                            <button onClick={() => handleAction(p.id, 'pay')} title="Marquer payé" className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors">
                              <Banknote className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleAction(p.id, 'revert')} title="Remettre en brouillon" className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors">
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {p.status === 'draft' && (
                          <button onClick={() => handleEdit(p)} title="Modifier" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
                            <FileText className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => generatePaySlipPDF(p)} title="Imprimer bulletin" className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors">
                          <FileText className="w-4 h-4" />
                        </button>
                        {p.status !== 'paid' && (
                          <button onClick={() => handleDelete(p.id)} title="Supprimer" className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </div>
                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        <div className="space-y-2">
                          <h4 className="font-semibold text-emerald-700 text-sm">Gains</h4>
                          <div className="flex justify-between"><span className="text-gray-500">Salaire de base</span><span>{formatCurrency(p.baseSalary)}</span></div>
                          {p.seniority > 0 && <div className="flex justify-between"><span className="text-gray-500">Ancienneté</span><span>{formatCurrency(p.seniority)}</span></div>}
                          {p.transportAllowance > 0 && <div className="flex justify-between"><span className="text-gray-500">Transport</span><span>{formatCurrency(p.transportAllowance)}</span></div>}
                          {p.housingAllowance > 0 && <div className="flex justify-between"><span className="text-gray-500">Logement</span><span>{formatCurrency(p.housingAllowance)}</span></div>}
                          {p.bonuses > 0 && <div className="flex justify-between"><span className="text-gray-500">Primes</span><span>{formatCurrency(p.bonuses)}</span></div>}
                          {p.overtime > 0 && <div className="flex justify-between"><span className="text-gray-500">Heures sup.</span><span>{formatCurrency(p.overtime)}</span></div>}
                          <div className="flex justify-between font-semibold border-t border-gray-100 pt-1"><span>Brut</span><span>{formatCurrency(p.grossSalary)}</span></div>
                        </div>
                        <div className="space-y-2">
                          <h4 className="font-semibold text-red-600 text-sm">Retenues salariales</h4>
                          <div className="flex justify-between"><span className="text-gray-500">IPRES général (5,6%)</span><span>-{formatCurrency(p.ipresGeneral)}</span></div>
                          {p.ipresCadre > 0 && <div className="flex justify-between"><span className="text-gray-500">IPRES cadre (2,4%)</span><span>-{formatCurrency(p.ipresCadre)}</span></div>}
                          <div className="flex justify-between"><span className="text-gray-500">CSS maladie (3%)</span><span>-{formatCurrency(p.cssMaladie)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">IR (barème)</span><span>-{formatCurrency(p.incomeTax)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">TRIMF</span><span>-{formatCurrency(p.trimf)}</span></div>
                          <div className="flex justify-between font-semibold border-t border-gray-100 pt-1 text-red-600"><span>Total retenues</span><span>-{formatCurrency(p.totalDeductions)}</span></div>
                        </div>
                        <div className="space-y-2">
                          <h4 className="font-semibold text-blue-700 text-sm">Charges patronales</h4>
                          <div className="flex justify-between"><span className="text-gray-500">IPRES (8,4%)</span><span>{formatCurrency(p.employerIpres)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">CSS (AT+PF)</span><span>{formatCurrency(p.employerCss)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">CFCE (3%)</span><span>{formatCurrency(p.employerCfce)}</span></div>
                          <div className="flex justify-between font-semibold border-t border-gray-100 pt-1"><span>Total patronal</span><span>{formatCurrency(p.employerIpres + p.employerCss + p.employerCfce)}</span></div>
                          {p.validatedAt && <div className="mt-3 text-gray-400">Validé le {new Date(p.validatedAt).toLocaleDateString('fr-FR')}</div>}
                          {p.paidAt && <div className="text-emerald-600">Payé le {new Date(p.paidAt).toLocaleDateString('fr-FR')}</div>}
                          {p.notes && <div className="mt-2 text-gray-500 italic">Note: {p.notes}</div>}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Add/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold">{editId ? 'Modifier le bulletin' : 'Nouveau bulletin de paie'}</h3>
              <button onClick={() => { setShowModal(false); setEditId(null) }} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl">{error}</div>}

              {/* Employee info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l&apos;employé *</label>
                  <input value={form.employeeName} onChange={e => setForm(f => ({ ...f, employeeName: e.target.value }))} required
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Poste</label>
                  <input value={form.employeeRole} onChange={e => setForm(f => ({ ...f, employeeRole: e.target.value }))}
                    placeholder="Ex: Pharmacien, Caissier..."
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                </div>
              </div>

              {/* Period */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mois *</label>
                  <select value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                    {monthNames.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Année *</label>
                  <input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} required
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                </div>
              </div>

              {/* Gains */}
              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-sm font-semibold text-emerald-700 mb-3">Gains</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Salaire de base (XOF) *</label>
                    <input type="number" min="0" value={form.baseSalary} onChange={e => setForm(f => ({ ...f, baseSalary: e.target.value }))} required
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Prime d&apos;ancienneté</label>
                    <input type="number" min="0" value={form.seniority} onChange={e => setForm(f => ({ ...f, seniority: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Indemnité de transport</label>
                    <input type="number" min="0" value={form.transportAllowance} onChange={e => setForm(f => ({ ...f, transportAllowance: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Indemnité de logement</label>
                    <input type="number" min="0" value={form.housingAllowance} onChange={e => setForm(f => ({ ...f, housingAllowance: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Primes diverses</label>
                    <input type="number" min="0" value={form.bonuses} onChange={e => setForm(f => ({ ...f, bonuses: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Heures supplémentaires</label>
                    <input type="number" min="0" value={form.overtime} onChange={e => setForm(f => ({ ...f, overtime: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                  </div>
                </div>
              </div>

              {/* Options */}
              <div className="flex items-center gap-3 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isCadre} onChange={e => setForm(f => ({ ...f, isCadre: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                  <span className="text-sm text-gray-700">Cadre (IPRES régime cadre)</span>
                </label>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>

              {/* Preview */}
              <div className="p-4 bg-emerald-50 rounded-xl space-y-1">
                <p className="text-sm text-gray-600">Brut estimé: <span className="font-bold text-gray-900">{formatCurrency(grossPreview)}</span></p>
                <p className="text-xs text-gray-500">Les cotisations (IPRES, CSS, IR, TRIMF) seront calculées automatiquement</p>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button type="button" onClick={() => { setShowModal(false); setEditId(null) }}
                  className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200">
                  Annuler
                </button>
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-60">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editId ? 'Enregistrer' : 'Créer le bulletin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
