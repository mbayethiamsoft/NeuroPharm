# Anomalies & Audit — NeuroPharm v1

> **Règle anti-régression** : toute modification de ce flux (API, page, logique frontend) **doit** mettre ce fichier à jour avant le merge.

---

## 1. Vue d'ensemble

La page `/dashboard/anomalies` regroupe deux fonctions distinctes :
1. **Alertes** : détection automatique d'anomalies métier (stock, expiration, fraude)
2. **Journal d'audit** : historique de toutes les actions réalisées dans la pharmacie

**Fichiers principaux :**

| Fichier | Rôle |
|---------|------|
| `src/app/dashboard/anomalies/page.tsx` | Page UI (deux onglets) |
| `src/app/api/anomalies/route.ts` | `GET` alertes actives |
| `src/app/api/audit/route.ts` | `GET` journal d'audit |

**Accès** : rôles `ADMIN` et `PHARMACIST` (selon permissions).

---

## 2. Modèles Prisma

### `Notification` (alertes)

```prisma
model Notification {
  id         String   @id @default(cuid())
  pharmacyId String
  title      String
  message    String
  type       String   // stock_low, expiry, fraud, payment, system
  severity   String   @default("info") // info, warning, critical
  isRead     Boolean  @default(false)
  link       String?  // lien vers la ressource concernée
  createdAt  DateTime @default(now())
}
```

### `AuditLog`

```prisma
model AuditLog {
  id           String   @id @default(cuid())
  pharmacyId   String
  userId       String?
  action       String   // CREATE, UPDATE, DELETE, LOGIN, SALE, TOGGLE_STATUS, etc.
  entity       String   // medication, sale, user, stock, payroll, expense, supplier
  entityId     String?
  details      String?  // JSON stringifié avec les champs modifiés
  isSuspicious Boolean  @default(false)
  ipAddress    String?
  createdAt    DateTime @default(now())

  @@index([pharmacyId, createdAt])
  @@index([isSuspicious])
}
```

---

## 3. Routes API

### `GET /api/anomalies`

**Auth** : `ADMIN` ou `PHARMACIST`

**Comportement** : scan en temps réel des conditions anormales. Ne lit **pas** la table `Notification` — génère les alertes à la volée depuis les autres tables.

**Types d'anomalies détectées :**

| Type | Sévérité | Condition | Source |
|------|----------|-----------|--------|
| `stock_low` | `warning` | `quantity <= minStock && quantity > 0` | `Medication` |
| `stock_low` | `critical` | `quantity === 0` | `Medication` |
| `expiry` | `warning` | `expiryDate` dans les 30 prochains jours | `Medication` |
| `expiry` | `critical` | `expiryDate < now` (déjà expiré) | `Medication` |
| `fraud` | `warning` | `isSuspicious === true` | `AuditLog` |
| `payment` | `warning` | `Payment.status === 'failed'` récent | `Payment` |
| `system` | `info` | Événements système récents | `SystemLog` |

**Réponse :**
```json
{
  "anomalies": [
    {
      "type": "stock_low",
      "severity": "critical",
      "title": "Rupture de stock",
      "message": "Amoxicilline 500mg : stock épuisé",
      "link": "/dashboard/stock",
      "medicationId": "clxxx..."
    },
    {
      "type": "expiry",
      "severity": "warning",
      "title": "Expiration proche",
      "message": "Ibuprofène 400mg expire le 15/04/2024 (dans 5 jours)",
      "link": "/dashboard/medicaments"
    }
  ],
  "counts": {
    "total": 12,
    "critical": 3,
    "warning": 8,
    "info": 1
  }
}
```

---

### `GET /api/audit`

**Auth** : `ADMIN` uniquement

**Query params :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `action` | string | Filtre par action (CREATE, UPDATE, DELETE, SALE, LOGIN...) |
| `entity` | string | Filtre par entité (medication, sale, user...) |
| `userId` | string | Filtre par utilisateur |
| `suspicious` | boolean | Si `true` : uniquement les entrées suspectes |
| `startDate` | string | ISO date de début |
| `endDate` | string | ISO date de fin |
| `limit` | number | Défaut : 50 |
| `offset` | number | Pagination |

