# Ventes (Point de Vente) — NeuroPharm v1

> **Règle anti-régression** : toute modification de ce flux (API, page, logique frontend) **doit** mettre ce fichier à jour avant le merge.

---

## 1. Vue d'ensemble

La page `/dashboard/ventes` est le point de vente (POS) de la pharmacie. Elle permet d'enregistrer les transactions de vente avec décrémentation automatique du stock.

**Fichiers principaux :**

| Fichier | Rôle |
|---------|------|
| `src/app/dashboard/ventes/page.tsx` | Page POS principale |
| `src/app/api/sales/route.ts` | `GET` (liste) + `POST` (créer vente) |
| `src/app/api/sales/[id]/route.ts` | `GET` détail vente |

---

## 2. Modèles Prisma

### `Sale`

```prisma
enum PaymentMethod {
  CASH
  MOBILE_MONEY
  CARD
  INSURANCE
  CREDIT
}

model Sale {
  id             String        @id @default(cuid())
  pharmacyId     String
  userId         String        // vendeur
  subtotal       Float
  tax            Float         @default(0)
  discount       Float         @default(0)
  total          Float
  paymentMethod  PaymentMethod @default(CASH)
  customerName   String?
  customerPhone  String?
  isPrescription Boolean       @default(false)
  status         String        @default("completed") // completed, refunded, cancelled
  createdAt      DateTime      @default(now())
}
```

### `SaleItem`

```prisma
model SaleItem {
  id           String @id @default(cuid())
  saleId       String
  medicationId String
  quantity     Int
  unitPrice    Float  // prix au moment de la vente (snapshot)
  total        Float
}
```

> `unitPrice` est un snapshot du `sellingPrice` au moment de la vente. Une modification ultérieure du prix du médicament n'affecte pas les ventes passées.

---

## 3. Routes API

### `GET /api/sales`

**Auth** : tout rôle authentifié avec `pharmacyId`

**Query params :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `search` | string | Filtre par nom client ou référence |
| `status` | string | `completed`, `refunded`, `cancelled` |
| `startDate` | string | ISO date de début |
| `endDate` | string | ISO date de fin |
| `limit` | number | Défaut : 20 |
| `offset` | number | Pagination |

**Réponse :**
```json
{
  "sales": [
    {
      "id": "...",
      "total": 8500,
      "paymentMethod": "CASH",
      "customerName": "Amadou Diallo",
      "status": "completed",
      "createdAt": "2024-03-15T14:30:00Z",
      "user": { "firstName": "Mariama", "lastName": "Ba" },
      "items": [...]
    }
  ],
  "total": 1240,
  "todayTotal": 45000,
  "todayCount": 12
}
```

---

### `POST /api/sales`

**Auth** : `ADMIN`, `PHARMACIST`, ou `CASHIER`

**Corps de requête :**
```json
{
  "items": [
    { "medicationId": "clxxx...", "quantity": 2, "unitPrice": 2000 },
    { "medicationId": "clyyy...", "quantity": 1, "unitPrice": 1500 }
  ],
  "paymentMethod": "CASH",
  "discount": 5,
  "customerName": "Amadou Diallo",
  "customerPhone": "771234567",
  "isPrescription": false
}
```

**Calcul automatique côté serveur :**
```
subtotal = sum(item.quantity × item.unitPrice)
tax      = subtotal × (pharmacySettings.taxRate / 100)
discount = subtotal × (discount% / 100)
total    = subtotal + tax - discount
```

**Comportements d'erreur :**

| Condition | HTTP | Message |
|-----------|------|---------|
| `items` vide | 400 | Aucun article dans la vente |
| Médicament hors pharmacie | 404 | Médicament introuvable |
| **Stock en rayon insuffisant** | 400 | `Stock en rayon insuffisant pour "{nom}". Rayon: X, Demande: Y (Z disponibles en magasin — transferer en rayon d'abord)` |
| Prix négatif | 400 | Prix invalide |

> ⚠️ La vérification porte sur `shelfQuantity` (stock en rayon) **et non** sur `quantity` (total). Un produit avec du stock uniquement en magasin est non vendable — voir `docs/Stock.md` pour le transfert magasin → rayon.

**Effets de bord (transaction atomique) :**
1. Crée la `Sale` + tous les `SaleItem`
2. Décrémente **à la fois** `Medication.quantity` et `Medication.shelfQuantity` pour chaque item
3. Crée un `StockMovement` `OUT` avec `location = "shelf"` par item (référence = ID vente)
4. Écrit un `AuditLog` `SALE` / `sale`
5. Dispatche l'événement `neuropharm:sale-complete` pour rafraîchir le dashboard

> ⚠️ La décrémentation du stock et la création de la vente sont dans une **transaction atomique** — si l'une échoue, tout est annulé.

---

### `GET /api/sales/[id]`

**Auth** : tout rôle authentifié avec `pharmacyId`

**Validation** : vérifie que `sale.pharmacyId === jwt.pharmacyId`

**Réponse :** détail complet avec `items` et médicaments associés.

---

## 4. Interface utilisateur (POS)

### 4.1 Recherche de médicaments

