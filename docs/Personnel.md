# Personnel — NeuroPharm v1

> **Règle anti-régression** : toute modification de ce flux (API, page, logique frontend) **doit** mettre ce fichier à jour avant le merge.

---

## 1. Vue d'ensemble

La page `/dashboard/personnel` permet à l'admin de gérer les employés de la pharmacie et de suivre leurs présences. Les employés sont des `User` avec un `pharmacyId` non null et un rôle différent de `SUPER_ADMIN`.

**Fichiers principaux :**

| Fichier | Rôle |
|---------|------|
| `src/app/dashboard/personnel/page.tsx` | Page UI (deux onglets) |
| `src/app/api/personnel/route.ts` | `GET` (liste) + `POST` (créer employé) |
| `src/app/api/personnel/[id]/route.ts` | `PUT` (modifier) + `DELETE` (désactiver) |
| `src/app/api/personnel/[id]/toggle/route.ts` | `POST` (activer/désactiver compte) |
| `src/app/api/personnel/attendance/route.ts` | `GET` + `POST` (présences) |

---

## 2. Modèles Prisma

### `User` (employé)

```prisma
enum Role {
  SUPER_ADMIN   // Plateforme SaaS — pas de pharmacyId
  ADMIN         // Admin pharmacie (créé à l'inscription)
  PHARMACIST    // Pharmacien — accès médicaments, stock
  CASHIER       // Caissier — accès POS uniquement
  ACCOUNTANT    // Comptable — accès comptabilité, paie
}

model User {
  id         String    @id @default(cuid())
  email      String    @unique
  password   String    // bcrypt hashé
  firstName  String
  lastName   String
  phone      String?
  role       Role      @default(CASHIER)
  pharmacyId String?   // null pour SUPER_ADMIN
  isActive   Boolean   @default(true)
  lastLogin  DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
}
```

### `Attendance`

```prisma
model Attendance {
  id         String    @id @default(cuid())
  userId     String
  pharmacyId String
  date       DateTime  @default(now())
  checkIn    DateTime?
  checkOut   DateTime?
  status     String    @default("present") // present, absent, late, leave
  notes      String?
  createdAt  DateTime  @default(now())
}
```

---

## 3. Routes API

### `GET /api/personnel`

**Auth** : `ADMIN` uniquement

**Réponse :**
```json
{
  "users": [
    {
      "id": "...",
      "firstName": "Mariama",
      "lastName": "Ba",
      "email": "mariama@pharmacie.sn",
      "role": "PHARMACIST",
      "phone": "771234567",
      "isActive": true,
      "lastLogin": "2024-03-15T08:30:00Z",
      "createdAt": "2024-01-10T00:00:00Z"
    }
  ]
}
```

> ⚠️ Ne jamais exposer le champ `password` dans la réponse.

---

### `POST /api/personnel`

**Auth** : `ADMIN` uniquement

**Corps de requête :**
```json
{
  "firstName": "Ibrahima",
  "lastName": "Diop",
  "email": "ibrahima@pharmacie.sn",
  "password": "motdepasse123",
  "role": "PHARMACIST",
  "phone": "781234567"
}
```

**Validation :**
- Email unique (global, toutes pharmacies confondues)
- Mot de passe ≥ 6 caractères
- Rôle doit être `PHARMACIST`, `CASHIER`, ou `ACCOUNTANT` — pas `ADMIN` ni `SUPER_ADMIN`

**Effets de bord :**
1. Hash le mot de passe avec bcrypt
2. Crée le `User` avec `pharmacyId` depuis le JWT
3. Crée les `UserPermission` par défaut selon le rôle (depuis `DEFAULT_PERMISSIONS` dans `rbac.ts`)
4. Écrit un `AuditLog` `CREATE` / `user`

---

### `PUT /api/personnel/[id]`

**Auth** : `ADMIN` uniquement

**Validation** : vérifie que `user.pharmacyId === jwt.pharmacyId`

**Corps de requête :**
```json
{
  "firstName": "Ibrahima",
  "lastName": "Diop",
  "phone": "781234567",
  "role": "CASHIER"
}
```

> Le champ `email` ne peut pas être modifié via cette route. Utiliser `/api/auth/profile` pour le changement d'email propre.  
> Le mot de passe ne peut pas être modifié ici — l'employé utilise `/api/auth/profile` ou l'admin utilise une route dédiée de reset.

---

### `POST /api/personnel/[id]/toggle`

**Auth** : `ADMIN` uniquement

**Comportement** : inverse `User.isActive`.

