# Authentification — Login & Logout — NeuroPharm v1

> **Règle anti-régression** : toute modification de ce flux (API, page, logique frontend) **doit** mettre ce fichier à jour avant le merge.

---

## 1. Vue d'ensemble

La page `/login` est le point d'entrée unique pour tous les utilisateurs (admins pharmacie, employés, super-admin). L'authentification repose sur JWT stocké en cookie httpOnly.

**Fichiers principaux :**

| Fichier | Rôle |
|---------|------|
| `src/app/login/page.tsx` | Page UI de connexion |
| `src/app/api/auth/login/route.ts` | `POST` — génération du JWT |
| `src/app/api/auth/logout/route.ts` | `POST` — suppression du cookie |
| `src/lib/auth.ts` | Utilitaires JWT (`signJWT`, `verifyJWT`, `getAuthUser`) |

---

## 2. Route `POST /api/auth/login`

**Pas d'auth requise** (route publique)

**Corps de requête :**
```json
{
  "email": "admin@pharmacie.sn",
  "password": "motdepasse"
}
```

**Séquence :**
```
1. Trouver l'utilisateur par email
2. Vérifier isActive === true
3. Comparer le mot de passe avec bcrypt
4. Générer un JWT signé (24h)
5. Poser le cookie httpOnly
6. Mettre à jour User.lastLogin
7. Écrire un AuditLog LOGIN
8. Retourner les infos utilisateur (sans password)
```

**Comportements d'erreur :**

| Condition | HTTP | Message |
|-----------|------|---------|
| Email introuvable | 401 | Email ou mot de passe incorrect |
| Mot de passe incorrect | 401 | Email ou mot de passe incorrect |
| Compte désactivé | 403 | Compte désactivé. Contactez l'administrateur. |

> ⚠️ En cas d'email introuvable et de MDP incorrect, le message est **identique** (sécurité : pas d'énumération des emails).

**Réponse (succès) :**
```json
{
  "user": {
    "id": "...",
    "email": "admin@pharmacie.sn",
    "firstName": "Amadou",
    "lastName": "Diallo",
    "role": "ADMIN",
    "pharmacyId": "clxxx..."
  }
}
```

---

## 3. Payload JWT

```typescript
interface JWTPayload {
  userId:     string
  email:      string
  role:       Role           // SUPER_ADMIN | ADMIN | PHARMACIST | CASHIER | ACCOUNTANT
  pharmacyId: string | null  // null pour SUPER_ADMIN
  iat:        number
  exp:        number         // iat + 86400 (24h)
}
```

**Cookie :**
```
Name:     neuropharm-token
HttpOnly: true
SameSite: Lax
Secure:   true (production uniquement)
Path:     /
MaxAge:   86400 (24h)
```

---

## 4. Cookies d'impersonation

Quand un SUPER_ADMIN impersonne une pharmacie, deux cookies supplémentaires sont posés :

```
neuropharm-original-token   → token SA original (restauré à la fin de l'impersonation)
neuropharm-impersonating    → "true"
```

La présence de `neuropharm-impersonating` déclenche l'affichage du bandeau jaune dans l'UI.

---

## 5. Route `POST /api/auth/logout`

**Auth** : requise (cookie JWT valide)

**Comportement :**
1. Efface le cookie `neuropharm-token`
2. Efface les cookies d'impersonation si présents
3. Écrit un `SystemLog` `LOGOUT` (ou `AuditLog` selon rôle)
4. Redirige vers `/login`

---

## 6. Redirection après login

| Rôle | Destination |
|------|-------------|
| `SUPER_ADMIN` | `/dashboard/superadmin` |
| `ADMIN` | `/dashboard` |
| `PHARMACIST` | `/dashboard` |
| `CASHIER` | `/dashboard` |
| `ACCOUNTANT` | `/dashboard` |

La redirection est gérée côté client dans `login/page.tsx` après réception de la réponse API.

---

## 7. Interface utilisateur

### 7.1 Formulaire de connexion

| Champ | Type | Requis |
|-------|------|--------|
| Email | email | Oui |
| Mot de passe | password (avec toggle affichage) | Oui |
| Bouton « Se connecter » | submit | — |

### 7.2 Message de bienvenue personnalisé

Si l'utilisateur se connecte pour la première fois (flag détecté via `lastLogin === null`), un message de bienvenue personnalisé est affiché.

### 7.3 Modal support (accessible sans connexion)

Un bouton « Contacter le support » accessible depuis la page login ouvre une modal permettant de soumettre un ticket via `POST /api/support` (route publique) :

| Champ | Requis |
|-------|--------|
| Nom | Oui |
| Email | Oui |
| Sujet | Oui |
| Message | Oui |
| Priorité | Non (défaut : `normal`) |

### 7.4 Lien vers inscription

Lien vers `/register` pour les nouvelles pharmacies.

---

## 8. Protection des routes (`middleware`)

Un middleware Next.js vérifie la présence et validité du cookie JWT sur toutes les routes `/dashboard/*`. Si invalide ou absent : redirection vers `/login`.

**Routes publiques (pas de vérification) :**
- `/login`
- `/register`
- `/api/auth/login`
- `/api/auth/logout`
- `/api/support`
- `/api/payments/confirm` (polling wave — pas de cookie disponible dans l'onglet)
- `/dashboard/paiement-wave` (page QR — onglet ouvert sans session)

---

## 9. Règles de sécurité

1. **Pas d'énumération d'emails** : le message d'erreur est identique pour email inexistant et MDP incorrect.
2. **Bcrypt** : comparaison avec `bcrypt.compare()` — jamais de comparaison de hash à hash.
3. **Cookie httpOnly** : le JWT n'est jamais accessible depuis `document.cookie` ou JavaScript.
4. **`pharmacyId` depuis JWT uniquement** : toute route API lisant le `pharmacyId` le prend depuis le token décodé — jamais depuis le body de la requête.
5. **Logs** : chaque connexion réussie écrit un `AuditLog` `LOGIN` avec IP. Les échecs ne sont pas logués (pas de bruteforce tracking en v1).
6. **Expiration** : les tokens expirent après 24h — pas de refresh token en v1 (l'utilisateur est redirigé vers `/login`).
