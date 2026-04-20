# Paiements & Abonnements — NeuroPharm v1

> **Règle anti-régression** : toute modification de ces flux (API, page, logique frontend) **doit** mettre ce fichier à jour avant le merge. Un flux non documenté est un flux non testé.

---

## 1. Plans disponibles

| Clé | Nom | Mensuel (XOF) | Annuel (XOF) | Paiement requis |
|-----|-----|:-------------:|:------------:|:---------------:|
| `TRIAL` | Essai | 0 | 0 | Non |
| `BASIC` | Basique | 15 000 | 150 000 | Oui |
| `PROFESSIONAL` | Professionnel | 35 000 | 350 000 | Oui |
| `ENTERPRISE` | Entreprise | 75 000 | Sur devis | Non (devis SA) |

Ces montants sont définis à **trois endroits à maintenir synchrones** :

- **Frontend** : `planAmounts` et `planAnnualAmounts` dans `src/app/dashboard/parametres/page.tsx`
- **API initiate** : `PLAN_AMOUNTS` dans `src/app/api/payments/initiate/route.ts`
- **API subscriptions** : `PLAN_AMOUNTS` dans `src/app/api/subscriptions/route.ts`

> ⚠️ Si un tarif change, mettre à jour ces **trois** endroits + ce tableau.

---

## 2. Méthodes de paiement

| Méthode | Statut | Provider |
|---------|--------|----------|
| Wave | ✅ Disponible | `wave` |
| Orange Money | 🔜 Bientôt dispo | `orange_money` |
| Carte bancaire | 🔜 Bientôt dispo | — |

Seul Wave est activé (`available: true` dans `paymentMethods` dans `parametres/page.tsx`).  
L'API `/api/payments/initiate` refuse explicitement tout `method !== 'wave'` (HTTP 400).

---

## 3. Modèles Prisma

### `Subscription`

```prisma
enum SubscriptionPlan {
  TRIAL
  BASIC
  PROFESSIONAL
  ENTERPRISE
}

enum SubscriptionStatus {
  ACTIVE
  SUSPENDED
  CANCELLED
  EXPIRED
}

model Subscription {
  id             String             @id @default(cuid())
  pharmacyId     String             @unique
  plan           SubscriptionPlan   @default(TRIAL)
  status         SubscriptionStatus @default(ACTIVE)
  startDate      DateTime           @default(now())
  endDate        DateTime?
  amount         Float              @default(0)
  autoPayEnabled Boolean            @default(false)
  payments       Payment[]
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt
}
```

### `Payment`

```prisma
model Payment {
  id             String   @id @default(cuid())
  subscriptionId String
  amount         Float
  method         String   @default("mobile_money")
  provider       String?  // "wave" | "orange_money"
  reference      String?  // "NP-YYYYMMDD-XXXXXX"
  status         String   @default("pending") // pending | completed | failed
  period         String   @default("monthly") // monthly | annual
  sessionToken   String?  @unique  // token Wave QR (expire après n minutes)
  expiresAt      DateTime?
  paidAt         DateTime?
  notes          String?
  recordedBy     String?  // email du SuperAdmin (paiement manuel)
  type           String   @default("pharmacy_initiated")
                          // pharmacy_initiated | manual | auto
  createdAt      DateTime @default(now())
}
```

---

## 4. Flux 1 — Payer l'abonnement actuel avec Wave

**Déclencheur** : l'admin est sur un plan payant actif et veut renouveler ou payer.

### 4.1 Pré-conditions

- `subscription.plan !== 'TRIAL'`
- `planAmounts[subscription.plan] > 0`
- Le bouton « Payer via Wave » est visible dans l'onglet **Abonnement** de `/dashboard/parametres`

### 4.2 Séquence

