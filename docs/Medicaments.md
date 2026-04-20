# Médicaments — NeuroPharm v1

> **Règle anti-régression** : toute modification de ce flux (API, page, logique frontend) **doit** mettre ce fichier à jour avant le merge.

---

## 1. Vue d'ensemble

La page `/dashboard/medicaments` permet à l'admin et au pharmacien de gérer le catalogue complet des médicaments d'une pharmacie. Les données sont strictement isolées par `pharmacyId` (multi-tenant).

**Fichiers principaux :**

| Fichier | Rôle |
|---------|------|
| `src/app/dashboard/medicaments/page.tsx` | Page UI principale (liste, CRUD, import) |
| `src/app/api/medications/route.ts` | `GET` (liste) + `POST` (créer) |
| `src/app/api/medications/[id]/route.ts` | `PUT` (modifier complet) + `PATCH` (édition rapide partielle) + `DELETE` (supprimer) |
| `src/app/api/medications/import/route.ts` | `POST` (import CSV fournisseur) |

---

## 2. Modèle Prisma `Medication`

```prisma
model Medication {
  id                   String     @id @default(cuid())
  name                 String
  genericName          String?
  barcode              String?
  description          String?
  dosage               String?
  form                 String?    // tablet, syrup, injection, capsule, cream, drops, suppository, powder, other
  categoryId           String?
  category             Category?  @relation(...)
  pharmacyId           String
  purchasePrice        Float      @default(0)
  sellingPrice         Float      @default(0)
  quantity             Int        @default(0)    // total stock (magasin + rayons)
  shelfQuantity        Int        @default(0)    // portion en rayon — seule vendable au POS
  minStock             Int        @default(10)
  expiryDate           DateTime?
  location             String?    // emplacement rayon (label texte libre)
  requiresPrescription Boolean    @default(false)
  isActive             Boolean    @default(true)
  createdAt            DateTime   @default(now())
  updatedAt            DateTime   @updatedAt
}
```

> **Magasin vs rayons** : `quantity` est le **total**. `shelfQuantity` est la portion en rayon, **seule vendable**. Voir `docs/Stock.md` pour les flux de transfert.

**Soft delete** : ne jamais faire `DELETE` SQL sur un `Medication` actif — utiliser `isActive: false`.  
Les médicaments inactifs sont exclus des listes et du POS mais conservent leur historique de ventes.

---

## 3. Modèle `Category`

```prisma
model Category {
  id          String  @id @default(cuid())
  name        String
  description String?
  pharmacyId  String

  @@unique([name, pharmacyId])  // unicité par pharmacie
}
```

Les catégories sont créées à la volée lors de la création d'un médicament si elles n'existent pas.

---

## 4. Routes API

### `GET /api/medications`

**Auth** : tout rôle authentifié avec `pharmacyId`

**Query params :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `search` | string | Filtre par nom ou code-barres (ILIKE) |
| `category` | string | Filtre par nom de catégorie |
| `limit` | number | Défaut : 20 |
| `offset` | number | Défaut : 0 (pagination) |

**Réponse :**
```json
{
  "medications": [...],
  "total": 142,
  "categories": ["Antibiotiques", "Antalgiques", ...]
}
```

> ⚠️ Le `pharmacyId` est toujours lu depuis le JWT — jamais depuis les query params.

---

### `POST /api/medications`

**Auth** : `ADMIN` ou `PHARMACIST`

**Corps de requête :**
```json
{
  "name": "Amoxicilline 500mg",
  "genericName": "Amoxicilline",
  "barcode": "3400935789",
  "dosage": "500mg",
  "form": "tablet",
  "categoryId": "clxxx...",
  "purchasePrice": 1500,
  "sellingPrice": 2000,
  "quantity": 100,
  "minStock": 20,
  "expiryDate": "2026-12-31",
  "location": "Rayon A3",
  "requiresPrescription": false
}
```

**Effets de bord :**
1. Crée le médicament avec `pharmacyId` depuis le JWT. `shelfQuantity` est **toujours initialisée à 0** : le stock initial arrive en magasin.
2. Si `categoryId` est absent mais un nom de catégorie est fourni : crée ou retrouve la catégorie via `upsert`
3. Crée un `StockMovement` `IN` avec `location = "warehouse"` si `quantity > 0`
4. Écrit un `AuditLog` `CREATE` / `medication`

> ⚠️ Pour rendre du stock vendable, transférer ensuite en rayon via `POST /api/stock/transfer` (voir `docs/Stock.md`).

---

### `PUT /api/medications/[id]`

**Auth** : `ADMIN` ou `PHARMACIST`

**Validation** : vérifie que `medication.pharmacyId === jwt.pharmacyId` avant toute modification.

