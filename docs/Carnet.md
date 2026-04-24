# Carnet (crédit client) — NeuroPharm v1

> **Règle anti-régression** : toute modification de ce flux (API, page, logique frontend) **doit** mettre ce fichier à jour avant le merge.

---

## 1. Vue d'ensemble

En Afrique de l'Ouest (et particulièrement au Sénégal), beaucoup de pharmacies pratiquent la **vente à crédit** pour leurs clients réguliers : le patient repart avec ses médicaments sans payer, et la pharmacie tient un **carnet** des sommes dues. Le client rembourse ensuite par versements successifs.

Le module Carnet implémente cette pratique :
- Un **Customer** (client) est créé avec éventuellement un **plafond de crédit** (`creditLimit`)
- Les ventes POS avec `paymentMethod=CREDIT` sont rattachées au client et incrémentent son solde dû
- Les **remboursements** (`CreditPayment`) décrémentent le solde — chaque paiement produit un **reçu imprimable**
- Un **rapport PDF** (HTML imprimable) liste tous les clients avec soldes et permet filtres / export

**Fichiers principaux**

| Fichier | Rôle |
|---------|------|
| `src/app/dashboard/ventes/carnet/page.tsx` | UI du carnet : liste clients, filtres, modals détail/paiement/création, export PDF |
| `src/app/dashboard/ventes/layout.tsx` | Ajoute l'onglet « Carnet » (check permission `credit`) |
| `src/app/api/customers/route.ts` | `GET` liste + agrégats soldes, `POST` création |
| `src/app/api/customers/[id]/route.ts` | `GET` détail (ventes + paiements + solde), `PUT` update, `DELETE` soft delete |
| `src/app/api/customers/[id]/payments/route.ts` | `POST` enregistrer un remboursement |
| `src/app/api/carnet/report/route.ts` | `GET` rapport JSON (filtres) |
| `src/app/api/carnet/report/pdf/route.ts` | `GET` rapport HTML auto-imprimable |
| `src/lib/carnet-report.ts` | Helper `buildCarnetReport` : construit les données du rapport |
| `src/lib/carnet-report-html.ts` | Helper `buildCarnetReportHtml` : rend le HTML imprimable |
| `src/lib/receipt.ts` | Ajout de `PaymentReceipt`, `buildPaymentReceiptHtml`, `printPaymentReceipt` |

---

## 2. Modèles Prisma

### `Customer`

```prisma
model Customer {
  id          String          @id @default(cuid())
  pharmacyId  String
  pharmacy    Pharmacy        @relation(fields: [pharmacyId], references: [id], onDelete: Cascade)
  fullName    String
  phone       String?
  address     String?
  notes       String?
  creditLimit Float           @default(0) // 0 = pas de limite
  isActive    Boolean         @default(true)
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  sales       Sale[]
  payments    CreditPayment[]

  @@unique([pharmacyId, phone])
  @@index([pharmacyId, isActive])
  @@map("customers")
}
```

- `@@unique([pharmacyId, phone])` : deux clients ne peuvent pas partager le même téléphone au sein d'une pharmacie. NULL est autorisé plusieurs fois.
- Soft delete via `isActive = false`.

### `CreditPayment`

```prisma
model CreditPayment {
  id          String   @id @default(cuid())
  pharmacyId  String
  pharmacy    Pharmacy @relation(fields: [pharmacyId], references: [id], onDelete: Cascade)
  customerId  String
  customer    Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  amount      Float
  method      String   @default("CASH") // CASH, MOBILE_MONEY, CARD
  receivedBy  String?  // userId du vendeur qui a encaissé
  notes       String?
  createdAt   DateTime @default(now())

  @@index([pharmacyId, customerId])
  @@map("credit_payments")
}
```

### `Sale` — ajout

```prisma
customerId    String?
customer      Customer? @relation(fields: [customerId], references: [id], onDelete: SetNull)

@@index([pharmacyId, customerId])
```

> Pour une vente POS avec `paymentMethod=CREDIT`, `customerId` est **obligatoire** (validé côté serveur). Pour les autres modes, il reste optionnel (et typiquement `null`).

### Calcul du solde

Le solde n'est **jamais stocké** : il est recalculé à la demande.

```
totalDebt(customer) = Σ Sale.total WHERE customerId = X AND paymentMethod = CREDIT AND status ≠ 'cancelled'
totalPaid(customer) = Σ CreditPayment.amount WHERE customerId = X
balance(customer)   = totalDebt − totalPaid
```

Rationale : évite les incohérences entre solde stocké et historique en cas de remboursement, annulation, ou correction manuelle.

---

## 3. RBAC

Permission menu **`credit`** (séparée de `sales`).

| Rôle | Accès par défaut |
|------|------------------|
| `ADMIN` | ✅ toujours |
| `PHARMACIST` | ❌ par défaut (configurable via `UserPermission`) |
| `CASHIER` | ✅ (les caissiers gèrent le carnet au comptoir) |
| `ACCOUNTANT` | ✅ (pour consulter/exporter le rapport) |

