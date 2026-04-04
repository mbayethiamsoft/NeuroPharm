'use client'

import { useState, useEffect } from 'react'
import { Users, Plus, X, Loader2, Clock, UserCheck, UserX } from 'lucide-react'

interface Employee {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string | null
  role: string
  isActive: boolean
  lastLogin: string | null
  createdAt: string
}

interface Attendance {
  id: string
  date: string
  checkIn: string | null
  checkOut: string | null
  status: string
  user: { firstName: string; lastName: string; role: string }
}

const roleBadge: Record<string, { label: string; cls: string }> = {
  ADMIN: { label: 'Admin', cls: 'bg-purple-100 text-purple-700' },
  PHARMACIST: { label: 'Pharmacien', cls: 'bg-emerald-100 text-emerald-700' },
  CASHIER: { label: 'Caissier', cls: 'bg-blue-100 text-blue-700' },
  ACCOUNTANT: { label: 'Comptable', cls: 'bg-amber-100 text-amber-700' },
  SUPER_ADMIN: { label: 'Super Admin', cls: 'bg-red-100 text-red-700' },
}

const statusBadge: Record<string, { label: string; cls: string }> = {
  present: { label: 'Present', cls: 'bg-emerald-100 text-emerald-700' },
  absent: { label: 'Absent', cls: 'bg-red-100 text-red-700' },
  late: { label: 'Retard', cls: 'bg-amber-100 text-amber-700' },
  leave: { label: 'Conge', cls: 'bg-blue-100 text-blue-700' },
}

export default function PersonnelPage() {
  const [tab, setTab] = useState<'employees' | 'attendance'>('employees')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [attendances, setAttendances] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', phone: '', role: 'CASHIER' })

  const fetchEmployees = async () => {
    setLoading(true)
    const res = await fetch('/api/personnel')
    const data = await res.json()
    setEmployees(data.users || [])
    setLoading(false)
  }

  const fetchAttendances = async () => {
    const res = await fetch('/api/personnel/attendance')
    const data = await res.json()
    setAttendances(data.attendances || [])
  }

  useEffect(() => { fetchEmployees() }, [])
  useEffect(() => { if (tab === 'attendance') fetchAttendances() }, [tab])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/personnel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false)
    setShowModal(false)
    fetchEmployees()
  }

  const handleCheckIn = async () => {
    await fetch('/api/personnel/attendance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'checkIn' }),
    })
    fetchAttendances()
  }

  const handleCheckOut = async () => {
    await fetch('/api/personnel/attendance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'checkOut' }),
    })
    fetchAttendances()
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button onClick={() => setTab('employees')} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'employees' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Employés</button>
          <button onClick={() => setTab('attendance')} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'attendance' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Présences</button>
        </div>
        <div className="flex gap-2">
          {tab === 'attendance' && (
            <>
              <button onClick={handleCheckIn} className="flex items-center gap-2 px-3 py-2 bg-emerald-100 text-emerald-700 text-sm font-medium rounded-xl hover:bg-emerald-200">
                <UserCheck className="w-4 h-4" /> Pointer arrivee
              </button>
              <button onClick={handleCheckOut} className="flex items-center gap-2 px-3 py-2 bg-amber-100 text-amber-700 text-sm font-medium rounded-xl hover:bg-amber-200">
                <UserX className="w-4 h-4" /> Pointer depart
              </button>
            </>
          )}
          {tab === 'employees' && (
            <button onClick={() => { setForm({ firstName: '', lastName: '', email: '', password: '', phone: '', role: 'CASHIER' }); setShowModal(true) }}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700">
              <Plus className="w-4 h-4" /> Ajouter
            </button>
          )}
        </div>
      </div>

      {tab === 'employees' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Employe</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Email</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Role</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Téléphone</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Derniere connexion</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12"><Loader2 className="w-6 h-6 mx-auto animate-spin text-gray-400" /></td></tr>
              ) : employees.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12"><Users className="w-10 h-10 mx-auto mb-2 text-gray-300" /><p className="text-gray-400">Aucun employe</p></td></tr>
              ) : employees.map(emp => (
                <tr key={emp.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-semibold">
                        {emp.firstName[0]}{emp.lastName[0]}
                      </div>
                      <span className="font-medium text-gray-900">{emp.firstName} {emp.lastName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{emp.email}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${roleBadge[emp.role]?.cls || 'bg-gray-100 text-gray-700'}`}>
                      {roleBadge[emp.role]?.label || emp.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{emp.phone || '-'}</td>
                  <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">
                    {emp.lastLogin ? new Date(emp.lastLogin).toLocaleDateString('fr-FR') : 'Jamais'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'attendance' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Employe</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Arrivee</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Depart</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-600">Statut</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {attendances.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12"><Clock className="w-10 h-10 mx-auto mb-2 text-gray-300" /><p className="text-gray-400">Aucune presence</p></td></tr>
              ) : attendances.map(a => (
                <tr key={a.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-gray-500">{new Date(a.date).toLocaleDateString('fr-FR')}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{a.user.firstName} {a.user.lastName}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{a.checkIn ? new Date(a.checkIn).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{a.checkOut ? new Date(a.checkOut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusBadge[a.status]?.cls || 'bg-gray-100'}`}>
                      {statusBadge[a.status]?.label || a.status}
                    </span>
                  </td>
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
              <h3 className="text-lg font-semibold">Ajouter un employe</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prénom *</label>
                  <input required value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                  <input required value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe *</label>
                <input type="password" required minLength={6} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                  <option value="PHARMACIST">Pharmacien</option>
                  <option value="CASHIER">Caissier</option>
                  <option value="ACCOUNTANT">Comptable</option>
                </select>
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