**Effets de bord :**
1. Met à jour le médicament
2. Écrit un `AuditLog` `UPDATE` / `medication` avec les champs modifiés en `details`

---

### `PATCH /api/medications/[id]`

**Auth** : `ADMIN` ou `PHARMACIST`

**Objectif** : édition rapide (quick-edit) depuis `/dashboard/stock` du prix de vente et de la date d'expiration, typiquement pour compléter les fiches fraîchement importées. **Le quick-edit n'existe plus sur `/dashboard/medicaments`** — la page médicaments n'affiche que les valeurs en lecture seule, la modification passe par le modal (bouton crayon).

**Champs réellement utilisés par l'UI** (`/dashboard/stock`) :

| Champ | Type | Règle |
|-------|------|-------|
| `sellingPrice` | number | `>= 0`, XOF |
| `expiryDate` | ISO date \| null | `null` pour retirer |

**Champs acceptés mais plus envoyés par le front** (conservés pour compatibilité / scripts) :

| Champ | Type | Règle |
|-------|------|-------|
| `categoryId` | string \| null | Doit appartenir à la même pharmacie. **Retiré du quick-edit UI sur demande produit.** |
| `quantity` | number | Entier `>= 0`. **Plus quick-éditable** : passer par un mouvement de stock (`POST /api/stock`). Si réellement utilisé, l'API clampe `shelfQuantity` au nouveau total pour préserver `shelfQuantity <= quantity`. |

Tout autre champ reçu est ignoré. Si aucun champ valide n'est fourni, l'API répond `400`.

**Validation** :
- Vérifie `medication.pharmacyId === jwt.pharmacyId`.
- Pour `categoryId`, vérifie que la catégorie appartient à la même pharmacie.

**Effets de bord** :
1. Met à jour les champs fournis uniquement (merge partiel).
2. Écrit un `AuditLog` `UPDATE` / `medication` avec la liste des champs modifiés.

---

### `DELETE /api/medications/[id]`

**Auth** : `ADMIN` uniquement

**Comportement** : soft delete (`isActive: false`), pas de suppression physique.

**Effets de bord :**
1. Passe `isActive` à `false`
2. Écrit un `AuditLog` `DELETE` / `medication`

---

### `POST /api/medications/import`

**Auth** : `ADMIN` ou `PHARMACIST`

**Corps** : `multipart/form-data` avec un champ `file` (fichier `.csv`).

**Format CSV attendu** (séparateur `;`, valeurs entre guillemets optionnels, encodage UTF-8 avec/sans BOM) :

```
"Date";"Numero Facture";"Numero Ligne";"Code Interne";"Code Cip";"Code CIP Alternatif";"Description";"Laboratoire";"Quantite Demandee";"Quantitee livree";"Unite Gratuite";"Prix de Cession Hors Taxe";"Taux Taxe";"Prix public";"Prix TTC"
```

**Mapping colonnes → modèle `Medication`** :

| Colonne CSV | Champ Prisma | Notes |
|-------------|--------------|-------|
| `Description` | `name` | Requis, sinon ligne ignorée |
| `Code Cip` → `Code CIP Alternatif` → `Code Interne` | `barcode` | Premier non vide utilisé. Sert aussi de clé de rapprochement. |
| `Laboratoire` | `genericName` | Fallback si le fabricant est fourni sans DCI |
| `Quantitee livree` + `Unite Gratuite` | `quantity` (création) ou incrément (mise à jour) | Additionnés |
| `Prix TTC` (fallback `Prix de Cession Hors Taxe`) | `purchasePrice` | |
| `Prix public` | `sellingPrice` | Fallback = `purchasePrice` si absent |
| `Numero Facture` | `StockMovement.reference` | Traçabilité |

**Logique de rapprochement** :

1. Recherche un `Medication` existant avec le même `barcode` (ou le même `name` si aucun code) dans la pharmacie courante.
2. **Existe** : `quantity += totalQty` (magasin), crée un `StockMovement` `IN` avec `location = "warehouse"` (raison `Import fournisseur — facture <n°>`). **`shelfQuantity` n'est pas modifiée**. **Les prix existants ne sont pas modifiés** pour préserver la politique tarifaire.
3. **N'existe pas** : crée le médicament (`shelfQuantity = 0`) + `StockMovement` `IN` `warehouse`.

> ℹ️ Tout stock importé arrive en magasin et doit être transféré en rayon (`POST /api/stock/transfer`) avant d'être vendable au POS.

**Parsing** :

- Séparateur auto-détecté (`;` ou `,`) en fonction du header.
- Valeurs numériques acceptent la virgule décimale française (`1 234,50` → `1234.5`).
- BOM UTF-8 et ligne `sep=;` (Excel) supprimés automatiquement.
- En-têtes tolérants à la casse et aux accents.

