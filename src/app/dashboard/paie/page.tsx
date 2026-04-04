'use client'

import { useState, useEffect } from 'react'
import { Plus, X, Loader2, Check, FileText, Trash2 } from 'lucide-react'

interface Payroll {
  id: string
  employeeName: string
  baseSalary: number
  bonuses: number
  deductions: number
  netSalary: number
  month: number
  year: number
  status: string
  paidAt: string | null
  createdAt: string
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(n)

const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function generatePaySlipPDF(p: Payroll) {
  const w = window.open('', '_blank', 'width=800,height=600')
  if (!w) return
  w.document.write(`<!DOCTYPE html><html><head><title>Bulletin de paie - ${p.employeeName}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 40px; color: #1e293b; }
  .header { text-align: center; border-bottom: 3px solid #059669; padding-bottom: 20px; margin-bottom: 30px; }
  .header h1 { color: #059669; margin: 0; font-size: 28px; }
  .header p { color: #64748b; margin: 5px 0 0; }
  .info { display: flex; justify-content: space-between; margin-bottom: 30px; }
  .info div { font-size: 14px; }
  .info strong { display: block; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  th { background: #f8fafc; font-weight: 600; color: #475569; }
  .total { font-size: 18px; font-weight: bold; color: #059669; }
  .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; }
  @media print { body { padding: 20px; } }
</style></head><body>
  <div class="header">
    <h1>NeuroPharm</h1>
    <p>Bulletin de Paie</p>
  </div>
  <div class="info">
    <div><strong>Employé</strong>${p.employeeName}</div>
    <div><strong>Période</strong>${monthNames[p.month - 1]} ${p.year}</div>
    <div><strong>Statut</strong>${p.status === 'paid' ? 'Payé' : 'En attente'}</div>
  </div>
  <table>
    <thead><tr><th>Désignation</th><th style="text-align:right">Montant</th></tr></thead>
    <tbody>
      <tr><td>Salaire de base</td><td style="text-align:right">${formatCurrency(p.baseSalary)}</td></tr>
      <tr><td>Primes et bonus</td><td style="text-align:right;color:#059669">+${formatCurrency(p.bonuses)}</td></tr>
      <tr><td>Déductions</td><td style="text-align:right;color:#ef4444">-${formatCurrency(p.deductions)}</td></tr>
      <tr><td class="total">Salaire net</td><td style="text-align:right" class="total">${formatCurrency(p.netSalary)}</td></tr>
    </tbody>
  </table>
  ${p.paidAt ? `<p>Payé le : ${new Date(p.paidAt).toLocaleDateString('fr-FR')}</p>` : ''}
  <div class="footer">
    <p>Document généré par NeuroPharm - Gestion Pharmaceutique Intelligente</p>
    <p>Ce document est confidentiel</p>
  </div>
  <script>window.onload=function(){window.print();}</script>
</body></html>`)
  w.document.close()
}

export default function PaiePage() {
  const [payrolls, setPayrolls] = useState<Payroll[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    employeeName: '',
    baseSalary: '',
    bonuses: '0',
    deductions: '0',
    month: String(new Date().getMonth() + 1),
    year: String(new Date().getFullYear()),
  })

  const fetchPayrolls = () => {
    fetch('/api/payroll').then(r => r.json()).then(d => {
      setPayrolls(d.payrolls || [])
      setLoading(false)
    })
  }

  useEffect(() => { fetchPayrolls() }, [])

  const netSalary = Number(form.baseSalary || 0) + Number(form.bonuses || 0) - Number(form.deductions || 0)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeName: form.employeeName,
        baseSalary: Number(form.baseSalary),
        bonuses: Number(form.bonuses),
        deductions: Number(form.deductions),
        month: Number(form.month),
        year: Number(form.year),
      }),
    })
    setSaving(false)
    setShowModal(false)
    fetchPayrolls()
  }

  const handleMarkPaid = async (id: string) => {
    await fetch(`/api/payroll/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid' }),
    })
    fetchPayrolls()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce bulletin de paie ?')) return
    await fetch(`/api/payroll/${id}`, { method: 'DELETE' })
    fetchPayrolls()
  }

  // Stats
  const totalNet = payrolls.reduce((s, p) => s + p.netSalary, 0)
  const paidCount = payrolls.filter(p => p.status === 'paid').length
  const pendingCount = payrolls.filter(p => p.status === 'pending').length

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <p className="text-sm text-gray-500">Masse salariale</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalNet)}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <p className="text-sm text-gray-500">Bulletins payés</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{paidCount}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <p className="text-sm text-gray-500">En attente</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{pendingCount}</p>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Bulletins de paie</h2>
        <button
          onClick={() => { setForm({ employeeName: '', baseSalary: '', bonuses: '0', deductions: '0', month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()) }); setShowModal(true) }}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Employé</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Période</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Base</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Primes</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Déductions</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Net</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Statut</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={8} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-600" /></td></tr>
            ) : payrolls.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-gray-400">Aucun bulletin de paie</td></tr>
            ) : payrolls.map(p => (
              <tr key={p.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 font-medium text-gray-900">{p.employeeName}</td>
                <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{monthNames[p.month - 1]} {p.year}</td>
                <td className="px-4 py-3 text-right text-gray-600 hidden lg:table-cell">{formatCurrency(p.baseSalary)}</td>
                <td className="px-4 py-3 text-right text-emerald-600 hidden lg:table-cell">+{formatCurrency(p.bonuses)}</td>
                <td className="px-4 py-3 text-right text-red-600 hidden lg:table-cell">-{formatCurrency(p.deductions)}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(p.netSalary)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {p.status === 'paid' ? 'Payé' : 'En attente'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {p.status === 'pending' && (
                      <button onClick={() => handleMarkPaid(p.id)} title="Marquer payé" className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors">
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => generatePaySlipPDF(p)} title="Télécharger PDF" className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors">
                      <FileText className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(p.id)} title="Supprimer" className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold">Nouveau bulletin de paie</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAdd} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l&apos;employé *</label>
                <input value={form.employeeName} onChange={e => setForm(f => ({ ...f, employeeName: e.target.value }))} required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Salaire de base (XOF) *</label>
                <input type="number" min="0" value={form.baseSalary} onChange={e => setForm(f => ({ ...f, baseSalary: e.target.value }))} required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Primes</label>
                  <input type="number" min="0" value={form.bonuses} onChange={e => setForm(f => ({ ...f, bonuses: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Déductions</label>
                  <input type="number" min="0" value={form.deductions} onChange={e => setForm(f => ({ ...f, deductions: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                </div>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl">
                <p className="text-sm text-gray-600">Salaire net: <span className="font-bold text-emerald-700">{formatCurrency(netSalary)}</span></p>
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200">Annuler</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-60">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
