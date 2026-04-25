export interface ReceiptItem {
  name: string
  quantity: number
  unitPrice: number
  total: number
}

export interface ReceiptPharmacy {
  name: string
  address: string | null
  city: string | null
  phone: string | null
  email: string | null
  taxId: string | null
}

export interface Receipt {
  id: string
  createdAt: string
  subtotal: number
  discount: number
  tax: number
  total: number
  paymentMethod: string
  customerName: string | null
  customerPhone: string | null
  amountPaid?: number | null
  change?: number | null
  creditNoteAmount?: number | null
  creditNoteRef?: string | null
  isPrescription: boolean
  cashier: string
  items: ReceiptItem[]
  pharmacy: ReceiptPharmacy | null
  status?: string
}

export const PAYMENT_LABELS_FR: Record<string, string> = {
  CASH: 'Espèces',
  MOBILE_MONEY: 'Mobile Money',
  CARD: 'Carte bancaire',
  INSURANCE: 'Assurance',
  CREDIT: 'Crédit',
}

export const SALE_STATUS_LABELS_FR: Record<string, string> = {
  completed: 'Terminée',
  refunded: 'Remboursée',
  cancelled: 'Annulée',
}

export const formatReceiptNumber = (id: string) => id.slice(-8).toUpperCase()

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
  }).format(n)

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export function buildReceiptHtml(r: Receipt): string {
  const date = new Date(r.createdAt)
  const dateStr = date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
  const shortRef = formatReceiptNumber(r.id)
  const pharmacy = r.pharmacy
  const headerLines: string[] = []
  if (pharmacy) {
    headerLines.push(`<div class="ph-name">${escapeHtml(pharmacy.name)}</div>`)
    const addr = [pharmacy.address, pharmacy.city].filter(Boolean).join(', ')
    if (addr) headerLines.push(`<div>${escapeHtml(addr)}</div>`)
    if (pharmacy.phone) headerLines.push(`<div>Tél : ${escapeHtml(pharmacy.phone)}</div>`)
    if (pharmacy.email) headerLines.push(`<div>${escapeHtml(pharmacy.email)}</div>`)
    if (pharmacy.taxId) headerLines.push(`<div>NINEA : ${escapeHtml(pharmacy.taxId)}</div>`)
  }

  const itemsRows = r.items
    .map(
      (i) => `
    <tr>
      <td class="left">${escapeHtml(i.name)}</td>
      <td class="center">${i.quantity}</td>
      <td class="right">${formatCurrency(i.unitPrice)}</td>
      <td class="right">${formatCurrency(i.total)}</td>
    </tr>`
    )
    .join('')

  const customerBlock =
    r.customerName || r.customerPhone
      ? `<div class="block">
        <div><strong>Client :</strong> ${escapeHtml(r.customerName || '-')}</div>
        ${r.customerPhone ? `<div><strong>Téléphone :</strong> ${escapeHtml(r.customerPhone)}</div>` : ''}
      </div>`
      : ''

  const discountRow =
    r.discount > 0 ? `<tr><td>Remise</td><td class="right">-${formatCurrency(r.discount)}</td></tr>` : ''
  const taxRow = r.tax > 0 ? `<tr><td>TVA</td><td class="right">${formatCurrency(r.tax)}</td></tr>` : ''

  // Credit note (avoir) applied to this sale — appears between the grand total
  // and the cash tender, so the customer sees how the net-due was reached.
  const creditNoteRows =
    r.creditNoteAmount && r.creditNoteAmount > 0
      ? `<tr><td>Avoir${r.creditNoteRef ? ` n° ${escapeHtml(r.creditNoteRef)}` : ''}</td><td class="right">-${formatCurrency(r.creditNoteAmount)}</td></tr>
         <tr class="change"><td>Net à payer</td><td class="right">${formatCurrency(Math.max(0, r.total - r.creditNoteAmount))}</td></tr>`
      : ''

  // Cash register block (CASH sales only, when the pharmacist recorded the tender).
  const cashRows =
    r.paymentMethod === 'CASH' && r.amountPaid != null
      ? `<tr><td>Espèces reçues</td><td class="right">${formatCurrency(r.amountPaid)}</td></tr>
         <tr class="change"><td>Monnaie rendue</td><td class="right">${formatCurrency(r.change ?? 0)}</td></tr>`
      : ''

  const statusBadge =
    r.status && r.status !== 'completed'
      ? `<div class="footer"><span class="badge badge-warn">${escapeHtml(SALE_STATUS_LABELS_FR[r.status] || r.status)}</span></div>`
      : ''

  const reprintBadge =
    r.status === 'completed'
      ? ''
      : '' // reserved for future "DUPLICATA" marker

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Reçu ${shortRef}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; color: #111; margin: 0; padding: 16px; font-size: 12px; }
  .receipt { max-width: 320px; margin: 0 auto; }
  .header { text-align: center; margin-bottom: 12px; }
  .ph-name { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
  .meta { display: flex; justify-content: space-between; font-size: 11px; margin: 8px 0; }
  .block { margin: 8px 0; padding: 8px 0; border-top: 1px dashed #999; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 4px 2px; vertical-align: top; }
  thead th { border-bottom: 1px dashed #999; font-size: 11px; text-align: left; }
  .center { text-align: center; }
  .right { text-align: right; }
  .left { text-align: left; }
  .totals { margin-top: 8px; padding-top: 8px; border-top: 1px dashed #999; }
  .totals td { padding: 2px 0; font-size: 12px; }
  .totals .grand td { font-size: 14px; font-weight: 700; padding-top: 6px; border-top: 1px solid #111; }
  .totals .change td { font-weight: 700; padding-top: 4px; }
  .footer { margin-top: 16px; text-align: center; font-size: 11px; }
  .badge { display: inline-block; margin-top: 6px; padding: 2px 8px; border: 1px solid #111; border-radius: 4px; font-size: 10px; }
  .badge-warn { border-color: #b45309; color: #b45309; }
  @media print {
    body { padding: 0; }
    @page { margin: 8mm; }
  }
</style>
</head>
<body>
  <div class="receipt">
    <div class="header">${headerLines.join('')}</div>

    <div class="meta">
      <span>Reçu n° ${shortRef}</span>
      <span>${escapeHtml(dateStr)}</span>
    </div>
    <div class="meta">
      <span>Vendeur : ${escapeHtml(r.cashier)}</span>
      <span>Paiement : ${escapeHtml(PAYMENT_LABELS_FR[r.paymentMethod] || r.paymentMethod)}</span>
    </div>

    ${customerBlock}

    <table>
      <thead>
        <tr>
          <th class="left">Article</th>
          <th class="center">Qté</th>
          <th class="right">PU</th>
          <th class="right">Total</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>

    <table class="totals">
      <tr><td>Sous-total</td><td class="right">${formatCurrency(r.subtotal)}</td></tr>
      ${discountRow}
      ${taxRow}
      <tr class="grand"><td>Total à payer</td><td class="right">${formatCurrency(r.total)}</td></tr>
      ${creditNoteRows}
      ${cashRows}
    </table>

    ${r.isPrescription ? '<div class="footer"><span class="badge">Vente sur ordonnance</span></div>' : ''}
    ${statusBadge}
    ${reprintBadge}

    <div class="footer">
      Merci de votre visite !<br/>
      Conservez ce reçu pour tout échange.
    </div>
  </div>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => { window.focus(); window.print(); }, 200);
    });
  </script>
</body>
</html>`
}

export function printReceipt(receipt: Receipt): void {
  const w = window.open('', '_blank', 'width=420,height=640')
  if (!w) return
  w.document.open()
  w.document.write(buildReceiptHtml(receipt))
  w.document.close()
}

// ============== CREDIT PAYMENT RECEIPT (Carnet) ==============

export interface PaymentReceipt {
  id: string
  createdAt: string
  amount: number
  method: string // CASH, MOBILE_MONEY, CARD
  notes: string | null
  customerName: string
  customerPhone: string | null
  previousBalance: number
  newBalance: number
  cashier: string
  pharmacy: ReceiptPharmacy | null
}

export function buildPaymentReceiptHtml(r: PaymentReceipt): string {
  const date = new Date(r.createdAt)
  const dateStr = date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
  const shortRef = formatReceiptNumber(r.id)
  const pharmacy = r.pharmacy

  const headerLines: string[] = []
  if (pharmacy) {
    headerLines.push(`<div class="ph-name">${escapeHtml(pharmacy.name)}</div>`)
    const addr = [pharmacy.address, pharmacy.city].filter(Boolean).join(', ')
    if (addr) headerLines.push(`<div>${escapeHtml(addr)}</div>`)
    if (pharmacy.phone) headerLines.push(`<div>Tél : ${escapeHtml(pharmacy.phone)}</div>`)
    if (pharmacy.taxId) headerLines.push(`<div>NINEA : ${escapeHtml(pharmacy.taxId)}</div>`)
  }

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Reçu paiement ${shortRef}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; color: #111; margin: 0; padding: 16px; font-size: 12px; }
  .receipt { max-width: 320px; margin: 0 auto; }
  .header { text-align: center; margin-bottom: 12px; }
  .ph-name { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
  .title { text-align: center; font-size: 13px; font-weight: 700; padding: 6px 0; border-top: 1px dashed #999; border-bottom: 1px dashed #999; margin: 8px 0; letter-spacing: 0.05em; text-transform: uppercase; }
  .meta { display: flex; justify-content: space-between; font-size: 11px; margin: 6px 0; }
  .block { margin: 8px 0; padding: 8px 0; border-top: 1px dashed #999; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  td { padding: 3px 0; font-size: 12px; }
  .right { text-align: right; }
  .amount { font-size: 18px; font-weight: 700; text-align: center; padding: 10px 0; margin: 10px 0; border: 2px solid #059669; color: #059669; border-radius: 6px; }
  .grand td { font-size: 14px; font-weight: 700; padding-top: 6px; border-top: 1px solid #111; }
  .footer { margin-top: 16px; text-align: center; font-size: 11px; }
  .badge { display: inline-block; margin-top: 6px; padding: 2px 8px; border: 1px solid #059669; color: #059669; border-radius: 4px; font-size: 10px; }
  @media print { body { padding: 0; } @page { margin: 8mm; } }
</style>
</head>
<body>
  <div class="receipt">
    <div class="header">${headerLines.join('')}</div>
    <div class="title">Reçu de paiement carnet</div>

    <div class="meta">
      <span>Reçu n° ${shortRef}</span>
      <span>${escapeHtml(dateStr)}</span>
    </div>
    <div class="meta">
      <span>Encaissé par : ${escapeHtml(r.cashier || '—')}</span>
      <span>Mode : ${escapeHtml(PAYMENT_LABELS_FR[r.method] || r.method)}</span>
    </div>

    <div class="block">
      <div><strong>Client :</strong> ${escapeHtml(r.customerName)}</div>
      ${r.customerPhone ? `<div><strong>Téléphone :</strong> ${escapeHtml(r.customerPhone)}</div>` : ''}
    </div>

    <div class="amount">Paiement reçu : ${formatCurrency(r.amount)}</div>

    <table>
      <tr><td>Solde avant paiement</td><td class="right">${formatCurrency(r.previousBalance)}</td></tr>
      <tr><td>Versement</td><td class="right">-${formatCurrency(r.amount)}</td></tr>
      <tr class="grand"><td>Solde restant dû</td><td class="right">${formatCurrency(r.newBalance)}</td></tr>
    </table>

    ${r.notes ? `<div class="block"><strong>Note :</strong> ${escapeHtml(r.notes)}</div>` : ''}
    ${r.newBalance <= 0.009 ? '<div class="footer"><span class="badge">Carnet soldé</span></div>' : ''}

    <div class="footer">
      Merci pour votre paiement !<br/>
      Conservez ce reçu.
    </div>
  </div>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => { window.focus(); window.print(); }, 200);
    });
  </script>
</body>
</html>`
}

export function printPaymentReceipt(receipt: PaymentReceipt): void {
  const w = window.open('', '_blank', 'width=420,height=640')
  if (!w) return
  w.document.open()
  w.document.write(buildPaymentReceiptHtml(receipt))
  w.document.close()
}

// ============== CREDIT NOTE RECEIPT (Avoir) ==============

const REASON_LABELS_FR: Record<string, string> = {
  RETURN: 'Retour produit',
  BILLING_ERROR: 'Erreur de facturation',
  CANCELLATION: 'Annulation de vente',
  PARTIAL_PRESCRIPTION: 'Ordonnance partielle',
  OTHER: 'Autre',
}

export interface CreditNoteReceipt {
  id: string
  createdAt: string
  amount: number
  usedAmount: number
  remaining: number
  reason: string
  customerName: string | null
  customerPhone: string | null
  notes: string | null
  expiresAt: string | null
  originSaleRef: string | null
  issuedBy: string | null
  pharmacy: ReceiptPharmacy | null
}

export function buildCreditNoteReceiptHtml(r: CreditNoteReceipt): string {
  const date = new Date(r.createdAt)
  const dateStr = date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
  const shortRef = formatReceiptNumber(r.id)
  const pharmacy = r.pharmacy
  const expStr = r.expiresAt
    ? new Date(r.expiresAt).toLocaleDateString('fr-FR', { dateStyle: 'medium' })
    : null

  const headerLines: string[] = []
  if (pharmacy) {
    headerLines.push(`<div class="ph-name">${escapeHtml(pharmacy.name)}</div>`)
    const addr = [pharmacy.address, pharmacy.city].filter(Boolean).join(', ')
    if (addr) headerLines.push(`<div>${escapeHtml(addr)}</div>`)
    if (pharmacy.phone) headerLines.push(`<div>Tél : ${escapeHtml(pharmacy.phone)}</div>`)
    if (pharmacy.taxId) headerLines.push(`<div>NINEA : ${escapeHtml(pharmacy.taxId)}</div>`)
  }

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Avoir ${shortRef}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; color: #111; margin: 0; padding: 16px; font-size: 12px; }
  .receipt { max-width: 320px; margin: 0 auto; }
  .header { text-align: center; margin-bottom: 12px; }
  .ph-name { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
  .title { text-align: center; font-size: 13px; font-weight: 700; padding: 6px 0; border-top: 1px dashed #999; border-bottom: 1px dashed #999; margin: 8px 0; letter-spacing: 0.05em; text-transform: uppercase; color: #6d28d9; }
  .meta { display: flex; justify-content: space-between; font-size: 11px; margin: 6px 0; }
  .block { margin: 8px 0; padding: 8px 0; border-top: 1px dashed #999; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  td { padding: 3px 0; font-size: 12px; }
  .right { text-align: right; }
  .amount { font-size: 20px; font-weight: 700; text-align: center; padding: 12px 0; margin: 10px 0; border: 2px solid #6d28d9; color: #6d28d9; border-radius: 6px; }
  .grand td { font-size: 14px; font-weight: 700; padding-top: 6px; border-top: 1px solid #111; }
  .footer { margin-top: 16px; text-align: center; font-size: 11px; }
  .badge { display: inline-block; margin-top: 6px; padding: 2px 8px; border: 1px solid #6d28d9; color: #6d28d9; border-radius: 4px; font-size: 10px; }
  .terms { font-size: 10px; color: #666; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #999; }
  @media print { body { padding: 0; } @page { margin: 8mm; } }
</style>
</head>
<body>
  <div class="receipt">
    <div class="header">${headerLines.join('')}</div>
    <div class="title">Bon d'avoir</div>

    <div class="meta">
      <span>Avoir n° ${shortRef}</span>
      <span>${escapeHtml(dateStr)}</span>
    </div>
    <div class="meta">
      <span>Émis par : ${escapeHtml(r.issuedBy || '—')}</span>
      <span>Motif : ${escapeHtml(REASON_LABELS_FR[r.reason] || r.reason)}</span>
    </div>

    ${
      r.customerName || r.customerPhone
        ? `<div class="block">
            <div><strong>Client :</strong> ${escapeHtml(r.customerName || '—')}</div>
            ${r.customerPhone ? `<div><strong>Téléphone :</strong> ${escapeHtml(r.customerPhone)}</div>` : ''}
          </div>`
        : ''
    }

    <div class="amount">${formatCurrency(r.amount)}</div>

    <table>
      <tr><td>Montant initial</td><td class="right">${formatCurrency(r.amount)}</td></tr>
      ${
        r.usedAmount > 0
          ? `<tr><td>Déjà utilisé</td><td class="right">-${formatCurrency(r.usedAmount)}</td></tr>`
          : ''
      }
      <tr class="grand"><td>Solde disponible</td><td class="right">${formatCurrency(r.remaining)}</td></tr>
    </table>

    ${
      r.originSaleRef
        ? `<div class="block"><strong>Vente d'origine :</strong> ${escapeHtml(r.originSaleRef)}</div>`
        : ''
    }
    ${expStr ? `<div class="block"><strong>Valable jusqu'au :</strong> ${escapeHtml(expStr)}</div>` : ''}
    ${r.notes ? `<div class="block"><strong>Note :</strong> ${escapeHtml(r.notes)}</div>` : ''}

    <div class="footer">
      <span class="badge">Bon réutilisable en pharmacie</span>
      <div class="terms">
        Présentez ce bon lors d'un prochain achat pour déduction.<br/>
        Non remboursable en espèces.
      </div>
    </div>
  </div>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => { window.focus(); window.print(); }, 200);
    });
  </script>
</body>
</html>`
}

export function printCreditNoteReceipt(receipt: CreditNoteReceipt): void {
  const w = window.open('', '_blank', 'width=420,height=640')
  if (!w) return
  w.document.open()
  w.document.write(buildCreditNoteReceiptHtml(receipt))
  w.document.close()
}
