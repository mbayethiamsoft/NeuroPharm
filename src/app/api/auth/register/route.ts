import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, generateToken, type SessionUser } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const { firstName, lastName, email, password, phone, pharmacyName, country } =
      await request.json()

    // Validation
    if (!firstName || !lastName || !email || !password || !pharmacyName) {
      return NextResponse.json(
        { error: 'Tous les champs obligatoires doivent etre remplis' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir au moins 6 caracteres' },
        { status: 400 }
      )
    }

    // Check existing user
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'Un compte avec cet email existe deja' },
        { status: 409 }
      )
    }

    const hashedPassword = await hashPassword(password)

    // Create pharmacy, user, subscription, and settings in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the pharmacy
      const pharmacy = await tx.pharmacy.create({
        data: {
          name: pharmacyName.trim(),
          country: country || 'Sénégal',
          phone: phone || null,
          email: email.toLowerCase().trim(),
        },
      })

      // 2. Create admin user
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase().trim(),
          password: hashedPassword,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone || null,
          role: 'ADMIN',
          pharmacyId: pharmacy.id,
          lastLogin: new Date(),
        },
      })

      // 3. Create trial subscription (14 days)
      await tx.subscription.create({
        data: {
          pharmacyId: pharmacy.id,
          plan: 'TRIAL',
          status: 'ACTIVE',
          startDate: new Date(),
          endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          amount: 0,
        },
      })

      // 4. Create default pharmacy settings
      await tx.pharmacySettings.create({
        data: {
          pharmacyId: pharmacy.id,
          taxRate: 0,
          lowStockThreshold: 10,
          expiryAlertDays: 30,
        },
      })

      // 5. Audit log
      await tx.auditLog.create({
        data: {
          pharmacyId: pharmacy.id,
          userId: user.id,
          action: 'CREATE',
          entity: 'pharmacy',
          entityId: pharmacy.id,
          details: `Pharmacie "${pharmacy.name}" creee avec compte administrateur`,
        },
      })

      return { user, pharmacy }
    })

    const sessionUser: SessionUser = {
      id: result.user.id,
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      role: result.user.role,
      pharmacyId: result.user.pharmacyId,
    }

    const token = generateToken(sessionUser)

    const cookieStore = await cookies()
    cookieStore.set('neuropharm-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24, // 24 hours
    })

    return NextResponse.json(
      {
        user: sessionUser,
        pharmacy: {
          id: result.pharmacy.id,
          name: result.pharmacy.name,
        },
        message: 'Compte cree avec succes',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Register error:', error)
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    )
  }
}