```
Admin clique "Payer via Wave"
  → setShowPayment(true)  [ouvre la modal de sélection période]

Admin sélectionne Mensuel / Annuel puis clique "Payer {montant} via Wave"
  → handleInitiateWavePayment()
      │
      ├─ window.open('', '_blank')  ← AVANT tout await (anti-popup-blocker)
      │    Si null → alert("Autorisez les popups") + return
      │    Affiche page de chargement Wave dans l'onglet
      │
      ├─ POST /api/payments/initiate
      │    body: { period, method: 'wave' }
      │    [l'API lit le plan depuis la DB, calcule le montant]
      │
      │    Réponse OK : { sessionToken, reference, amount, expiresAt, ... }
      │    Réponse KO : newTab.close() + alert(error)
      │
      ├─ newTab.location.href = /dashboard/paiement-wave?session=...&amount=...&ref=...
      │
      ├─ setPendingPayment({ reference, expiresAt })
      ├─ setShowPayment(false)
      └─ setTimeout(15s) → refreshSubscription() + fetchPayments()
```

### 4.3 Fichiers impliqués

| Fichier | Rôle |
|---------|------|
| `src/app/dashboard/parametres/page.tsx` | UI (modal période, bouton, `handleInitiateWavePayment`) |
| `src/app/api/payments/initiate/route.ts` | Crée le `Payment` en DB + génère `sessionToken` |
| `src/app/dashboard/paiement-wave/page.tsx` | QR code + timer + confirmation |
| `src/app/api/payments/confirm/route.ts` | Valide le paiement + prolonge l'abonnement |

---

## 5. Flux 2 — Changer de plan et payer avec Wave

**Déclencheur** : l'admin clique « Choisir ce plan » sur un plan différent du sien.

### 5.1 Pré-conditions

- Le plan cible est différent du plan actuel
- La modal de confirmation s'ouvre avec les détails du changement

### 5.2 Séquence

```
Admin clique "Choisir ce plan" sur une carte plan
  → setPendingPlan(plan.key)  [ouvre la modal de confirmation]

Admin confirme via "Confirmer et payer avec Wave" (ou "Confirmer" si gratuit/ENTERPRISE)
  → handleChangePlan()
      │
      ├─ const planToActivate = pendingPlan  ← CAPTURÉ en const avant tout setState
      ├─ newPlanPrice = planAmounts[planToActivate] ou planAnnualAmounts selon période
      ├─ needsPayment = newPlanPrice > 0 && planToActivate !== 'ENTERPRISE'
      │
      ├─ [Si needsPayment]
      │    window.open('', '_blank')  ← AVANT tout await (anti-popup-blocker)
      │    Si null → alert + setChangingPlan(false) + return
      │
      ├─ PATCH /api/subscriptions  body: { plan: planToActivate }
      │    Réponse KO → newTab.close() + setPlanChangeError
      │    Réponse OK → setSubscription(planToActivate) + setPendingPlan(null)
      │
      ├─ [Si needsPayment]
      │    POST /api/payments/initiate  body: { period, method: 'wave' }
      │    [l'API relit le plan depuis la DB — déjà mis à jour par le PATCH]
      │    Réponse OK → newTab.location.href = /dashboard/paiement-wave?...
      │                  + setPendingPayment + setTimeout(15s) refresh
      │    Réponse KO → newTab.close() + setPlanChangeError(data2.error)
      │
      └─ finally: setChangingPlan(false)
```

### 5.3 Comportement selon le plan cible

| Plan cible | `needsPayment` | Bouton dans la modal |
|------------|:--------------:|---------------------|
| `TRIAL` | Non | « Confirmer » → PATCH seul |
| `BASIC` | Oui | « Confirmer et payer avec Wave » → PATCH + initiate |
| `PROFESSIONAL` | Oui | « Confirmer et payer avec Wave » → PATCH + initiate |
| `ENTERPRISE` | Non | « Confirmer » → PATCH seul (devis SA) |

### 5.4 Ordre des opérations — pourquoi PATCH avant initiate ?

