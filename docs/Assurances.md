# Assurances / Tiers payant — NeuroPharm v1

> **Règle anti-régression** : toute modification des flux assurances (API, page, split, rapport) **doit** mettre ce fichier à jour avant le merge.

---

## 1. Vue d'ensemble

Le module **Assurances / Tiers payant** permet à une pharmacie de gérer les institutions qui règlent tout ou partie des ventes pour le compte de leurs adhérents (assurances privées, mutuelles, CMU, IPM, etc.), d'enregistrer les bénéficiaires (titulaires + ayants droit), de tracer les créances au moment de la vente, et d'exporter un état de créances à adresser à l'institution pour paiement.

**Fichiers principaux :**

| Fichier | Rôle |
|---------|------|
| `src/app/dashboard/ventes/assurances/page.tsx` | Page de gestion (institutions, bénéficiaires, rapports, e-mail) |
| `src/app/dashboard/ventes/layout.tsx` | Onglet « Assurances » (gated par la permission `insurance`) |
| `src/app/dashboard/ventes/page.tsx` | POS — panneau tiers payant quand `paymentMethod=INSURANCE` |
| `src/app/api/insurances/route.ts` | `GET` (liste + agrégats optionnels) + `POST` (créer institution) |
| `src/app/api/insurances/[id]/route.ts` | `GET` (détail + bénéficiaires + ventes récentes), `PUT`, soft `DELETE` |
| `src/app/api/insurances/[id]/beneficiaries/route.ts` | `POST` (créer bénéficiaire) |
| `src/app/api/insurances/[id]/beneficiaries/[bid]/route.ts` | `PUT`, soft `DELETE` |
| `src/app/api/insurances/sales/status/route.ts` | `PATCH` bulk `insuranceClaimStatus` |
| `src/app/api/insurances/report/route.ts` | `GET` rapport JSON (filtré) |
| `src/app/api/insurances/report/pdf/route.ts` | `GET` rapport HTML auto-imprimable |
| `src/lib/insurance-report.ts` | `buildInsuranceReport()` — source unique de vérité |
| `src/lib/insurance-report-html.ts` | `buildInsuranceReportHtml()` — template A4 |

---

## 2. Modèles Prisma

### `Insurance`

Institution payeuse (assurance, mutuelle, CMU, IPM). Scopée par `pharmacyId`, soft-delete via `isActive`.

```prisma
model Insurance {
  id             String                   @id @default(cuid())
  pharmacyId     String
  name           String
  type           String                   @default("ASSURANCE") // ASSURANCE, MUTUELLE, CMU, IPM, AUTRE
  code           String?                  // n° de convention / code interne
  contactName    String?
  phone          String?
  email          String?
  address        String?
  notes          String?
  coverageRate   Float                    @default(80)           // % par défaut
  isActive       Boolean                  @default(true)
  createdAt      DateTime                 @default(now())
  updatedAt      DateTime                 @updatedAt
  beneficiaries  InsuranceBeneficiary[]
  sales          Sale[]
}
```

> `coverageRate` n'est qu'un défaut : chaque vente stocke son propre `insuranceCoverage` snapshot, pour que l'historique reste stable si le taux change plus tard.

### `InsuranceBeneficiary`

Titulaire ou ayant droit rattaché à une institution. Relation auto-référencée : un `HOLDER` peut avoir plusieurs dépendants (`SPOUSE`, `CHILD`, `PARENT`, `OTHER`).

```prisma
model InsuranceBeneficiary {
  id                String                 @id @default(cuid())
  pharmacyId        String
  insuranceId       String
  fullName          String
  membershipNumber  String?                // n° d'affiliation
  relationship      String                 @default("HOLDER") // HOLDER, SPOUSE, CHILD, PARENT, OTHER
  holderId          String?                // null si HOLDER, sinon → InsuranceBeneficiary (HOLDER)
  phone             String?
  birthDate         DateTime?
  notes             String?
  isActive          Boolean                @default(true)
  holder            InsuranceBeneficiary?  @relation("BeneficiaryDependents", fields: [holderId], references: [id])
  dependents        InsuranceBeneficiary[] @relation("BeneficiaryDependents")
  sales             Sale[]

  @@unique([insuranceId, membershipNumber])
}
```

> Le `@@unique([insuranceId, membershipNumber])` empêche deux adhérents de la même institution avec le même matricule. Un bénéficiaire sans `membershipNumber` n'est pas contraint (null répété autorisé).

### `Sale` — champs tiers payant

Quand une vente passe par `paymentMethod=INSURANCE`, les champs suivants sont renseignés :

