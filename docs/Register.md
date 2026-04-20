# Inscription — Nouvelle pharmacie — NeuroPharm v1

> **Règle anti-régression** : toute modification de ce flux (API, page, logique frontend) **doit** mettre ce fichier à jour avant le merge.

---

## 1. Vue d'ensemble

La page `/register` permet à une nouvelle pharmacie de s'inscrire sur la plateforme NeuroPharm. Une seule inscription crée simultanément :
- La pharmacie (`Pharmacy`)
- L'abonnement initial (`Subscription`)
- Le compte admin de la pharmacie (`User` avec rôle `ADMIN`)
- Les paramètres par défaut (`PharmacySettings`)

**Fichiers principaux :**

| Fichier | Rôle |
|---------|------|
| `src/app/register/page.tsx` | Page UI d'inscription |
| `src/app/api/auth/register/route.ts` | `POST` — création pharmacie + admin |

**Route publique** — aucune authentification requise.

---

## 2. Route `POST /api/auth/register`

**Pas d'auth requise** (route publique)

**Corps de requête :**
```json
{
  "pharmacyName": "Pharmacie du Plateau",
  "pharmacyAddress": "12 Avenue Pompidou",
  "pharmacyCity": "Dakar",
  "pharmacyPhone": "338201234",
  "adminFirstName": "Amadou",
  "adminLastName": "Diallo",
  "adminEmail": "amadou@pharmacie-plateau.sn",
  "adminPassword": "motdepasse123",
  "plan": "TRIAL"
}
```

**Séquence (transaction atomique) :**
```
1. Vérifier unicité de adminEmail
2. Hash du mot de passe (bcrypt)
3. Créer Pharmacy
4. Créer PharmacySettings (valeurs par défaut)
5. Créer Subscription (plan sélectionné, status: ACTIVE, endDate selon plan)
6. Créer User ADMIN avec pharmacyId
7. Écrire SystemLog PHARMACY_CREATE
8. Générer JWT + poser cookie
9. Retourner user + pharmacyId
```

**Comportements d'erreur :**

| Condition | HTTP | Message |
|-----------|------|---------|
| Email déjà utilisé | 409 | Un compte avec cet email existe déjà |
| Champs requis manquants | 400 | Champs requis manquants |
| Mot de passe < 6 caractères | 400 | Le mot de passe doit contenir au moins 6 caractères |
| Plan invalide | 400 | Plan invalide |

> ⚠️ La transaction est atomique : si une étape échoue, aucune donnée n'est créée en base.

---

## 3. Plans disponibles à l'inscription

| Plan | Libellé | Prix | Abonnement initial |
|------|---------|:----:|-------------------|
| `TRIAL` | Essai gratuit | 0 XOF | 30 jours (endDate = now + 30j) |
| `BASIC` | Basique | 15 000 XOF/mois | Accès immédiat, paiement requis ensuite |
| `PROFESSIONAL` | Professionnel | 35 000 XOF/mois | Accès immédiat, paiement requis ensuite |
| `ENTERPRISE` | Entreprise | Sur devis | Contact SA requis |

**EndDate par défaut à l'inscription :**
- `TRIAL` : `now + 30 jours`
- `BASIC` / `PROFESSIONAL` : `now + 30 jours` (période de grâce — le premier paiement Wave active la période réelle)
- `ENTERPRISE` : fixé manuellement par le SuperAdmin

---

## 4. Valeurs par défaut créées

### `PharmacySettings` (défauts)
```
taxRate           = 0
lowStockThreshold = 10
expiryAlertDays   = 30
receiptHeader     = null
receiptFooter     = null
```

### `Subscription` (défauts)
```
plan             = (choix inscription)
status           = ACTIVE
startDate        = now
endDate          = now + 30j
autoPayEnabled   = false
amount           = 0
```

---

## 5. Interface utilisateur

### 5.1 Formulaire d'inscription

**Section Pharmacie :**

| Champ | Requis | Description |
|-------|--------|-------------|
| Nom de la pharmacie | Oui | Raison sociale |
| Adresse | Non | Adresse physique |
| Ville | Non | Ville (défaut : Dakar) |
| Téléphone | Non | Numéro Sénégal |

**Section Compte administrateur :**

| Champ | Requis | Description |
|-------|--------|-------------|
| Prénom | Oui | |
| Nom | Oui | |
| Email | Oui | Sera l'identifiant de connexion |
| Mot de passe | Oui | Minimum 6 caractères |
| Confirmer MDP | Oui | Doit correspondre |

**Section Choix du plan :**

Cards interactives pour chaque plan avec :
- Nom et description
- Prix mensuel / annuel
- Liste des fonctionnalités incluses
- Indication si paiement requis

### 5.2 Progression et validation

- Validation en temps réel (email format, MDP longueur, confirmation)
- Indicateur de force du mot de passe
- Bouton « Créer mon compte » désactivé jusqu'à validation complète
- Message de succès avec redirection automatique vers `/dashboard`

### 5.3 Lien vers connexion

Lien vers `/login` pour les pharmacies déjà inscrites.

---

## 6. Post-inscription

Après une inscription réussie :
1. L'admin est automatiquement connecté (JWT posé)
2. Redirection vers `/dashboard`
3. Si le plan choisi est payant, une notification de bienvenue suggère d'effectuer le premier paiement via `/dashboard/parametres`
4. Un `SystemLog` `PHARMACY_CREATE` est écrit avec les détails (nom pharmacie, plan, email admin)

---

## 7. Règles métier

1. **Un seul admin par pharmacie à l'inscription** : les autres employés sont créés ensuite par l'admin via `/dashboard/personnel`.
2. **Email unique global** : l'email admin doit être unique dans toute la table `User` — pas de réutilisation entre pharmacies.
3. **Transaction atomique** : si la création du `User` échoue après la création de `Pharmacy`, aucune donnée partielle ne reste en base.
4. **Rôle fixe** : le premier compte créé à l'inscription a toujours le rôle `ADMIN` — pas de choix possible.
5. **Isolation immédiate** : dès la création, toutes les données de la pharmacie sont isolées par son `pharmacyId` — aucune donnée n'est partagée par défaut.
6. **SystemLog** : la création d'une pharmacie est une action SaaS — elle s'écrit dans `SystemLog` (pas `AuditLog`) pour visibilité du SuperAdmin.
