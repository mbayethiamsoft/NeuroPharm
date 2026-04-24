# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

# NeuroPharm v1 — Instructions agent

NeuroPharm est une plateforme SaaS multi-tenant de gestion de pharmacies (Sénégal). Ce dépôt contient la v1 (Next.js 16.2.2 App Router + Prisma 7 + PostgreSQL).

## Commandes essentielles

```bash
# Développement
npm run dev          # serveur local (Turbopack)
npm run build        # build production
npm run lint         # ESLint

# Base de données (toujours dans cet ordre après un changement de schéma)
npm run db:push      # npx prisma db push  → applique le schéma
npm run db:generate  # npx prisma generate → resynchronise le client TS
npm run db:seed      # seed initial
npm run db:studio    # interface Prisma Studio
npm run db:reset     # force-reset + seed (destructif)
```

> ⚠️ Ne jamais oublier `db:generate` après `db:push` — incident historique : les types TS restent désynchronisés et provoquent des erreurs `Property X does not exist`.

## Documentation projet

Avant de commencer une tâche, consulter au besoin :

**Infrastructure & SaaS**
- `docs/Architecture.md` — vue d'ensemble technique, auth, RBAC, i18n, multi-tenant, cookies.
- `docs/Database.md` — modèles Prisma, conventions multi-tenant, workflow migrations.
- `docs/SuperAdmin.md` — espace SaaS (pages, routes API, impersonation).
- `docs/i18n.md` — gestion des traductions FR/EN.
- `docs/Tasks.md` — état d'avancement, chantiers en cours, backlog.

**Auth & Accès**
- `docs/Login.md` — authentification JWT, cookies, redirection, protection des routes.
- `docs/Register.md` — inscription nouvelle pharmacie (création atomique pharmacy + admin + subscription).
- `docs/Permissions.md` — RBAC, permissions par défaut par rôle, surcharges individuelles (`UserPermission`).
- `docs/Profil.md` — mise à jour profil utilisateur, changement de mot de passe.

**Paiements & Abonnements**
- `docs/Paiements.md` — **flux Wave complets** (initiate, confirm, changement de plan, anti-popup-blocker, variables env, couleurs de marque). ← À lire OBLIGATOIREMENT avant de toucher aux paiements.
- `docs/PaiementWave.md` — page QR Wave (`/dashboard/paiement-wave`) : états, timer, polling, simulation dev, couleurs.
- `docs/Parametres.md` — configuration pharmacie, onglet abonnement, constantes tarifs (3 endroits synchrones).

**Modules métier pharmacie**
- `docs/Medicaments.md` — catalogue médicaments, CRUD, soft delete, badges stock/expiration.
- `docs/Stock.md` — mouvements de stock (IN/OUT/ADJUSTMENT/RETURN/EXPIRED), campagnes inventaire.
- `docs/Ventes.md` — point de vente (POS), calculs, décrémentation stock atomique, événement temps réel.
- `docs/Carnet.md` — ventes à crédit (carnet), clients, remboursements, rapport PDF, plafond de crédit.
- `docs/Fournisseurs.md` — gestion fournisseurs, commandes d'achat (workflow statuts).
- `docs/Personnel.md` — employés, présences, permissions par défaut par rôle.
- `docs/Comptabilite.md` — résumé financier (revenus ventes vs dépenses), gestion des dépenses.
- `docs/Paie.md` — bulletins de salaire sénégalais (IPRES, CSS, IR progressif, TRIMF, CFCE), workflow draft/validated/paid.
- `docs/Anomalies.md` — alertes temps réel (stock, expiration, fraude) + journal d'audit (`AuditLog`).
- `docs/Notifications.md` — notifications persistées en DB, marquage lu, types et sévérités.

> **Rappel** : `AuditLog` = actions intra-pharmacie (scopé `pharmacyId`). `SystemLog` = actions SaaS cross-tenant (SuperAdmin).

### Règle anti-régression documentation

> **Toute modification d'un processus ou d'une fonctionnalité documentée dans `docs/` doit entraîner la mise à jour du fichier `.md` correspondant dans la même session.** Ne jamais laisser la documentation en décalage avec le code : un fichier `.md` obsolète est pire qu'aucune documentation car il induit activement en erreur les sessions futures.

## Règles essentielles

1. **Documentation à jour** : si tu modifies un flux ou une fonctionnalité couverte dans `docs/`, **mets à jour le fichier `.md` correspondant** avant de clore la session. Cf. section « Règle anti-régression documentation » ci-dessus.
2. **Langue UI** : français par défaut. Toute chaîne destinée à l'utilisateur passe par `useI18n()` et doit exister à la fois dans `src/lib/i18n/fr.ts` et `src/lib/i18n/en.ts`.
3. **Multi-tenant** : toute requête Prisma sur des entités métier (medications, sales, payrolls, …) **doit** filtrer par `pharmacyId`. Le `pharmacyId` provient du JWT — jamais du body client.
4. **RBAC** : avant d'ajouter un menu ou une route, mettre à jour `src/lib/rbac.ts` (`ALL_MENU_KEYS`, `DEFAULT_PERMISSIONS`, `MENU_LABELS`) et vérifier les permissions côté API et côté Sidebar.
5. **Prisma** : `schema.prisma` n'a **pas** de `url` dans `datasource db` (configuration via `prisma.config.ts` + `@prisma/adapter-pg`). Après tout changement de schéma : `npm run db:push` **puis** `npm run db:generate`.
6. **i18n typing** : `Translations` est `Record<string, Record<string, string>>`, pas `typeof fr as const`. Ne pas réintroduire `as const` (incident résolu — casse l'inférence côté `en.ts`).
7. **Logs système** : pour toute action sensible (login, création pharmacie, changement plan, impersonation, reset password…), appeler `createSystemLog()` (`src/lib/system-log.ts`).
8. **Audit logs métier** : les actions intra-pharmacie (vente, ajustement stock, modif personnel…) écrivent dans `AuditLog` (lié à `pharmacyId`), pas dans `SystemLog`.
9. **Format monétaire** : XOF avec locale `fr-FR` (`Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' })`). Pas de décimales pour le franc CFA.
10. **SuperAdmin vs Admin pharmacie** : ces deux rôles ont des sidebars, dashboards et droits totalement disjoints. Le `SUPER_ADMIN` ne voit jamais les modules métier d'une pharmacie sauf en mode impersonation.
11. **Soft-delete** : préférer `isActive: false` à un `DELETE` SQL pour `User`, `Supplier`, `Medication`, `Pharmacy`.
12. **Paiements Wave** : lire `docs/Paiements.md` avant toute modification. Pattern anti-popup-blocker obligatoire (`window.open` AVANT tout `await`). Couleur Wave = `#1A73E8`. Montants définis à 3 endroits synchrones (voir doc).

## Conventions code

- Pas de fichiers Markdown créés sans demande explicite (sauf cette doc).
- Pas de `console.log` laissés en production ; préférer `createSystemLog` ou `auditLog`.
- Composants client : `'use client'` en première ligne. Les hooks (`useI18n`, `useDashboard`) ne fonctionnent que côté client.
- Routes API : toujours vérifier le token via `getAuthUser()` ou équivalent, puis le rôle, puis le `pharmacyId`.
- Ne jamais exposer `password` ni `email` dans une réponse API non authentifiée.
- Listes paginées : paramètres `limit` / `offset`.
