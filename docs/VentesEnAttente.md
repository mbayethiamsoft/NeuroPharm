# Ventes en attente (Pending Sales)

## But

Permettre au pharmacien de **mettre en pause** une transaction du point de vente, puis de la **reprendre** plus tard sans tout ressaisir, dans les cas typiques :

- Le client n'a pas encore payé (revient plus tard)
- Médicament temporairement indisponible (commande fournisseur en cours)
- Élément administratif manquant (ordonnance, carte mutuelle/CMU)
- Attente d'accord de prise en charge assurance

> **Vente en attente ≠ Pro forma.** Une pro forma est un devis estimatif (intention commerciale, sans projection de finalisation). Une vente en attente est une **vente réelle interrompue** : le panier, le client, le mode de paiement et le contexte (assurance, avoir, ordonnance) sont sauvegardés tels quels.

> **Vente en attente ≠ Carnet (crédit).** Une vente carnet est **finalisée** (status='completed', stock décrémenté) — le client doit simplement de l'argent. Une vente en attente n'existe pas encore comptablement.

## Décisions de conception

1. **Pas de réservation de stock.** Mettre une vente en attente n'a aucun impact sur les `Medication.shelfQuantity` ni sur le `StockMovement`. Le stock est revérifié uniquement à la reprise (avertissement non bloquant si insuffisant).
2. **Tables séparées** `PendingSale` + `PendingSaleItem` (mirror de `Proforma`/`ProformaItem`). Le modèle `Sale` reste **inchangé** — les rapports, comptabilité, carnet, assurances ne sont pas impactés.
3. **Raison obligatoire** + note libre optionnelle. La raison est un enum (string en DB, validé côté API).
4. **Reprise = hydratation POS via `?pendingId=X`** (pattern identique à proforma). À la finalisation, la `PendingSale` passe `status='converted'` avec `convertedSaleId`.
5. **Annulation = soft delete** (status='cancelled'), pas de suppression DB — préserve l'audit.

## Modèles Prisma (`prisma/schema.prisma`)

### `PendingSale`
- `id`, `pharmacyId`, `userId` (auteur)
- Snapshot panier : `subtotal`, `discount`, `discountRate`, `tax`, `total`
- Snapshot client : `customerName`, `customerPhone`, `customerId` (optionnel)
- Mode paiement prévu : `paymentMethod` (CASH | MOBILE_MONEY | CARD | INSURANCE | CREDIT)
- Contexte assurance : `insuranceId`, `beneficiaryId`, `insuranceCoverage`
- Avoir éventuellement appliqué : `creditNoteId`, `creditNoteAmount`
- Métadonnées : `reason` (NO_PAYMENT | MISSING_PRESCRIPTION | AWAITING_INSURANCE | OUT_OF_STOCK | OTHER), `note`, `isPrescription`
- Cycle de vie : `status` (active | converted | cancelled), `convertedSaleId`, `convertedAt`
- Index : `(pharmacyId, status)`, `(pharmacyId, createdAt)`

### `PendingSaleItem`
- `id`, `pendingSaleId`
- Snapshot médicament : `medicationId` (nullable si supprimé), `medicationName`, `medicationRef`, `quantity`, `unitPrice`, `total`

## Endpoints API

| Méthode | Route | Description | Audit |
|---------|-------|-------------|-------|
| `GET` | `/api/sales/pending` | Liste paginée. Filtres : `status` (default `active`), `reason`, `search`, `dateFrom`/`dateTo` | — |
| `POST` | `/api/sales/pending` | Crée une vente en attente. **Aucun impact stock**. `reason` obligatoire | `CREATE_PENDING_SALE` |
| `GET` | `/api/sales/pending/[id]` | Détail (items + auteur) | — |
| `PATCH` | `/api/sales/pending/[id]` | Met à jour `reason` et/ou `note` (uniquement si status=`active`) | `UPDATE_PENDING_SALE` |
| `DELETE` | `/api/sales/pending/[id]` | Annule (soft) — passe à status=`cancelled` | `CANCEL_PENDING_SALE` |
| `POST` | `/api/sales/pending/[id]/convert` | Marque comme convertie. Body : `{ convertedSaleId }`. Appelé **après** la création de la vraie `Sale` côté POS | `CONVERT_PENDING_SALE` |

Toutes les routes filtrent par `pharmacyId` du JWT (multi-tenant strict).

## Flux UI

### 1. Mise en attente (depuis le POS)

Bouton **horloge** à côté de « Valider la vente ». Désactivé tant que le panier est vide.

