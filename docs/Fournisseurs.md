# Fournisseurs — NeuroPharm v1

> **Règle anti-régression** : toute modification de ce flux (API, page, logique frontend) **doit** mettre ce fichier à jour avant le merge.

---

## 1. Vue d'ensemble

La page `/dashboard/fournisseurs` gère le référentiel des fournisseurs de la pharmacie et leurs commandes d'achat. Toutes les données sont isolées par `pharmacyId`.

**Fichiers principaux :**

| Fichier | Rôle |
|---------|------|
| `src/app/dashboard/fournisseurs/page.tsx` | Page UI principale |
| `src/app/api/suppliers/route.ts` | `GET` (liste) + `POST` (créer) |
| `src/app/api/suppliers/[id]/route.ts` | `PUT` (modifier) + `DELETE` (désactiver) |

---

## 2. Modèles Prisma

### `Supplier`

```prisma
model Supplier {
  id         String @id @default(cuid())
  name       String
  contact    String?  // nom du contact chez le fournisseur
  phone      String?
  email      String?
  address    String?
  pharmacyId String
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  orders PurchaseOrder[]
}
```

**Soft delete** : `isActive: false` — les fournisseurs désactivés n'apparaissent plus dans les listes mais leurs commandes historiques sont conservées.

### `PurchaseOrder`

```prisma
model PurchaseOrder {
  id         String @id @default(cuid())
  pharmacyId String
  supplierId String
  total      Float  @default(0)
  status     String @default("pending") // pending, ordered, received, cancelled
  orderedAt  DateTime?
  receivedAt DateTime?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  items PurchaseOrderItem[]
}
```

### `PurchaseOrderItem`

```prisma
model PurchaseOrderItem {
  id              String @id @default(cuid())
  purchaseOrderId String
  medicationName  String  // nom libre (le médicament peut ne pas être en DB encore)
  quantity        Int
  unitPrice       Float
  total           Float
  receivedQty     Int?   // quantité effectivement reçue (peut différer de quantity)
}
```

> Note : `medicationName` est un champ texte libre dans `PurchaseOrderItem` — ce n'est pas une FK vers `Medication`. Cela permet de commander des médicaments pas encore dans le catalogue.

---

## 3. Routes API

### `GET /api/suppliers`

**Auth** : tout rôle authentifié avec `pharmacyId`

**Query params :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `search` | string | Filtre par nom ou contact |
| `limit` | number | Défaut : 20 |
| `offset` | number | Pagination |

**Réponse :**
```json
{
  "suppliers": [
    {
      "id": "...",
      "name": "Laborex Sénégal",
      "contact": "Ibrahima Sow",
      "phone": "338201234",
      "email": "ibrahima@laborex.sn",
      "address": "Zone A, Dakar",
      "isActive": true,
      "ordersCount": 12
    }
  ],
  "total": 8
}
```

---

### `POST /api/suppliers`

**Auth** : `ADMIN` uniquement

**Corps de requête :**
```json
{
  "name": "Laborex Sénégal",
  "contact": "Ibrahima Sow",
  "phone": "338201234",
  "email": "ibrahima@laborex.sn",
  "address": "Zone A, Dakar"
}
```

**Validation :**
- `name` requis et non vide
- `email` doit être un format valide si fourni

**Effets de bord :**
1. Crée le fournisseur avec `pharmacyId` depuis le JWT
2. Écrit un `AuditLog` `CREATE` / `supplier`

---

### `PUT /api/suppliers/[id]`

**Auth** : `ADMIN` uniquement

**Validation** : vérifie que `supplier.pharmacyId === jwt.pharmacyId`

**Corps de requête :** mêmes champs que POST (partiels acceptés)

**Effets de bord :**
1. Met à jour le fournisseur
2. Écrit un `AuditLog` `UPDATE` / `supplier`

---

### `DELETE /api/suppliers/[id]`

**Auth** : `ADMIN` uniquement

**Comportement** : soft delete (`isActive: false`), pas de suppression physique.

**Effets de bord :**
1. Passe `isActive` à `false`
2. Écrit un `AuditLog` `DELETE` / `supplier`

---

## 4. Interface utilisateur

### 4.1 Liste des fournisseurs

Affichage en cartes avec :
- Nom du fournisseur (titre)
- Nom du contact
- Téléphone et email (cliquables)
- Adresse
- Nombre de commandes total
- Boutons : Modifier / Désactiver

### 4.2 Formulaire fournisseur

| Champ | Requis | Description |
|-------|--------|-------------|
| Nom | Oui | Raison sociale |
| Contact | Non | Nom du représentant |
| Téléphone | Non | Numéro Sénégal |
| Email | Non | Adresse email |
| Adresse | Non | Adresse physique |

### 4.3 Commandes d'achat (PurchaseOrder)

Workflow des statuts :

```
pending  →  ordered  →  received
                    ↘  cancelled
```

| Statut | Libellé | Description |
|--------|---------|-------------|
| `pending` | En attente | Commande créée, non encore envoyée |
| `ordered` | Commandé | Commande transmise au fournisseur |
| `received` | Reçu | Livraison reçue, stock mis à jour |
| `cancelled` | Annulé | Commande annulée |

> Quand une commande passe en `received`, un mouvement `IN` est automatiquement créé pour chaque `PurchaseOrderItem` avec `receivedQty`.

---

## 5. Règles métier

1. **Fournisseur unique par nom** : pas de contrainte DB, mais afficher un avertissement frontend si un fournisseur avec le même nom existe déjà.
2. **Suppression physique interdite** : un fournisseur ayant des commandes ne peut être que désactivé.
3. **Réception partielle** : `receivedQty` peut être inférieur à `quantity` dans un `PurchaseOrderItem` — le stock est mis à jour avec la quantité réellement reçue.
4. **Multi-tenant** : `pharmacyId` toujours depuis le JWT — un fournisseur ne peut jamais être partagé entre pharmacies.