L'onglet « Carnet » dans `/dashboard/ventes/` n'apparaît que si :
- l'utilisateur est ADMIN / SUPER_ADMIN, **ou**
- `permissions['credit'] === true`

Cf. `src/lib/rbac.ts` — `ALL_MENU_KEYS`, `DEFAULT_PERMISSIONS`, `MENU_LABELS`.

---

## 4. Routes API

### `GET /api/customers`

Retourne la liste des clients actifs avec agrégats soldes.

**Query params :**

| Paramètre | Description |
|-----------|-------------|
| `search` | Filtre par nom ou téléphone (insensitive) |
| `filter` | `inDebt` / `settled` (filtré côté serveur après calcul) |
| `dateFrom` / `dateTo` | Plage de dates appliquée aux ventes et paiements inclus dans le calcul d'agrégats |
| `limit` / `offset` | Pagination (défaut limit=100, max 500) |

**Réponse :**
```json
{
  "customers": [
    {
      "id": "clxxx",
      "fullName": "Amadou Diallo",
      "phone": "771234567",
      "creditLimit": 50000,
      "totalDebt": 42000,
      "totalPaid": 30000,
      "balance": 12000
    }
  ],
  "totals": { "totalCount": 12, "inDebtCount": 7, "totalDebt": 200000, "totalPaid": 150000, "balance": 50000 }
}
```

### `POST /api/customers`

Crée un client. Validation : `fullName` requis, `creditLimit ≥ 0`, téléphone unique par pharmacie si renseigné. Écrit un `AuditLog` `CREATE / customer`.

### `GET /api/customers/[id]`

Détail complet : fiche client, ventes CREDIT (avec items + vendeur), paiements, totaux calculés. Vérifie `pharmacyId` du JWT.

### `PUT /api/customers/[id]`

Update partiel. Même règles que POST. Conflit 409 si téléphone déjà utilisé. Audit log `UPDATE / customer`.

### `DELETE /api/customers/[id]`

Soft delete (`isActive = false`). Les ventes et paiements historiques sont **conservés**. Audit log `DELETE / customer`.

### `POST /api/customers/[id]/payments`

Enregistre un remboursement.

**Corps :**
```json
{ "amount": 5000, "method": "CASH", "notes": "Versement partiel" }
```

**Validations :**
- `amount > 0`
- `method ∈ { CASH, MOBILE_MONEY, CARD }`
- `amount ≤ balance` (anti surpaiement — erreur 400 sinon, avec le solde actuel dans le message)

**Effets :**
1. Crée `CreditPayment` avec `receivedBy = session.userId`
2. Écrit `AuditLog` `CREDIT_PAYMENT / credit_payment`
3. Retourne `{ payment, customer, balance (nouveau), previousBalance, cashier }` — suffisant pour imprimer le reçu immédiatement côté client.

### `GET /api/carnet/report`

Version JSON du rapport Carnet. Mêmes filtres que `/api/customers` + plage de dates appliquée aux agrégats. Retourne `{ rows, totals, dateFrom, dateTo }`.

### `GET /api/carnet/report/pdf`

Renvoie une page HTML standalone, auto-imprimable (script `window.print()` au `load`). Le navigateur propose « Enregistrer au format PDF » dans le dialogue d'impression — c'est ainsi que l'utilisateur obtient son PDF.

> ⚠️ **Pas de librairie PDF côté serveur** : pour garder le bundle léger, on utilise le moteur d'impression du navigateur, comme pour les reçus de vente. Si un besoin de génération PDF headless apparaît (ex. envoi automatique par e-mail), envisager `pdfkit` ou `puppeteer`.

---

## 5. Point de vente (POS) — changement CREDIT

Dans `/dashboard/ventes/page.tsx` :

