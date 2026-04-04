import { prisma } from './prisma'

export async function createSystemLog(params: {
  level?: string
  action: string
  userId?: string
  userEmail?: string
  targetId?: string
  targetType?: string
  details?: string
  ipAddress?: string
}) {
  try {
    await prisma.systemLog.create({
      data: {
        level: params.level || 'info',
        action: params.action,
        userId: params.userId || null,
        userEmail: params.userEmail || null,
        targetId: params.targetId || null,
        targetType: params.targetType || null,
        details: params.details || null,
        ipAddress: params.ipAddress || null,
      },
    })
  } catch (error) {
    console.error('Failed to create system log:', error)
  }
}