- Barre de recherche par nom ou code-barres
- Grille de résultats : nom, prix, **stock en rayon** (`shelfQuantity`) — seul affiché comme « disponible »
- Si le produit a du stock en magasin mais 0 en rayon : carte désactivée + hint `+N en magasin` (inviter au transfert)
- Badge rouge si rupture rayon (non sélectionnable)
- Indicateur ordonnance requise

### 4.2 Panier

| Action | Description |
|--------|-------------|
| Ajouter | Clic sur la carte médicament → incrémente quantité |
| Quantité | Input numérique ajustable (max = stock disponible) |
| Supprimer | Bouton ✕ par article |
| Vider | Réinitialise tout le panier |

**Calcul temps réel :**
```
Sous-total = sum(qté × prix unitaire)
Remise     = Sous-total × (remise% / 100)
Total      = Sous-total - Remise + TVA
```

### 4.3 Informations de vente

| Champ | Requis | Description |
|-------|--------|-------------|
| Mode de paiement | Oui | CASH / MOBILE_MONEY / CARD / INSURANCE / CREDIT |
| Remise (%) | Non | Pourcentage de 0 à 100 |
| Nom client | Non | Pour le ticket |
| Téléphone client | Non | Pour le ticket |
| Vente sur ordonnance | Non | Checkbox |

### 4.4 Récapitulatif et validation

- Affichage : Sous-total → Remise → TVA → **Total**
- Bouton « Valider la vente » : désactivé si panier vide
- Modal de succès avec récapitulatif (n° de reçu + total) et bouton **« Imprimer le reçu »**

### 4.5 Impression du reçu

Après une vente réussie, le frontend conserve un objet `Receipt` (état `lastReceipt`) construit à partir de la réponse `POST /api/sales` (id, date, vendeur) et du panier local (lignes, totaux, client, mode de paiement, ordonnance). Les infos pharmacie (nom, adresse, ville, téléphone, email, NINEA) sont récupérées au montage de la page via `GET /api/settings`.

L'impression est **déclenchée manuellement** depuis la modale de succès via le bouton **« Imprimer le reçu »** qui appelle `printReceipt()`. Cette fonction ouvre une fenêtre popup (`window.open`) avec un HTML autonome (police monospace ~320px de large, format ticket de caisse) et déclenche `window.print()` automatiquement à `load` (~200ms après).

> ⚠️ La popup **ne se ferme pas automatiquement** après l'impression (incident historique : sur certains navigateurs `afterprint` se déclenchait avant l'ouverture du dialogue système, refermant la popup avant que l'utilisateur n'ait pu valider). L'utilisateur doit fermer la fenêtre manuellement.

> ⚠️ Si le navigateur bloque les popups, l'utilisateur doit autoriser les popups pour le domaine. Aucun fallback iframe n'est implémenté en v1.

Le reçu inclut : en-tête pharmacie, n° (8 derniers car. de l'`id`), date/heure, vendeur, mode de paiement, bloc client (si renseigné), tableau des lignes (article, qté, PU, total), totaux (sous-total, remise, TVA, total), badge « Vente sur ordonnance » si applicable.

### 4.6 Événement temps réel

Après chaque vente réussie, la page dispatche :
```typescript
window.dispatchEvent(new CustomEvent('neuropharm:sale-complete'))
```
Ce qui déclenche le rafraîchissement des KPI sur `/dashboard` si l'onglet est ouvert.

---

## 5. Historique des ventes

Disponible via `GET /api/sales` avec filtres :
- Plage de dates
- Statut
- Recherche client

**Statuts :**

| Statut | Description |
|--------|-------------|
| `completed` | Vente finalisée (défaut) |
| `refunded` | Remboursée (modification manuelle SA) |
| `cancelled` | Annulée avant encaissement |

---

## 6. Méthodes de paiement

| Enum | Libellé FR | Usage |
|------|-----------|-------|
| `CASH` | Espèces | Standard |
| `MOBILE_MONEY` | Mobile Money | Wave, Orange Money |
| `CARD` | Carte bancaire | Terminal |
| `INSURANCE` | Assurance | Tiers payant |
| `CREDIT` | Crédit | Client régulier |

---

## 7. Règles métier

1. **Seul le stock en rayon est vendable** : la vérification et la décrémentation portent sur `shelfQuantity`, jamais sur `quantity` seul. Le stock en magasin ne peut pas être vendu.
2. **Stock en temps réel** : la quantité en rayon affichée dans le POS est en temps réel — si un autre vendeur vend le dernier article simultanément, la transaction la plus lente reçoit une erreur 400.
3. **Prix snapshot** : `unitPrice` dans `SaleItem` est figé au moment de la vente — ne jamais recalculer depuis le prix actuel du médicament pour les ventes passées.
4. **TVA** : calculée côté serveur depuis `PharmacySettings.taxRate`. Le frontend affiche la même valeur mais le serveur est autoritaire.
5. **Remise** : appliquée avant la TVA dans le calcul serveur (`subtotal × discount%` puis TVA sur `subtotal - discount`).
6. **Ordonnance** : le flag `isPrescription` est informatif uniquement en v1 — aucun blocage automatique.
7. **Rôle `CASHIER`** : peut créer des ventes mais ne peut pas accéder à la gestion des médicaments ni au stock (ni effectuer des transferts magasin → rayon).
