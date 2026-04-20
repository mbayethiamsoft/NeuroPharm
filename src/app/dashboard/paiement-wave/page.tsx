'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import QRCode from 'react-qr-code'
import { CheckCircle, Clock, AlertTriangle, Smartphone, ArrowLeft, Loader2, RefreshCw } from 'lucide-react'

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(n)

const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const POLL_INTERVAL_MS = 5000

function WavePaymentContent() {
  const searchParams = useSearchParams()

  const sessionToken = searchParams.get('session') || ''
  const amount = parseInt(searchParams.get('amount') || '0', 10)
  const reference = searchParams.get('ref') || ''
  const period = searchParams.get('period') || 'monthly'
  const plan = searchParams.get('plan') || ''
  const pharmacyName = searchParams.get('pharmacy') || ''
  const expiresAtStr = searchParams.get('expires') || ''

  const [timeLeft, setTimeLeft] = useState(0)
  const [status, setStatus] = useState<'pending' | 'confirming' | 'success' | 'expired' | 'error'>('pending')
  const [result, setResult] = useState<{ reference: string; newEndDate: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  // Compte à rebours
  useEffect(() => {
    if (!expiresAtStr) return
    const expiresAt = new Date(expiresAtStr).getTime()

    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining === 0) setStatus(s => s === 'pending' ? 'expired' : s)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAtStr])

  // Polling automatique en production : vérifie le statut toutes les 5 secondes
  useEffect(() => {
    if (!IS_PRODUCTION || !sessionToken) return

    const poll = async () => {
      try {
        const res = await fetch(`/api/payments/confirm?session=${encodeURIComponent(sessionToken)}`)
        if (!res.ok) return
        const data = await res.json()
        if (data.status === 'completed') {
          setResult({ reference: data.reference, newEndDate: data.newEndDate })
          setStatus('success')
        } else if (data.status === 'failed') {
          setErrorMsg('Le paiement a été annulé ou a expiré.')
          setStatus('error')
        }
      } catch {
        // Silencieux — on réessaie au prochain tick
      }
    }

    const id = setInterval(() => {
      setStatus(s => {
        if (s !== 'pending') { clearInterval(id); return s }
        poll()
        return s
      })
    }, POLL_INTERVAL_MS)

    return () => clearInterval(id)
  }, [sessionToken])

  // Confirmation manuelle (dev uniquement — simulate Wave webhook)
  const handleConfirm = useCallback(async () => {
    if (!sessionToken) return
    setStatus('confirming')
    try {
      const res = await fetch('/api/payments/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult({ reference: data.reference, newEndDate: data.newEndDate })
        setStatus('success')
      } else {
        setErrorMsg(data.error || 'Échec de la confirmation')
        setStatus('error')
      }
    } catch {
      setErrorMsg('Erreur de connexion')
      setStatus('error')
    }
  }, [sessionToken])

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const timerLabel = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  const timerRatio = expiresAtStr
    ? timeLeft / (parseInt(process.env.NEXT_PUBLIC_WAVE_QR_EXPIRY_MINUTES || '10', 10) * 60)
    : 1
  const timerColor = timerRatio > 0.4 ? 'text-emerald-600' : timerRatio > 0.15 ? 'text-amber-500' : 'text-red-500'

  const wavePayUrl = `https://pay.wave.com/m/neuropharm?amount=${amount}&currency=XOF&ref=${reference}`

  // --- Écran succès ---
  if (status === 'success' && result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Paiement confirmé !</h1>
          <p className="text-gray-500 mt-2">Votre abonnement a été renouvelé avec succès.</p>

          <div className="mt-6 space-y-2 p-4 bg-gray-50 rounded-2xl text-sm text-left">
            <div className="flex justify-between">
              <span className="text-gray-500">Référence</span>
              <span className="font-mono font-bold text-emerald-600">{result.reference}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Montant payé</span>
              <span className="font-semibold">{formatCurrency(amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Période</span>
              <span className="font-medium">{period === 'annual' ? 'Annuel' : 'Mensuel'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Valide jusqu&apos;au</span>
              <span className="font-medium">{new Date(result.newEndDate).toLocaleDateString('fr-FR')}</span>
            </div>
          </div>

          <p className="mt-5 text-sm text-gray-500">
            Une notification a été envoyée à votre compte. Vous pouvez fermer cet onglet.
          </p>

          <button
            onClick={() => window.close()}
            className="mt-6 w-full py-3 bg-emerald-600 text-white font-semibold rounded-2xl hover:bg-emerald-700 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    )
  }

  // --- Écran expiré ---
  if (status === 'expired') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-amber-100 flex items-center justify-center">
            <Clock className="w-10 h-10 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">QR Code expiré</h1>
          <p className="text-gray-500 mt-2">Ce lien de paiement a expiré. Retournez sur la page Paramètres pour générer un nouveau QR code.</p>
          <button
            onClick={() => window.close()}
            className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-medium rounded-2xl hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Fermer
          </button>
        </div>
      </div>
    )
  }

  // --- Écran erreur ---
  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Échec du paiement</h1>
          <p className="text-gray-500 mt-2">{errorMsg}</p>
          <button
            onClick={() => window.close()}
            className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-medium rounded-2xl hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Fermer
          </button>
        </div>
      </div>
    )
  }

  // --- Écran principal (pending / confirming) ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden">

        {/* En-tête Wave */}
        <div className="bg-[#1A73E8] px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-lg leading-none">Paiement Wave</p>
              <p className="text-blue-100 text-sm mt-0.5">Scanner avec l&apos;application Wave</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Montant */}
          <div className="text-center">
            <p className="text-sm text-gray-500">Montant à régler</p>
            <p className="text-4xl font-bold text-gray-900 mt-1">{formatCurrency(amount)}</p>
            <p className="text-sm text-gray-400 mt-1">
              Plan {plan} — {period === 'annual' ? 'Abonnement annuel' : 'Abonnement mensuel'}
              {pharmacyName ? ` · ${pharmacyName}` : ''}
            </p>
          </div>

          {/* QR Code */}
          <div className="flex justify-center">
            <div className="p-4 rounded-2xl border-2 border-blue-100 bg-white shadow-sm">
              <QRCode
                value={wavePayUrl}
                size={200}
                bgColor="#ffffff"
                fgColor="#1A73E8"
                level="M"
              />
            </div>
          </div>

          {/* Référence */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl text-sm">
            <span className="text-gray-500">Référence</span>
            <span className="font-mono font-bold text-gray-800 select-all">{reference}</span>
          </div>

          {/* Timer */}
          {expiresAtStr && (
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 rounded-xl text-sm">
              <span className="text-gray-500 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Expire dans</span>
              <span className={`font-mono font-bold ${timerColor}`}>{timerLabel}</span>
            </div>
          )}

          {/* Instructions */}
          <div className="space-y-2">
            {[
              "Ouvrez l'application Wave sur votre téléphone",
              'Appuyez sur « Scanner » ou « Payer »',
              'Scannez le QR code ci-dessus',
              'Confirmez le montant et validez',
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm text-gray-600">
                <span className="mt-0.5 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </span>
                {step}
              </div>
            ))}
          </div>

          {/* Zone de confirmation */}
          <div className="pt-1">
            {IS_PRODUCTION ? (
              /* Production : attente automatique du webhook Wave */
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-center">
                <div className="flex items-center justify-center gap-2 text-[#1A73E8] font-semibold mb-1">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  En attente de confirmation Wave…
                </div>
                <p className="text-xs text-blue-600">
                  Cette page se met à jour automatiquement dès que Wave valide votre paiement.
                </p>
              </div>
            ) : (
              /* Développement : bouton de simulation */
              <>
                <p className="text-xs text-center text-amber-600 bg-amber-50 rounded-xl px-3 py-2 mb-3">
                  Mode développement — simule la validation Wave (webhook)
                </p>
                <button
                  onClick={handleConfirm}
                  disabled={status === 'confirming' || timeLeft === 0}
                  className="w-full py-3.5 bg-emerald-600 text-white font-semibold rounded-2xl hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  {status === 'confirming'
                    ? <><Loader2 className="w-5 h-5 animate-spin" /> Confirmation en cours...</>
                    : <><CheckCircle className="w-5 h-5" /> Confirmer le paiement Wave</>
                  }
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function WavePaymentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    }>
      <WavePaymentContent />
    </Suspense>
  )
}
