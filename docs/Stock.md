# Stock — NeuroPharm v1

> **Règle anti-régression** : toute modification de ce flux (API, page, logique frontend) **doit** mettre ce fichier à jour avant le merge.

---

## 1. Vue d'ensemble

La page `/dashboard/stock` gère les mouvements de stock et les campagnes d'inventaire physique. C'est le seul point d'entrée autorisé pour modifier la quantité d'un médicament après sa création initiale.

### 1.1 Magasin vs Rayons (stock à deux niveaux)

NeuroPharm distingue deux localisations physiques dans une pharmacie :

| Localisation | Champ DB | Vendable au POS ? |
|--------------|----------|-------------------|
| **Magasin** (stockage interne) | `Medication.quantity - Medication.shelfQuantity` (calculé) | ❌ Non |
| **Rayons** (étagères en vente) | `Medication.shelfQuantity` | ✅ Oui |
| **Total** | `Medication.quantity` | — |

**Règles fondamentales :**

1. Tout médicament **ajouté manuellement** ou **importé** arrive **en magasin** (`shelfQuantity = 0`).
2. Le POS (`/api/sales`) ne peut vendre **que du stock en rayon** (`shelfQuantity`).
3. Pour rendre du stock vendable, l'admin/pharmacien fait un **transfert magasin → rayon** via `POST /api/stock/transfer`.
4. Une vente décrémente **à la fois** `quantity` et `shelfQuantity`.
5. Les mouvements de stock (IN/OUT/EXPIRED/RETURN/ADJUSTMENT) ont un champ `location` indiquant sur quelle zone ils portent (défaut : `warehouse`).

**Fichiers principaux :**

| Fichier | Rôle |
|---------|------|
| `src/app/dashboard/stock/page.tsx` | Page UI (deux onglets) |
| `src/app/api/stock/route.ts` | `GET` stats + `POST` mouvement |
| `src/app/api/stock/transfer/route.ts` | `POST` transfert magasin → rayon |
| `src/app/api/stock/movements/route.ts` | `GET` historique des mouvements |
| `src/app/api/stock/inventory/route.ts` | Gestion des campagnes d'inventaire |

---

## 2. Modèles Prisma

### `StockMovement`

```prisma
enum MovementType {
  IN         // Entrée de stock (réception commande)
  OUT        // Sortie manuelle (perte, don, vente, etc.)
  ADJUSTMENT // Ajustement (correction inventaire)
  RETURN     // Retour fournisseur ou client
  EXPIRED    // Retrait pour péremption
  TRANSFER   // Transfert magasin → rayon
}

model StockMovement {
  id           String       @id @default(cuid())
  medicationId String
  pharmacyId   String
  type         MovementType
  quantity     Int          // positif ou négatif selon le type
  location     String?      // "warehouse" | "shelf" (destination pour TRANSFER)
  reason       String?
  reference    String?      // numéro BL, ID vente, etc.
  unitPrice    Float?
  createdAt    DateTime     @default(now())
}
```

### `Medication` (champs stock)

```prisma
model Medication {
  quantity      Int @default(0)  // total = magasin + rayons
  shelfQuantity Int @default(0)  // portion en rayon (vendable au POS)
  // ... autres champs
}
```

Invariants :
- `0 <= shelfQuantity <= quantity`
- `warehouseQuantity = quantity - shelfQuantity` (calculé côté serveur dans la réponse `/api/stock`)

### `Inventory` (campagne d'inventaire)

```prisma
model Inventory {
  id          String   @id @default(cuid())
  pharmacyId  String
  name        String
  status      String   @default("draft") // draft | in_progress | completed
  startedAt   DateTime?
  completedAt DateTime?
  items       InventoryItem[]
  createdAt   DateTime @default(now())
}

model InventoryItem {
  id           String @id @default(cuid())
  inventoryId  String
  medicationId String
  expectedQty  Int    // quantité système
  actualQty    Int?   // quantité comptée physiquement
  difference   Int?   // actualQty - expectedQty
}
```

---

## 3. Routes API

### `GET /api/stock`

**Auth** : tout rôle authentifié avec `pharmacyId`

