# Paie (Bulletins de salaire) — NeuroPharm v1

> **Règle anti-régression** : toute modification de ce flux (API, page, logique frontend) **doit** mettre ce fichier à jour avant le merge.

---

## 1. Vue d'ensemble

La page `/dashboard/paie` gère les bulletins de salaire conformément à la législation sénégalaise (IPRES, CSS, IR progressif, TRIMF, CFCE). Elle couvre la création manuelle, la génération automatique, la validation et le marquage comme payé.

**Fichiers principaux :**

| Fichier | Rôle |
|---------|------|
| `src/app/dashboard/paie/page.tsx` | Page UI principale |
| `src/app/api/payroll/route.ts` | `GET` (liste) + `POST` (créer bulletin) |
| `src/app/api/payroll/[id]/route.ts` | `GET` détail + `PUT` (modifier) + `DELETE` |
| `src/app/api/payroll/generate/route.ts` | `POST` génération automatique pour un mois |
| `src/lib/payroll-calc.ts` | Calculs des cotisations et taxes |

**Accès** : rôles `ADMIN` et `ACCOUNTANT` (selon permissions).

---

## 2. Modèle Prisma `Payroll`

```prisma
model Payroll {
  id             String   @id @default(cuid())
  pharmacyId     String
  employeeName   String
  employeeRole   String?  // poste (libellé libre)
  month          Int      // 1-12
  year           Int      // ex. 2024

  // ── Gains ──────────────────────────────────
  baseSalary         Float    // Salaire de base
  seniority          Float    @default(0)  // Prime d'ancienneté
  transportAllowance Float    @default(0)  // Indemnité transport
  housingAllowance   Float    @default(0)  // Indemnité logement
  bonuses            Float    @default(0)  // Primes diverses
  overtime           Float    @default(0)  // Heures supplémentaires
  grossSalary        Float    // Brut (calculé)

  // ── Retenues salariales ────────────────────
  ipresGeneral    Float    @default(0)  // IPRES régime général : 5,6 %
  ipresCadre      Float    @default(0)  // IPRES régime cadre : 2,4 % (si applicable)
  cssAccident     Float    @default(0)  // CSS accidents du travail (réservé)
  cssMaladie      Float    @default(0)  // CSS maladie : 3 %
  incomeTax       Float    @default(0)  // IR (barème progressif)
  trimf           Float    @default(0)  // TRIMF (minimum fiscal)
  cfce            Float    @default(0)  // CFCE (contribution forfaitaire)
  otherDeductions Float    @default(0)  // Autres retenues

  // ── Charges patronales (info bulletin) ────
  employerIpres   Float    @default(0)  // IPRES patronal : 8,4 %
  employerCss     Float    @default(0)  // CSS patronale (AT, PF, maladie)
  employerCfce    Float    @default(0)  // CFCE patronale

  // ── Totaux ────────────────────────────────
  totalGross      Float    // Total brut
  totalDeductions Float    // Total retenues salariales
  netSalary       Float    // Net à payer

  // ── Workflow ──────────────────────────────
  status          String   @default("draft") // draft, validated, paid
  validatedBy     String?  // ID de l'admin validateur
  validatedAt     DateTime?
  paidAt          DateTime?
  notes           String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([pharmacyId, employeeName, month, year])
}
```

> **Contrainte unique** : un seul bulletin par (pharmacie, employé, mois, année).

---

## 3. Calculs de cotisations sénégalaises (`src/lib/payroll-calc.ts`)

### 3.1 Salaire brut

```
grossSalary = baseSalary + seniority + transportAllowance + housingAllowance + bonuses + overtime
```

### 3.2 Retenues salariales

| Cotisation | Base | Taux salarié |
|------------|------|:------------:|
| IPRES régime général | Brut plafonné | **5,6 %** |
| IPRES régime cadre | Brut plafonné (cadres) | **2,4 %** |
| CSS maladie | Brut | **3 %** |
| IR (impôt revenu) | Brut - cotisations sociales | Barème progressif |
| TRIMF | Fixe selon revenus | Forfait |
| CFCE | Base légale | Forfait |

### 3.3 Charges patronales (informatives sur le bulletin)

| Cotisation | Base | Taux patronal |
|------------|------|:-------------:|
| IPRES patronal | Brut plafonné | **8,4 %** |
| CSS patronale | Brut | Variable (AT + PF + maladie) |
| CFCE patronale | Base légale | Forfait |

### 3.4 Barème IR (simplifié Sénégal)

| Tranche (revenu imposable/mois) | Taux |
|---------------------------------|:----:|
| 0 – 50 000 XOF | 0 % |
| 50 001 – 130 000 XOF | 20 % |
| 130 001 – 250 000 XOF | 30 % |
| 250 001 – 500 000 XOF | 35 % |
| > 500 000 XOF | 40 % |

> Les tranches et taux exacts sont dans `src/lib/payroll-calc.ts` — toujours se référer au fichier source en cas de doute ou de changement légal.

### 3.5 Net à payer

```
netSalary = grossSalary - totalDeductions
totalDeductions = ipresGeneral + ipresCadre + cssMaladie + incomeTax + trimf + cfce + otherDeductions
```

---

## 4. Routes API

### `GET /api/payroll`

**Auth** : `ADMIN` ou `ACCOUNTANT`

