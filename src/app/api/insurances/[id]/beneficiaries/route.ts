import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'

const VALID_RELATIONSHIPS = ['HOLDER', 'SPOUSE', 'CHILD', 'PARENT', 'OTHER']

// POST /api/insurances/[id]/beneficiaries — add a beneficiary (holder or dependent)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }
    const { id: insuranceId } = await params

    const insurance = await prisma.insurance.findFirst({
      where: { id: insuranceId, pharmacyId: session.pharmacyId, isActive: true },
    })
    if (!insurance) {
      return NextResponse.json({ error: 'Institution introuvable' }, { status: 404 })
    }

    const body = await request.json()
    const fullName = (body.fullName || '').trim()
    const membershipNumber = (body.membershipNumber || '').trim() || null
    const phone = (body.phone || '').trim() || null
    const notes = (body.notes || '').trim() || null
    const relationship = VALID_RELATIONSHIPS.includes(body.relationship)
      ? body.relationship
      : 'HOLDER'
    const holderId = body.holderId ? String(body.holderId) : null
    const birthDateRaw = body.birthDate ? String(body.birthDate) : null
    const birthDate = birthDateRaw ? new Date(birthDateRaw) : null

    if (!fullName) {
      return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
    }
    if (birthDate && Number.isNaN(birthDate.getTime())) {
      return NextResponse.json({ error: 'Date de naissance invalide' }, { status: 400 })
    }

    // Holder validation: dependents must point to a real holder of the same institution.
    if (relationship !== 'HOLDER') {
      if (!holderId) {
        return NextResponse.json(
          { error: 'Sélectionnez le titulaire associé à cet ayant droit' },
          { status: 400 }
        )
      }
      const holder = await prisma.insuranceBeneficiary.findFirst({
        where: {
          id: holderId,
          insuranceId,
          pharmacyId: session.pharmacyId,
          relationship: 'HOLDER',
          isActive: true,
        },
      })
      if (!holder) {
        return NextResponse.json({ error: 'Titulaire introuvable' }, { status: 404 })
      }
    }

    if (membershipNumber) {
      const duplicate = await prisma.insuranceBeneficiary.findFirst({
        where: { insuranceId, membershipNumber },
      })
      if (duplicate) {
        return NextResponse.json(
          { error: 'Ce numéro d\'affilié est déjà utilisé' },
          { status: 409 }
        )
      }
    }

    const beneficiary = await prisma.insuranceBeneficiary.create({
      data: {
        pharmacyId: session.pharmacyId,
        insuranceId,
        fullName,
        membershipNumber,
        phone,
        birthDate,
        relationship,
        holderId: relationship === 'HOLDER' ? null : holderId,
        notes,
      },
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'CREATE',
      entity: 'insurance_beneficiary',
      entityId: beneficiary.id,
      details: JSON.stringify({ insuranceId, fullName, relationship }),
    })

    return NextResponse.json({ beneficiary }, { status: 201 })
  } catch (error) {
    console.error('Error creating beneficiary:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