```prisma
insuranceId           String?   // → Insurance, onDelete: SetNull
beneficiaryId         String?   // → InsuranceBeneficiary, onDelete: SetNull
insuranceCoverage     Float?    // % effectif à la date de vente (snapshot)
insuranceAmount       Float?    // total × coverage / 100 — montant dû par l'institution
patientAmount         Float?    // total - insuranceAmount — reste à charge patient
insuranceClaimRef     String?   // n° de bon / ordonnance
insuranceClaimStatus  String    @default("pending") // pending, billed, paid, rejected
```

> `onDelete: SetNull` sur `insuranceId` / `beneficiaryId` permet de désactiver (soft delete) ou même supprimer une institution sans casser les ventes historiques. Les rapports conservent alors le `customerName` / `customerPhone` snapshot et la somme `insuranceAmount`.

---

## 3. Routes API

### 3.1 `GET /api/insurances`

Liste les institutions actives de la pharmacie, triées par nom.

| Param | Type | Description |
|-------|------|-------------|
| `search` | string | Filtre nom / code / contactName |
| `withTotals` | `1` | Ajoute `totals` par institution (salesCount, totalCovered, totalPaid, outstanding) |
| `dateFrom`, `dateTo` | date | Restreint l'agrégat à une période |

Réponse :
```json
{
  "insurances": [
    {
      "id": "...", "name": "...", "type": "CMU", "coverageRate": 100,
      "beneficiaryCount": 12,
      "totals": { "salesCount": 34, "totalCovered": 125000, "totalPaid": 90000, "outstanding": 35000 }
    }
  ]
}
```

### 3.2 `POST /api/insurances`

Crée une institution. Validations :
- `name` requis
- `type` whitelist (`ASSURANCE`, `MUTUELLE`, `CMU`, `IPM`, `AUTRE`)
- `coverageRate` ∈ [0, 100]
- Unicité du `name` insensible à la casse dans la pharmacie (409 sinon)

Écrit un `AuditLog` `CREATE insurance`.

### 3.3 `GET /api/insurances/[id]`

Renvoie l'institution complète, ses `beneficiaries` actifs, les **100 dernières** ventes `INSURANCE` et les totaux agrégés (salesCount, totalCovered, totalPatient, totalPaid, outstanding).

### 3.4 `PUT /api/insurances/[id]`

Mise à jour partielle. Mêmes validations que POST. Écrit `AuditLog UPDATE`.

### 3.5 `DELETE /api/insurances/[id]`

Soft delete (`isActive=false`). Les ventes historiques restent attachées par `insuranceId` ; le rapport continue de les retrouver. Écrit `AuditLog DELETE`.

### 3.6 `POST /api/insurances/[id]/beneficiaries`

Crée un titulaire ou ayant droit. Validations :
- `fullName` requis
- `relationship` whitelist (`HOLDER`, `SPOUSE`, `CHILD`, `PARENT`, `OTHER`)
- Si `relationship !== 'HOLDER'` : `holderId` requis et doit pointer vers un `HOLDER` actif **de la même institution**
- `membershipNumber` unique par institution si fourni (conflit → 409)
- `birthDate` parsée si fournie

### 3.7 `PUT /api/insurances/[id]/beneficiaries/[bid]`

Mise à jour. Règles supplémentaires :
- Impossible de **rétrograder** un `HOLDER` qui a encore des dépendants actifs (409).
- Impossible de rattacher un bénéficiaire à lui-même via `holderId`.

### 3.8 `DELETE /api/insurances/[id]/beneficiaries/[bid]`

Soft delete. Refuse si le bénéficiaire est un `HOLDER` avec des dépendants actifs — désactiver d'abord les ayants droit.

### 3.9 `PATCH /api/insurances/sales/status`

Mise à jour en masse du statut de créance.

```json
{ "saleIds": ["clxxx", "clyyy"], "status": "billed" }
```

