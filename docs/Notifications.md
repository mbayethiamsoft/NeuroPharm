# Notifications — NeuroPharm v1

> **Règle anti-régression** : toute modification de ce flux (API, page, logique frontend) **doit** mettre ce fichier à jour avant le merge.

---

## 1. Vue d'ensemble

La page `/dashboard/notifications` affiche les notifications système générées automatiquement par la plateforme (paiements, alertes stock, confirmations d'actions). Elles sont différentes des anomalies qui sont calculées à la volée — les notifications sont persistées en base.

**Fichiers principaux :**

| Fichier | Rôle |
|---------|------|
| `src/app/dashboard/notifications/page.tsx` | Page UI principale |
| `src/app/api/notifications/route.ts` | `GET` (liste) + `PUT` (marquer lues) |

---

## 2. Modèle Prisma `Notification`

```prisma
model Notification {
  id         String   @id @default(cuid())
  pharmacyId String
  title      String
  message    String
  type       String   // stock_low, expiry, fraud, payment, system
  severity   String   @default("info") // info, warning, critical
  isRead     Boolean  @default(false)
  link       String?  // URL relative vers la ressource concernée
  createdAt  DateTime @default(now())

  @@index([pharmacyId, isRead])
}
```

---

## 3. Types de notifications

| Type | Sévérité habituelle | Généré par |
|------|--------------------|-----------:|
| `stock_low` | `warning` ou `critical` | `POST /api/stock` (décrémentation automatique) |
| `expiry` | `warning` ou `critical` | Scan périodique ou `GET /api/anomalies` |
| `fraud` | `warning` | Détection activité suspecte |
| `payment` | `info` ou `warning` | `POST /api/payments/confirm` |
| `system` | `info` | Actions système (création compte, changement plan) |

---

## 4. Création automatique de notifications

Les notifications sont créées depuis les routes API via une fonction utilitaire (ex. `createNotification()`).

**Déclencheurs connus :**

| Événement | Type | Titre (exemple) |
|-----------|------|-----------------|
| Paiement Wave confirmé | `payment` | « Paiement reçu — Plan Professionnel renouvelé » |
| Stock d'un médicament = 0 | `stock_low` | « Rupture de stock : Amoxicilline 500mg » |
| Stock d'un médicament ≤ minStock | `stock_low` | « Stock bas : Ibuprofène 400mg (3 unités restantes) » |
| Médicament expiré | `expiry` | « Produit expiré : Doliprane 1g (depuis le 01/03/2024) » |
| Médicament expire dans ≤ 30 j | `expiry` | « Expiration proche : Amoxicilline (dans 12 jours) » |

---

## 5. Routes API

### `GET /api/notifications`

**Auth** : tout rôle authentifié avec `pharmacyId`

**Query params :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `type` | string | Filtre par type |
| `severity` | string | `info`, `warning`, `critical` |
| `isRead` | boolean | `false` = non lues uniquement |
| `limit` | number | Défaut : 20 |
| `offset` | number | Pagination |

**Réponse :**
```json
{
  "notifications": [
    {
      "id": "...",
      "title": "Paiement reçu",
      "message": "Votre abonnement Professionnel a été renouvelé jusqu'au 15/04/2024.",
      "type": "payment",
      "severity": "info",
      "isRead": false,
      "link": "/dashboard/parametres",
      "createdAt": "2024-03-15T14:30:00Z"
    }
  ],
  "total": 24,
  "unreadCount": 7
}
```

---

### `PUT /api/notifications`

**Auth** : tout rôle authentifié avec `pharmacyId`

**Corps de requête :**
```json
// Marquer une notification spécifique comme lue
{ "id": "clxxx..." }

// Marquer toutes comme lues
{ "markAllRead": true }
```

**Effets de bord :**
1. Met à jour `isRead: true` pour la/les notification(s) ciblée(s)
2. Toujours filtré par `pharmacyId` depuis le JWT

---

## 6. Interface utilisateur

### 6.1 En-tête de page

- Compteur de notifications non lues (badge rouge)
- Bouton « Tout marquer comme lu »

### 6.2 Liste des notifications

Pour chaque notification :
- **Icône** selon le type :
  - `stock_low` → AlertTriangle (ambre ou rouge)
  - `expiry` → Clock (ambre ou rouge)
  - `fraud` → Shield (rouge)
  - `payment` → CreditCard (vert)
  - `system` → Bell (bleu)
- **Titre** (en gras si non lue)
- **Message** (texte complet)
- **Badge de sévérité** coloré
- **Horodatage** (format relatif : « il y a 2 heures »)
- **Lien** vers la ressource si disponible
- **Indicateur de non-lecture** (point bleu ou fond légèrement coloré)

### 6.3 Couleurs de sévérité

| Sévérité | Couleur texte | Couleur badge |
|----------|---------------|---------------|
| `info` | Bleu | `bg-blue-100 text-blue-800` |
| `warning` | Ambre | `bg-amber-100 text-amber-800` |
| `critical` | Rouge | `bg-red-100 text-red-800` |

### 6.4 Badge dans la barre de navigation

Le badge de notifications non lues dans la sidebar est mis à jour depuis `unreadCount` de la réponse `GET /api/notifications`.

---

## 7. Règles métier

1. **Pas de suppression** : les notifications ne peuvent pas être supprimées (seulement marquées lues) — elles constituent un historique.
2. **Isolation multi-tenant** : `pharmacyId` toujours filtré depuis le JWT — jamais depuis le body client.
3. **Pas de push temps réel en v1** : les notifications sont récupérées par polling (à chaque chargement de la page ou rafraîchissement manuel). Une intégration WebSocket ou SSE est prévue en v2.
4. **Notifications vs Anomalies** : les `Notification` (persistées en DB) sont complémentaires aux alertes temps réel de `/api/anomalies` (calculées à la volée). La page `/dashboard/anomalies` affiche les secondes, `/dashboard/notifications` affiche les premières.
