# Paramètres — NeuroPharm v1

> **Règle anti-régression** : toute modification de ce flux (API, page, logique frontend) **doit** mettre ce fichier à jour avant le merge.

---

## 1. Vue d'ensemble

La page `/dashboard/parametres` centralise la configuration de la pharmacie et la gestion de son abonnement. Elle est divisée en plusieurs onglets.

**Fichiers principaux :**

| Fichier | Rôle |
|---------|------|
| `src/app/dashboard/parametres/page.tsx` | Page UI (onglets + logique paiement Wave) |
| `src/app/api/settings/route.ts` | `GET` + `PUT` paramètres pharmacie |

**Accès** : `ADMIN` uniquement.

> ⚠️ Ce fichier contient aussi toute la logique de paiement Wave (initier un paiement, changer de plan). Lire **`docs/Paiements.md`** avant de modifier cette page.

---

## 2. Modèle Prisma `PharmacySettings`

```prisma
model PharmacySettings {
  id                String   @id @default(cuid())
  pharmacyId        String   @unique
  taxRate           Float    @default(0)     // TVA en % (ex. 18 pour 18 %)
  lowStockThreshold Int      @default(10)    // Seuil alerte stock faible
  expiryAlertDays   Int      @default(30)    // Jours avant expiration → alerte
  receiptHeader     String?                  // En-tête ticket de caisse
  receiptFooter     String?                  // Pied de page ticket
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

Ces paramètres sont distincts du modèle `Pharmacy` (infos générales) :

```prisma
model Pharmacy {
  name     String
  address  String?
  city     String?
  country  String   @default("Senegal")
  phone    String?
  email    String?
  logo     String?  // URL ou base64
  taxId    String?  // NINEA ou équivalent
  currency String   @default("XOF")
  timezone String   @default("Africa/Dakar")
}
```

---

## 3. Routes API

### `GET /api/settings`

**Auth** : `ADMIN` uniquement

**Réponse :**
```json
{
  "pharmacy": {
    "id": "...",
    "name": "Pharmacie du Plateau",
    "address": "12 Avenue Pompidou",
    "city": "Dakar",
    "phone": "338201234",
    "email": "contact@pharmacie-plateau.sn",
    "taxId": "SN123456789",
    "currency": "XOF",
    "timezone": "Africa/Dakar"
  },
  "settings": {
    "taxRate": 18,
    "lowStockThreshold": 10,
    "expiryAlertDays": 30,
    "receiptHeader": "Pharmacie du Plateau\nDakar, Sénégal",
    "receiptFooter": "Merci de votre visite. Conservez votre ordonnance."
  },
  "subscription": {
    "plan": "PROFESSIONAL",
    "status": "ACTIVE",
    "startDate": "2024-01-01",
    "endDate": "2024-04-01",
    "autoPayEnabled": false
  }
}
```

---

### `PUT /api/settings`

**Auth** : `ADMIN` uniquement

**Corps de requête :**
```json
{
  "pharmacy": {
    "name": "Pharmacie du Plateau",
    "address": "12 Avenue Pompidou",
    "city": "Dakar",
    "phone": "338201234",
    "email": "contact@pharmacie-plateau.sn",
    "taxId": "SN123456789"
  },
  "settings": {
    "taxRate": 18,
    "lowStockThreshold": 15,
    "expiryAlertDays": 45,
    "receiptHeader": "Pharmacie du Plateau",
    "receiptFooter": "Merci de votre visite."
  }
}
```

**Effets de bord :**
1. Met à jour `Pharmacy` et `PharmacySettings` (upsert pour settings)
2. Écrit un `AuditLog` `UPDATE` / `settings`

---

## 4. Interface utilisateur — Onglets

### 4.1 Onglet Informations générales

| Champ | Modèle | Description |
|-------|--------|-------------|
| Nom de la pharmacie | `Pharmacy.name` | Requis |
| Adresse | `Pharmacy.address` | Optionnel |
| Ville | `Pharmacy.city` | Optionnel |
| Téléphone | `Pharmacy.phone` | Optionnel |
| Email | `Pharmacy.email` | Optionnel |
| NINEA / Identifiant fiscal | `Pharmacy.taxId` | Optionnel |
| Logo | `Pharmacy.logo` | URL ou base64 |

### 4.2 Onglet Paramètres

| Champ | Modèle | Défaut | Description |
|-------|--------|--------|-------------|
| TVA (%) | `PharmacySettings.taxRate` | 0 | Taux appliqué aux ventes |
| Seuil stock faible | `PharmacySettings.lowStockThreshold` | 10 | Quantité déclenchant l'alerte |
| Jours avant expiration | `PharmacySettings.expiryAlertDays` | 30 | Délai d'alerte expiration |
| En-tête ticket | `PharmacySettings.receiptHeader` | — | Texte multi-ligne |
| Pied de page ticket | `PharmacySettings.receiptFooter` | — | Texte multi-ligne |

### 4.3 Onglet Abonnement

Affichage de l'abonnement actuel avec :
- Plan actuel (badge coloré)
- Statut (ACTIVE / SUSPENDED / EXPIRED / CANCELLED)
- Date de début et de fin
- Jours restants
- Toggle auto-renouvellement

**Cards de plans disponibles :**

| Plan | Mensuel | Annuel | Paiement |
|------|:-------:|:------:|:--------:|
| TRIAL | 0 XOF | 0 XOF | Non |
| BASIC | 15 000 XOF | 150 000 XOF | Wave |
| PROFESSIONAL | 35 000 XOF | 350 000 XOF | Wave |
| ENTERPRISE | 75 000 XOF | Devis | Non (SA) |

**Boutons selon le contexte :**

| Contexte | Bouton affiché |
|----------|----------------|
| Plan actuel non gratuit | « Payer via Wave » (renouveler) |
| Autre plan, prix > 0 | « Choisir ce plan » → modal → « Confirmer et payer avec Wave » |
| Plan TRIAL ou ENTERPRISE | « Choisir ce plan » → modal → « Confirmer » |
| Plan actuel | Indicateur « Plan actuel » (non cliquable) |

> ⚠️ Toute la logique de paiement (anti-popup-blocker, séquence PATCH + initiate) est documentée dans `docs/Paiements.md`. Ne pas modifier sans lire ce fichier.

### 4.4 Onglet Méthodes de paiement (informatif)

Affichage des méthodes disponibles :

| Méthode | Statut | Provider |
|---------|--------|----------|
| Wave | ✅ Disponible | `wave` |
| Orange Money | 🔜 Bientôt | `orange_money` |
| Carte bancaire | 🔜 Bientôt | — |

---

## 5. Constantes de tarifs à maintenir synchrones

Les montants des plans sont définis à **trois endroits** — toujours les mettre à jour ensemble :

1. **Frontend** (`parametres/page.tsx`) :
```typescript
const planAmounts = { TRIAL: 0, BASIC: 15000, PROFESSIONAL: 35000, ENTERPRISE: 75000 }
const planAnnualAmounts = { TRIAL: 0, BASIC: 150000, PROFESSIONAL: 350000, ENTERPRISE: 0 }
```

2. **API initiate** (`src/app/api/payments/initiate/route.ts`) :
```typescript
const PLAN_AMOUNTS = { monthly: { BASIC: 15000, PROFESSIONAL: 35000, ENTERPRISE: 75000 }, annual: { ... } }
```

3. **API subscriptions** (`src/app/api/subscriptions/route.ts`) :
```typescript
const PLAN_AMOUNTS = { ... }  // même structure
```

> Si un tarif change → mettre à jour ces trois endroits + `docs/Paiements.md`.

---

## 6. Règles métier

1. **Admin uniquement** : seul l'ADMIN peut accéder aux paramètres — les autres rôles sont redirigés.
2. **`pharmacyId` depuis JWT** : le PUT ne prend jamais un `pharmacyId` depuis le body — toujours depuis le token JWT.
3. **TVA** : le `taxRate` est utilisé lors de la création d'une vente dans `POST /api/sales` — une modification du taux n'affecte pas les ventes passées.
4. **Logo** : en v1, le logo est stocké comme URL ou base64 dans le champ `Pharmacy.logo` — pas de stockage S3 ou CDN.
5. **Auto-renouvellement** : le toggle `autoPayEnabled` est enregistré dans `Subscription.autoPayEnabled` — aucun job automatique n'est implémenté en v1 (prépare la v2).