**Réponse :**
```json
{
  "logs": [
    {
      "id": "...",
      "action": "DELETE",
      "entity": "medication",
      "entityId": "clxxx...",
      "details": "{\"name\":\"Paracétamol 1g\"}",
      "isSuspicious": false,
      "ipAddress": "192.168.1.10",
      "createdAt": "2024-03-15T10:30:00Z",
      "user": { "firstName": "Mariama", "lastName": "Ba", "email": "mariama@ph.sn" }
    }
  ],
  "total": 1240,
  "suspiciousCount": 3
}
```

---

## 4. Création automatique d'entrées `AuditLog`

La fonction `createAuditLog()` (dans `src/lib/auth.ts` ou équivalent) est appelée depuis chaque route API pour les actions sensibles.

**Actions loggées :**

| Action | Entité | Déclenché par |
|--------|--------|---------------|
| `LOGIN` | `user` | `POST /api/auth/login` |
| `CREATE` | `medication` | `POST /api/medications` |
| `UPDATE` | `medication` | `PUT /api/medications/[id]` |
| `DELETE` | `medication` | `DELETE /api/medications/[id]` |
| `SALE` | `sale` | `POST /api/sales` |
| `CREATE` | `stock` | `POST /api/stock` (ajustement) |
| `CREATE` | `user` | `POST /api/personnel` |
| `UPDATE` | `user` | `POST /api/personnel/[id]/toggle` |
| `CREATE` | `payroll` | `POST /api/payroll` |
| `UPDATE` | `payroll` | `PUT /api/payroll/[id]` |
| `CREATE` | `expense` | `POST /api/accounting/expenses` |
| `CREATE` | `supplier` | `POST /api/suppliers` |

> ⚠️ `AuditLog` est pour les actions **intra-pharmacie** uniquement. Les actions SaaS (impersonation, changement de plan) utilisent `SystemLog` (cross-tenant).

---

## 5. Détection de comportements suspects

Le flag `isSuspicious` peut être posé automatiquement ou manuellement :

**Règles automatiques (à implémenter ou déjà en place) :**
- `DELETE` d'un médicament ayant eu des ventes récentes
- Vente d'un montant anormalement élevé (> seuil configurable)
- Connexion à une heure inhabituelle
- Multiples tentatives de connexion échouées

**Marquage manuel :** prévu pour une version future (bouton « Marquer suspect » dans l'UI audit).

---

## 6. Interface utilisateur

### 6.1 Onglet Alertes

**Cards de statistiques :**
- Total anomalies (toutes sévérités)
- Critiques (rouge)
- Avertissements (ambre)
- Informations (bleu)

**Liste d'alertes avec :**
- Icône selon le type
- Titre et message
- Badge de sévérité coloré
- Lien vers la ressource concernée

**Couleurs de sévérité :**

| Sévérité | Couleur | Usage |
|----------|---------|-------|
| `info` | Bleu | Information générale |
| `warning` | Ambre | Situation à surveiller |
| `critical` | Rouge | Action immédiate requise |

### 6.2 Onglet Journal d'audit

**Table avec colonnes :**
- Horodatage
- Utilisateur (nom + email)
- Action (badge coloré)
- Entité + ID
- Détails (JSON collapsé)
- Flag suspect (icône rouge si `isSuspicious`)
- Adresse IP

**Filtres :**
- Type d'action
- Entité
- Plage de dates
- Uniquement suspects (toggle)

**Badges d'action :**

| Action | Couleur |
|--------|---------|
| `CREATE` | Vert |
| `UPDATE` | Bleu |
| `DELETE` | Rouge |
| `SALE` | Violet |
| `LOGIN` | Gris |

---

## 7. Règles métier

1. **Lecture seule** : le journal d'audit est en lecture seule — aucune modification ni suppression possible depuis l'UI ou l'API.
2. **Rétention** : pas de politique de rétention automatique en v1 — les logs sont conservés indéfiniment.
3. **`AuditLog` ≠ `SystemLog`** : `AuditLog` est scopé par `pharmacyId` (actions métier). `SystemLog` est cross-tenant (actions SaaS). Ne pas mélanger.
4. **Performance** : l'API `/api/anomalies` effectue un scan complet des médicaments — si le catalogue devient grand (> 1000 produits), envisager un cache ou un job périodique.
5. **Isolation** : un admin ne peut voir que les logs de sa pharmacie — `pharmacyId` toujours filtré depuis le JWT.
