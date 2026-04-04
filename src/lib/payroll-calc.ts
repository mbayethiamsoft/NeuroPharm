/**
 * Senegal Payroll Calculator
 * Based on Senegalese labor code and social security regulations:
 * - IPRES (Institut de Prévoyance Retraite du Sénégal)
 * - CSS (Caisse de Sécurité Sociale)
 * - IR (Impôt sur le Revenu) - barème progressif
 * - TRIMF / CFCE
 */

export interface PayrollInput {
  baseSalary: number
  seniority?: number
  transportAllowance?: number
  housingAllowance?: number
  bonuses?: number
  overtime?: number
  isCadre?: boolean
}

export interface PayrollCalculation {
  // Gains
  baseSalary: number
  seniority: number
  transportAllowance: number
  housingAllowance: number
  bonuses: number
  overtime: number
  grossSalary: number

  // Retenues salariales
  ipresGeneral: number
  ipresCadre: number
  cssMaladie: number
  incomeTax: number
  trimf: number
  totalDeductions: number

  // Charges patronales
  employerIpres: number
  employerCss: number
  employerCfce: number

  // Net
  totalGross: number
  netSalary: number
}

// IPRES rates
const IPRES_GENERAL_EMPLOYEE = 0.056 // 5.6% part salariale
const IPRES_GENERAL_EMPLOYER = 0.084 // 8.4% part patronale
const IPRES_CADRE_EMPLOYEE = 0.024   // 2.4% cadres
const IPRES_CADRE_EMPLOYER = 0.036   // 3.6% cadres
const IPRES_GENERAL_CEILING = 432000 // Plafond mensuel régime général

// CSS rates
const CSS_MALADIE_EMPLOYEE = 0.03    // 3% maladie (part salariale estimée)
const CSS_AT_EMPLOYER = 0.01 + 0.07  // AT + PF (part patronale)

// CFCE
const CFCE_RATE = 0.03               // 3% charge patronale

// TRIMF (forfaitaire par tranche de revenu mensuel)
function calculateTRIMF(grossSalary: number): number {
  if (grossSalary <= 75000) return 0
  if (grossSalary <= 140000) return 900
  if (grossSalary <= 250000) return 1800
  if (grossSalary <= 500000) return 3600
  if (grossSalary <= 1000000) return 6000
  return 9600
}

// IR (Impôt sur le Revenu) - barème annuel simplifié appliqué mensuellement
function calculateIncomeTax(taxableMonthly: number): number {
  const annual = taxableMonthly * 12

  let tax = 0
  if (annual <= 630000) {
    tax = 0
  } else if (annual <= 1500000) {
    tax = (annual - 630000) * 0.20
  } else if (annual <= 4000000) {
    tax = 174000 + (annual - 1500000) * 0.30
  } else if (annual <= 8000000) {
    tax = 924000 + (annual - 4000000) * 0.35
  } else if (annual <= 13500000) {
    tax = 2324000 + (annual - 8000000) * 0.37
  } else {
    tax = 4359000 + (annual - 13500000) * 0.40
  }

  return Math.round(tax / 12)
}

export function calculatePayroll(input: PayrollInput): PayrollCalculation {
  const baseSalary = input.baseSalary || 0
  const seniority = input.seniority || 0
  const transportAllowance = input.transportAllowance || 0
  const housingAllowance = input.housingAllowance || 0
  const bonuses = input.bonuses || 0
  const overtime = input.overtime || 0

  // Brut = base + primes + indemnités + heures sup
  const grossSalary = baseSalary + seniority + transportAllowance + housingAllowance + bonuses + overtime
  const totalGross = grossSalary

  // Assiette IPRES (plafonnée)
  const ipresBase = Math.min(grossSalary, IPRES_GENERAL_CEILING)

  // Retenues salariales
  const ipresGeneral = Math.round(ipresBase * IPRES_GENERAL_EMPLOYEE)
  const ipresCadre = input.isCadre ? Math.round((grossSalary - IPRES_GENERAL_CEILING > 0 ? grossSalary - IPRES_GENERAL_CEILING : 0) * IPRES_CADRE_EMPLOYEE) : 0
  const cssMaladie = Math.round(grossSalary * CSS_MALADIE_EMPLOYEE)
  const trimf = calculateTRIMF(grossSalary)

  // Revenu imposable = brut - cotisations sociales
  const socialContributions = ipresGeneral + ipresCadre + cssMaladie
  const taxableIncome = grossSalary - socialContributions
  const incomeTax = calculateIncomeTax(taxableIncome)

  const totalDeductions = ipresGeneral + ipresCadre + cssMaladie + incomeTax + trimf

  // Charges patronales
  const employerIpres = Math.round(ipresBase * IPRES_GENERAL_EMPLOYER) + (input.isCadre ? Math.round((grossSalary - IPRES_GENERAL_CEILING > 0 ? grossSalary - IPRES_GENERAL_CEILING : 0) * IPRES_CADRE_EMPLOYER) : 0)
  const employerCss = Math.round(grossSalary * CSS_AT_EMPLOYER)
  const employerCfce = Math.round(grossSalary * CFCE_RATE)

  // Net
  const netSalary = totalGross - totalDeductions

  return {
    baseSalary,
    seniority,
    transportAllowance,
    housingAllowance,
    bonuses,
    overtime,
    grossSalary,
    ipresGeneral,
    ipresCadre,
    cssMaladie,
    incomeTax,
    trimf,
    totalDeductions,
    employerIpres,
    employerCss,
    employerCfce,
    totalGross,
    netSalary,
  }
}
