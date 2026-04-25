import type { ReceiptPharmacy } from './receipt'

export interface ProformaItem {
  name: string
  reference?: string | null
  quantity: number
  unitPrice: number
  total: number
}

export interface Proforma {
  id: string
  createdAt: string
  subtotal: number
  discount: number
  discountRate: number
  total: number
  customerName: string | null
  customerPhone: string | null
  validityDays: number
  notes: string | null
  status: string
  author: string
  items: ProformaItem[]
  pharmacy: ReceiptPharmacy | null
}

export const PROFORMA_STATUS_LABELS_FR: Record<string, string> = {
  active: 'Actif',
  converted: 'Converti en vente',
  cancelled: 'Annulé',
}

// Numéro de devis : préfixe PF- + 8 derniers caractères de l'id, en majuscules.
// Distinct des reçus de vente pour éviter toute confusion visuelle.
export const formatProformaNumber = (id: string) => `PF-${id.slice(-8).toUpperCase()}`

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

export function buildProformaHtml(p: Proforma): string {
  const date = new Date(p.createdAt)
  const dateStr = date.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
  const ref = formatProformaNumber(p.id)
  const pharmacy = p.pharmacy

  const validityLabel =
    p.validityDays > 0
      ? (() => {
          const until = new Date(date.getTime() + p.validityDays * 24 * 60 * 60 * 1000)
          return `Validité : ${p.validityDays} jour${p.validityDays > 1 ? 's' : ''} (jusqu'au ${until.toLocaleDateString('fr-FR')})`
        })()
      : 'Validité : illimitée'

  const headerLines: string[] = []
  if (pharmacy) {
    headerLines.push(`<div class="ph-name">${escapeHtml(pharmacy.name)}</div>`)
    const addr = [pharmacy.address, pharmacy.city].filter(Boolean).join(', ')
    if (addr) headerLines.push(`<div>${escapeHtml(addr)}</div>`)
    if (pharmacy.phone) headerLines.push(`<div>Tél : ${escapeHtml(pharmacy.phone)}</div>`)
    if (pharmacy.email) headerLines.push(`<div>${escapeHtml(pharmacy.email)}</div>`)
    if (pharmacy.taxId) headerLines.push(`<div>NINEA : ${escapeHtml(pharmacy.taxId)}</div>`)
  }

  const itemsRows = p.items
    .map(
      (i, idx) => `
    <tr>
      <td class="center">${idx + 1}</td>
      <td class="left">
        <div class="item-name">${escapeHtml(i.name)}</div>
        ${i.reference ? `<div class="item-ref">Réf. ${escapeHtml(i.reference)}</div>` : ''}
      </td>
      <td class="center">${i.quantity}</td>
      <td class="right">${formatCurrency(i.unitPrice)}</td>
      <td class="right">${formatCurrency(i.total)}</td>
    </tr>`
    )
    .join('')

  const customerBlock =
    p.customerName || p.customerPhone
      ? `<div class="card">
          <div class="card-title">Destinataire</div>
          ${p.customerName ? `<div><strong>${escapeHtml(p.customerName)}</strong></div>` : ''}
          ${p.customerPhone ? `<div>Tél : ${escapeHtml(p.customerPhone)}</div>` : ''}
        </div>`
      : ''

  const discountRow =
    p.discount > 0
      ? `<tr><td>Remise (${p.discountRate}%)</td><td class="right">-${formatCurrency(p.discount)}</td></tr>`
      : ''

  const notesBlock = p.notes
    ? `<div class="notes"><strong>Notes :</strong><br/>${escapeHtml(p.notes).replace(/\n/g, '<br/>')}</div>`
    : ''

  const statusBanner =
    p.status === 'converted'
      ? `<div class="status-banner status-converted">Ce devis a été converti en vente.</div>`
      : p.status === 'cancelled'
        ? `<div class="status-banner status-cancelled">Ce devis a été annulé.</div>`
        : ''

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Pro forma ${ref}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica', 'Arial', sans-serif;
    color: #1f2937;
    margin: 0;
    padding: 24px;
    font-size: 12px;
    background: #fff;
    position: relative;
  }
  .doc { max-width: 720px; margin: 0 auto; position: relative; }
  /* Filigrane PRO FORMA diagonal — rend visuellement non-confondable avec une vraie facture */
  .watermark {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-30deg);
    font-size: 140px;
    font-weight: 900;
    color: rgba(99, 102, 241, 0.08);
    letter-spacing: 0.1em;
    white-space: nowrap;
    pointer-events: none;
    z-index: 0;
    user-select: none;
  }
  .content { position: relative; z-index: 1; }
  .legal-banner {
    background: #eef2ff;
    border: 2px dashed #6366f1;
    color: #3730a3;
    padding: 10px 14px;
    border-radius: 8px;
    text-align: center;
    font-weight: 600;
    margin-bottom: 18px;
    font-size: 11px;
    letter-spacing: 0.03em;
  }
  .header-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 20px; }
  .header-left { flex: 1; }
  .ph-name { font-size: 18px; font-weight: 800; color: #111827; margin-bottom: 4px; }
  .header-left div { font-size: 11px; color: #4b5563; line-height: 1.5; }
  .header-right { text-align: right; min-width: 240px; }
  .doc-type {
    background: #4f46e5;
    color: #fff;
    padding: 6px 14px;
    border-radius: 6px;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.05em;
    display: inline-block;
    margin-bottom: 6px;
  }
  .ref { font-size: 13px; font-weight: 700; color: #111827; }
  .meta-line { font-size: 11px; color: #4b5563; margin-top: 2px; }
  .card {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 16px;
  }
  .card-title { font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.items thead th {
    background: #f3f4f6;
    color: #374151;
    padding: 10px 8px;
    text-align: left;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 2px solid #d1d5db;
  }
  table.items tbody td {
    padding: 9px 8px;
    border-bottom: 1px solid #e5e7eb;
    vertical-align: top;
  }
  .center { text-align: center; }
  .right { text-align: right; }
  .left { text-align: left; }
  .item-name { font-weight: 600; color: #111827; }
  .item-ref { font-size: 10px; color: #6b7280; margin-top: 1px; }
  table.totals { width: 320px; margin-left: auto; margin-top: 14px; border-collapse: collapse; }
  table.totals td { padding: 6px 4px; font-size: 12px; }
  table.totals td.right { text-align: right; }
  table.totals .grand td {
    font-size: 15px;
    font-weight: 800;
    color: #111827;
    padding-top: 10px;
    border-top: 2px solid #111827;
  }
  .notes {
    margin-top: 20px;
    padding: 12px;
    background: #fffbeb;
    border-left: 4px solid #f59e0b;
    border-radius: 4px;
    font-size: 11px;
    color: #78350f;
  }
  .validity {
    margin-top: 20px;
    text-align: center;
    font-size: 11px;
    color: #4f46e5;
    font-weight: 600;
    padding: 8px;
    background: #eef2ff;
    border-radius: 4px;
  }
  .footer {
    margin-top: 32px;
    text-align: center;
    font-size: 10px;
    color: #6b7280;
    border-top: 1px solid #e5e7eb;
    padding-top: 12px;
    line-height: 1.6;
  }
  .status-banner {
    margin-bottom: 16px;
    padding: 10px;
    border-radius: 6px;
    text-align: center;
    font-weight: 700;
    font-size: 12px;
  }
  .status-converted { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
  .status-cancelled { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
  @media print {
    body { padding: 12mm; }
    @page { margin: 0; size: A4; }
  }
</style>
</head>
<body>
  <div class="watermark">PRO FORMA</div>
  <div class="doc">
    <div class="content">
      <div class="legal-banner">
        DOCUMENT D'ESTIMATION — SANS VALEUR COMPTABLE NI LÉGALE DE FACTURATION
      </div>

      ${statusBanner}

      <div class="header-row">
        <div class="header-left">${headerLines.join('')}</div>
        <div class="header-right">
          <span class="doc-type">DEVIS PRO FORMA</span>
          <div class="ref">N° ${ref}</div>
          <div class="meta-line">Émis le ${escapeHtml(dateStr)}</div>
          <div class="meta-line">Établi par ${escapeHtml(p.author)}</div>
        </div>
      </div>

      ${customerBlock}

      <table class="items">
        <thead>
          <tr>
            <th class="center" style="width:36px;">#</th>
            <th class="left">Désignation</th>
            <th class="center" style="width:60px;">Qté</th>
            <th class="right" style="width:110px;">Prix unitaire</th>
            <th class="right" style="width:120px;">Total</th>
          </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
      </table>

      <table class="totals">
        <tr><td>Sous-total</td><td class="right">${formatCurrency(p.subtotal)}</td></tr>
        ${discountRow}
        <tr class="grand"><td>Total estimatif</td><td class="right">${formatCurrency(p.total)}</td></tr>
      </table>

      <div class="validity">${escapeHtml(validityLabel)}</div>

      ${notesBlock}

      <div class="footer">
        Ce document est un <strong>devis pro forma</strong> à titre indicatif.<br/>
        Les prix et disponibilités peuvent évoluer. Seule une facture officielle fait foi.<br/>
        Pour confirmer la commande, présentez ce devis au comptoir avant la date d'expiration.
      </div>
    </div>
  </div>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => { window.focus(); window.print(); }, 250);
    });
  </script>
</body>
</html>`
}

export function printProforma(proforma: Proforma): void {
  const w = window.open('', '_blank', 'width=820,height=900')
  if (!w) return
  w.document.open()
  w.document.write(buildProformaHtml(proforma))
  w.document.close()
}
