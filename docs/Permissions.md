# Permissions & RBAC — NeuroPharm v1

> **Règle anti-régression** : toute modification de ce flux (API, page, logique frontend) **doit** mettre ce fichier à jour avant le merge.

---

## 1. Vue d'ensemble

Le système de permissions de NeuroPharm est un RBAC (Role-Based Access Control) à deux niveaux :
1. **Permissions par défaut** selon le rôle (définies dans `src/lib/rbac.ts`)
2. **Surcharges individuelles** par utilisateur (stockées dans `UserPermission`)

La page `/dashboard/permissions` permet à l'admin de personnaliser les accès de chaque employé.

**Fichiers principaux :**

| Fichier | Rôle |
|---------|------|
| `src/app/dashboard/permissions/page.tsx` | Page UI de gestion des permissions |
| `src/app/api/permissions/route.ts` | `GET` + `PUT` permissions par utilisateur |
| `src/lib/rbac.ts` | Définition des rôles, menus et permissions par défaut |

**Accès** : `ADMIN` uniquement (et `SUPER_ADMIN` via impersonation).

---

## 2. Modèles Prisma

### `UserPermission`

```prisma
model UserPermission {
  id        String  @id @default(cuid())
  userId    String
  menuKey   String  // clé du menu (voir liste ci-dessous)
  canAccess Boolean @default(true)

  @@unique([userId, menuKey])
}
```

> Si aucune entrée `UserPermission` n'existe pour un (userId, menuKey), le système utilise la permission par défaut du rôle (depuis `DEFAULT_PERMISSIONS` dans `rbac.ts`).

---

## 3. Clés de menus (`ALL_MENU_KEYS`)

```typescript
// src/lib/rbac.ts
export const ALL_MENU_KEYS = [
  'dashboard',
  'medications',
  'stock',
  'sales',
  'suppliers',
  'personnel',
  'accounting',
  'payroll',
  'anomalies',
  'notifications',
  'settings',
]
```

> ⚠️ Si un nouveau menu est ajouté, il doit être ajouté dans `ALL_MENU_KEYS`, `DEFAULT_PERMISSIONS`, et `MENU_LABELS` — sinon il ne sera pas visible dans la page Permissions et sera inaccessible par défaut.

---

## 4. Permissions par défaut (`DEFAULT_PERMISSIONS`)

| Menu | ADMIN | PHARMACIST | CASHIER | ACCOUNTANT |
|------|:-----:|:----------:|:-------:|:----------:|
| `dashboard` | ✓ | ✓ | ✓ | ✓ |
| `medications` | ✓ | ✓ | ✗ | ✗ |
| `stock` | ✓ | ✓ | ✗ | ✗ |
| `sales` | ✓ | ✓ | ✓ | ✗ |
| `suppliers` | ✓ | ✗ | ✗ | ✗ |
| `personnel` | ✓ | ✗ | ✗ | ✗ |
| `accounting` | ✓ | ✗ | ✗ | ✓ |
| `payroll` | ✓ | ✗ | ✗ | ✓ |
| `anomalies` | ✓ | ✓ | ✗ | ✗ |
| `notifications` | ✓ | ✓ | ✓ | ✓ |
| `settings` | ✓ | ✗ | ✗ | ✗ |

**Note** : `SUPER_ADMIN` n'a pas de permissions dans ce tableau — il accède à l'espace superadmin, distinct de l'espace pharmacie.

---

## 5. Routes API

### `GET /api/permissions`

**Auth** : `ADMIN` uniquement

**Réponse :**
```json
{
  "users": [
    {
      "id": "clxxx...",
      "firstName": "Mariama",
      "lastName": "Ba",
      "email": "mariama@ph.sn",
      "role": "PHARMACIST",
      "isActive": true,
      "permissions": {
        "dashboard": true,
        "medications": true,
        "stock": true,
        "sales": true,
        "suppliers": false,
        "personnel": false,
        "accounting": false,
        "payroll": false,
        "anomalies": true,
        "notifications": true,
        "settings": false
      }
    }
  ]
}
```

