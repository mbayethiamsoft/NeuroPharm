import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, generateToken } from '@/lib/auth'
import { createSystemLog } from '@/lib/system-log'
import { cookies } from 'next/headers'

// POST: Start impersonation — switch to pharmacy admin view
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (session?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { pharmacyId } = await request.json()
    if (!pharmacyId) {
      return NextResponse.json({ error: 'pharmacyId requis' }, { status: 400 })
    }

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: { id: true, name: true },
    })
    if (!pharmacy) {
      return NextResponse.json({ error: 'Pharmacie non trouvée' }, { status: 404 })
    }

    // Log the impersonation action
    await createSystemLog({
      level: 'warning',
      action: 'IMPERSONATE_START',
      userId: session.id,
      userEmail: session.email,
      targetId: pharmacyId,
      targetType: 'pharmacy',
      details: `SuperAdmin a démarré une impersonation sur ${pharmacy.name}`,
    })

    // Save original SuperAdmin token, then create a temporary ADMIN token for that pharmacy
    const cookieStore = await cookies()
    const originalToken = cookieStore.get('neuropharm-token')?.value

    // Create an impersonation session: SuperAdmin becomes ADMIN of the target pharmacy
    const impersonatedSession = {
      id: session.id,
      email: session.email,
      firstName: session.firstName,
      lastName: session.lastName,
      role: 'ADMIN' as const,
      pharmacyId: pharmacy.id,
    }

    const impToken = generateToken(impersonatedSession)

    const response = NextResponse.json({
      success: true,
      pharmacyName: pharmacy.name,
    })

    // Store original token in a separate cookie for restore
    response.cookies.set('neuropharm-original-token', originalToken || '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600, // 1 hour max impersonation
      path: '/',
    })

    // Set the impersonation flag
    response.cookies.set('neuropharm-impersonating', pharmacy.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600,
      path: '/',
    })

    // Replace current token with impersonated one
    response.cookies.set('neuropharm-token', impToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Impersonate POST:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// DELETE: Stop impersonation — restore original SuperAdmin session
export async function DELETE() {
  try {
    const cookieStore = await cookies()
    const originalToken = cookieStore.get('neuropharm-original-token')?.value
    const impersonatingPharmacy = cookieStore.get('neuropharm-impersonating')?.value

    if (!originalToken) {
      return NextResponse.json({ error: 'Pas de session originale trouvée' }, { status: 400 })
    }

    // Log the exit
    const session = await getSession()
    await createSystemLog({
      action: 'IMPERSONATE_END',
      userId: session?.id,
      userEmail: session?.email,
      targetId: impersonatingPharmacy || undefined,
      targetType: 'pharmacy',
      details: 'SuperAdmin a quitté le mode impersonation',
    })

    const response = NextResponse.json({ success: true })

    // Restore original token
    response.cookies.set('neuropharm-token', originalToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 86400,
      path: '/',
    })

    // Clear impersonation cookies
    response.cookies.delete('neuropharm-original-token')
    response.cookies.delete('neuropharm-impersonating')

    return response
  } catch (error) {
    console.error('Impersonate DELETE:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
