# Architecture — NeuroPharm v1

## Vue d'ensemble

NeuroPharm est un SaaS multi-tenant de gestion de pharmacies destiné au marché sénégalais (et plus largement UEMOA). Une instance unique sert plusieurs pharmacies, chaque pharmacie ayant ses propres utilisateurs, stock, ventes, paie, etc. Un rôle global `SUPER_ADMIN` administre la plateforme elle-même (pharmacies, abonnements, paiements, support, logs).

## Stack

| Couche       | Choix                                                      |
| ------------ | ---------------------------------------------------------- |
| Framework    | Next.js **16.2.2** (App Router, Turbopack)                 |
| Langage      | TypeScript                                                 |
| ORM          | Prisma **7** + `@prisma/adapter-pg` (config `prisma.config.ts`) |
| Base         | PostgreSQL                                                 |
| Auth         | JWT signé maison, stocké en cookie `httpOnly`              |
| UI           | React 19, Tailwind CSS, lucide-react                       |
| i18n         | Provider React maison (`I18nProvider`) + localStorage      |
| PWA          | Service worker / manifest (cf. `dffdc35 some new features, pwa...`) |

> ⚠️ Cette version de Next a des breaking changes par rapport aux connaissances par défaut. Lire `node_modules/next/dist/docs/` avant d'écrire un Server Action ou de toucher au routing.

## Arborescence

```
src/
  app/
    api/                 # routes API (server)
      auth/              # login, register, me, logout
      superadmin/        # routes SaaS (SUPER_ADMIN uniquement)
      personnel/         # employés (admin pharmacie)
      sales/ stock/ ...  # CRUD métier
      permissions/       # gestion RBAC par admin pharmacie
      support/           # tickets (POST public)
    dashboard/
      page.tsx           # redirige selon rôle
      layout.tsx         # I18nProvider > DashboardProvider > Sidebar/Header
      superadmin/        # espace SaaS (pages SA)
      personnel/, stock/, ventes/, paie/, ...   # espace pharmacie
      permissions/       # UI RBAC admin pharmacie
    login/, register/    # entrées publiques
  components/
    Sidebar.tsx          # nav role-aware (SA vs pharmacie + RBAC)
    Header.tsx           # titres pages, recherche, langue, profil
    DashboardProvider.tsx# contexte user + permissions + impersonation
    ImpersonationBanner.tsx
    SupportContactModal.tsx
  lib/
    rbac.ts              # menus, permissions par défaut, labels FR/EN
    system-log.ts        # createSystemLog()
    payroll-calc.ts      # IPRES / CSS / IR / TRIMF / CFCE
    i18n/
      index.ts           # exports fr, en, Locale, localeNames
      fr.ts en.ts        # dictionnaires (Record<string, Record<string,string>>)
prisma/
  schema.prisma          # source unique du modèle
prisma.config.ts         # adapter pg + URL côté runtime
```

## Authentification

- Login (`POST /api/auth/login`) : vérifie email/mot de passe, refuse si `user.isActive === false` (403). Émet un JWT contenant `userId`, `email`, `role`, `pharmacyId`. Stocké dans le cookie **`neuropharm-token`** (`httpOnly`, `sameSite=lax`).
- Logout : supprime le cookie.
- `GET /api/auth/me` : renvoie l'utilisateur courant **et** détecte l'impersonation via le cookie `neuropharm-impersonating`.
- Pas de refresh token : un seul JWT longue durée.

## RBAC

Trois niveaux complémentaires :

1. **Rôle Prisma** (`Role` enum) : `SUPER_ADMIN`, `ADMIN`, `PHARMACIST`, `CASHIER`, `ACCOUNTANT`. Filtre grossier (espace SaaS vs espace pharmacie, accès API).
2. **Permissions par défaut** par rôle : `DEFAULT_PERMISSIONS` dans `src/lib/rbac.ts`. `ADMIN` reçoit toutes les `ALL_MENU_KEYS`, les autres un sous-ensemble.
3. **Permissions personnalisées** : modèle `UserPermission` (`userId + menuKey → canAccess`). Modifiables par l'admin pharmacie via `/dashboard/permissions`. Une permission explicite override le défaut.

Le `DashboardProvider` charge les permissions effectives via `/api/permissions?userId=…` et expose `permissions` + `permissionsLoaded`. La `Sidebar` masque les entrées non autorisées.

