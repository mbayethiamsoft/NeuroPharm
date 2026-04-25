import type { InsuranceReportResult, ClaimStatus } from './insurance-report'

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const fmtXOF = (n: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
  }).format(n)

const fmtDate = (d: Date | null) =>
  d
    ? new Date(d).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—'

const STATUS_LABELS: Record<ClaimStatus, string> = {
  pending: 'À facturer',
  billed: 'Facturée',
  paid: 'Réglée',
  rejected: 'Rejetée',
}

const TYPE_LABELS: Record<string, string> = {
  ASSURANCE: 'Assurance',
  MUTUELLE: 'Mutuelle',
  CMU: 'CMU',
  IPM: 'Institution de prévoyance maladie',
  AUTRE: 'Autre',
}

export interface InsuranceReportPharmacyHeader {
  name: string
  address: string | null
  city: string | null
  phone: string | null
  email: string | null
  taxId: string | null
}

export function buildInsuranceReportHtml(
  report: InsuranceReportResult,
  pharmacy: InsuranceReportPharmacyHeader | null,
  opts: { autoPrint?: boolean; showItems?: boolean } = {}
): string {
  const { institution, rows, totals, dateFrom, dateTo, filters } = report
  const showItems = opts.showItems !== false

  const periodStr =
    dateFrom || dateTo ? `Du ${fmtDate(dateFrom)} au ${fmtDate(dateTo)}` : 'Toutes périodes'

  const pharmacyHeader = pharmacy
    ? `<div class="ph-header">
        <h1>${escapeHtml(pharmacy.name)}</h1>
        ${[pharmacy.address, pharmacy.city]
          .filter(Boolean)
          .map((v) => `<p>${escapeHtml(v!)}</p>`)
          .join('')}
        ${pharmacy.phone ? `<p>Tél : ${escapeHtml(pharmacy.phone)}</p>` : ''}
        ${pharmacy.email ? `<p>${escapeHtml(pharmacy.email)}</p>` : ''}
        ${pharmacy.taxId ? `<p>NINEA : ${escapeHtml(pharmacy.taxId)}</p>` : ''}
      </div>`
    : ''

  const institutionBlock = institution
    ? `<div class="institution">
        <div>
          <strong>Institution :</strong> ${escapeHtml(institution.name)}
          <span class="muted"> · ${escapeHtml(TYPE_LABELS[institution.type] || institution.type)}</span>
        </div>
        ${institution.code ? `<div><strong>Code / convention :</strong> ${escapeHtml(institution.code)}</div>` : ''}
        ${institution.contactName ? `<div><strong>Contact :</strong> ${escapeHtml(institution.contactName)}</div>` : ''}
        ${institution.email ? `<div><strong>E-mail :</strong> ${escapeHtml(institution.email)}</div>` : ''}
        ${institution.phone ? `<div><strong>Téléphone :</strong> ${escapeHtml(institution.phone)}</div>` : ''}
        ${institution.address ? `<div><strong>Adresse :</strong> ${escapeHtml(institution.address)}</div>` : ''}
        <div><strong>Taux conventionnel :</strong> ${institution.coverageRate}%</div>
      </div>`
    : ''

  const generatedAt = new Date().toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const filterChips: string[] = []
  if (filters.status) filterChips.push(`Statut : ${STATUS_LABELS[filters.status]}`)
  if (filters.search) filterChips.push(`Recherche : "${escapeHtml(filters.search)}"`)

  const rowItemsHtml = (items: { name: string; quantity: number; unitPrice: number; total: number }[]) =>
    items
      .map(
        (it) =>
          `<div class="line-item">${it.quantity} × ${escapeHtml(it.name)} <span class="muted">(${fmtXOF(it.unitPrice)})</span></div>`
      )
      .join('')

  const tableRows = rows.length
    ? rows
        .map(
          (r) => `
      <tr class="claim-row status-${r.claimStatus}">
        <td>
          <div>${fmtDate(r.date)}</div>
          <div class="muted small">N° ${escapeHtml(r.receiptNumber)}</div>
        </td>
        <td>
          <div><strong>${escapeHtml(r.beneficiaryName || '—')}</strong></div>
          ${r.beneficiaryNumber ? `<div class="muted small">N° ${escapeHtml(r.beneficiaryNumber)}</div>` : ''}
          ${r.holderName ? `<div class="muted small">Ayant droit · titulaire : ${escapeHtml(r.holderName)}</div>` : ''}
          ${r.claimRef ? `<div class="muted small">Bon : ${escapeHtml(r.claimRef)}</div>` : ''}
        </td>
        ${showItems ? `<td><div class="items-block">${rowItemsHtml(r.items) || '—'}</div></td>` : ''}
        <td class="right">${fmtXOF(r.saleTotal)}</td>
        <td class="right"><strong>${fmtXOF(r.insuranceAmount)}</strong>${r.coverageRate != null ? `<div class="muted small">${r.coverageRate}%</div>` : ''}</td>
        <td class="right">${fmtXOF(r.patientAmount)}</td>
        <td class="center"><span class="badge badge-${r.claimStatus}">${STATUS_LABELS[r.claimStatus]}</span></td>
      </tr>`
        )
        .join('')
    : `<tr><td colspan="${showItems ? 7 : 6}" class="empty">Aucune créance pour les filtres choisis</td></tr>`

  const autoPrintScript = opts.autoPrint
    ? `<script>window.addEventListener('load', () => setTimeout(() => { window.focus(); window.print(); }, 250));</script>`
    : ''

  const titleSuffix = institution ? ` — ${institution.name}` : ''

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Créances tiers payant${titleSuffix} — ${escapeHtml(pharmacy?.name || 'NeuroPharm')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica', 'Arial', sans-serif; color: #111; margin: 0; padding: 24px; font-size: 11.5px; background: #fff; }
  .page { max-width: 1180px; margin: 0 auto; }
  .ph-header { text-align: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #2563eb; }
  .ph-header h1 { margin: 0 0 4px; font-size: 20px; color: #2563eb; }
  .ph-header p { margin: 2px 0; font-size: 11px; color: #555; }
  .report-title { text-align: center; margin: 12px 0 4px; font-size: 18px; font-weight: 700; }
  .report-meta { text-align: center; font-size: 11px; color: #666; margin-bottom: 16px; }
  .institution { margin: 12px 0 16px; padding: 12px 14px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; font-size: 11px; line-height: 1.6; }
  .institution strong { color: #1e3a8a; }
  .muted { color: #6b7280; }
  .small { font-size: 10px; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
  .summary .card { padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb; }
  .summary .label { font-size: 10px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.04em; }
  .summary .value { font-size: 16px; font-weight: 700; color: #111; margin-top: 4px; }
  .summary .value.due { color: #dc2626; }
  .summary .value.paid { color: #059669; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead { background: #2563eb; color: #fff; }
  th { padding: 8px 6px; text-align: left; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; }
  td { padding: 8px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #fafafa; }
  .right { text-align: right; }
  .center { text-align: center; }
  .empty { text-align: center; color: #999; padding: 30px; font-style: italic; }
  .filters { font-size: 10px; color: #666; margin-bottom: 10px; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #888; text-align: center; }
  .signature { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 30px; font-size: 11px; }
  .signature .box { border-top: 1px solid #999; padding-top: 6px; min-height: 60px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 600; }
  .badge-pending { background: #fef3c7; color: #92400e; }
  .badge-billed { background: #dbeafe; color: #1e40af; }
  .badge-paid { background: #d1fae5; color: #065f46; }
  .badge-rejected { background: #fee2e2; color: #991b1b; }
  .items-block { font-size: 10.5px; line-height: 1.5; }
  .line-item { padding: 1px 0; }
  .print-btn { position: fixed; top: 16px; right: 16px; padding: 10px 18px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.1); }
  .print-btn:hover { background: #1d4ed8; }
  @media print {
    body { padding: 0; }
    @page { size: A4; margin: 12mm; }
    .print-btn { display: none; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
  <div class="page">
    ${pharmacyHeader}
    <h2 class="report-title">État de créances tiers payant</h2>
    <p class="report-meta">${escapeHtml(periodStr)} · Généré le ${escapeHtml(generatedAt)}</p>

    ${institutionBlock}
    ${filterChips.length ? `<p class="filters"><strong>Filtres :</strong> ${filterChips.join(' · ')}</p>` : ''}

    <div class="summary">
      <div class="card"><div class="label">Ventes</div><div class="value">${totals.salesCount}</div></div>
      <div class="card"><div class="label">Pris en charge (institution)</div><div class="value">${fmtXOF(totals.totalCovered)}</div></div>
      <div class="card"><div class="label">Déjà réglé</div><div class="value paid">${fmtXOF(totals.totalPaid)}</div></div>
      <div class="card"><div class="label">Reste à recouvrer</div><div class="value due">${fmtXOF(totals.outstanding)}</div></div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Date · N° reçu</th>
          <th>Bénéficiaire</th>
          ${showItems ? '<th>Articles</th>' : ''}
          <th class="right">Total vente</th>
          <th class="right">Part institution</th>
          <th class="right">Reste patient</th>
          <th class="center">Statut</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
      <tfoot>
        <tr>
          <td colspan="${showItems ? 3 : 2}" class="right"><strong>TOTAUX</strong></td>
          <td class="right"><strong>${fmtXOF(totals.saleTotal)}</strong></td>
          <td class="right"><strong>${fmtXOF(totals.totalCovered)}</strong></td>
          <td class="right"><strong>${fmtXOF(totals.totalPatient)}</strong></td>
          <td class="center muted small">${totals.salesCount} vente(s)</td>
        </tr>
      </tfoot>
    </table>

    <div class="signature">
      <div class="box">Cachet et signature de la pharmacie</div>
      <div class="box">Reçu par l'institution — date et signature</div>
    </div>

    <div class="footer">
      NeuroPharm — État de créances généré automatiquement. Document à présenter à l'institution pour règlement.
    </div>
  </div>
  ${autoPrintScript}
</body>
</html>`
}