- Scope forcé à la pharmacie courante + `paymentMethod='INSURANCE'` (prévention d'élévation de privilège).
- `status` whitelist (`pending`, `billed`, `paid`, `rejected`).
- Retourne le nombre de ventes mises à jour.

### 3.10 `GET /api/insurances/report`

Rapport JSON consommé par la page. Params :

| Param | Description |
|-------|-------------|
| `insuranceId` | (optionnel — omettre pour agréger toutes institutions) |
| `beneficiaryId` | Filtre sur un adhérent précis |
| `status` | `pending`, `billed`, `paid`, `rejected` |
| `dateFrom`, `dateTo` | Plage de dates (inclusives) |
| `search` | Recherche libre (customerName, customerPhone, id, claimRef, beneficiary.fullName, beneficiary.membershipNumber) |

Réponse : `{ institution, rows[], totals, dateFrom, dateTo, filters }` (cf. `src/lib/insurance-report.ts` pour les types).

### 3.11 `GET /api/insurances/report/pdf`

Mêmes paramètres, renvoie un HTML A4 auto-imprimable (pattern identique au rapport Carnet) — le navigateur ouvre automatiquement le dialogue d'impression. Ajoute un bouton « Imprimer / Enregistrer en PDF » visible uniquement à l'écran, et un paramètre `showItems=0` pour masquer le détail des articles.

---

## 4. Interface utilisateur

### 4.1 POS — panneau tiers payant

Apparaît dans `/dashboard/ventes` quand `paymentMethod=INSURANCE` :

1. **Chargement paresseux** des institutions à la première sélection du mode INSURANCE.
2. **Sélecteur institution** → déclenche le chargement des bénéficiaires.
3. **Sélecteur bénéficiaire** + bouton `+` pour créer un titulaire ou un ayant droit à la volée (modale ciblée).
4. **Taux pour cette vente (%)** : surcharge ponctuelle du taux institution, vide = défaut institution.
5. **N° de bon** : stocké dans `insuranceClaimRef`.
6. **Preview du split** (uniquement avec un bénéficiaire + un total > 0) : « Part institution (X%) » + « Reste patient » en temps réel.

> Sur soumission : `customerName` / `customerPhone` sont ignorés côté client pour les ventes INSURANCE — le serveur copie depuis le bénéficiaire (comme pour CREDIT).

### 4.2 Page `/dashboard/ventes/assurances`

Onglet « Assurances » dans le shell des ventes (gated RBAC : `insurance` ou rôle ADMIN/SUPER_ADMIN).

Trois sous-onglets :

#### Institutions

- Grille de cartes : nom + badge type, code, taux, nb bénéficiaires.
- Si agrégats disponibles : mini-cartes `Pris en charge` / `Réglé` / `Reste dû`.
- Actions par carte : modifier, désactiver, raccourcis « Bénéficiaires » + « Rapport ».
- Bouton « + Nouvelle institution » ouvre un modal CRUD.

#### Bénéficiaires

- Table détaillée (nom, n° affilié, lien, titulaire, téléphone).
- Badge `Titulaire` (bleu) vs autres (gris).
- Ajouter / modifier / désactiver (modale dédiée avec dropdown des titulaires actifs quand relation ≠ HOLDER).

#### Créances & rapport

- Filtres : statut, dateFrom, dateTo, recherche libre.
- Cartes de synthèse : Ventes, Pris en charge, Réglé, Reste dû.
- Actions : **Imprimer / PDF** (ouvre le HTML auto-imprimable), **Envoyer par e-mail** (ouvre un modal).
- Table des créances avec sélection multiple + **bulk update** du `insuranceClaimStatus`.
- Colonnes : date, n° reçu (8 derniers char), bénéficiaire (+ n° affilié + titulaire si ayant droit), bon, total, part institution (+ taux), patient, statut.

### 4.3 Export par e-mail

Le modal « Envoyer par e-mail » :
- Pré-remplit `to` avec `insurance.email`.
- Pré-remplit un objet + un corps FR incluant les totaux du rapport courant.
- Champs tous éditables.
- Au clic sur « Ouvrir e-mail + PDF » :
  1. Ouvre le PDF du rapport dans un nouvel onglet (pour que le pharmacien puisse le sauvegarder et l'attacher).
  2. Déclenche `mailto:` avec subject/body encodés → ouvre le client e-mail par défaut.

> Aucune infra SMTP côté serveur en v1 : l'envoi se fait via le client e-mail de l'utilisateur. Le PDF doit être attaché manuellement depuis le dialogue « nouveau message » (raison : la RFC `mailto:` ne permet pas de joindre un fichier).

---

## 5. Calcul du split tiers payant

Le split est calculé **à la soumission** côté serveur (source unique de vérité), puis persisté :

```typescript
// src/app/api/sales/route.ts (extrait)
const requestedRate = insuranceCoverage ?? insurance.coverageRate
storedInsuranceAmount = Math.round(((dueTotal * requestedRate) / 100) * 100) / 100
storedPatientAmount = Math.max(0, Math.round((dueTotal - storedInsuranceAmount) * 100) / 100)
```

- `dueTotal` = total de la vente **après** remise.
- `storedInsuranceAmount` stocké tel quel dans `insuranceAmount`.
- `storedPatientAmount` toujours ≥ 0 (protection contre les arrondis négatifs).
- `insuranceCoverage` est le taux **effectivement utilisé**, stocké pour l'historique.

Le preview côté frontend utilise la même formule — il peut différer légèrement d'un centime sur des taux non-entiers (arrondi). Le serveur reste autoritaire.

---

## 6. Statuts de créance

| Statut | Libellé | Sens |
|--------|---------|------|
| `pending` | À facturer | Vente enregistrée, créance non encore adressée à l'institution (défaut) |
| `billed` | Facturée | Dossier envoyé — en attente de règlement |
| `paid` | Réglée | Institution a payé — compte dans `totalPaid` |
| `rejected` | Rejetée | Institution refuse la prise en charge — exclu de `outstanding` |

**Règle d'agrégat (`outstanding`)** : une créance compte dans le reste à recouvrer **sauf si** elle est `paid` ou `rejected`. Une vente `pending` ou `billed` est donc encore « due ».

Mise à jour : via le bulk update du rapport (`PATCH /api/insurances/sales/status`) ou individuellement via un futur endpoint de détail vente (non implémenté en v1 — utiliser le bulk avec un seul ID).

---

## 7. RBAC & permissions

- Clé de menu : `'insurance'` dans `src/lib/rbac.ts` (`ALL_MENU_KEYS`).
- Rôles par défaut avec accès : `ADMIN`, `SUPER_ADMIN`, `CASHIER`, `ACCOUNTANT`.
- L'onglet « Assurances » dans le layout des ventes est visible si `permissions['insurance'] === true` ou rôle privilégié.
- Côté API : scoping strict par `session.pharmacyId` ; aucune route ne lit le `pharmacyId` depuis le body.

---

## 8. i18n

Bloc dédié `insurance` dans `src/lib/i18n/fr.ts` et `en.ts` (~70 clés) : `title`, `tab`, `institutions`, `beneficiaries`, `reports`, `typeAssurance`/`typeMutuelle`/`typeCmu`/`typeIpm`/`typeOther`, `relationshipHolder`/`Spouse`/`Child`/`Parent`/`Other`, `claimStatusPending`/`Billed`/`Paid`/`Rejected`, `exportPdf`, `sendByEmail`, `emailSubject`/`Body`/`Recipient`/`DefaultSubject`/`Hint`, etc.

---

## 9. Audit & logs

Toutes les écritures sensibles passent par `createAuditLog()` (entity = `insurance` ou `insurance_beneficiary` ou `sale`) :

| Action | Entity | Trigger |
|--------|--------|---------|
| `CREATE` | `insurance` | `POST /api/insurances` |
| `UPDATE` | `insurance` | `PUT /api/insurances/[id]` |
| `DELETE` | `insurance` | `DELETE /api/insurances/[id]` |
| `CREATE` / `UPDATE` / `DELETE` | `insurance_beneficiary` | routes `/beneficiaries` |
| `UPDATE` | `sale` (via bulk) | `PATCH /api/insurances/sales/status` |
| `SALE` | `sale` | `POST /api/sales` avec `paymentMethod=INSURANCE` (details inclut `insuranceId`/`beneficiaryId`/`insuranceAmount`) |

---

## 10. Règles métier & garde-fous

1. **Scope pharmacie** : toutes les requêtes lisent `pharmacyId` depuis le JWT (`getSession()`). Les bodies clients ne sont jamais fiables.
2. **Soft delete** : institutions et bénéficiaires utilisent `isActive=false` — les ventes historiques restent lisibles (via `onDelete: SetNull` côté Sale on est aussi protégé même en cas de suppression dure).
3. **Snapshot du taux** : `insuranceCoverage` est figé au moment de la vente. Modifier le `coverageRate` d'une institution ne recalcule jamais les ventes passées.
4. **Bénéficiaire obligatoire** : une vente INSURANCE sans bénéficiaire est rejetée côté serveur (400). Le POS bloque également la soumission.
5. **Holders/Dépendants cohérents** : on ne peut pas supprimer/demoter un titulaire qui a encore des ayants droit actifs (409) — désactiver d'abord les dépendants.
6. **Snapshot client** : `customerName` / `customerPhone` sont copiés depuis le bénéficiaire côté serveur pour que le reçu et l'historique soient cohérents.
7. **Mode `mailto:`** : pas d'infra SMTP en v1 ; l'e-mail ouvre le client e-mail local. Le PDF est ouvert dans un onglet parallèle pour l'attachement manuel.
8. **Format XOF** : tous les montants (split, totaux, rapport PDF) utilisent `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 })`.
