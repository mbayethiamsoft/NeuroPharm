'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Pill } from 'lucide-react'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => {
        if (res.ok) router.push('/dashboard')
        else router.push('/login')
      })
      .catch(() => router.push('/login'))
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-600 to-teal-700">
      <div className="text-center text-white animate-pulse">
        <Pill className="mx-auto h-16 w-16 mb-4" />
        <h1 className="text-3xl font-bold">NeuroPharm</h1>
        <p className="mt-2 text-emerald-100">Chargement...</p>
      </div>
    </div>
  )
}