**Réponse** :

```json
{
  "created": 12,
  "updated": 5,
  "skipped": 1,
  "errors": [{ "line": 8, "message": "..." }]
}
```

**Effets de bord** :

1. Crée/met à jour les médicaments ligne par ligne.
2. Écrit un `StockMovement` `IN` par ligne avec `quantity > 0`.
3. Écrit un `AuditLog` `IMPORT` / `medication` avec le résumé (`fileName`, compteurs).

> ⚠️ Multi-tenant strict : toutes les recherches et créations sont scopées par `session.pharmacyId`. Un même Code CIP peut donc exister dans plusieurs pharmacies sans collision.

---

## 5. Interface utilisateur

### 5.0 Barre d'actions

Un seul bouton en haut à droite :

- **Ajouter** (primaire) : ouvre le formulaire de création manuelle.

> 🚫 **L'import CSV fournisseur a été déplacé sur `/dashboard/stock`** (2026-04-20). Le bouton **Importer** vit désormais sur la page Stock, aux côtés de `Transferer` et `Ajustement` — c'est l'endroit naturel pour alimenter le magasin. La route API reste `POST /api/medications/import` (inchangée). Ne pas réintroduire l'import ici.

### 5.1 Recherche et filtres

- **Barre de recherche** : filtre par `name` ou `barcode` en temps réel (debounce recommandé)
- **Filtre catégorie** : dropdown dynamique rempli depuis l'API
- **Pagination** : 20 médicaments par page, boutons Précédent / Suivant

### 5.2 Badges de statut stock

| Condition | Badge | Couleur |
|-----------|-------|---------|
| `quantity > minStock` | OK | Vert |
| `0 < quantity <= minStock` | Stock bas | Ambre |
| `quantity === 0` | Rupture | Rouge |

### 5.3 Indicateurs d'expiration

| Condition | Couleur |
|-----------|---------|
| Expiré (`expiryDate < now`) | Rouge |
| Expire dans ≤ 30 jours | Ambre |
| Expire dans > 30 jours | Neutre |

### 5.4 Édition rapide en ligne — déplacée vers `/dashboard/stock`

> 🚫 **Règle figée (2026-04-20)** : **aucun quick-edit sur `/dashboard/medicaments`**. Les cellules du tableau sont en lecture seule. Toute modification d'un médicament existant passe soit par :
> - le modal complet (bouton crayon → `PUT /api/medications/[id]`),
> - ou le quick-edit des colonnes **Prix vente** / **Expiration** sur `/dashboard/stock` (voir `docs/Stock.md`).
>
> La catégorie et la quantité ne sont **pas** quick-éditables : la catégorie passe par le modal complet, la quantité passe par un mouvement de stock (`POST /api/stock`). Ne pas réintroduire d'édition inline ici.

### 5.5 Formulaire médicament

Champs disponibles :

| Champ | Requis | Type |
|-------|--------|------|
| Nom | Oui | text |
| Nom générique | Non | text |
| Code-barres | Non | text |
| Dosage | Non | text |
| Forme | Non | select (`tablet`, `syrup`, `injection`, `capsule`, `cream`, `drops`, `suppository`, `powder`, `other`) |
| Catégorie | Non | select (liste pharmacie) |
| Prix d'achat | Oui | number (XOF) |
| Prix de vente | Oui | number (XOF) |
| Quantité initiale | Oui | number |
| Stock minimum | Oui | number (défaut : 10) |
| Date d'expiration | Non | date |
| Emplacement | Non | text (ex. « Rayon A3 ») |
| Ordonnance requise | Non | checkbox |

---

## 6. Règles métier

1. **Prix de vente ≥ Prix d'achat** : vérification frontend (warning non bloquant) pour éviter les ventes à perte.
2. **Quantité** : ne jamais modifier directement via ce formulaire en production — passer par `POST /api/stock` (mouvement de stock). Le champ `quantity` du formulaire de création est l'entrée initiale uniquement.
3. **Ordonnance** : les médicaments avec `requiresPrescription: true` sont marqués dans le POS et déclenchent un indicateur visuel.
4. **Soft delete uniquement** : un médicament supprimé reste visible dans l'historique des ventes et des mouvements de stock.

---

## 7. Sécurité multi-tenant

```typescript
// Toujours filtrer par pharmacyId depuis le JWT
const medications = await prisma.medication.findMany({
  where: { pharmacyId: user.pharmacyId, isActive: true },
})

// Toujours vérifier l'appartenance avant update/delete
const med = await prisma.medication.findUnique({ where: { id } })
if (med.pharmacyId !== user.pharmacyId) return 403
```

---

## 8. Format monétaire

Prix affichés en XOF sans décimale :
```typescript
Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(price)
```
