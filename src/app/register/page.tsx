'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Pill,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  User,
  Phone,
  Building2,
  Globe,
} from 'lucide-react'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
    pharmacyName: '',
    country: 'Sénégal',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (form.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Une erreur est survenue')
        return
      }

      router.push('/dashboard')
    } catch {
      setError('Impossible de se connecter au serveur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-5/12 relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800">
        {/* Decorative elements */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-10 w-72 h-72 bg-emerald-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-teal-400/15 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-emerald-300/10 rounded-full blur-2xl" />
        </div>

        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-5">
          <div
            className="h-full w-full"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
        </div>

        <div className="relative z-10 flex flex-col justify-center items-center w-full px-12 text-white">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-16 h-16 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-lg">
              <Pill className="w-9 h-9 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold tracking-tight">NeuroPharm</h1>
              <p className="text-emerald-200 text-sm font-medium">Gestion Pharmaceutique Intelligente</p>
            </div>
          </div>

          <div className="max-w-md text-center space-y-6">
            <h2 className="text-2xl font-semibold leading-snug">
              Lancez votre pharmacie numérique en quelques minutes
            </h2>
            <p className="text-emerald-100/80 leading-relaxed">
              Essai gratuit de 14 jours. Aucune carte bancaire requise. Commencez à gérer votre pharmacie dès aujourd&apos;hui.
            </p>
          </div>

          {/* Benefits */}
          <div className="mt-12 space-y-4 max-w-sm w-full">
            {[
              'Configuration instantanée de votre pharmacie',
              'Importation facile de votre catalogue',
              'Support technique disponible 24/7',
              'Données sécurisées et sauvegardées',
            ].map((benefit) => (
              <div key={benefit} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-400/20 border border-emerald-400/30 flex items-center justify-center flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-emerald-300" />
                </div>
                <span className="text-sm text-emerald-100">{benefit}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Register Form */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 px-6 py-12 overflow-y-auto">
        <div className="w-full max-w-lg">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <div className="w-11 h-11 bg-emerald-600 rounded-xl flex items-center justify-center">
              <Pill className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900">NeuroPharm</span>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900">Créer un compte</h2>
            <p className="text-gray-500 mt-2">Inscrivez-vous et configurez votre pharmacie</p>
          </div>

          {error && (
            <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Prénom
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="firstName"
                    type="text"
                    value={form.firstName}
                    onChange={(e) => updateField('firstName', e.target.value)}
                    placeholder="Prénom"
                    required
                    className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all shadow-sm"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Nom
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="lastName"
                    type="text"
                    value={form.lastName}
                    onChange={(e) => updateField('lastName', e.target.value)}
                    placeholder="Nom"
                    required
                    className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all shadow-sm"
                  />
                </div>
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1.5">
                Adresse email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="vous@pharmacie.com"
                  required
                  className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all shadow-sm"
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="phone" className="block text-sm font-semibold text-gray-700 mb-1.5">
                Téléphone
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="+221 77 000 00 00"
                  className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all shadow-sm"
                />
              </div>
            </div>

            {/* Pharmacy name */}
            <div>
              <label htmlFor="pharmacyName" className="block text-sm font-semibold text-gray-700 mb-1.5">
                Nom de la pharmacie
              </label>
              <div className="relative">
                <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="pharmacyName"
                  type="text"
                  value={form.pharmacyName}
                  onChange={(e) => updateField('pharmacyName', e.target.value)}
                  placeholder="Pharmacie du Plateau"
                  required
                  className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all shadow-sm"
                />
              </div>
            </div>

            {/* Country */}
            <div>
              <label htmlFor="country" className="block text-sm font-semibold text-gray-700 mb-1.5">
                Pays
              </label>
              <div className="relative">
                <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                  id="country"
                  value={form.country}
                  onChange={(e) => updateField('country', e.target.value)}
                  required
                  className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all shadow-sm appearance-none"
                >
                  <optgroup label="Pays UEMOA">
                    <option value="Sénégal">Sénégal</option>
                    <option value="Côte d'Ivoire">Côte d&apos;Ivoire</option>
                    <option value="Mali">Mali</option>
                    <option value="Burkina Faso">Burkina Faso</option>
                    <option value="Niger">Niger</option>
                    <option value="Togo">Togo</option>
                    <option value="Bénin">Bénin</option>
                    <option value="Guinée-Bissau">Guinée-Bissau</option>
                  </optgroup>
                  <optgroup label="Autres pays africains">
                    <option value="Guinée">Guinée</option>
                    <option value="Cameroun">Cameroun</option>
                    <option value="RD Congo">RD Congo</option>
                    <option value="Gabon">Gabon</option>
                    <option value="Congo">Congo</option>
                    <option value="Tchad">Tchad</option>
                    <option value="Madagascar">Madagascar</option>
                  </optgroup>
                </select>
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1.5">
                Mot de passe
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  placeholder="Minimum 6 caractères"
                  required
                  minLength={6}
                  className="w-full pl-11 pr-12 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 mt-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Création en cours...
                </>
              ) : (
                'Créer mon compte'
              )}
            </button>
          </form>

          {/* Login link */}
          <p className="mt-6 text-center text-sm text-gray-500">
            Déjà un compte ?{' '}
            <Link
              href="/login"
              className="text-emerald-600 font-semibold hover:text-emerald-700 transition-colors"
            >
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