> Les permissions retournées sont la valeur effective (surcharge si elle existe, défaut de rôle sinon).

---

### `PUT /api/permissions`

**Auth** : `ADMIN` uniquement

**Corps de requête :**
```json
{
  "userId": "clxxx...",
  "permissions": {
    "medications": true,
    "stock": false,
    "sales": true
  }
}
```

> Seules les clés présentes dans le body sont mises à jour. Les autres restent inchangées.

**Comportement :**
1. Vérifie que l'utilisateur appartient à la pharmacie de l'admin
2. Pour chaque clé : `upsert` dans `UserPermission` (`create` si absente, `update` sinon)
3. Écrit un `AuditLog` `UPDATE` / `permissions`

**Validation :**
- `userId` doit correspondre à un utilisateur actif de la même pharmacie
- Impossible de modifier les permissions d'un `ADMIN` ou `SUPER_ADMIN`
- Les clés doivent être dans `ALL_MENU_KEYS`

---

## 6. Application des permissions

### 6.1 Côté API

Chaque route API vérifie le rôle ET les permissions :
```typescript
const user = await getAuthUser(request)
if (!hasPermission(user, 'medications')) return 403
```

La fonction `hasPermission()` suit la logique :
1. Si `UserPermission` existe pour cet utilisateur et cette clé → utiliser `canAccess`
2. Sinon → utiliser `DEFAULT_PERMISSIONS[user.role][menuKey]`

### 6.2 Côté Sidebar

La navigation latérale filtre les menus affichés selon les permissions effectives de l'utilisateur connecté. Un menu non accessible est masqué (pas juste désactivé).

### 6.3 Côté page

Chaque page protégée vérifie la permission au chargement et redirige vers `/dashboard` si l'accès est refusé.

---

## 7. Interface utilisateur

### 7.1 Tableau de permissions

- Une ligne par employé non-admin
- Une colonne par menu
- Checkboxes modifiables
- Surlignage ambre des cases modifiées (diff visuel avant sauvegarde)
- Bouton « Enregistrer » par employé (pas de sauvegarde globale)

### 7.2 Employés inactifs

- Affichés dans la liste avec un indicateur visuel (grisé ou badge « Inactif »)
- Bouton « Réactiver » directement accessible depuis la page Permissions
- Redirection vers `/dashboard/personnel` pour la gestion complète

### 7.3 Labels des menus (`MENU_LABELS`)

```typescript
// src/lib/rbac.ts
export const MENU_LABELS = {
  dashboard:     'Tableau de bord',
  medications:   'Médicaments',
  stock:         'Stock',
  sales:         'Ventes',
  suppliers:     'Fournisseurs',
  personnel:     'Personnel',
  accounting:    'Comptabilité',
  payroll:       'Paie',
  anomalies:     'Anomalies',
  notifications: 'Notifications',
  settings:      'Paramètres',
}
```

---

## 8. Règles métier

1. **Hiérarchie** : les permissions individuelles (`UserPermission`) **surchargent** les permissions par défaut du rôle — elles ne s'additionnent pas.
2. **Admin non configurable** : l'ADMIN a accès à tout par construction — ses permissions ne peuvent pas être restreintes via cette page.
3. **Suppression de permissions** : quand un employé est supprimé (soft delete via `isActive: false`), ses `UserPermission` restent en base (cascade non activée) — ils seront réutilisés si le compte est réactivé.
4. **Ajout d'un nouveau menu** : toujours mettre à jour `ALL_MENU_KEYS`, `DEFAULT_PERMISSIONS` et `MENU_LABELS` dans `rbac.ts` — et vérifier le `SIDEBAR` pour l'affichage.
5. **Isolation multi-tenant** : un admin ne peut gérer que les permissions des utilisateurs de sa propre pharmacie.
