/**
 * RBAC (Role-Based Access Control) configuration
 * Defines default menu access per role and utilities for permission checks
 */

// All available menu keys (matching sidebar navigation)
export const ALL_MENU_KEYS = [
  'dashboard',
  'medications',
  'stock',
  'sales',
  'sales_pending',
  'credit',
  'credit_notes',
  'insurance',
  'proforma',
  'suppliers',
  'staff',
  'accounting',
  'payroll',
  'anomalies',
  'notifications',
  'settings',
] as const

export type MenuKey = (typeof ALL_MENU_KEYS)[number]

// Default permissions per role
// ADMIN has full access, other roles have restricted defaults
export const DEFAULT_PERMISSIONS: Record<string, MenuKey[]> = {
  ADMIN: [...ALL_MENU_KEYS],
  PHARMACIST: ['dashboard', 'proforma'],
  CASHIER: ['dashboard', 'sales', 'sales_pending', 'stock', 'credit', 'credit_notes', 'insurance', 'proforma'],
  ACCOUNTANT: ['dashboard', 'accounting', 'payroll', 'credit', 'credit_notes', 'insurance'],
}

// Menu labels (for admin permission UI)
export const MENU_LABELS: Record<MenuKey, { fr: string; en: string }> = {
  dashboard: { fr: 'Tableau de bord', en: 'Dashboard' },
  medications: { fr: 'Médicaments', en: 'Medications' },
  stock: { fr: 'Gestion du Stock', en: 'Stock Management' },
  sales: { fr: 'Point de Vente', en: 'Point of Sale' },
  sales_pending: { fr: 'Ventes en attente', en: 'Pending sales' },
  credit: { fr: 'Carnet (crédit client)', en: 'Carnet (customer credit)' },
  credit_notes: { fr: 'Avoirs', en: 'Credit notes' },
  insurance: { fr: 'Assurances / Tiers payant', en: 'Insurance / Third-party payers' },
  proforma: { fr: 'Pro forma (devis)', en: 'Pro forma (quote)' },
  suppliers: { fr: 'Fournisseurs', en: 'Suppliers' },
  staff: { fr: 'Personnel', en: 'Staff' },
  accounting: { fr: 'Comptabilité', en: 'Accounting' },
  payroll: { fr: 'Paie', en: 'Payroll' },
  anomalies: { fr: 'Anomalies', en: 'Anomalies' },
  notifications: { fr: 'Notifications', en: 'Notifications' },
  settings: { fr: 'Paramètres', en: 'Settings' },
}

/**
 * Check if a role has access to a menu by default
 */
export function hasDefaultAccess(role: string, menuKey: string): boolean {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return true
  return DEFAULT_PERMISSIONS[role]?.includes(menuKey as MenuKey) ?? false
}
