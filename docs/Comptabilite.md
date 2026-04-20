# Comptabilité — NeuroPharm v1

> **Règle anti-régression** : toute modification de ce flux (API, page, logique frontend) **doit** mettre ce fichier à jour avant le merge.

---

## 1. Vue d'ensemble

La page `/dashboard/comptabilite` offre un récapitulatif financier de la pharmacie et la gestion des dépenses. Elle agrège les revenus des ventes et les dépenses pour calculer le résultat net.

**Fichiers principaux :**

| Fichier | Rôle |
|---------|------|
| `src/app/dashboard/comptabilite/page.tsx` | Page UI (deux onglets) |
| `src/app/api/accounting/route.ts` | `GET` résumé financier |
| `src/app/api/accounting/expenses/route.ts` | `GET` (liste) + `POST` (créer dépense) |

**Accès** : rôles `ADMIN` et `ACCOUNTANT` (selon permissions).

---

## 2. Modèle Prisma `Expense`

```prisma
model Expense {
  id          String   @id @default(cuid())
  pharmacyId  String
  category    String   // loyer, services, salaires, fournitures, transport, divers
  description String?
  amount      Float
  date        DateTime @default(now())
  createdAt   DateTime @default(now())
}
```

> ⚠️ Pas d'`updatedAt` ni de soft delete sur `Expense` — une dépense enregistrée est permanente. Corriger une erreur via une nouvelle dépense inverse (montant négatif) ou supprimer directement (accès ADMIN uniquement).

---

## 3. Routes API

### `GET /api/accounting`

**Auth** : `ADMIN` ou `ACCOUNTANT`

**Query params :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `year` | number | Année (défaut : année courante) |
| `month` | number | Mois 1-12 (optionnel — si absent : tous les mois de l'année) |

**Réponse :**
```json
{
  "summary": {
    "totalRevenue": 2450000,
    "totalExpenses": 890000,
    "netProfit": 1560000,
    "margin": 63.67
  },
  "monthly": [
    {
      "month": 1,
      "revenue": 180000,
      "expenses": 65000,
      "profit": 115000
    },
    ...
  ]
}
```

**Calcul du revenu :**
```
totalRevenue = sum(Sale.total) où sale.pharmacyId = jwt.pharmacyId
               et sale.status = 'completed'
               pour la période donnée
```

**Calcul des dépenses :**
```
totalExpenses = sum(Expense.amount) où expense.pharmacyId = jwt.pharmacyId
                pour la période donnée
```

**Marge :**
```
margin = (netProfit / totalRevenue) × 100
```

---

### `GET /api/accounting/expenses`

**Auth** : `ADMIN` ou `ACCOUNTANT`

**Query params :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `category` | string | Filtre par catégorie |
| `startDate` | string | ISO date de début |
| `endDate` | string | ISO date de fin |
| `limit` | number | Défaut : 20 |
| `offset` | number | Pagination |

**Réponse :**
```json
{
  "expenses": [
    {
      "id": "...",
      "category": "loyer",
      "description": "Loyer local mois de mars",
      "amount": 250000,
      "date": "2024-03-01"
    }
  ],
  "total": 45,
  "totalAmount": 890000
}
```

---

### `POST /api/accounting/expenses`

**Auth** : `ADMIN` ou `ACCOUNTANT`

**Corps de requête :**
```json
{
  "category": "loyer",
  "description": "Loyer local mois de mars",
  "amount": 250000,
  "date": "2024-03-01"
}
```

**Catégories valides :**

| Clé | Libellé FR |
|-----|-----------|
| `loyer` | Loyer |
| `services` | Services & utilities |
| `salaires` | Salaires |
| `fournitures` | Fournitures |
| `transport` | Transport |
| `divers` | Divers |

**Validation :**
- `category` doit être dans la liste des catégories valides
- `amount` doit être > 0
- `date` doit être une date valide (passée ou présente)

**Effets de bord :**
1. Crée la dépense avec `pharmacyId` depuis le JWT
2. Écrit un `AuditLog` `CREATE` / `expense`

---

## 4. Interface utilisateur

### 4.1 Onglet Résumé

**Cards KPI :**

| Card | Valeur | Couleur |
|------|--------|---------|
| Chiffre d'affaires | `totalRevenue` XOF | Bleu |
| Dépenses | `totalExpenses` XOF | Rouge |
| Résultat net | `netProfit` XOF | Vert (si > 0), rouge (si < 0) |
| Marge | `margin` % | Dynamique |

**Graphique d'évolution mensuelle :**
- Barres horizontales par mois
- Barre verte : revenus
- Barre rouge : dépenses
- Filtre par année (sélecteur)

### 4.2 Onglet Dépenses

- Liste tabulaire avec : date, catégorie (badge coloré), description, montant
- Bouton « Ajouter une dépense » → modal
- Filtres : catégorie, plage de dates
- Tri : par date décroissante par défaut

**Badges de catégorie :**

| Catégorie | Couleur |
|-----------|---------|
| `loyer` | Violet |
| `services` | Bleu |
| `salaires` | Ambre |
| `fournitures` | Vert |
| `transport` | Cyan |
| `divers` | Gris |

### 4.3 Modal d'ajout de dépense

| Champ | Requis | Type |
|-------|--------|------|
| Catégorie | Oui | select |
| Description | Non | text |
| Montant | Oui | number (XOF) |
| Date | Oui | date (défaut : aujourd'hui) |

---

## 5. Règles métier

1. **Source de revenu unique** : le `totalRevenue` provient exclusivement des `Sale` avec `status = 'completed'`. Les ventes remboursées ou annulées ne sont pas comptabilisées.
2. **Dépenses non liées à la paie** : les fiches de paie validées dans le module `/dashboard/paie` ne créent **pas** automatiquement une `Expense`. L'ACCOUNTANT doit créer manuellement une dépense de catégorie `salaires` après paiement des bulletins.
3. **Format monétaire** : XOF sans décimale via `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' })`.
4. **Isolation multi-tenant** : toujours filtrer par `pharmacyId` depuis le JWT — un comptable ne peut voir que les données de sa pharmacie.
5. **Aucune modification de dépense** : en v1, les dépenses ne peuvent pas être modifiées après création. Pour corriger, supprimer et recréer (admin) ou créer une dépense compensatoire.
