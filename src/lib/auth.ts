import { prisma } from './prisma'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'fallback-secret'

export interface SessionUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  pharmacyId: string | null
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function generateToken(user: SessionUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '24h' })
}

export function verifyToken(token: string): SessionUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionUser
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('neuropharm-token')?.value
  if (!token) return null
  return verifyToken(token)
}

/**
 * Returns the real SuperAdmin session even during impersonation.
 * When a SUPER_ADMIN impersonates a pharmacy, the main token is replaced
 * with an ADMIN token. This function checks the original token first so
 * superadmin-only API routes remain accessible throughout impersonation.
 */
export async function getSuperAdminSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const originalToken = cookieStore.get('neuropharm-original-token')?.value
  if (originalToken) {
    const originalSession = verifyToken(originalToken)
    if (originalSession?.role === 'SUPER_ADMIN') return originalSession
  }
  return getSession()
}

export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}

export async function requireRole(roles: string[]): Promise<SessionUser> {
  const session = await requireAuth()
  if (!roles.includes(session.role)) redirect('/dashboard')
  return session
}

export async function createAuditLog(params: {
  pharmacyId: string
  userId?: string
  action: string
  entity: string
  entityId?: string
  details?: string
  isSuspicious?: boolean
}) {
  await prisma.auditLog.create({ data: params })
}