→ Ouvre une modale : sélecteur de raison (5 options i18n) + note libre.

→ `POST /api/sales/pending` avec **tout le contexte du panier** : items, mode de paiement, client carnet, institution + bénéficiaire assurance, avoir appliqué, ordonnance.

→ Reset complet du panier au succès. Le pharmacien retrouve sa vente dans l'onglet **« En attente »**.

### 2. Reprise

Depuis `/dashboard/ventes/en-attente`, bouton **▶ Reprendre** → redirige vers `/dashboard/ventes?pendingId=X`.

Le POS :
- charge la `PendingSale`,
- hydrate le panier en re-résolvant chaque `medicationId` depuis le catalogue,
- restaure le mode de paiement, le client, l'institution, le bénéficiaire, le taux de couverture, le statut ordonnance,
- affiche un **bandeau orange** indiquant qu'on travaille sur une vente en attente,
- affiche un **avertissement** si une ligne a un stock courant inférieur à la quantité demandée (le pharmacien ajuste manuellement),
- supprime le ?pendingId au succès et appelle `POST /api/sales/pending/[id]/convert` avec l'id de la vraie `Sale` créée.

### 3. Annulation

Bouton 🗑 dans la liste → confirmation → `DELETE /api/sales/pending/[id]` → status `cancelled`. Reste consultable via le filtre « Annulées ».

### 4. Modification (raison/note uniquement)

Bouton ✏️ dans la liste → modale → `PATCH /api/sales/pending/[id]` avec `{ reason, note }`. Pour modifier le panier, il faut reprendre la vente puis la remettre en attente (qui crée une nouvelle entrée).

## RBAC

Clé de permission : **`sales_pending`** (dans `src/lib/rbac.ts`).

| Rôle | Accès par défaut |
|------|------------------|
| ADMIN | ✅ (via `ALL_MENU_KEYS`) |
| PHARMACIST | ❌ (à activer manuellement par l'admin si besoin) |
| CASHIER | ✅ |
| ACCOUNTANT | ❌ |

L'onglet « En attente » n'apparaît dans la barre des onglets de `/dashboard/ventes` que si la permission est accordée. Les routes API renvoient 401 sans session — la couche permission menu est purement côté UI (à durcir côté API si besoin de granularité par rôle).

## Cas particuliers

- **Médicament supprimé entre la mise en attente et la reprise** : `medicationId` reste null dans `PendingSaleItem`, le détail de la liste affiche un badge ⚠ « supprimé du catalogue », le pharmacien doit le retirer du panier ou le ré-ajouter manuellement.
- **Stock insuffisant à la reprise** : avertissement orange en haut du POS, mais pas de blocage — le pharmacien peut réduire la quantité.
- **Avoir expiré entre les deux étapes** : la création de la `Sale` (POST `/api/sales`) revalide normalement l'avoir et renvoie une erreur 400 si expiré → le pharmacien retire l'avoir et finalise.
- **Plusieurs mises en attente successives** : remettre en attente une vente reprise crée une **nouvelle** `PendingSale` (l'ancienne reste « active » jusqu'à annulation manuelle ou fin de session POS — à noter dans l'UX si besoin de réutiliser l'ancien id, on choisit la simplicité).

## Non-objectifs (V1)

- Pas d'expiration automatique (cron) — une vente en attente reste active indéfiniment.
- Pas de notifications de relance.
- Pas d'impression d'un ticket « en attente » remis au client.
- Pas de réservation de stock.
- Pas de fusion de plusieurs ventes en attente.

## Audit

Toute action sur une `PendingSale` est tracée dans `AuditLog` (entité `pending_sale`) avec le `pharmacyId` et le `userId` de l'auteur.

## Fichiers clés

- Schéma : `prisma/schema.prisma` (modèles `PendingSale`, `PendingSaleItem`)
- API : `src/app/api/sales/pending/route.ts`, `src/app/api/sales/pending/[id]/route.ts`, `src/app/api/sales/pending/[id]/convert/route.ts`
- POS : `src/app/dashboard/ventes/page.tsx` (handler `handleHoldSale`, hydratation `?pendingId=X`)
- Liste : `src/app/dashboard/ventes/en-attente/page.tsx`
- Layout : `src/app/dashboard/ventes/layout.tsx` (onglet « En attente »)
- RBAC : `src/lib/rbac.ts` (clé `sales_pending`)
- i18n : `src/lib/i18n/fr.ts` et `src/lib/i18n/en.ts` (section `salesPending`)
