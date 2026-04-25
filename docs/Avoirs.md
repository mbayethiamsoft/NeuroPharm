# Avoirs (credit notes) — NeuroPharm v1

> **Règle anti-régression** : toute modification de ce flux (modèles, API, page, POS) **doit** mettre ce fichier à jour avant le merge.

---

## 1. Vue d'ensemble

Un **avoir** est un document qui représente une somme due au client par la pharmacie. Il est émis quand la pharmacie ne peut pas (ou ne veut pas) rembourser le client en espèces et préfère lui ouvrir un crédit utilisable lors d'un prochain passage.

Cas d'usage métier :
- **Retour de produit** (mauvais conditionnement, refus du patient…)
- **Erreur de facturation** sur une vente déjà encaissée
- **Annulation partielle** d'une vente
- **Ordonnance partielle** : une partie des médicaments n'est pas en stock — on encaisse la totalité, on délivre ce qui est dispo, et on émet un avoir pour la valeur du manquant

L'avoir possède un **solde** qui décroît au fur et à mesure de ses utilisations dans le POS. Tant qu'il reste du solde et qu'il n'est ni annulé ni expiré, il est consommable.

**Fichiers principaux**

| Fichier | Rôle |
|---------|------|
| `prisma/schema.prisma` | Modèles `CreditNote` + `CreditNoteUsage` (+ relations sur Sale, Customer, Pharmacy) |
| `src/lib/credit-note.ts` | Constantes (raisons, statuts), helpers (`deriveCreditNoteStatus`, `formatCreditNoteNumber`) |
| `src/lib/receipt.ts` | Ajout `CreditNoteReceipt`, `buildCreditNoteReceiptHtml`, `printCreditNoteReceipt` ; ligne « Avoir » sur le reçu de vente |
| `src/lib/rbac.ts` | Clé menu `credit_notes` (CASHIER + ACCOUNTANT par défaut) |
| `src/lib/i18n/{fr,en}.ts` | Section `creditNotes` (~50 clés) |
| `src/app/api/credit-notes/route.ts` | `GET` liste + agrégats, `POST` création |
| `src/app/api/credit-notes/[id]/route.ts` | `GET` détail + historique d'utilisation, `PATCH` (annulation / édition légère), `DELETE` (refusé si déjà utilisé) |
| `src/app/api/credit-notes/redeemable/route.ts` | Endpoint dédié POS : avoirs réutilisables uniquement (cap 25) |
| `src/app/api/sales/route.ts` | `POST` étendu : accepte `creditNoteId` + `creditNoteAmount`, valide, consomme atomiquement |
| `src/app/dashboard/ventes/avoirs/page.tsx` | UI complète : stats, table/cards, modals création + détail |
| `src/app/dashboard/ventes/layout.tsx` | Ajoute l'onglet « Avoirs » (check permission `credit_notes`) |
| `src/app/dashboard/ventes/page.tsx` | Section POS « Avoir (optionnel) » : recherche, application, badge |

---

## 2. Modèles Prisma

### `CreditNote`

```prisma
model CreditNote {
  id            String   @id @default(cuid())
  pharmacyId    String
  pharmacy      Pharmacy @relation(fields: [pharmacyId], references: [id], onDelete: Cascade)
  customerId    String?
  customer      Customer? @relation(fields: [customerId], references: [id])
  customerName  String?
  customerPhone String?
  originSaleId  String?
  originSale    Sale?    @relation("CreditNoteOrigin", fields: [originSaleId], references: [id])
  reason        String   @default("OTHER")  // RETURN | BILLING_ERROR | CANCELLATION | PARTIAL_PRESCRIPTION | OTHER
  amount        Float                       // montant émis (figé après création)
  usedAmount    Float    @default(0)        // somme consommée par les usages
  status        String   @default("active") // active | partially_used | used | expired | cancelled
  expiresAt     DateTime?
  notes         String?
  createdBy     String?
  usages        CreditNoteUsage[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([pharmacyId, status])
  @@index([pharmacyId, customerId])
  @@map("credit_notes")
}
```