1. Le mode `CREDIT` est désormais le **5ᵉ bouton** dans la grille des modes de paiement.
2. Lorsque CREDIT est sélectionné :
   - Un panneau ambre apparaît avec un **select** listant les clients actifs + leur solde courant
   - Un bouton « + » ouvre une **modal de création rapide** (nom, téléphone, plafond)
   - Le solde et le plafond du client sélectionné s'affichent en direct
   - Si le total de la vente + solde actuel dépasse le plafond, un avertissement rouge apparaît (**l'API bloquera la vente**)
3. La validation de la vente envoie `customerId` dans le body. Le serveur :
   - Vérifie que le client existe et appartient à la pharmacie
   - Vérifie que `balance + total ≤ creditLimit` si `creditLimit > 0`
   - Écrit la vente avec `customerId`, `customerName` et `customerPhone` copiés depuis le client (les champs texte du ticket restent alimentés automatiquement)

---

## 6. Reçu de remboursement

Quand un paiement est enregistré via la modal, `printPaymentReceipt` ouvre une popup imprimable (même pattern que le reçu de vente).

Le reçu inclut :
- En-tête pharmacie (nom, adresse, téléphone, NINEA)
- Titre « Reçu de paiement carnet »
- N° de reçu (8 derniers caractères de `CreditPayment.id`), date/heure
- Encaissé par (vendeur), mode de paiement
- Bloc client (nom + téléphone)
- **Montant du versement** (en gros, encadré vert)
- Tableau : solde avant → versement → solde restant dû
- Note (si renseignée)
- Badge « Carnet soldé » si le nouveau solde ≤ 0

> ⚠️ Comme pour les reçus de vente : la popup **ne se ferme pas automatiquement** après impression (incident historique — certains navigateurs ferment avant que l'utilisateur ait validé).

---

## 7. Page Carnet (`/dashboard/ventes/carnet`)

### KPIs (4 cartes)

| Carte | Contenu |
|-------|---------|
| Clients actifs | `totals.totalCount` |
| Clients en dette | `totals.inDebtCount` |
| Total dû (période) | Somme des totaux ventes CREDIT dans la période sélectionnée |
| Solde global | `totalDebt - totalPaid` |

### Filtres

- Recherche (nom ou téléphone, debounce 300 ms)
- Statut : tous / en dette uniquement / soldé uniquement
- Plage de dates (appliquée aux agrégats ventes+paiements)

### Tableau (desktop) / cartes (mobile)

Colonnes : Nom, Téléphone, Plafond, Total dû, Total remboursé, Solde, Statut (badge), Actions (Détail / Édition / Désactivation).

### Modal détail client

- Fiche (nom, téléphone, adresse, notes)
- 3 boxes résumé (Total dû, Total remboursé, Solde)
- Bloc plafond si défini
- Liste des remboursements (avec bouton « Enregistrer un paiement » si solde > 0)
- Liste des ventes à crédit (date, n° reçu, nb articles, vendeur, total)

### Modal paiement

- Affiche le solde courant du client
- Montant (XOF) requis, Mode (CASH/MOBILE_MONEY/CARD), Note (facultative)
- Validation client : montant > 0 et ≤ solde
- À la validation : POST API → reçu PDF popup → rafraîchissement liste + détail

### Export PDF

Bouton « Exporter en PDF » (noir) dans la barre d'actions. Ouvre `/api/carnet/report/pdf` dans un nouvel onglet avec tous les filtres actifs. La page s'auto-imprime ; l'utilisateur choisit « Enregistrer en PDF » dans le dialogue.

---

## 8. i18n

Nouvelle section `t.carnet.*` dans `src/lib/i18n/fr.ts` et `src/lib/i18n/en.ts`, référencée dans l'interface `Translations`.

Principales clés : `title`, `tab`, `newCustomer`, `creditLimit`, `balance`, `totalDebt`, `totalPaid`, `recordPayment`, `savePayment`, `exportPdf`, `inDebt`, `settled`, `creditLimitExceeded`, `amountExceedsBalance`, `deleteCustomerConfirm`, etc.

---

## 9. Règles métier

1. **Un client CREDIT = un Customer** : la vente crédit sans `customerId` est refusée (400). L'interface POS masque le bouton « Valider » effectivement utile tant que le client n'est pas choisi (erreur affichée).
2. **Plafond = 0 → pas de limite**. Valeur > 0 → bloquée au dépassement.
3. **Pas d'annulation de paiement en v1** : si erreur de saisie, SuperAdmin doit intervenir en DB (ou ajouter une route `DELETE /credit-payments/[id]` en v1.1).
4. **Soft delete client** : désactiver un client masque sa ligne dans la liste mais ne touche pas à ses ventes / paiements. Pour réactiver : changer `isActive` en base (pas d'UI en v1).
5. **Stock** : une vente CREDIT décrémente le stock exactement comme une vente CASH (voir `docs/Ventes.md`). Aucune différence côté inventaire.
6. **Historique des ventes** : les ventes CREDIT apparaissent dans `/dashboard/ventes/historique` avec le badge CREDIT, comme avant. La nouveauté est qu'elles référencent désormais un client de la table `customers`.
7. **Reçus** : reçu de vente normal à la validation POS ; reçu de paiement distinct à chaque remboursement.

---

## 10. Audit trail

| Événement | Action | Entity |
|-----------|--------|--------|
| Création client | `CREATE` | `customer` |
| Modification client | `UPDATE` | `customer` |
| Désactivation client | `DELETE` | `customer` |
| Enregistrement paiement | `CREDIT_PAYMENT` | `credit_payment` |
| Vente CREDIT | `SALE` | `sale` (inchangé) |

Tous vers `AuditLog` (scopé `pharmacyId`). Jamais `SystemLog` — le carnet est intra-pharmacie.

---

## 11. Évolutions v1.x à envisager

- **Annulation de paiement** (route `DELETE /api/customers/[id]/payments/[paymentId]` + audit)
- **Statement PDF individuel** (par client, plutôt que global)
- **Notifications automatiques** quand un client dépasse 80 % de son plafond
- **Export CSV** (actuellement PDF uniquement sur demande produit v1)
- **SMS au client** avec le solde restant après paiement (Wave SMS API)
