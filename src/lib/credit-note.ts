// Helpers partagés pour le module Avoirs (CreditNote).
//
// Le numéro d'avoir est, comme pour les reçus de vente, les 8 derniers
// caractères du cuid mis en majuscules. C'est ce numéro qu'on imprime sur le
// bon et que le client peut présenter pour réutiliser l'avoir au POS.

export const CREDIT_NOTE_REASONS = [
  'RETURN',
  'BILLING_ERROR',
  'CANCELLATION',
  'PARTIAL_PRESCRIPTION',
  'OTHER',
] as const

export type CreditNoteReason = (typeof CREDIT_NOTE_REASONS)[number]

export const CREDIT_NOTE_REASON_LABELS_FR: Record<CreditNoteReason, string> = {
  RETURN: 'Retour produit',
  BILLING_ERROR: 'Erreur de facturation',
  CANCELLATION: 'Annulation de vente',
  PARTIAL_PRESCRIPTION: 'Ordonnance partielle',
  OTHER: 'Autre',
}

export const CREDIT_NOTE_STATUSES = [
  'active',
  'partially_used',
  'used',
  'expired',
  'cancelled',
] as const

export type CreditNoteStatus = (typeof CREDIT_NOTE_STATUSES)[number]

export const CREDIT_NOTE_STATUS_LABELS_FR: Record<CreditNoteStatus, string> = {
  active: 'Actif',
  partially_used: 'Partiellement utilisé',
  used: 'Soldé',
  expired: 'Expiré',
  cancelled: 'Annulé',
}

export const formatCreditNoteNumber = (id: string) => id.slice(-8).toUpperCase()

// Calcule le statut effectif d'un avoir à partir de son montant restant et de
// son éventuelle date d'expiration. Le statut "cancelled" prime sur tout le
// reste : on ne le recalcule jamais ici (il est défini explicitement à
// l'annulation et l'avoir devient inutilisable).
export function deriveCreditNoteStatus(args: {
  amount: number
  usedAmount: number
  expiresAt: Date | string | null
  status: string
  now?: Date
}): CreditNoteStatus {
  if (args.status === 'cancelled') return 'cancelled'
  const now = args.now || new Date()
  const remaining = args.amount - args.usedAmount
  if (remaining <= 0.009) return 'used'
  if (args.expiresAt) {
    const exp = args.expiresAt instanceof Date ? args.expiresAt : new Date(args.expiresAt)
    if (exp.getTime() < now.getTime()) return 'expired'
  }
  if (args.usedAmount > 0.009) return 'partially_used'
  return 'active'
}