**Query params :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `search` | string | Filtre nom/code-barres |
| `alert` | string | `low` ou `expiring` |
| `location` | string | `warehouse` ou `shelf` (filtre les médicaments ayant du stock à cet endroit) |

**Réponse :**
```json
{
  "medications": [
    {
      "id": "...",
      "name": "Amoxicilline 500mg",
      "quantity": 120,
      "shelfQuantity": 30,
      "warehouseQuantity": 90,
      "status": "ok",
      "category": { "name": "Antibiotiques" },
      "sellingPrice": 2000,
      "expiryDate": "2026-12-31"
    }
  ],
  "stats": {
    "totalProducts": 245,
    "lowStock": 12,
    "expiringSoon": 8,
    "totalWarehouse": 3200,
    "totalShelf": 780,
    "awaitingTransfer": 14
  }
}
```

> `lowStock` = médicaments avec `quantity <= minStock`  
> `expiringSoon` = médicaments avec `expiryDate` dans les 30 prochains jours  
> `totalWarehouse` / `totalShelf` = somme des unités par localisation  
> `awaitingTransfer` = produits ayant du stock uniquement en magasin (`shelfQuantity = 0` et `warehouseQuantity > 0`)

---

### `POST /api/stock`

**Auth** : `ADMIN` ou `PHARMACIST`

**Corps de requête :**
```json
{
  "medicationId": "clxxx...",
  "type": "IN",
  "quantity": 50,
  "location": "warehouse",
  "reason": "Réception commande #BL2024-001",
  "reference": "BL2024-001",
  "unitPrice": 1500
}
```

| Champ | Valeurs | Défaut | Notes |
|-------|---------|--------|-------|
| `type` | IN, OUT, ADJUSTMENT, RETURN, EXPIRED | — | `TRANSFER` passe par `/api/stock/transfer` (pas ici) |
| `location` | `warehouse`, `shelf` | `warehouse` | Zone sur laquelle porte le mouvement |
| `quantity` | entier | — | Négatif autorisé uniquement pour `ADJUSTMENT` |

**Logique par type :**

| Type | Effet sur `quantity` | Effet sur `shelfQuantity` |
|------|----------------------|---------------------------|
| `IN` / `RETURN` | `+n` | `+n` si `location = shelf`, sinon inchangé |
| `OUT` / `EXPIRED` | `-n` | `-n` si `location = shelf`, sinon inchangé — vérifie la dispo à la zone choisie |
| `ADJUSTMENT` | `+delta` | `+delta` si `location = shelf`, sinon inchangé |

**Comportements d'erreur :**

| Condition | HTTP | Message |
|-----------|------|---------|
| `medicationId` invalide ou hors pharmacie | 404 | Médicament introuvable |
| `quantity` manquante ou zéro | 400 | Champs requis |
| Stock en magasin insuffisant (OUT/EXPIRED location=warehouse) | 400 | Stock en magasin insuffisant |
| Stock en rayon insuffisant (OUT/EXPIRED location=shelf) | 400 | Stock en rayon insuffisant |
| ADJUSTMENT rendant `quantity < 0` ou `shelfQuantity < 0` ou `shelfQuantity > quantity` | 400 | message adapté |

**Effets de bord (transaction atomique) :**
1. Crée le `StockMovement` (avec `location`)
2. Met à jour `Medication.quantity` et `Medication.shelfQuantity` selon la règle
3. Écrit un `AuditLog` `STOCK_MOVEMENT` / `stock_movement`

---

### `POST /api/stock/transfer`

**Auth** : `ADMIN` ou `PHARMACIST`

**Corps de requête :**
```json
{
  "medicationId": "clxxx...",
  "quantity": 20,
  "reason": "Réapprovisionnement rayon A"
}
```

Déplace `quantity` unités du magasin vers les rayons (warehouse → shelf).

**Comportements d'erreur :**

| Condition | HTTP | Message |
|-----------|------|---------|
| `medicationId` invalide | 404 | Médicament introuvable |
| `quantity <= 0` | 400 | quantity (>0) requis |
| `quantity > warehouseQuantity` | 400 | Stock insuffisant en magasin (disponible: N) |