**Query params :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `status` | string | `draft`, `validated`, `paid` |
| `month` | number | 1-12 |
| `year` | number | ex. 2024 |
| `limit` | number | Défaut : 20 |
| `offset` | number | Pagination |

**Réponse :**
```json
{
  "payrolls": [...],
  "total": 8,
  "totalNetSalary": 2450000
}
```

---

### `POST /api/payroll`

**Auth** : `ADMIN` ou `ACCOUNTANT`

**Corps de requête :** tous les champs du modèle sauf les totaux (calculés côté serveur).

**Effets de bord :**
1. Recalcule `grossSalary`, `totalDeductions`, `netSalary` côté serveur via `payroll-calc.ts`
2. Crée le bulletin avec `status: 'draft'`
3. Écrit un `AuditLog` `CREATE` / `payroll`

---

### `PUT /api/payroll/[id]`

**Auth** : `ADMIN` ou `ACCOUNTANT`

**Actions possibles via le corps :**

```json
// Modifier les montants (draft uniquement)
{ "baseSalary": 350000, "bonuses": 50000, ... }

// Valider
{ "action": "validate" }

// Marquer payé
{ "action": "pay" }

// Repasser en brouillon
{ "action": "revert" }
```

**Transitions de statut autorisées :**

```
draft → validated (action: "validate")
validated → paid (action: "pay")
validated → draft (action: "revert")
paid → (aucune transition — permanent)
```

**Effets de bord (validate) :**
1. Passe `status` à `validated`
2. Enregistre `validatedBy` (ID de l'admin) et `validatedAt`
3. Écrit un `AuditLog` `UPDATE` / `payroll`

**Effets de bord (pay) :**
1. Passe `status` à `paid`
2. Enregistre `paidAt`
3. Écrit un `AuditLog` `UPDATE` / `payroll`

---

### `POST /api/payroll/generate`

**Auth** : `ADMIN` uniquement

**Corps de requête :**
```json
{ "month": 3, "year": 2024 }
```

**Comportement :**
1. Récupère tous les `User` actifs de la pharmacie (hors SUPER_ADMIN)
2. Pour chacun, crée un bulletin avec `baseSalary = 0` et `status: 'draft'` si aucun bulletin n'existe déjà pour ce mois/année
3. Retourne le nombre de bulletins créés et ignorés (déjà existants)

> Les montants générés automatiquement sont à `0` — l'ACCOUNTANT doit les saisir manuellement.

---

### `DELETE /api/payroll/[id]`

**Auth** : `ADMIN` uniquement  
**Condition** : uniquement si `status === 'draft'`

**Effets de bord :**
1. Supprime le bulletin
2. Écrit un `AuditLog` `DELETE` / `payroll`

---

## 5. Interface utilisateur

### 5.1 Liste des bulletins

| Colonne | Description |
|---------|-------------|
| Employé | Nom + rôle |
| Période | Mois/Année (ex. Mars 2024) |
| Brut | `grossSalary` XOF |
| Net | `netSalary` XOF |
| Statut | Badge : Brouillon / Validé / Payé |
| Actions | Modifier, Valider, Marquer payé, Réinitialiser, Supprimer, Imprimer |

**Filtres :**
- Statut (Tous / Brouillon / Validé / Payé)
- Mois
- Année

### 5.2 Formulaire de saisie

**Section Gains :**
- Salaire de base (requis)
- Prime d'ancienneté
- Indemnité transport
- Indemnité logement
- Primes diverses
- Heures supplémentaires
- **Salaire brut** (calculé automatiquement)

**Section Retenues :**
- IPRES général (calculé)
- IPRES cadre (calculé si coché)
- CSS maladie (calculé)
- IR (calculé selon barème)
- TRIMF (calculé)
- CFCE (calculé)
- Autres retenues (manuel)
- **Total retenues** (calculé)

**Section Charges patronales (affichage info) :**
- IPRES patronal
- CSS patronale
- CFCE patronale

**Net à payer** (calculé = Brut - Total retenues)

### 5.3 Statuts (badges)

| Statut | Badge | Couleur |
|--------|-------|---------|
| `draft` | Brouillon | Gris |
| `validated` | Validé | Bleu |
| `paid` | Payé | Vert |

### 5.4 Génération PDF du bulletin

Le bouton « Imprimer » génère un PDF côté client avec :
- En-tête : nom pharmacie, mois/année
- Informations employé : nom, poste
- Tableau Gains avec détail
- Tableau Retenues avec détail
- Tableau Charges patronales (informatif)
- Net à payer (mis en évidence)

---

## 6. Règles métier

1. **Pas de modification après paiement** : un bulletin `paid` est verrouillé — aucune modification possible.
2. **Calculs côté serveur** : les totaux (`grossSalary`, `totalDeductions`, `netSalary`) sont toujours recalculés côté API — le frontend n'est pas autoritaire sur ces valeurs.
3. **Pas de lien automatique avec `Expense`** : la validation d'un bulletin ne crée pas automatiquement une `Expense` dans le module comptabilité — l'ACCOUNTANT doit saisir manuellement.
4. **Unicité** : un seul bulletin par (pharmacie, employé, mois, année) — contrainte enforced en DB via `@@unique`.
5. **Format monétaire** : XOF sans décimale — `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' })`.
