import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { firstName, lastName, phone, currentPassword, newPassword } = body

    // Password change
    if (currentPassword && newPassword) {
      const user = await prisma.user.findUnique({ where: { id: session.id } })
      if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })

      const valid = await bcrypt.compare(currentPassword, user.password)
      if (!valid) return NextResponse.json({ error: 'Mot de passe actuel incorrect' }, { status: 400 })

      const hashed = await bcrypt.hash(newPassword, 12)
      await prisma.user.update({
        where: { id: session.id },
        data: { password: hashed },
      })

      return NextResponse.json({ success: true })
    }

    // Profile update
    const updateData: Record<string, string> = {}
    if (firstName) updateData.firstName = firstName
    if (lastName) updateData.lastName = lastName
    if (phone !== undefined) updateData.phone = phone

    await prisma.user.update({
      where: { id: session.id },
      data: updateData,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Profile PUT:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