**Effets de bord (transaction atomique) :**
1. Crée un `StockMovement` de type `TRANSFER`, `location = "shelf"`, `quantity = n`
2. Incrémente `Medication.shelfQuantity` de `n` (le total `quantity` reste inchangé)
3. Écrit un `AuditLog` `STOCK_TRANSFER`

---

### `GET /api/stock/movements`

**Auth** : tout rôle authentifié avec `pharmacyId`

**Query params :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `medicationId` | string | Filtre par médicament |
| `type` | string | Filtre par type de mouvement |
| `limit` | number | Défaut : 50 |
| `offset` | number | Pagination |

**Réponse :**
```json
{
  "movements": [
    {
      "id": "...",
      "type": "IN",
      "quantity": 50,
      "reason": "Réception",
      "reference": "BL2024-001",
      "createdAt": "2024-03-15T10:30:00Z",
      "medication": { "name": "Amoxicilline 500mg" }
    }
  ],
  "total": 320
}
```

---

### Gestion des campagnes d'inventaire — `GET/POST/PUT /api/stock/inventory`

**Workflow :**

```
POST (créer campagne)  →  status: "draft"
PUT { action: "start" }  →  status: "in_progress", startedAt: now
PUT { action: "count", items: [...] }  →  enregistre actualQty + difference
PUT { action: "complete" }  →  status: "completed", completedAt: now
                              + crée des ADJUSTMENT pour chaque différence
```

**Règle** : une seule campagne peut être `in_progress` à la fois par pharmacie.

---

## 4. Interface utilisateur

### 4.1 Onglet Vue d'ensemble

- **Cards de stats** : total produits, total en magasin, total en rayons, stock bas, expirations proches. **Grille figée** : `grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4` (ne pas modifier).
- **Bannière d'alerte** : si des produits n'ont aucun stock en rayon mais du stock en magasin (`awaitingTransfer`), propose un transfert rapide
- **Filtre localisation** : `Tous` / `Magasin` / `Rayons`
- **Liste** avec colonnes : nom, **Magasin**, **Rayons**, **Total**, stock min, **Prix vente** (quick-édit), **Expiration** (quick-édit), statut, action « Transférer »
- **Boutons d'action** : `Importer` (CSV fournisseur), `Transferer` (magasin → rayons) et `Ajustement` (mouvement classique)

#### Quick-edit inline (`Prix vente` + `Expiration`)

> 📌 **Règle figée (2026-04-20)** : le quick-edit vit exclusivement sur cette page. Il est interdit sur `/dashboard/medicaments`.

| Colonne | Contrôle | Sauvegarde |
|---------|----------|-----------|
| Prix vente | `<input type="number">` autofocus, bordure emerald | `Enter` ou `blur` |
| Expiration | `<input type="date">` autofocus, bordure emerald | `Enter` ou `blur` |

- Raccourcis : `Enter` valide, `Escape` annule.
- Mise à jour via `PATCH /api/medications/[id]` — seul le champ modifié est envoyé.
- Après succès : mise à jour optimiste du state local, pas de refetch global.
- En cas d'erreur serveur : bannière rouge en haut de la page (`AlertTriangle`).
- Si la valeur n'a pas changé, aucune requête n'est envoyée.
- **Interdits** : pas de quick-edit pour `categoryId` (retiré produit) ni `quantity` (passer par un mouvement de stock via le modal « Ajustement »).

Pensé pour compléter rapidement les prix et les dates d'expiration des médicaments fraîchement importés (`POST /api/medications/import`) avant de les transférer en rayon.

### 4.2 Modal de mouvement de stock (Ajustement)

| Champ | Requis | Description |
|-------|--------|-------------|
| Médicament | Oui | Recherche par nom |
| Type | Oui | IN / OUT / ADJUSTMENT / RETURN / EXPIRED |
| Localisation | Oui | `Magasin` (défaut) ou `Rayons` |
| Quantité | Oui | Entier (négatif autorisé pour ADJUSTMENT) |
| Raison | Non | Texte libre |

### 4.2.bis Modal d'import CSV fournisseur

> 📌 **Règle figée (2026-04-20)** : le bouton **Importer** vit sur `/dashboard/stock` (pas sur `/dashboard/medicaments`). Raison : l'import alimente le magasin, et le transfert vers les rayons se fait depuis cette même page — le flux complet est contigu.

