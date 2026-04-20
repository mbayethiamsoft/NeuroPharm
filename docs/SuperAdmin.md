# Espace SuperAdmin (SaaS)

L'espace SuperAdmin est une application administrative séparée à l'intérieur du même Next.js. Il est exclusivement destiné au rôle `SUPER_ADMIN`. Les utilisateurs `SUPER_ADMIN` n'ont **aucun** `pharmacyId` et n'accèdent **jamais** aux modules métier d'une pharmacie, sauf en mode impersonation.

## Pages

Toutes sous `/dashboard/superadmin/*`, accès limité au rôle `SUPER_ADMIN`.

| Route                                 | Fichier                                                | Rôle  | Description                                                       |
| ------------------------------------- | ------------------------------------------------------ | ----- | ----------------------------------------------------------------- |
| `/dashboard/superadmin`               | `src/app/dashboard/superadmin/page.tsx`                | SA    | KPIs cross-tenant, distribution des plans, derniers logs, liens rapides |
| `/dashboard/superadmin/pharmacies`    | `src/app/dashboard/superadmin/pharmacies/page.tsx`     | SA    | Liste / création, toggle `isActive`, action « se connecter en tant que » |
| `/dashboard/superadmin/utilisateurs`  | `src/app/dashboard/superadmin/utilisateurs/page.tsx`   | SA    | Liste / filtre rôle, toggle actif, modal reset password           |
| `/dashboard/superadmin/abonnements`   | `src/app/dashboard/superadmin/abonnements/page.tsx`    | SA    | Onglets abonnements / paiements, change plan / status / extend    |
| `/dashboard/superadmin/logs`          | `src/app/dashboard/superadmin/logs/page.tsx`           | SA    | Lecture filtrée de `SystemLog` (level, action, pagination)        |
| `/dashboard/superadmin/support`       | `src/app/dashboard/superadmin/support/page.tsx`        | SA    | Tickets de support (filtre statut, modal de réponse)              |
| `/dashboard/superadmin/parametres`    | `src/app/dashboard/superadmin/parametres/page.tsx`     | SA    | Éditeur clé/valeur de `SaasConfig`                                |

## Routes API

Toutes sous `/api/superadmin/*`, vérifient le rôle `SUPER_ADMIN`.

| Route                                | Verbes      | Description                                                                          |
| ------------------------------------ | ----------- | ------------------------------------------------------------------------------------ |
| `/api/superadmin/dashboard`          | `GET`       | KPIs (counts, revenus, distribution plans) calculés en parallèle via Prisma          |
| `/api/superadmin/users`              | `GET`, `PUT`| GET avec filtres `search` / `pharmacyId` / `role` ; PUT actions `toggle_active`, `reset_password` |
| `/api/superadmin/subscriptions`      | `GET`, `PUT`| GET avec paiements joints ; PUT `change_plan`, `change_status`, `extend`             |
| `/api/superadmin/logs`               | `GET`       | Lecture `SystemLog` avec filtres `level` / `action` / `limit` / `offset`             |
| `/api/superadmin/impersonate`        | `POST`, `DELETE` | POST : démarre l'impersonation ; DELETE : restaure le JWT SA                  |
| `/api/superadmin/settings`           | `GET`, `PUT`| GET/PUT (upsert) sur `SaasConfig`                                                    |

Routes connexes (hors `/api/superadmin/*` mais utilisées par l'espace SA) :

- `/api/support` — `POST` public (login/register/modal de contact), `GET`/`PUT` réservés SA.
- `/api/permissions` — `GET`/`PUT` (réservé `ADMIN` côté pharmacie, pas SA).

## Impersonation — flux détaillé

```
SA sur /dashboard/superadmin/pharmacies
        │
        ├──> POST /api/superadmin/impersonate { pharmacyId }
        │      ├─ vérifie rôle SUPER_ADMIN
        │      ├─ copie le cookie 'neuropharm-token' courant dans 'neuropharm-original-token'
        │      ├─ génère un JWT ADMIN pour la pharmacie cible
        │      ├─ écrase 'neuropharm-token' avec ce JWT
        │      └─ pose 'neuropharm-impersonating' = pharmacyId
        │
        ├──> Redirection vers /dashboard
        │      └─ DashboardProvider détecte l'impersonation via /api/auth/me
        │      └─ ImpersonationBanner s'affiche en haut de l'écran
        │
        └──> Sortie : DELETE /api/superadmin/impersonate
               ├─ restaure 'neuropharm-token' depuis 'neuropharm-original-token'
               ├─ supprime 'neuropharm-original-token' et 'neuropharm-impersonating'
               └─ redirection vers /dashboard/superadmin
```

> Toutes les entrées/sorties d'impersonation **doivent** produire un `SystemLog` (`action: 'IMPERSONATE_START' | 'IMPERSONATE_END'`).

## Règles RBAC SuperAdmin vs Admin

| Action                                      | SUPER_ADMIN | ADMIN (pharmacie) |
| ------------------------------------------- | :---------: | :---------------: |
| Voir le dashboard SaaS                      |     ✅      |        ❌          |
| Créer / désactiver une pharmacie            |     ✅      |        ❌          |
| Lister tous les utilisateurs (cross-tenant) |     ✅      |        ❌          |
| Reset password n'importe quel utilisateur   |     ✅      |        ❌          |
| Changer plan / statut d'abonnement          |     ✅      |        ❌          |
| Lire `SystemLog`                            |     ✅      |        ❌          |
| Répondre à un ticket de support             |     ✅      |        ❌          |
| Modifier `SaasConfig`                       |     ✅      |        ❌          |
| Impersonifier un admin pharmacie            |     ✅      |        ❌          |
| Gérer les permissions intra-pharmacie       |     ❌      |        ✅          |
| Modifier les permissions d'un autre `ADMIN` |     ❌      |        ❌          |
| Modifier les permissions d'un `SUPER_ADMIN` |     ❌      |        ❌          |
| Voir les ventes / stock d'une pharmacie     |   ❌ (sauf impersonation)   |     ✅           |

## Composants liés

- `src/components/Sidebar.tsx` — affiche la nav SaaS si `role === 'SUPER_ADMIN'`.
- `src/components/Header.tsx` — titres SA, recherche **à rendre role-aware** (cf. `Tasks.md`), lien « Paramètres » du dropdown profil **à rediriger** vers `/dashboard/superadmin/parametres` quand SA.
- `src/components/ImpersonationBanner.tsx` — bandeau jaune en mode impersonation.
- `src/components/DashboardProvider.tsx` — expose `isImpersonating`, `impersonatingPharmacy`, `exitImpersonation()`.
