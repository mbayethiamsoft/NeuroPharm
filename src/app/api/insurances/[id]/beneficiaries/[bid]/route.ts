import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'

const VALID_RELATIONSHIPS = ['HOLDER', 'SPOUSE', 'CHILD', 'PARENT', 'OTHER']

// PUT /api/insurances/[id]/beneficiaries/[bid] — update beneficiary
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; bid: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }
    const { id: insuranceId, bid } = await params

    const existing = await prisma.insuranceBeneficiary.findFirst({
      where: { id: bid, insuranceId, pharmacyId: session.pharmacyId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Bénéficiaire introuvable' }, { status: 404 })
    }

    const body = await request.json()
    const fullName = body.fullName !== undefined ? String(body.fullName).trim() : existing.fullName
    const membershipNumber =
      body.membershipNumber !== undefined
        ? String(body.membershipNumber).trim() || null
        : existing.membershipNumber
    const phone = body.phone !== undefined ? String(body.phone).trim() || null : existing.phone
    const notes = body.notes !== undefined ? String(body.notes).trim() || null : existing.notes
    const relationship =
      body.relationship !== undefined && VALID_RELATIONSHIPS.includes(body.relationship)
        ? body.relationship
        : existing.relationship
    const holderId =
      body.holderId !== undefined ? (body.holderId ? String(body.holderId) : null) : existing.holderId
    const birthDateRaw = body.birthDate !== undefined ? body.birthDate : undefined
    let birthDate: Date | null | undefined = undefined
    if (birthDateRaw !== undefined) {
      birthDate = birthDateRaw ? new Date(String(birthDateRaw)) : null
      if (birthDate && Number.isNaN(birthDate.getTime())) {
        return NextResponse.json({ error: 'Date de naissance invalide' }, { status: 400 })
      }
    }

    if (!fullName) {
      return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
    }

    // Holder consistency for dependents
    let finalHolderId = holderId
    if (relationship === 'HOLDER') {
      finalHolderId = null
    } else {
      if (!finalHolderId) {
        return NextResponse.json(
          { error: 'Sélectionnez le titulaire associé à cet ayant droit' },
          { status: 400 }
        )
      }
      if (finalHolderId === existing.id) {
        return NextResponse.json(
          { error: 'Un bénéficiaire ne peut pas être son propre titulaire' },
          { status: 400 }
        )
      }
      const holder = await prisma.insuranceBeneficiary.findFirst({
        where: {
          id: finalHolderId,
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

    if (membershipNumber && membershipNumber !== existing.membershipNumber) {
      const duplicate = await prisma.insuranceBeneficiary.findFirst({
        where: { insuranceId, membershipNumber, NOT: { id: bid } },
      })
      if (duplicate) {
        return NextResponse.json(
          { error: 'Ce numéro d\'affilié est déjà utilisé' },
          { status: 409 }
        )
      }
    }

    // If a holder is being demoted to a dependent, ensure no one still depends on them.
    if (existing.relationship === 'HOLDER' && relationship !== 'HOLDER') {
      const dependents = await prisma.insuranceBeneficiary.count({
        where: { holderId: bid, isActive: true },
      })
      if (dependents > 0) {
        return NextResponse.json(
          {
            error:
              'Ce titulaire a encore des ayants droits actifs. Réaffectez-les ou désactivez-les avant.',
          },
          { status: 400 }
        )
      }
    }

    const updateData: Record<string, unknown> = {
      fullName,
      membershipNumber,
      phone,
      notes,
      relationship,
      holderId: finalHolderId,
    }
    if (birthDate !== undefined) updateData.birthDate = birthDate

    const beneficiary = await prisma.insuranceBeneficiary.update({
      where: { id: bid },
      data: updateData,
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'UPDATE',
      entity: 'insurance_beneficiary',
      entityId: bid,
      details: JSON.stringify({ fullName, relationship }),
    })

    return NextResponse.json({ beneficiary })
  } catch (error) {
    console.error('Error updating beneficiary:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// DELETE /api/insurances/[id]/beneficiaries/[bid] — soft delete (isActive=false)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; bid: string }> }
) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }
    const { id: insuranceId, bid } = await params

    const existing = await prisma.insuranceBeneficiary.findFirst({
      where: { id: bid, insuranceId, pharmacyId: session.pharmacyId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Bénéficiaire introuvable' }, { status: 404 })
    }

    // Block deactivation of a holder while it still has active dependents.
    if (existing.relationship === 'HOLDER') {
      const dependents = await prisma.insuranceBeneficiary.count({
        where: { holderId: bid, isActive: true },
      })
      if (dependents > 0) {
        return NextResponse.json(
          {
            error:
              'Ce titulaire a encore des ayants droits actifs. Désactivez-les ou réaffectez-les avant.',
          },
          { status: 400 }
        )
      }
    }

    await prisma.insuranceBeneficiary.update({
      where: { id: bid },
      data: { isActive: false },
    })

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'DELETE',
      entity: 'insurance_beneficiary',
      entityId: bid,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting beneficiary:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
