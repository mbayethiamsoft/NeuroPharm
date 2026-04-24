import type { CarnetReportResult } from './carnet-report'

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
  d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

export interface PharmacyHeader {
  name: string
  address: string | null
  city: string | null
  phone: string | null
  email: string | null
  taxId: string | null
}

export function buildCarnetReportHtml(
  report: CarnetReportResult,
  pharmacy: PharmacyHeader | null,
  opts: { search?: string; filter?: string; autoPrint?: boolean } = {}
): string {
  const { rows, totals, dateFrom, dateTo } = report
  const filterLabels: Record<string, string> = {
    inDebt: 'En dette uniquement',
    settled: 'Soldé uniquement',
  }

  const periodStr =
    dateFrom || dateTo
      ? `Du ${fmtDate(dateFrom)} au ${fmtDate(dateTo)}`
      : 'Toutes périodes'

  const pharmacyHeader = pharmacy
    ? `<div class="ph-header">
        <h1>${escapeHtml(pharmacy.name)}</h1>
        ${[pharmacy.address, pharmacy.city].filter(Boolean).map((v) => `<p>${escapeHtml(v!)}</p>`).join('')}
        ${pharmacy.phone ? `<p>Tél : ${escapeHtml(pharmacy.phone)}</p>` : ''}
        ${pharmacy.email ? `<p>${escapeHtml(pharmacy.email)}</p>` : ''}
        ${pharmacy.taxId ? `<p>NINEA : ${escapeHtml(pharmacy.taxId)}</p>` : ''}
      </div>`
    : ''

  const generatedAt = new Date().toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const tableRows = rows.length
    ? rows
        .map(
          (r) => `
      <tr>
        <td>${escapeHtml(r.fullName)}${r.phone ? `<br/><span class="phone">${escapeHtml(r.phone)}</span>` : ''}</td>
        <td class="right">${r.creditLimit > 0 ? fmtXOF(r.creditLimit) : '—'}</td>
        <td class="right">${fmtXOF(r.totalDebt)}</td>
        <td class="right">${fmtXOF(r.totalPaid)}</td>
        <td class="right ${r.balance > 0.009 ? 'debt' : 'ok'}">${fmtXOF(r.balance)}</td>
        <td class="center">${fmtDate(r.lastSaleAt)}</td>
        <td class="center">${fmtDate(r.lastPaymentAt)}</td>
      </tr>`
        )
        .join('')
    : `<tr><td colspan="7" class="empty">Aucun client</td></tr>`

  const activeFilters: string[] = []
  if (opts.search) activeFilters.push(`Recherche : "${escapeHtml(opts.search)}"`)
  if (opts.filter && filterLabels[opts.filter]) activeFilters.push(filterLabels[opts.filter])

  const autoPrintScript = opts.autoPrint
    ? `<script>window.addEventListener('load', () => setTimeout(() => { window.focus(); window.print(); }, 250));</script>`
    : ''

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Rapport Carnet — ${escapeHtml(pharmacy?.name || 'NeuroPharm')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica', 'Arial', sans-serif; color: #111; margin: 0; padding: 24px; font-size: 12px; background: #fff; }
  .page { max-width: 1100px; margin: 0 auto; }
  .ph-header { text-align: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #059669; }
  .ph-header h1 { margin: 0 0 4px; font-size: 20px; color: #059669; }
  .ph-header p { margin: 2px 0; font-size: 11px; color: #555; }
  .report-title { text-align: center; margin: 12px 0 4px; font-size: 18px; font-weight: 700; }
  .report-meta { text-align: center; font-size: 11px; color: #666; margin-bottom: 20px; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
  .summary .card { padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb; }
  .summary .label { font-size: 10px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.04em; }
  .summary .value { font-size: 16px; font-weight: 700; color: #111; margin-top: 4px; }
  .summary .value.debt { color: #dc2626; }
  .summary .value.ok { color: #059669; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead { background: #059669; color: #fff; }
  th { padding: 8px 6px; text-align: left; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; }
  td { padding: 7px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  .right { text-align: right; }
  .center { text-align: center; }
  .phone { font-size: 10px; color: #888; }
  .debt { color: #dc2626; font-weight: 600; }
  .ok { color: #059669; font-weight: 600; }
  .empty { text-align: center; color: #999; padding: 30px; font-style: italic; }
  .filters { font-size: 10px; color: #666; margin-bottom: 10px; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #888; text-align: center; }
  .print-btn { position: fixed; top: 16px; right: 16px; padding: 10px 18px; background: #059669; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.1); }
  .print-btn:hover { background: #047857; }
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
    <h2 class="report-title">Rapport Carnet — Crédit client</h2>
    <p class="report-meta">${escapeHtml(periodStr)} · Généré le ${escapeHtml(generatedAt)}</p>

    ${activeFilters.length ? `<p class="filters"><strong>Filtres :</strong> ${activeFilters.join(' · ')}</p>` : ''}

    <div class="summary">
      <div class="card"><div class="label">Clients</div><div class="value">${totals.totalCount}</div></div>
      <div class="card"><div class="label">Clients en dette</div><div class="value debt">${totals.inDebtCount}</div></div>
      <div class="card"><div class="label">Total dû (période)</div><div class="value">${fmtXOF(totals.totalDebt)}</div></div>
      <div class="card"><div class="label">Solde global</div><div class="value ${totals.balance > 0 ? 'debt' : 'ok'}">${fmtXOF(totals.balance)}</div></div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Client</th>
          <th class="right">Plafond</th>
          <th class="right">Total dû</th>
          <th class="right">Total remboursé</th>
          <th class="right">Solde</th>
          <th class="center">Dernière vente</th>
          <th class="center">Dernier paiement</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>

    <div class="footer">
      NeuroPharm — Rapport Carnet généré automatiquement. Ce document est un état au moment de la génération.
    </div>
  </div>
  ${autoPrintScript}
</body>
</html>`
}
