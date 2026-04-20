# Profil utilisateur — NeuroPharm v1

> **Règle anti-régression** : toute modification de ce flux (API, page, logique frontend) **doit** mettre ce fichier à jour avant le merge.

---

## 1. Vue d'ensemble

La page `/dashboard/profil` permet à chaque utilisateur connecté de consulter et modifier ses informations personnelles, et de changer son mot de passe.

**Fichiers principaux :**

| Fichier | Rôle |
|---------|------|
| `src/app/dashboard/profil/page.tsx` | Page UI profil |
| `src/app/api/auth/me/route.ts` | `GET` — infos utilisateur courant |
| `src/app/api/auth/profile/route.ts` | `PUT` — mise à jour profil et mot de passe |

**Accès** : tout utilisateur authentifié (tous rôles).

---

## 2. Route `GET /api/auth/me`

**Auth** : tout utilisateur authentifié (JWT valide)

**Réponse :**
```json
{
  "user": {
    "id": "clxxx...",
    "email": "mariama@pharmacie.sn",
    "firstName": "Mariama",
    "lastName": "Ba",
    "phone": "771234567",
    "role": "PHARMACIST",
    "pharmacyId": "clyyy...",
    "pharmacy": {
      "name": "Pharmacie du Plateau"
    },
    "lastLogin": "2024-03-15T08:30:00Z",
    "createdAt": "2024-01-10T00:00:00Z"
  },
  "isImpersonating": false
}
```

> ⚠️ Ne jamais inclure `password` dans la réponse.

**Cas impersonation** : si le `SUPER_ADMIN` est en mode impersonation, `isImpersonating: true` est retourné et un bandeau jaune est affiché dans l'UI.

---

## 3. Route `PUT /api/auth/profile`

**Auth** : tout utilisateur authentifié

**Corps de requête — mise à jour des infos :**
```json
{
  "firstName": "Mariama",
  "lastName": "Ba",
  "phone": "771234567"
}
```

**Corps de requête — changement de mot de passe :**
```json
{
  "currentPassword": "ancien_mdp",
  "newPassword": "nouveau_mdp",
  "confirmPassword": "nouveau_mdp"
}
```

**Validation :**
- `firstName` et `lastName` : non vides si fournis
- `currentPassword` : vérifié par bcrypt contre le hash en DB
- `newPassword` : ≥ 6 caractères
- `newPassword === confirmPassword` : vérifié côté serveur

**Comportements d'erreur :**

| Condition | HTTP | Message |
|-----------|------|---------|
| Mot de passe actuel incorrect | 401 | Mot de passe actuel incorrect |
| Nouveau mot de passe trop court | 400 | Le mot de passe doit contenir au moins 6 caractères |
| Confirmation ne correspond pas | 400 | Les mots de passe ne correspondent pas |

**Effets de bord :**
1. Met à jour le `User` (firstName, lastName, phone)
2. Si changement de mot de passe : hash bcrypt du nouveau MDP + mise à jour
3. Écrit un `AuditLog` `UPDATE` / `user`

---

## 4. Interface utilisateur

### 4.1 Informations affichées (lecture seule)

| Information | Source |
|-------------|--------|
| Nom complet | `firstName + lastName` |
| Email | `User.email` |
| Rôle | Badge coloré selon `User.role` |
| Pharmacie | `Pharmacy.name` |
| Dernière connexion | `User.lastLogin` (formaté) |
| Membre depuis | `User.createdAt` (formaté) |

### 4.2 Formulaire de modification

| Champ | Requis | Notes |
|-------|--------|-------|
| Prénom | Oui | Modifiable |
| Nom | Oui | Modifiable |
| Téléphone | Non | Modifiable |
| Email | — | **Non modifiable** depuis cette page |

### 4.3 Section changement de mot de passe

| Champ | Requis | Notes |
|-------|--------|-------|
| Mot de passe actuel | Oui | Vérifié côté serveur |
| Nouveau mot de passe | Oui | Minimum 6 caractères |
| Confirmer le mot de passe | Oui | Doit correspondre au précédent |

Le formulaire de changement de mot de passe est **distinct** du formulaire d'infos — une seule action à la fois.

### 4.4 Badge de rôle

| Rôle | Label FR | Couleur |
|------|---------|---------|
| `SUPER_ADMIN` | Super Admin | Violet |
| `ADMIN` | Administrateur | Bleu |
| `PHARMACIST` | Pharmacien | Vert |
| `CASHIER` | Caissier | Ambre |
| `ACCOUNTANT` | Comptable | Cyan |

---

## 5. Règles métier

1. **Email non modifiable** : l'email est l'identifiant unique de connexion — sa modification nécessite une procédure de vérification non implémentée en v1.
2. **Bcrypt** : les mots de passe sont toujours hashés avec bcrypt (cost factor 10) — jamais en clair en DB.
3. **Propre compte uniquement** : un utilisateur ne peut modifier que son propre profil. L'admin modifie les infos de ses employés via `/dashboard/personnel`.
4. **Impersonation** : un SUPER_ADMIN en mode impersonation voit le profil de l'admin impersoné — ses modifications s'appliquent à l'utilisateur impersoné (tracer via `SystemLog`).
5. **i18n** : les libellés des rôles et les messages d'erreur passent par `useI18n()` — toujours ajouter les traductions FR et EN en parallèle.