> Restriction : un admin ne peut **pas** modifier les permissions d'un `ADMIN` ni d'un `SUPER_ADMIN` (vérification côté API `/api/permissions PUT`).

## SuperAdmin vs espace pharmacie

- `/dashboard/page.tsx` redirige `SUPER_ADMIN` vers `/dashboard/superadmin` (sauf en impersonation).
- La `Sidebar` détecte le rôle et affiche **deux navigations totalement disjointes**.
- `Header.searchablePages` doit être role-aware (SA → pharmacies/users/abonnements/logs/paiements ; pharmacie → modules métier). À corriger (cf. `Tasks.md`).

## Impersonation

Flux :

1. SA clique « Se connecter en tant que… » sur `/dashboard/superadmin/pharmacies`.
2. `POST /api/superadmin/impersonate` :
   - sauvegarde le JWT SA dans le cookie **`neuropharm-original-token`** ;
   - génère un JWT `ADMIN` pour la pharmacie cible et l'écrit dans `neuropharm-token` ;
   - pose un cookie marqueur **`neuropharm-impersonating`** (id pharmacie).
3. La page `/dashboard` rend l'espace pharmacie ; `ImpersonationBanner` (jaune) s'affiche en haut.
4. Sortie : `DELETE /api/superadmin/impersonate` restaure `neuropharm-token` depuis `neuropharm-original-token` et supprime le marqueur.

Toutes les actions d'impersonation sont (doivent être) tracées via `createSystemLog`.

## i18n

- Provider : `I18nProvider` (contexte React) lu via `useI18n()` qui retourne `{ t, locale, setLocale, locales }`.
- Persistance : `localStorage` (`neuropharm-locale`).
- `t` est typé contre `Translations`, qui est volontairement `Record<string, Record<string, string>>` — **ne pas** revenir à un `typeof fr as const` (cassait l'assignabilité côté `en.ts`).
- Toute chaîne UI passe par `t('section.key')`. Cf. `docs/i18n.md`.

## Logs système

- Helper unique : `createSystemLog({ level, action, userId, userEmail, targetId, targetType, details, ipAddress })` (`src/lib/system-log.ts`).
- Modèle : `SystemLog` (cf. `docs/Database.md`), indexé sur `level`, `action`, `createdAt`.
- Lu et filtré par `/dashboard/superadmin/logs` via `/api/superadmin/logs` (paramètres `level`, `action`, `limit`, `offset`).
- À distinguer de `AuditLog`, qui est intra-pharmacie et lié à `pharmacyId`.

## Support tickets

- `POST /api/support` est **public** (utilisable depuis `/login` et `/register` via `SupportContactModal`).
- `GET` / `PUT` réservés au `SUPER_ADMIN` (page `/dashboard/superadmin/support`).
- Statuts : `open`, `in_progress`, `resolved`, `closed`.

## Paie sénégalaise

`src/lib/payroll-calc.ts` calcule pour chaque bulletin :

- Salaire brut (base + ancienneté + indemnités + primes + heures supp).
- Cotisations salariales : **IPRES** général 5,6 %, IPRES cadre 2,4 %, **CSS** maladie, **IR** (barème progressif), **TRIMF**.
- Charges patronales : IPRES 8,4 %, CSS (AT/PF/maladie), **CFCE**.
- Net à payer.

Le modèle `Payroll` stocke chaque ligne (gains, retenues, charges patronales, totaux). Workflow : `draft → validated → paid`.

## Conventions de code

- **Locale d'affichage** : `fr-FR` par défaut, monnaie `XOF` sans décimales.
- **Server vs Client** : tout composant utilisant `useI18n`, `useDashboard`, `useState`, etc., doit commencer par `'use client'`.
- **Sécurité API** : chaque route lit le token, vérifie le rôle, puis filtre par `pharmacyId` (sauf routes SuperAdmin qui agissent cross-tenant).
- **Pas de mock DB en test** : intégrer contre une vraie base.
- **Pas d'`as const`** sur les dictionnaires de traduction.

## Cookies utilisés

| Cookie                       | Rôle                                                  |
| ---------------------------- | ----------------------------------------------------- |
| `neuropharm-token`           | JWT actif (utilisateur courant, possiblement impersoné) |
| `neuropharm-original-token`  | JWT du SA, posé avant impersonation                   |
| `neuropharm-impersonating`   | Marqueur (id pharmacie cible)                         |
| `neuropharm-locale`          | Préférence langue (localStorage en miroir)            |
