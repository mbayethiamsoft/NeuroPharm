# Base de données — NeuroPharm v1

## Stack

- **PostgreSQL** (provider Prisma)
- **Prisma 7** + **`@prisma/adapter-pg`**
- L'URL de connexion **n'est pas** dans `schema.prisma` (`datasource db { provider = "postgresql" }` uniquement). Elle est lue à l'exécution via `prisma.config.ts`.
- Client généré dans `node_modules/.prisma/client` (cf. `generator client`).

### Workflow migrations

```bash
# 1. Modifier prisma/schema.prisma
# 2. Pousser le schéma sur la base
npx prisma db push
# 3. TOUJOURS régénérer le client TS (sinon erreurs de typage côté code)
npx prisma generate
```

> Incident historique : oublier `prisma generate` après `db push` provoque des erreurs du type `Property X does not exist in PayrollUpdateInput`.

## Multi-tenant

Chaque entité métier porte un `pharmacyId` (FK vers `Pharmacy`). **Toute** requête Prisma sur ces entités doit contenir `where: { pharmacyId }`. Le `pharmacyId` provient du JWT, jamais d'un payload client.

Entités cross-tenant (sans `pharmacyId`) : `User` (peut être SUPER_ADMIN sans pharmacie), `SystemLog`, `SupportTicket`, `SaasConfig`, `UserPermission`, `Subscription` (lié 1-1 à `Pharmacy`), `Payment`.

## Modèles

### Tenant & abonnements

- **`Pharmacy`** — entité racine multi-tenant. Devise par défaut `XOF`, timezone `Africa/Dakar`. Soft-disable via `isActive`.
- **`PharmacySettings`** — réglages pharmacie (taxe, seuil stock bas, alertes péremption, en-tête/pied ticket).
- **`Subscription`** — relation 1-1 avec `Pharmacy`. Plans : `TRIAL | BASIC | PROFESSIONAL | ENTERPRISE`. Statuts : `ACTIVE | SUSPENDED | CANCELLED | EXPIRED`.
- **`Payment`** — paiements rattachés à un abonnement. Méthodes : `mobile_money` (par défaut), provider `wave` / `orange_money` / etc. Statut : `pending | completed | failed`.

### Utilisateurs & RBAC

- **`User`** — `Role` : `SUPER_ADMIN | ADMIN | PHARMACIST | CASHIER | ACCOUNTANT`. `pharmacyId` nullable (le SA n'en a pas). Bloqué via `isActive = false` (le login renvoie 403).
- **`UserPermission`** — `(userId, menuKey)` unique. Override des `DEFAULT_PERMISSIONS` du fichier `src/lib/rbac.ts`.

### SaaS / SuperAdmin

- **`SystemLog`** — journal cross-tenant.
  - Champs : `level` (`info | warning | error | critical`), `action` (`LOGIN`, `IMPERSONATE`, `SUBSCRIPTION_CHANGE`, `PHARMACY_CREATE`…), `userId`, `userEmail`, `targetId`, `targetType`, `details`, `ipAddress`, `createdAt`.
  - Index : `level`, `action`, `createdAt`.
- **`SupportTicket`** — `status` (`open | in_progress | resolved | closed`), `priority` (`low | normal | high | urgent`). Index sur `status`.
- **`SaasConfig`** — clé/valeur (`key` unique). Configuration globale modifiable par le SA.

### Catalogue & stock

- **`Category`** — unique par `(name, pharmacyId)`.
- **`Medication`** — prix d'achat/vente, quantité, seuil min, péremption, location, `requiresPrescription`, `isActive`.
- **`StockMovement`** — `MovementType` : `IN | OUT | ADJUSTMENT | RETURN | EXPIRED`.
- **`Inventory` / `InventoryItem`** — campagnes d'inventaire (`draft → in_progress → completed`).

### Ventes

- **`Sale` / `SaleItem`** — `PaymentMethod` : `CASH | MOBILE_MONEY | CARD | INSURANCE | CREDIT`. `status` : `completed | refunded | cancelled`. Toujours rattaché à un `User` (caissier).

### Fournisseurs & achats

- **`Supplier`** — soft-disable via `isActive`.
- **`PurchaseOrder` / `PurchaseOrderItem`** — `status` : `pending | ordered | received | cancelled`.

### Comptabilité & paie

- **`Expense`** — catégorie libre (loyer, utilities, salaires…).
- **`Payroll`** — bulletin de salaire mensuel. Détails Sénégal :
  - Gains : `baseSalary`, `seniority`, `transportAllowance`, `housingAllowance`, `bonuses`, `overtime`, `grossSalary`.
  - Retenues salariales : `ipresGeneral` (5,6 %), `ipresCadre` (2,4 %), `cssMaladie`, `incomeTax` (IR), `trimf`, `cfce`, `otherDeductions`.
  - Charges patronales : `employerIpres` (8,4 %), `employerCss`, `employerCfce`.
  - Workflow : `draft → validated → paid` (avec `validatedBy`, `validatedAt`, `paidAt`).
  - Unique sur `(pharmacyId, employeeName, month, year)`.
- Calcul effectif : `src/lib/payroll-calc.ts`.

### Personnel

- **`Attendance`** — pointage (check-in/check-out, status `present | absent | late | leave`).

### Audit & notifications

- **`AuditLog`** — actions intra-pharmacie (CREATE/UPDATE/DELETE/LOGIN/SALE…), avec flag `isSuspicious` pour la détection de fraude. Index `(pharmacyId, createdAt)` et `(isSuspicious)`.
- **`Notification`** — `type` : `stock_low | expiry | fraud | payment | system`. `severity` : `info | warning | critical`. Index `(pharmacyId, isRead)`.

## Récap : enums

| Enum                 | Valeurs                                              |
| -------------------- | ---------------------------------------------------- |
| `Role`               | SUPER_ADMIN, ADMIN, PHARMACIST, CASHIER, ACCOUNTANT  |
| `SubscriptionPlan`   | TRIAL, BASIC, PROFESSIONAL, ENTERPRISE               |
| `SubscriptionStatus` | ACTIVE, SUSPENDED, CANCELLED, EXPIRED                |
| `MovementType`       | IN, OUT, ADJUSTMENT, RETURN, EXPIRED                 |
| `PaymentMethod`      | CASH, MOBILE_MONEY, CARD, INSURANCE, CREDIT          |

## Bonnes pratiques

- Soft-delete : préférer `isActive: false` à un `DELETE` SQL pour `User`, `Supplier`, `Medication`, `Pharmacy`.
- Toute écriture sensible doit produire un `AuditLog` (intra-pharmacie) ou un `SystemLog` (cross-tenant).
- Ne **jamais** exposer un `password` ni un `email` dans une réponse API non authentifiée.
- Les listes paginées (logs, tickets…) acceptent `limit` / `offset`.