- `customerId` est **optionnel** : on accepte les avoirs anonymes (porteur). Quand un client est rattaché on **snapshot** son nom/téléphone (`customerName`/`customerPhone`) — comme pour `Sale` — pour préserver l'historique même si le client est renommé/supprimé.
- `originSaleId` est facultatif : un avoir peut être émis ex-nihilo (geste commercial) ou rattaché à la vente d'origine (retour, erreur).
- Le `status` stocké en base est le **statut brut** ; le statut effectif (qui prend en compte l'expiration et le solde épuisé) est calculé à la lecture par `deriveCreditNoteStatus()` — voir §6.

### `CreditNoteUsage`

```prisma
model CreditNoteUsage {
  id           String     @id @default(cuid())
  pharmacyId   String
  pharmacy     Pharmacy   @relation(fields: [pharmacyId], references: [id], onDelete: Cascade)
  creditNoteId String
  creditNote   CreditNote @relation(fields: [creditNoteId], references: [id], onDelete: Cascade)
  saleId       String
  sale         Sale       @relation(fields: [saleId], references: [id])
  amount       Float
  createdAt    DateTime   @default(now())

  @@index([pharmacyId, creditNoteId])
  @@index([pharmacyId, saleId])
  @@map("credit_note_usages")
}
```

Une ligne par utilisation dans une vente. Permet la traçabilité complète (quelle vente a consommé combien sur quel avoir).

### Relations ajoutées sur `Sale`

```prisma
model Sale {
  // …
  creditNoteAmount  Float?                                    // montant payé via avoir sur cette vente
  creditNoteUsages  CreditNoteUsage[]                         // détail des avoirs consommés (1:N)
  creditNotesIssued CreditNote[]      @relation("CreditNoteOrigin") // avoirs nés de cette vente
}
```

> Après tout changement : `npm run db:push && npm run db:generate` (cf. règle CLAUDE.md).

---

## 3. RBAC

- Clé menu : `credit_notes` (entre `credit` et `insurance` dans `ALL_MENU_KEYS`).
- **Permissions par défaut** : visible pour `CASHIER` et `ACCOUNTANT` (en plus de `ADMIN`/`SUPER_ADMIN`). `PHARMACIST` et `CHIEF_PHARMACIST` peuvent l'avoir via permission individuelle (`UserPermission`).
- Label sidebar : `MENU_LABELS.credit_notes = { fr: 'Avoirs', en: 'Credit notes' }`.
- L'onglet POS (`src/app/dashboard/ventes/layout.tsx`) lit la permission `credit_notes` ; les non-autorisés ne voient ni l'onglet, ni la page.

---

## 4. Routes API

Toutes les routes filtrent par `pharmacyId` extrait du JWT (jamais du body). Toutes les écritures produisent un `AuditLog`.

### `GET /api/credit-notes`

Liste + agrégats. Paramètres :
- `search` — match sur les 8 derniers car. de l'`id` (n° d'avoir), `customerName`, `customerPhone`
- `status` — filtre sur le statut **effectif** (`active|partially_used|used|expired|cancelled`)
- `customerId` — restreindre à un client
- `dateFrom` / `dateTo` — bornes sur `createdAt`
- `limit` / `offset` — pagination

Réponse :
```json
{
  "creditNotes": [{ "...": "...", "remaining": 1500, "effectiveStatus": "partially_used" }],
  "totals": {
    "totalIssued": 25000,
    "totalUsed": 8000,
    "outstanding": 17000,
    "activeCount": 6
  }
}
```

### `POST /api/credit-notes`

Crée un avoir.

Body :
```json
{
  "amount": 5000,                       // requis, > 0
  "reason": "PARTIAL_PRESCRIPTION",     // dans CREDIT_NOTE_REASONS
  "customerId": null,                   // ou cuid client
  "customerName": "Mme Diop",           // utilisé si customerId absent
  "customerPhone": "77...",
  "originSaleId": "cuid de la vente",   // facultatif
  "expiresAt": "2026-12-31",            // facultatif (mis à 23:59:59)
  "notes": "Manque Doliprane 1000"
}
```

Audit log : `CREDIT_NOTE_CREATE`.

### `GET /api/credit-notes/[id]`

Détail enrichi (`remaining`, `effectiveStatus`) avec `customer`, `originSale` et l'historique `usages` (incluant la `sale` associée).

### `PATCH /api/credit-notes/[id]`

Deux modes :

1. **Annulation** : `{ "action": "cancel" }` → status devient `cancelled`. Refusé si déjà annulé. Audit log `CREDIT_NOTE_CANCEL`. L'avoir reste consultable mais n'est plus consommable au POS.
2. **Édition légère** : `{ "notes": "...", "expiresAt": "YYYY-MM-DD" | null }`. Le **montant** et le **motif** sont **figés après création** — pour les changer : annuler puis recréer. Audit log `UPDATE`.