L'API `/payments/initiate` lit le plan depuis la DB pour calculer le bon montant. Il faut que le PATCH ait changé le plan **avant** d'appeler initiate. Conséquence : si initiate échoue, le plan est déjà changé mais aucun paiement n'est collecté (grace period implicite — l'admin peut relancer via Flux 1).

### 5.5 Fichiers impliqués

| Fichier | Rôle |
|---------|------|
| `src/app/dashboard/parametres/page.tsx` | UI (modal confirmation, `handleChangePlan`) |
| `src/app/api/subscriptions/route.ts` | `PATCH` change le plan en DB |
| `src/app/api/payments/initiate/route.ts` | Crée le `Payment` en DB |
| `src/app/dashboard/paiement-wave/page.tsx` | QR + confirmation |
| `src/app/api/payments/confirm/route.ts` | Valide + prolonge abonnement |

---

## 6. Page Wave (`/dashboard/paiement-wave`)

> Documentation détaillée dans `docs/PaiementWave.md`.

Reçoit ses données **exclusivement via les search params URL** — aucun cookie de session disponible dans ce nouvel onglet.

| Param | Type | Contenu |
|-------|------|---------|
| `session` | string | `sessionToken` (clé unique du `Payment` en DB) |
| `amount` | number | Montant à afficher (XOF) |
| `ref` | string | Référence (`NP-YYYYMMDD-XXXXXX`) |
| `period` | string | `monthly` ou `annual` |
| `plan` | string | Nom du plan (affichage uniquement) |
| `pharmacy` | string | Nom de la pharmacie (affichage uniquement) |
| `expires` | string | ISO date d'expiration du QR |

### 6.1 États de la page

| État | Déclencheur | UI affichée |
|------|------------|-------------|
| `pending` | Initial | QR code + timer + zone attente |
| `confirming` | Clic bouton simulation (dev only) | Spinner |
| `success` | Polling `completed` / confirm POST OK | Confirmation verte + détails |
| `expired` | Timer atteint 0 | Message d'expiration |
| `error` | Polling `failed` / confirm POST KO | Message d'erreur |

### 6.2 Timer

- Durée : `NEXT_PUBLIC_WAVE_QR_EXPIRY_MINUTES` (défaut : 10 min)
- Couleur dynamique : vert > 40 %, ambre 15–40 %, rouge < 15 %

### 6.3 Mode simulation (développement uniquement)

En `NODE_ENV !== 'production'`, un bouton **vert** « Confirmer le paiement Wave » appelle `POST /api/payments/confirm` pour simuler le webhook Wave.  
En **production**, la page active un **polling toutes les 5 s** via `GET /api/payments/confirm?session=TOKEN`.

---

## 7. API `/api/payments/initiate`

**Route** : `POST /api/payments/initiate`  
**Auth** : `ADMIN` ou `SUPER_ADMIN` avec `pharmacyId`

### Corps de requête

```json
{ "period": "monthly|annual", "method": "wave" }
```

> Le plan est ignoré dans le corps — l'API lit `subscription.plan` depuis la DB.

### Comportements d'erreur

| Condition | HTTP | Message |
|-----------|------|---------|
| Token invalide / pas de session | 401/403 | Non autorisé |
| `period` invalide | 400 | Période invalide |
| `method !== 'wave'` | 400 | Seul Wave est disponible |
| Aucun abonnement en DB | 404 | Aucun abonnement trouvé |
| Montant = 0 (plan gratuit) | 400 | Ce plan ne nécessite pas de paiement |

### Effets de bord

1. Expire tous les `Payment` en statut `pending` pour cet abonnement (→ `failed`)
2. Crée un nouveau `Payment` avec `sessionToken` unique et `expiresAt`
3. Écrit un `SystemLog` `PAYMENT_INITIATED`

### Réponse (succès)

```json
{
  "sessionToken": "tok_xxxx",
  "reference": "NP-20240315-ABC123",
  "amount": 35000,
  "expiresAt": "2024-03-15T15:00:00Z",
  "period": "monthly",
  "plan": "PROFESSIONAL",
  "pharmacyName": "Pharmacie du Plateau"
}
```

