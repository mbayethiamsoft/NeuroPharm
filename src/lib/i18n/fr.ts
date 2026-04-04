const fr = {
  // Common
  common: {
    save: 'Enregistrer',
    cancel: 'Annuler',
    delete: 'Supprimer',
    edit: 'Modifier',
    create: 'Créer',
    add: 'Ajouter',
    close: 'Fermer',
    confirm: 'Confirmer',
    search: 'Rechercher',
    loading: 'Chargement...',
    noData: 'Aucune donnée',
    error: 'Erreur',
    success: 'Succès',
    actions: 'Actions',
    status: 'Statut',
    period: 'Période',
    date: 'Date',
    amount: 'Montant',
    total: 'Total',
    yes: 'Oui',
    no: 'Non',
    back: 'Retour',
    next: 'Suivant',
    previous: 'Précédent',
    all: 'Tous',
    active: 'Actif',
    inactive: 'Inactif',
    name: 'Nom',
    email: 'E-mail',
    phone: 'Téléphone',
    address: 'Adresse',
    description: 'Description',
    notes: 'Notes',
    language: 'Langue',
    french: 'Français',
    english: 'English',
  },

  // Auth
  auth: {
    login: 'Connexion',
    logout: 'Déconnexion',
    loggingOut: 'Déconnexion...',
    email: 'Adresse e-mail',
    password: 'Mot de passe',
    loginButton: 'Se connecter',
    loginLoading: 'Connexion en cours...',
    welcomeBack: 'Bon retour',
    welcomeNew: 'Bienvenue sur NeuroPharm',
    welcomeDefault: 'Bonjour',
    loginSubtitle: 'Gestion Pharmaceutique Intelligente',
    loginDescription: 'Connectez-vous pour accéder à votre espace de gestion',
    invalidCredentials: 'E-mail ou mot de passe incorrect',
    sessionExpired: 'Session expirée, veuillez vous reconnecter',
    unauthorized: 'Non autorisé',
  },

  // Navigation
  nav: {
    dashboard: 'Tableau de bord',
    medications: 'Médicaments',
    stock: 'Gestion du Stock',
    sales: 'Point de Vente',
    suppliers: 'Fournisseurs',
    staff: 'Personnel',
    accounting: 'Comptabilité',
    anomalies: 'Anomalies',
    notifications: 'Notifications',
    settings: 'Paramètres',
    profile: 'Mon Profil',
    payroll: 'Gestion de la Paie',
  },

  // Dashboard
  dashboard: {
    todaySales: 'Ventes du jour',
    medsInStock: 'Médicaments en stock',
    activeProducts: 'produits actifs',
    lowStockAlerts: 'Alertes stock bas',
    reorder: 'produits à réapprovisionner',
    revenue: "Chiffre d'affaires",
    thisMonth: 'ce mois',
    recentSales: 'Ventes récentes',
    viewAll: 'Voir tout',
    quickActions: 'Actions rapides',
    newSale: 'Nouvelle vente',
    addMedication: 'Ajouter médicament',
    manageStock: 'Gérer le stock',
    viewAlerts: 'Voir les alertes',
    stockAlerts: 'Alertes stock',
    lowStockProducts: 'produit(s) en stock bas',
    noAlerts: 'Aucune alerte',
    noRecentSales: 'Aucune vente récente',
    summaryToday: "Voici le résumé de votre pharmacie aujourd'hui",
    items: 'article(s)',
  },

  // Payroll
  payroll: {
    title: 'Bulletins de paie',
    netPayroll: 'Masse salariale nette',
    employerCharges: 'Charges patronales',
    drafts: 'Brouillons',
    paid: 'Payés',
    draft: 'Brouillon',
    validated: 'Validé',
    paidStatus: 'Payé',
    newPayslip: 'Nouveau bulletin de paie',
    editPayslip: 'Modifier le bulletin',
    employeeName: "Nom de l'employé",
    employeeRole: 'Poste',
    baseSalary: 'Salaire de base',
    seniority: "Prime d'ancienneté",
    transportAllowance: 'Indemnité de transport',
    housingAllowance: 'Indemnité de logement',
    bonuses: 'Primes diverses',
    overtime: 'Heures supplémentaires',
    isCadre: 'Cadre (IPRES régime cadre)',
    grossSalary: 'Salaire brut',
    gains: 'Gains',
    deductions: 'Retenues salariales',
    ipresGeneral: 'IPRES Régime général',
    ipresCadre: 'IPRES Régime cadre',
    cssMaladie: 'CSS Maladie',
    incomeTax: 'Impôt sur le Revenu (IR)',
    trimf: 'TRIMF',
    totalDeductions: 'Total retenues',
    employerSection: 'Charges patronales',
    ipresEmployer: 'IPRES patronal',
    cssEmployer: 'CSS patronal (AT+PF)',
    cfceEmployer: 'CFCE',
    totalEmployer: 'Total patronal',
    netToPay: 'NET A PAYER',
    grossEstimate: 'Brut estimé',
    autoCalcNote: 'Les cotisations (IPRES, CSS, IR, TRIMF) seront calculées automatiquement',
    autoGenerate: 'Auto-générer',
    generateConfirm: 'Générer les bulletins pour',
    validate: 'Valider',
    markPaid: 'Marquer payé',
    revertDraft: 'Remettre en brouillon',
    printPayslip: 'Imprimer bulletin',
    deleteConfirm: 'Supprimer ce bulletin de paie ?',
    noPayslips: 'Aucun bulletin de paie',
    allMonths: 'Tous les mois',
    allStatuses: 'Tous statuts',
    validatedOn: 'Validé le',
    paidOn: 'Payé le',
    month: 'Mois',
    year: 'Année',
    createPayslip: 'Créer le bulletin',
  },

  // Months
  months: [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
  ],

  // Stock
  stock: {
    title: 'Gestion du Stock',
    totalProducts: 'Produits total',
    lowStock: 'Stock bas',
    expiringSoon: 'Bientôt périmés',
    totalValue: 'Valeur du stock',
  },

  // Sales
  sales: {
    title: 'Point de Vente',
    newSale: 'Nouvelle vente',
    cart: 'Panier',
    subtotal: 'Sous-total',
    tax: 'TVA',
    discount: 'Remise',
    total: 'Total',
    paymentMethod: 'Mode de paiement',
    cash: 'Espèces',
    mobileMoney: 'Mobile Money',
    card: 'Carte',
    insurance: 'Assurance',
    credit: 'Crédit',
    completeSale: 'Valider la vente',
    completed: 'Terminée',
    refunded: 'Remboursée',
    cancelled: 'Annulée',
  },

  // Notifications
  notifications: {
    title: 'Notifications',
    markAllRead: 'Tout marquer comme lu',
    noNotifications: 'Aucune notification',
    viewAll: 'Voir tout',
  },

  // Settings
  settings: {
    title: 'Paramètres',
    pharmacy: 'Pharmacie',
    pharmacyName: 'Nom de la pharmacie',
    taxRate: 'Taux de TVA',
    lowStockThreshold: 'Seuil de stock bas',
    expiryAlertDays: "Jours d'alerte péremption",
  },

  // Profile
  profile: {
    title: 'Mon Profil',
    firstName: 'Prénom',
    lastName: 'Nom',
    currentPassword: 'Mot de passe actuel',
    newPassword: 'Nouveau mot de passe',
    confirmPassword: 'Confirmer le mot de passe',
    updateProfile: 'Mettre à jour le profil',
    changePassword: 'Changer le mot de passe',
  },
}

export default fr

export interface Translations {
  common: Record<string, string>
  auth: Record<string, string>
  nav: Record<string, string>
  dashboard: Record<string, string>
  payroll: Record<string, string>
  months: string[]
  stock: Record<string, string>
  sales: Record<string, string>
  notifications: Record<string, string>
  settings: Record<string, string>
  profile: Record<string, string>
}