### `DELETE /api/credit-notes/[id]`

Suppression définitive. **Refusée si `usedAmount > 0`** — préférer l'annulation. Audit log `DELETE`.

### `GET /api/credit-notes/redeemable`

Endpoint dédié au POS. Retourne uniquement les avoirs réutilisables :
- `status != cancelled`
- `expiresAt = null` OU `expiresAt > now` (filtre SQL)
- `remaining > 0` (filtre Node, post-enrichissement)

Plafonné dur à **25 résultats** pour éviter de polluer le dropdown de la caisse. Accepte `search` (n° / nom / téléphone) ou `customerId`.

---

## 5. Intégration POS (`/api/sales`)

Le `POST /api/sales` accepte deux nouveaux champs optionnels :

```json
{
  "creditNoteId": "cuid de l'avoir",
  "creditNoteAmount": 1500
}
```

### Validations (avant transaction)

1. **`paymentMethod === 'INSURANCE'` interdit** avec un avoir en v1 (le split tiers-payant est trop ambigu — on tranchera à la v2 si besoin).
2. L'avoir doit exister, appartenir à la pharmacie, ne pas être annulé/expiré/épuisé.
3. `creditNoteAmount` doit être `> 0`, `<= remaining` (avec tolérance 0.009 pour les flottants), et `<= total`.

### Consommation atomique (compare-and-set)

À l'intérieur de la transaction Prisma :
1. Re-lire l'avoir avec `tx.creditNote.findUnique` (état frais).
2. Re-vérifier `remaining` — si entre temps une autre vente a consommé du solde, on **throw** et la transaction est rollback (la vente n'est pas créée).
3. Calculer `newUsedAmount` et `newStatus` (`used` si `newUsedAmount + 0.009 >= amount`, sinon `partially_used`).
4. `tx.creditNote.update({ data: { usedAmount, status } })`.
5. `tx.creditNoteUsage.create(...)` — trace l'utilisation.

La `Sale` créée porte `creditNoteAmount`. Un `AuditLog` `CREDIT_NOTE_USE` est ajouté **après** la transaction (best-effort — il n'invalide pas la vente s'il échoue).

### Impact sur les autres validations

- **CASH** : la validation `amountPaid >= total` est calculée sur **`dueAfterCreditNote = total - creditNoteAmount`**.
- **CREDIT (carnet)** : le contrôle de plafond utilise également `dueAfterCreditNote` — l'avoir réduit la dette portée au carnet.
- Le champ `Sale.total` reste le **total brut** ; la décrémentation de stock et les calculs comptables s'appuient dessus comme avant.

---

## 6. Statut effectif

Le statut stocké en base évolue uniquement à l'écriture (création, consommation, annulation). L'**expiration** est calculée à la volée à la lecture par :

```ts
deriveCreditNoteStatus({ amount, usedAmount, expiresAt, status }): CreditNoteStatus
```

Ordre de priorité :
1. `cancelled` (figé) → `cancelled`
2. `expiresAt < now` → `expired`
3. `usedAmount + 0.009 >= amount` → `used`
4. `usedAmount > 0` → `partially_used`
5. sinon → `active`

Avantage : pas de cron à maintenir pour passer les avoirs en `expired` — le calcul reste cohérent même si l'horloge dérive.

Le filtre `?status=expired` côté `GET /api/credit-notes` est appliqué **côté Node** après enrichissement (pas en SQL).

---

## 7. Page UI `/dashboard/ventes/avoirs`

**Composant** : `src/app/dashboard/ventes/avoirs/page.tsx` (client).

**Sections** :
- 4 stat cards : `Total émis` (indigo), `Total utilisé` (ambre), `Solde en circulation` (vert), `Avoirs actifs` (violet).
- Toolbar : recherche (debounce 300 ms), select statut, dateFrom/dateTo, refresh, bouton « Nouvel avoir » (violet).
- Table desktop / cards mobile : n°, date, motif, nom, montant initial, utilisé, restant, badge statut, actions (voir, imprimer).
- **Modal création** : montant, motif (select), client (dropdown OU nom/téléphone libre), `originSaleId`, `expiresAt`, notes. Auto-impression du reçu après création.
- **Modal détail** : 3 small stats, table d'infos (motif, statut, dates, client, vente d'origine), historique des `usages`, actions (réimprimer, supprimer si jamais utilisé, annuler).