---

## 8. API `/api/payments/confirm`

**Routes** :
- `GET /api/payments/confirm?session=TOKEN` — vérifie le statut sans modifier la DB (polling prod)
- `POST /api/payments/confirm` — confirme le paiement (webhook Wave ou simulation dev)

**Auth** : aucune (appelé depuis la page Wave — pas de cookie disponible dans l'onglet)

### Corps de requête (POST)

```json
{ "sessionToken": "tok_xxxx" }
```

### Réponse GET (polling)

```json
{ "status": "pending" }
// ou
{ "status": "completed", "paidAt": "..." }
// ou
{ "status": "failed" }
// ou
{ "status": "expired" }
```

### Comportements d'erreur (POST)

| Condition | HTTP | Message |
|-----------|------|---------|
| Token manquant | 400 | sessionToken requis |
| Paiement introuvable | 404 | Session introuvable |
| Déjà payé | 409 | Paiement déjà effectué |
| Session expirée ou annulée | 410 | Session expirée ou annulée |
| QR expiré (date) | 410 | QR code expiré |

### Effets de bord POST (transaction atomique)

1. `Payment.status` → `completed`, `paidAt` → now
2. `Subscription.endDate` → prolongée de **30 j** (mensuel) ou **365 j** (annuel), `status` → `ACTIVE`
3. Crée une `Notification` pour l'admin pharmacie (type `payment`, severity `info`)
4. Écrit un `SystemLog` `PAYMENT_COMPLETED`

---

## 9. API `/api/subscriptions`

**Route** : `PATCH /api/subscriptions`  
**Auth** : `ADMIN` avec `pharmacyId`

### Corps de requête

```json
{ "plan": "PROFESSIONAL" }
```

**Effets de bord :**
1. Met à jour `Subscription.plan`
2. Écrit un `SystemLog` `SUBSCRIPTION_CHANGED`

**Validation :**
- Le plan doit être dans `['TRIAL', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE']`
- Ne peut pas changer vers le plan actuel (HTTP 400)

---

## 10. Espace SuperAdmin — gestion des paiements

Le SUPER_ADMIN gère les abonnements depuis `/dashboard/superadmin/abonnements`.

| Action SA | Route API | Corps / Paramètre | Description |
|-----------|-----------|-------------------|-------------|
| Lister paiements | `GET /api/superadmin/payments` | — | Cross-tenant, tous les paiements |
| Enregistrer paiement manuel | `POST /api/superadmin/payments` | `{ subscriptionId, amount, period, method, provider, reference, notes }` | Sans Wave |
| Changer plan | `PUT /api/superadmin/subscriptions` | `{ action: 'change_plan', plan }` | Bypass paiement |
| Changer statut | `PUT /api/superadmin/subscriptions` | `{ action: 'change_status', status }` | ACTIVE/SUSPENDED/CANCELLED/EXPIRED |
| Étendre échéance | `PUT /api/superadmin/subscriptions` | `{ action: 'extend', days }` | Ajoute N jours à `endDate` |

### Paiement manuel (POST /api/superadmin/payments)

Utilisé par le SA pour enregistrer un paiement reçu hors-Wave (virement, espèces, etc.) :

```json
{
  "subscriptionId": "clxxx...",
  "amount": 150000,
  "period": "annual",
  "method": "bank_transfer",
  "provider": null,
  "reference": "VIREMENT-2024-001",
  "notes": "Paiement reçu par virement bancaire le 15/03/2024"
}
```

**Effets de bord :**
1. Crée un `Payment` avec `type: 'manual'`, `recordedBy: sa.email`, `status: 'completed'`
2. Prolonge `Subscription.endDate` (30 j mensuel / 365 j annuel)
3. Écrit un `SystemLog` `PAYMENT_MANUAL`

---

## 11. Variables d'environnement

| Variable | Côté | Défaut dev | Rôle |
|----------|------|-----------|------|
| `WAVE_MERCHANT_ID` | Serveur | `merchant_neuropharm_sn_001` | ID marchand Wave |
| `WAVE_CHECKOUT_URL` | Serveur | `https://pay.wave.com/m/neuropharm/c/` | URL checkout Wave |
| `WAVE_QR_EXPIRY_MINUTES` | Serveur | `10` | Durée validité QR (vérification API) |
| `NEXT_PUBLIC_WAVE_CHECKOUT_URL` | Client | `https://pay.wave.com/m/neuropharm/c/` | URL pour construction du QR |
| `NEXT_PUBLIC_WAVE_QR_EXPIRY_MINUTES` | Client | `10` | Durée du timer (page Wave) |

---

## 12. Couleurs de marque Wave

| Élément | Valeur | Fichier |
|---------|--------|---------|
| Bouton « Payer via Wave » (parametres) | `bg-blue-600` (`#2563EB`) | `parametres/page.tsx` |
| Bouton « Confirmer et payer avec Wave » (modal) | `bg-blue-600` | `parametres/page.tsx` |
| Header page Wave | `bg-[#1A73E8]` | `paiement-wave/page.tsx` |
| Pixels QR code | `fgColor="#1A73E8"` | `paiement-wave/page.tsx` |
| Bouton simulation dev | `bg-emerald-600` (vert) | `paiement-wave/page.tsx` |

> **Ne pas utiliser de valeurs Tailwind arbitraires (`bg-[#...]`) dans `parametres/page.tsx`** — elles peuvent ne pas être générées par le compilateur JIT, rendant les boutons blancs sur fond blanc (incident résolu).  
> **Ne pas utiliser de vert (`#009966`)** pour les boutons Wave — incident passé.  
> Les valeurs arbitraires sont acceptables **uniquement** dans `paiement-wave/page.tsx` (fichier autonome, pas de risque de purge).

---

## 13. Anti-popup-blocker pattern

Les navigateurs bloquent `window.open()` appelé **après** un `await`. La solution appliquée dans les deux flux :

```typescript
// 1. Ouvrir l'onglet AVANT tout await
const newTab = window.open('', '_blank')
if (!newTab) {
  alert("Autorisez les popups pour ce site.")
  return
}
newTab.document.write('<p style="font-family:sans-serif;padding:2rem;">Chargement du paiement Wave...</p>')

// 2. Faire les appels async
const res = await fetch('/api/payments/initiate', { method: 'POST', body: ... })
const data = await res.json()

if (!res.ok) {
  newTab.close()
  alert(data.error)
  return
}

// 3. Naviguer l'onglet déjà ouvert
newTab.location.href = `/dashboard/paiement-wave?session=${data.sessionToken}&amount=${data.amount}&...`
```

> **Ne jamais appeler `window.open()` après un `await`** — le popup sera systématiquement bloqué par le navigateur.

---

## 14. Statuts de paiement et cycle de vie

```
pending   → (confirm OK) → completed
          → (expire date) → failed
          → (nouvel initiate) → failed  [expiration automatique des pending]
```

| Statut | Description |
|--------|-------------|
| `pending` | QR généré, en attente de scan |
| `completed` | Paiement confirmé (webhook ou simulation) |
| `failed` | Expiré, annulé ou remplacé par un nouveau `pending` |

---

## 15. Prolongation de l'abonnement après paiement

| Période | Jours ajoutés | Base de calcul |
|---------|:------------:|----------------|
| `monthly` | 30 jours | `max(subscription.endDate, now) + 30j` |
| `annual` | 365 jours | `max(subscription.endDate, now) + 365j` |

> La prolongation utilise `max(endDate, now)` — ainsi, un abonnement déjà expiré repart de `now`, et un abonnement encore valide est prolongé depuis sa date de fin actuelle (cumul possible).