- `isActive: false` → l'employé ne peut plus se connecter (vérification dans `POST /api/auth/login`)
- Ses données (ventes, présences, paie) sont conservées

**Effets de bord :**
1. Met à jour `isActive`
2. Écrit un `AuditLog` `UPDATE` / `user` avec action `TOGGLE_STATUS`

---

### `GET /api/personnel/attendance`

**Auth** : `ADMIN` ou tout employé de la pharmacie

**Query params :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `date` | string | ISO date (défaut : aujourd'hui) |
| `userId` | string | Filtre par employé |

**Réponse :**
```json
{
  "attendances": [
    {
      "userId": "...",
      "user": { "firstName": "Mariama", "lastName": "Ba" },
      "date": "2024-03-15",
      "checkIn": "2024-03-15T08:00:00Z",
      "checkOut": "2024-03-15T17:00:00Z",
      "status": "present"
    }
  ]
}
```

---

### `POST /api/personnel/attendance`

**Auth** : tout employé authentifié (s'enregistre lui-même)

**Corps de requête :**
```json
{ "action": "checkin" }
// ou
{ "action": "checkout" }
// ou
{ "userId": "...", "status": "absent", "date": "2024-03-15" }
```

**Règles :**
- Un employé ne peut faire qu'un `checkin` et un `checkout` par jour
- Le `checkout` ne peut pas précéder le `checkin`
- Seul l'admin peut saisir une absence ou un congé pour un autre employé

---

## 4. Interface utilisateur

### 4.1 Onglet Employés

Liste des employés avec colonnes :
- Nom complet
- Email
- Rôle (badge coloré)
- Téléphone
- Dernière connexion
- Statut actif/inactif
- Actions : Modifier / Activer-Désactiver

**Badges de rôle :**

| Rôle | Couleur |
|------|---------|
| `ADMIN` | Violet |
| `PHARMACIST` | Bleu |
| `CASHIER` | Vert |
| `ACCOUNTANT` | Ambre |

### 4.2 Formulaire de création/modification

| Champ | Requis | Création | Modification |
|-------|--------|----------|--------------|
| Prénom | Oui | ✓ | ✓ |
| Nom | Oui | ✓ | ✓ |
| Email | Oui | ✓ | ✗ (non modifiable) |
| Mot de passe | Oui (création) | ✓ | ✗ |
| Rôle | Oui | ✓ | ✓ |
| Téléphone | Non | ✓ | ✓ |

### 4.3 Onglet Présences

- Sélecteur de date (défaut : aujourd'hui)
- Liste de tous les employés avec leur statut du jour
- Boutons Check-in / Check-out par employé
- Status badges : présent (vert), absent (rouge), en retard (ambre), congé (bleu)
- Notes optionnelles par présence

---

## 5. Permissions par défaut (depuis `rbac.ts`)

| Menu | ADMIN | PHARMACIST | CASHIER | ACCOUNTANT |
|------|:-----:|:----------:|:-------:|:----------:|
| dashboard | ✓ | ✓ | ✓ | ✓ |
| medications | ✓ | ✓ | ✗ | ✗ |
| stock | ✓ | ✓ | ✗ | ✗ |
| sales | ✓ | ✓ | ✓ | ✗ |
| suppliers | ✓ | ✗ | ✗ | ✗ |
| personnel | ✓ | ✗ | ✗ | ✗ |
| accounting | ✓ | ✗ | ✗ | ✓ |
| payroll | ✓ | ✗ | ✗ | ✓ |
| anomalies | ✓ | ✓ | ✗ | ✗ |
| notifications | ✓ | ✓ | ✓ | ✓ |
| settings | ✓ | ✗ | ✗ | ✗ |

Ces permissions peuvent être surchargées individuellement via `/dashboard/permissions`.

---

## 6. Règles métier

1. **Soft delete uniquement** : un employé ne peut être que désactivé (`isActive: false`) — jamais supprimé, pour conserver l'historique des ventes et de la paie.
2. **Email unique global** : l'email est l'identifiant de connexion — un même email ne peut pas appartenir à deux pharmacies différentes.
3. **Rôle ADMIN non créable ici** : seul le SuperAdmin peut promouvoir un utilisateur admin. La création d'employés est limitée aux rôles PHARMACIST, CASHIER, ACCOUNTANT.
4. **Impersonation** : les données d'un employé peuvent être vues par un SUPER_ADMIN en mode impersonation — toutes les actions restent tracées sous le pharmacyId de la pharmacie impersonée.