**Couleur de marque** : violet (`#6d28d9`) — pour distinguer visuellement des modules vente (vert) et carnet (ambre).

---

## 8. Reçu d'avoir

`buildCreditNoteReceiptHtml` (dans `src/lib/receipt.ts`) génère un reçu A6 imprimable :
- En-tête pharmacie
- Titre « Bon d'avoir » + n° (8 derniers car. de l'`id`, en majuscules — cf. `formatCreditNoteNumber`)
- Motif d'émission
- Bloc client (si rattaché)
- Montant en gros encart violet
- Tableau ventilation (montant initial, utilisé, restant)
- Référence vente d'origine (si applicable)
- Date d'expiration (si applicable)
- Notes
- Conditions d'utilisation au pied

`printCreditNoteReceipt(receipt)` ouvre une popup et déclenche `window.print()` automatiquement.

### Reçu de vente : ligne « Avoir » + « Net à payer »

Quand une vente consomme un avoir, le reçu de vente affiche entre la ligne « Total à payer » et le bloc espèces :
```
Avoir n° XXXXXXXX            -1 500 XOF
Net à payer                   3 500 XOF
```

---

## 9. POS — Section « Avoir (optionnel) »

Visible pour tous les paiements **sauf `INSURANCE`** :
- Champ recherche (n° / nom / téléphone, debounce 300 ms) → liste max 5 résultats avec solde restant.
- Sélection : badge violet montrant le n°, le solde dispo, le client (si nommé) et un input « montant à utiliser » (par défaut `min(remaining, total)`).
- Bouton X pour retirer l'avoir.
- Reset automatique au switch vers `INSURANCE` ou après vente validée.

Le total affiché à droite reste le total brut ; deux lignes supplémentaires apparaissent quand un avoir est appliqué :
```
Total                 5 000 XOF
Avoir appliqué       -1 500 XOF
Net à payer           3 500 XOF
```

Le bouton « Exact » et le calcul de monnaie en CASH utilisent `dueAfterCreditNote`.

---

## 10. Règles métier

- **Montant figé** : après création, `amount` et `reason` sont immuables. Pour corriger : annuler + recréer.
- **Suppression** : refusée si l'avoir a été utilisé (préserver la traçabilité). Préférer l'annulation.
- **Annulation** : statut `cancelled` permanent ; ne libère **pas** les usages déjà consommés (la vente concernée n'est pas modifiée).
- **Expiration** : calculée à la lecture, pas de cron. Un avoir expiré disparaît du POS mais reste consultable dans la liste.
- **Anonyme** : pas de `customerId` requis ; on garde un `customerName` snapshot facultatif. Tout porteur de l'avoir peut l'utiliser.
- **Multi-utilisation** : un même avoir peut être utilisé sur plusieurs ventes (le solde décroît à chaque fois).
- **Pas de cumul d'avoirs** sur une vente en v1 (un seul avoir par vente côté POS — l'API n'accepte qu'un `creditNoteId` à la fois).
- **Race condition** : compare-and-set inside transaction (cf. §5).

---

## 11. Audit trail

Toute action sensible produit un `AuditLog` (scopé `pharmacyId`) :

| Action | Quand |
|--------|-------|
| `CREDIT_NOTE_CREATE` | À la création (`POST /api/credit-notes`) |
| `CREDIT_NOTE_CANCEL` | Annulation (`PATCH ... { action: "cancel" }`) |
| `CREDIT_NOTE_USE` | Consommation dans une vente (post-transaction) |
| `UPDATE` | Édition notes/expiration |
| `DELETE` | Suppression (uniquement si jamais utilisé) |

Détails sérialisés en JSON dans `AuditLog.details` (montant, motif, client, vente associée…).

---

## 12. Évolutions futures (post-MVP)

- **Cumul d'avoirs** sur une vente (envoyer un tableau `creditNoteIds[]`).
- **Conversion espèces** : autoriser un remboursement en cash d'un avoir (pour les avoirs anciens jamais consommés).
- **Notification d'expiration** : alerte 7 jours avant `expiresAt` pour les avoirs significatifs.
- **Rapport PDF** des avoirs en circulation (sur le modèle de `carnet/report/pdf`).
- **Lien INSURANCE** : décider d'un comportement non-ambigu pour le tiers payant.
- **Conversion vente → avoir** : un bouton « émettre un avoir » directement depuis l'historique des ventes (`/dashboard/ventes/historique`) qui pré-remplit le motif et l'`originSaleId`.
