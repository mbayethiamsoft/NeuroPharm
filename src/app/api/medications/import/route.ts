import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, createAuditLog } from '@/lib/auth'

function parseNumber(value: string | undefined): number {
  if (!value) return 0
  const cleaned = value.replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

function parseIntSafe(value: string | undefined): number {
  if (!value) return 0
  const n = parseInt(value.replace(/\s/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

function parseCSVLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === sep && !inQuotes) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

function normalizeHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

type ImportError = { line: number; message: string }

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || !session.pharmacyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }
    if (session.role !== 'ADMIN' && session.role !== 'PHARMACIST') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 })
    }

    let text = await file.text()
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

    const rawLines = text.split(/\r?\n/)
    // Skip optional Excel "sep=" hint line
    let startIdx = 0
    if (rawLines[0]?.toLowerCase().startsWith('sep=')) startIdx = 1

    const lines = rawLines.slice(startIdx).filter((l) => l.trim().length > 0)
    if (lines.length < 2) {
      return NextResponse.json({ error: 'Fichier vide ou sans données' }, { status: 400 })
    }

    // Auto-detect separator on header (; is expected, fallback to ,)
    const sep = (lines[0].match(/;/g)?.length || 0) >= (lines[0].match(/,/g)?.length || 0) ? ';' : ','

    const header = parseCSVLine(lines[0], sep).map(normalizeHeader)
    const findIdx = (...keys: string[]) => {
      for (const k of keys) {
        const i = header.indexOf(normalizeHeader(k))
        if (i !== -1) return i
      }
      return -1
    }

    const iFacture = findIdx('Numero Facture')
    const iCip = findIdx('Code Cip')
    const iCipAlt = findIdx('Code CIP Alternatif')
    const iCodeInterne = findIdx('Code Interne')
    const iDesc = findIdx('Description')
    const iLabo = findIdx('Laboratoire')
    const iQteLivree = findIdx('Quantitee livree', 'Quantite livree')
    const iUniteGratuite = findIdx('Unite Gratuite')
    const iPuHT = findIdx('Prix de Cession Hors Taxe', 'Prix Cession HT')
    const iPrixPublic = findIdx('Prix public')
    const iPrixTTC = findIdx('Prix TTC')

    if (iDesc === -1 || (iCip === -1 && iCipAlt === -1 && iCodeInterne === -1)) {
      return NextResponse.json(
        { error: 'En-tête invalide : colonnes "Description" et "Code Cip" (ou "Code Interne") requises' },
        { status: 400 }
      )
    }

    let created = 0
    let updated = 0
    let skipped = 0
    const errors: ImportError[] = []

    for (let i = 1; i < lines.length; i++) {
      try {
        const row = parseCSVLine(lines[i], sep)
        const name = (row[iDesc] || '').trim()
        if (!name) {
          skipped++
          continue
        }

        const cip = iCip >= 0 ? (row[iCip] || '').trim() : ''
        const cipAlt = iCipAlt >= 0 ? (row[iCipAlt] || '').trim() : ''
        const codeInterne = iCodeInterne >= 0 ? (row[iCodeInterne] || '').trim() : ''
        const barcode = cip || cipAlt || codeInterne || null

        const qteLivree = iQteLivree >= 0 ? parseIntSafe(row[iQteLivree]) : 0
        const gratuite = iUniteGratuite >= 0 ? parseIntSafe(row[iUniteGratuite]) : 0
        const totalQty = qteLivree + gratuite

        const prixPublic = iPrixPublic >= 0 ? parseNumber(row[iPrixPublic]) : 0
        const prixTTC = iPrixTTC >= 0 ? parseNumber(row[iPrixTTC]) : 0
        const prixHT = iPuHT >= 0 ? parseNumber(row[iPuHT]) : 0

        const labo = iLabo >= 0 ? (row[iLabo] || '').trim() : ''
        const facture = iFacture >= 0 ? (row[iFacture] || '').trim() : ''

        const purchasePrice = prixTTC || prixHT
        const sellingPrice = prixPublic || purchasePrice

        const existing = barcode
          ? await prisma.medication.findFirst({
              where: { pharmacyId: session.pharmacyId, barcode, isActive: true },
            })
          : await prisma.medication.findFirst({
              where: { pharmacyId: session.pharmacyId, name, isActive: true },
            })

        if (existing) {
          if (totalQty > 0) {
            await prisma.medication.update({
              where: { id: existing.id },
              data: { quantity: existing.quantity + totalQty },
            })
            await prisma.stockMovement.create({
              data: {
                medicationId: existing.id,
                pharmacyId: session.pharmacyId,
                type: 'IN',
                quantity: totalQty,
                location: 'warehouse',
                reason: `Import fournisseur${facture ? ` — facture ${facture}` : ''}`,
                reference: facture || null,
                unitPrice: purchasePrice || existing.purchasePrice,
              },
            })
          }
          updated++
        } else {
          const med = await prisma.medication.create({
            data: {
              name,
              genericName: labo || null,
              barcode,
              pharmacyId: session.pharmacyId,
              purchasePrice,
              sellingPrice,
              quantity: totalQty,
              shelfQuantity: 0,
              minStock: 10,
            },
          })
          if (totalQty > 0) {
            await prisma.stockMovement.create({
              data: {
                medicationId: med.id,
                pharmacyId: session.pharmacyId,
                type: 'IN',
                quantity: totalQty,
                location: 'warehouse',
                reason: `Import fournisseur${facture ? ` — facture ${facture}` : ''}`,
                reference: facture || null,
                unitPrice: purchasePrice,
              },
            })
          }
          created++
        }
      } catch (e) {
        errors.push({
          line: i + 1,
          message: e instanceof Error ? e.message : 'Erreur inconnue',
        })
      }
    }

    await createAuditLog({
      pharmacyId: session.pharmacyId,
      userId: session.id,
      action: 'IMPORT',
      entity: 'medication',
      details: JSON.stringify({
        fileName: file.name,
        created,
        updated,
        skipped,
        errors: errors.length,
      }),
    })

    return NextResponse.json({ created, updated, skipped, errors })
  } catch (error) {
    console.error('POST /api/medications/import error:', error)
    return NextResponse.json(
      { error: "Erreur lors de l'import du fichier" },
      { status: 500 }
    )
  }
}
