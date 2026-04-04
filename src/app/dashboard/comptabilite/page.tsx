'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Percent, Plus, X, Loader2 } from 'lucide-react'

interface FinancialData {
  totalRevenue: number
  totalExpenses: number
  netProfit: number
  margin: number
  monthly: Array<{ month: string; revenue: number; expenses: number; profit: number }>
}

interface Expense {
  id: string
  category: string
  description: string | null
  amount: number
  date: string
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(n)

const expenseCatégories = ['loyer', 'services', 'salaires', 'fournitures', 'transport', 'divers']

export default function ComptabilitePage() {
  const [tab, setTab] = useState<'summary' | 'expenses'>('summary')
  const [financial, setFinancial] = useState<FinancialData | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ category: 'divers', description: '', amount: '', date: '' })

  useEffect(() => {
    setLoading(true)
    fetch('/api/accounting').then(r => r.json()).then(d => { setFinancial(d); setLoading(false) })
  }, [])

  useEffect(() => {
    if (tab === 'expenses') fetch('/api/accounting/expenses').then(r => r.json()).then(d => setExpenses(d.expenses || []))
  }, [tab])

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/accounting/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false)
    setShowModal(false)
    fetch('/api/accounting/expenses').then(r => r.json()).then(d => setExpenses(d.expenses || []))
    fetch('/api/accounting').then(r => r.json()).then(setFinancial)
  }

  const maxMonthlyValue = financial?.monthly?.length ? Math.max(...financial.monthly.map(m => Math.max(m.revenue, m.expenses)), 1) : 1

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: 'Revenus', value: financial?.totalRevenue || 0, icon: TrendingUp, color: 'bg-emerald-50', textColor: 'text-emerald-600' },
          { title: 'Dépenses', value: financial?.totalExpenses || 0, icon: TrendingDown, color: 'bg-red-50', textColor: 'text-red-600' },
          { title: 'Bénéfice net', value: financial?.netProfit || 0, icon: DollarSign, color: 'bg-blue-50', textColor: 'text-blue-600' },
          { title: 'Marge', value: financial?.margin || 0, icon: Percent, color: 'bg-violet-50', textColor: 'text-violet-600', isPercent: true },
        ].map(card => (
          <div key={card.title} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-xl ${card.color}`}><card.icon className={`w-5 h-5 ${card.textColor}`} /></div>
              <span className="text-sm text-gray-500">{card.title}</span>
            </div>
            <p className={`text-2xl font-bold ${card.textColor}`}>
              {loading ? '...' : 'isPercent' in card && card.isPercent ? `${card.value.toFixed(1)}%` : formatCurrency(card.value)}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button onClick={() => setTab('summary')} className={`px-4 py-2 text-sm font-medium rounded-lg ${tab === 'summary' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Résumé</button>
          <button onClick={() => setTab('expenses')} className={`px-4 py-2 text-sm font-medium rounded-lg ${tab === 'expenses' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Dépenses</button>
        </div>
        {tab === 'expenses' && (
          <button onClick={() => { setForm({ category: 'divers', description: '', amount: '', date: '' }); setShowModal(true) }}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700">
            <Plus className="w-4 h-4" /> Ajouter
          </button>
        )}
      </div>

      {tab === 'summary' && financial && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Évolution mensuelle</h3>
          <div className="space-y-3">
            {financial.monthly.map(m => (
              <div key={m.month} className="flex items-center gap-4">
                <span className="w-20 text-sm text-gray-500 font-mono">{m.month}</span>
                <div className="flex-1 flex gap-2">
                  <div className="flex-1">
                    <div className="h-6 bg-emerald-100 rounded-lg overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-lg transition-all" style={{ width: `${(m.revenue / maxMonthlyValue) * 100}%` }} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="h-6 bg-red-100 rounded-lg overflow-hidden">
                      <div className="h-full bg-red-400 rounded-lg transition-all" style={{ width: `${(m.expenses / maxMonthlyValue) * 100}%` }} />
                    </div>
                  </div>
                </div>
                <span className={`w-28 text-right text-sm font-medium ${m.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatCurrency(m.profit)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-6 mt-4 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500" /> Revenus</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400" /> Dépenses</span>
          </div>
        </div>
      )}

      {tab === 'expenses' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Catégorie</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Description</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Montant</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {expenses.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-12 text-gray-400">Aucune dépense</td></tr>
              ) : expenses.map(exp => (
                <tr key={exp.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-gray-500">{new Date(exp.date).toLocaleDateString('fr-FR')}</td>
                  <td className="px-4 py-3"><span className="px-2 py-1 text-xs bg-gray-100 rounded-full capitalize">{exp.category}</span></td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{exp.description || '-'}</td>
                  <td className="px-4 py-3 text-right font-medium text-red-600">{formatCurrency(exp.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold">Ajouter une dépense</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAddExpense} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                  {expenseCatégories.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Montant *</label>
                <input type="number" required min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200">Annuler</button>
                <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-60">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Ajouter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