- Ouvert via le bouton `Importer` de la barre d'actions.
- Upload d'un fichier `.csv` (séparateur `;`) conforme au format décrit dans `docs/Medicaments.md` §4 (`POST /api/medications/import`).
- Route API inchangée : `POST /api/medications/import` (auth `ADMIN` / `PHARMACIST`).
- Réponse : compteurs `créés / mis à jour / ignorés` + liste des erreurs par ligne.
- Après succès : `fetchData()` rafraîchit les stats + la liste, et l'onglet `Mouvements` est rafraîchi si actif (chaque ligne importée avec `quantity > 0` crée un `StockMovement` `IN` `warehouse`).
- Rappel : le stock importé arrive **en magasin** (`shelfQuantity` inchangée) — un transfert reste nécessaire pour le rendre vendable au POS.

### 4.3 Modal de transfert (magasin → rayons)

| Champ | Requis | Description |
|-------|--------|-------------|
| Médicament | Oui | Liste filtrée sur `warehouseQuantity > 0` |
| Quantité | Oui | Entier positif, max = `warehouseQuantity` |
| Raison | Non | Texte libre (ex. « Réapprovisionnement rayon A ») |

Affiche en temps réel le stock courant magasin/rayon pour le médicament sélectionné.

### 4.4 Onglet Mouvements

- Historique paginé (50 par page)
- Colonne `Localisation` (badge : Magasin / Rayon)
- Badges colorés par type :

| Type | Couleur | Signification |
|------|---------|---------------|
| `IN` | Vert | Entrée |
| `OUT` | Rouge | Sortie |
| `ADJUSTMENT` | Bleu | Ajustement |
| `RETURN` | Violet | Retour |
| `EXPIRED` | Gris | Périmé |
| `TRANSFER` | Indigo | Transfert magasin → rayon |

### 4.5 Onglet Inventaire (campagne physique)

1. Créer une campagne (nom libre)
2. Démarrer → statut `in_progress`
3. Pour chaque médicament : saisir la quantité physiquement comptée
4. Le système calcule `difference = actualQty - expectedQty`
5. Terminer → les ADJUSTMENT sont créés automatiquement pour régulariser les écarts

---

## 5. Alertes automatiques

L'API `/api/anomalies` agrège les alertes de stock générées par :

| Source | Déclencheur | Type notification |
|--------|-------------|-------------------|
| `POST /api/stock` | `quantity <= minStock` après mouvement | `stock_low` / `warning` |
| `GET /api/anomalies` | Scan périodique des `expiryDate < now + 30j` | `expiry` / `warning` |
| `GET /api/anomalies` | `quantity === 0` | `stock_low` / `critical` |

---

## 6. Règles métier

1. **Les quantités (`quantity` et `shelfQuantity`) ne peuvent jamais être négatives** : l'API rejette toute opération qui violerait l'invariant.
2. **Invariant** : `shelfQuantity <= quantity` à tout moment. L'API clampe automatiquement (PUT/PATCH medication) si le total passe sous le rayon.
3. **Seul le stock en rayon est vendable** : `POST /api/sales` vérifie et décrémente `shelfQuantity` (ainsi que `quantity`). Si le rayon est vide mais le magasin plein, l'erreur renvoie un indice explicite.
4. **Entrées = magasin** : toute création/import de médicament et tout mouvement `IN` (sauf `location: shelf` explicite) alimente le magasin. Pour rendre vendable : passer par `POST /api/stock/transfer`.
5. **Transferts** : en v1, le transfert va uniquement du magasin vers les rayons. Pour repousser du stock vers le magasin (cas rare), utiliser un `ADJUSTMENT` `-n` sur `shelf` suivi d'un `+n` sur `warehouse`.
6. **Soft delete** : les médicaments désactivés sont exclus des calculs de stock mais leurs mouvements historiques sont conservés.
7. **Backfill** (migration initiale) : après `npm run db:push`, les médicaments existants ont `shelfQuantity = 0` — tout leur stock est considéré en magasin. Pour conserver le comportement pré-feature (tout en rayon) :
   ```sql
   UPDATE medications SET "shelfQuantity" = quantity WHERE "shelfQuantity" = 0 AND quantity > 0;
   ```
