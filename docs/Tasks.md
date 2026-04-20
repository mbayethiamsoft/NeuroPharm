# Tasks — NeuroPharm v1

État au **2026-04-09**. Mise à jour à chaque session.

## ✅ Terminé

### Sessions précédentes

- **Espace SuperAdmin SaaS complet** (~61 routes) :
  - Pages : `dashboard`, `pharmacies`, `utilisateurs`, `abonnements`, `logs`, `support`, `parametres`.
  - APIs `/api/superadmin/*` : `dashboard`, `users`, `subscriptions`, `logs`, `impersonate`, `settings`.
  - KPIs cross-tenant, distribution des plans, derniers logs sur le dashboard SA.
- **RBAC dynamique** :
  - Modèle `UserPermission` (override par utilisateur).
  - `src/lib/rbac.ts` : `ALL_MENU_KEYS`, `DEFAULT_PERMISSIONS`, `MENU_LABELS` (FR/EN).
  - Page `/dashboard/permissions` (admin pharmacie) avec grille de cases à cocher.
  - API `/api/permissions` (GET/PUT) — restrictions : pas de modification des rôles `ADMIN` / `SUPER_ADMIN`.
- **Refonte Sidebar / Header** :
  - Sidebar role-aware (nav SA vs nav pharmacie filtrée par RBAC).
  - Header : titres de page i18n, sélecteur de langue (icône Globe), dropdown profil.
- **Impersonation** : flux cookie swap (`neuropharm-original-token` / `neuropharm-impersonating`), `ImpersonationBanner`, restauration via DELETE.
- **Support tickets** : POST public + UI SA (filtre statut, modal de réponse).
- **Login route** : refuse `isActive === false` (403).
- **i18n base** : `I18nProvider`, `fr.ts`, `en.ts`, sections `common`, `auth`, `nav`, `dashboard`, `payroll`, `months`, `stock`, `sales`, `notifications`, `settings`, `profile`. Persistance localStorage.
- **Paie sénégalaise** : `payroll-calc.ts` (IPRES général/cadre, CSS, IR, TRIMF, CFCE), modèle `Payroll` complet, workflow draft/validated/paid.
- **PWA** : manifest + service worker (commit `dffdc35`).

## 🚧 En cours / À faire (prompt corrections — session courante)

> Prochain plan d'implémentation. **Aucun de ces points n'est encore codé.**

### A. Admin Pharmacie — CRUD personnel

- [ ] Étendre `/api/personnel/route.ts` :
  - `PUT` (édition `firstName`, `lastName`, `phone`, `role`, `isActive`).
  - `DELETE` (soft delete : `isActive = false`).
  - Action explicite block/unblock.
  - GET : inclure les inactifs avec badge de statut.
  - Audit log systématique.
- [ ] Refonte `/dashboard/personnel/page.tsx` : colonne actions (Éditer, Bloquer/Débloquer, Supprimer), modal d'édition, badge actif/bloqué.
- [ ] Vérifier que login refuse bien les bloqués (déjà OK côté `/api/auth/login`).

### B. SuperAdmin — gestion paiements & plans

- [ ] Ajouter un toggle « paiement automatique » par pharmacie (champ à ajouter sur `Subscription` ou `Pharmacy`).
- [ ] Permettre l'enregistrement d'un **paiement manuel** depuis l'espace SA (avec `createSystemLog` mentionnant l'initiateur).
- [ ] Bouton « Choisir un plan » sur `/dashboard/superadmin/abonnements` (sélection TRIAL/BASIC/PRO/ENTERPRISE).

### C. Recherche SuperAdmin role-aware

- [ ] Dans `Header.tsx`, rendre `searchablePages` dépendant du rôle : pour SA → `pharmacies`, `utilisateurs`, `abonnements`, `logs`, `paiements` (pas de modules métier pharmacie).

### D. Lien « Paramètres » du dropdown profil

- [ ] Quand l'utilisateur courant est `SUPER_ADMIN`, le lien « Paramètres » doit pointer vers `/dashboard/superadmin/parametres` (et pas vers les paramètres pharmacie).

### E. Logs système — branchement effectif

- [ ] Appeler `createSystemLog()` aux endroits sensibles :
  - `POST /api/auth/login` (succès et échec).
  - `POST /api/superadmin/pharmacies` (création).
  - `PUT /api/superadmin/subscriptions` (change plan / status, extend).
  - `POST/DELETE /api/superadmin/impersonate`.
  - Reset password depuis `/api/superadmin/users` (PUT).
- [ ] Étendre `/api/superadmin/logs` et la page logs avec filtres **date** / **type** / **utilisateur**.

### F. i18n SuperAdmin

- [ ] Ajouter une section `superadmin` aux dictionnaires `src/lib/i18n/fr.ts` et `src/lib/i18n/en.ts`.
- [ ] Remplacer toutes les chaînes en dur des pages `/dashboard/superadmin/*` par `t('superadmin.…')`.
- [ ] Vérifier qu'il n'y a plus de mélange FR/EN dans une vue.

## 🧊 Backlog / idées

- Tests e2e (Playwright) sur les parcours critiques (login, vente, impersonation).
- Monitoring (Sentry ou équivalent).
- Exports CSV / PDF (ventes, paie, audit).
- Notifications email (rappels échéance abonnement, alertes de fraude).
- Génération automatique des bulletins de salaire en PDF.
- Migration `prisma db push` → vraies migrations versionnées (`prisma migrate`).
