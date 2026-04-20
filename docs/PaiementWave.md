# Page Paiement Wave (`/dashboard/paiement-wave`) — NeuroPharm v1

> **Règle anti-régression** : toute modification de cette page **doit** mettre ce fichier ET `docs/Paiements.md` à jour avant le merge.  
> Ce fichier documente la page QR Wave en détail. Pour les flux complets (initiate, confirm, changement de plan), voir `docs/Paiements.md`.

---

## 1. Vue d'ensemble

La page `/dashboard/paiement-wave` est un écran dédié affiché dans un **nouvel onglet** lors d'un paiement Wave. Elle est intentionnellement autonome (pas de sidebar, pas de navigation) et reçoit toutes ses données **via les search params URL**.

**Fichier principal :**
`src/app/dashboard/paiement-wave/page.tsx`

**Pas d'auth cookie** : cette page s'ouvre dans un nouvel onglet sans accès au cookie `neuropharm-token`. L'identification se fait uniquement via le `sessionToken` dans l'URL.

---

## 2. Search params reçus

| Param | Type | Contenu |
|-------|------|---------|
| `session` | string | `sessionToken` unique (lié au `Payment` en DB) |
| `amount` | number | Montant à afficher (XOF) |
| `ref` | string | Référence paiement (`NP-YYYYMMDD-XXXXXX`) |
| `period` | string | `monthly` ou `annual` |
| `plan` | string | Nom du plan (affichage uniquement) |
| `pharmacy` | string | Nom de la pharmacie (affichage uniquement) |
| `expires` | string | ISO date d'expiration du QR |

> ⚠️ Si `session` est absent ou `expires` est dépassé au chargement, la page passe directement à l'état `expired`.

---

## 3. États de la page

| État | Déclencheur | UI |
|------|------------|-----|
| `pending` | Initial | QR code + timer + instruction |
| `confirming` | Clic bouton simulation (dev) | Spinner « Vérification... » |
| `success` | Polling `completed` ou confirm OK | Confirmation verte + détails |
| `expired` | Timer = 0 ou expiresAt dépassé | Message d'expiration rouge |
| `error` | Polling `failed` ou confirm KO | Message d'erreur rouge |

---

## 4. Timer

### 4.1 Configuration

```
Durée = NEXT_PUBLIC_WAVE_QR_EXPIRY_MINUTES (défaut : 10 minutes)
Base  = expiresAt param URL (ou now + durée si absent)
```

### 4.2 Affichage

```
MM:SS  (ex. 09:47)
```

### 4.3 Couleur dynamique

| Temps restant | Couleur |
|---------------|---------|
| > 40 % de la durée totale | Vert (`text-green-600`) |
| 15 % – 40 % | Ambre (`text-amber-500`) |
| < 15 % | Rouge (`text-red-500`) |

### 4.4 Expiration

Quand le timer atteint 0 : passage immédiat à l'état `expired` — aucun appel API supplémentaire n'est effectué.

---

## 5. QR Code Wave

### 5.1 Construction de l'URL Wave

```typescript
const waveUrl = `${process.env.NEXT_PUBLIC_WAVE_CHECKOUT_URL}?amount=${amount}&ref=${ref}`
// Exemple : https://pay.wave.com/m/neuropharm/c/?amount=35000&ref=NP-20240315-ABC123
```

### 5.2 Rendu du QR code

- Bibliothèque : `qrcode.react` (ou équivalent)
- Taille : 256×256 px
- `fgColor` : `#1A73E8` (bleu Wave officiel)
- `bgColor` : `#FFFFFF`
- Niveau de correction d'erreurs : `L` ou `M`

### 5.3 Lien direct

En dessous du QR code, un lien cliquable vers l'URL Wave pour les utilisateurs sur mobile (le QR étant difficile à scanner sur le même appareil).

---

## 6. Modes de confirmation

### 6.1 Production — Polling automatique

La page effectue un polling toutes les **5 secondes** via :

```
GET /api/payments/confirm?session=TOKEN
```

**Réponse :**
```json
{ "status": "pending" }    // → continuer le polling
{ "status": "completed" }  // → passer à l'état success
{ "status": "failed" }     // → passer à l'état error
{ "status": "expired" }    // → passer à l'état expired
```

Le polling s'arrête dès qu'un statut terminal est reçu (`completed`, `failed`, `expired`) ou quand le timer atteint 0.

### 6.2 Développement — Bouton de simulation

En `NODE_ENV !== 'production'`, un bouton **vert** « Confirmer le paiement Wave » est affiché. Il appelle :

```
POST /api/payments/confirm
Body: { "sessionToken": "..." }
```

Ce bouton simule le webhook Wave — il ne doit jamais apparaître en production.

**Couleur du bouton de simulation** : `bg-emerald-600` (vert) — distinct du bleu Wave utilisé dans le header.

---

## 7. État Success

Affiché après confirmation réussie du paiement.

**Informations affichées :**
- Icône de succès (checkmark vert)
- Message de confirmation
- Montant payé (XOF)
- Référence paiement
- Nouvelle date de fin d'abonnement (retournée par `POST /api/payments/confirm`)
- Bouton « Retour au tableau de bord » → `/dashboard`

---

## 8. État Expired

**Affiché quand :**
- Le timer atteint 0
- Le param `expires` est une date passée au chargement
- Le polling retourne `status: 'expired'`

**UI :**
- Icône horloge rouge
- Message explicatif
- Bouton « Retourner aux paramètres » → `/dashboard/parametres`

> ⚠️ Ne pas relancer automatiquement un nouveau paiement depuis cette page — l'admin retourne sur `/dashboard/parametres` pour initier un nouveau flux.

---

## 9. État Error

**Affiché quand :**
- Le polling retourne `status: 'failed'`
- L'appel `POST /api/payments/confirm` retourne une erreur

**UI :**
- Icône d'erreur rouge
- Message d'erreur (technique ou générique selon la source)
- Bouton « Retourner aux paramètres »

---

## 10. Couleurs de marque Wave

| Élément | Valeur | Usage |
|---------|--------|-------|
| Header de page | `bg-[#1A73E8]` | Bandeau supérieur Wave |
| QR code | `fgColor="#1A73E8"` | Couleur des pixels QR |
| Boutons Wave (autres pages) | `bg-blue-600` | `#2563EB` (Tailwind standard) |
| Bouton simulation dev | `bg-emerald-600` | Vert — distingué du bleu Wave |

> Les valeurs `bg-[#1A73E8]` (arbitraires Tailwind) sont acceptables **uniquement** dans `paiement-wave/page.tsx` car ce fichier est autonome et les classes arbitraires ne risquent pas d'être purgées.  
> Dans `parametres/page.tsx`, utiliser **uniquement** `bg-blue-600` (classe Tailwind standard) pour éviter le bug de purge JIT.

---

## 11. Variables d'environnement

| Variable | Côté | Valeur dev | Rôle |
|----------|------|-----------|------|
| `NEXT_PUBLIC_WAVE_QR_EXPIRY_MINUTES` | Client | `10` | Durée du timer (minutes) |
| `NEXT_PUBLIC_WAVE_CHECKOUT_URL` | Client | `https://pay.wave.com/m/neuropharm/c/` | Base URL QR Wave |
| `WAVE_MERCHANT_ID` | Serveur | `merchant_neuropharm_sn_001` | ID marchand Wave |
| `WAVE_QR_EXPIRY_MINUTES` | Serveur | `10` | Durée validité QR (vérification API) |

---

## 12. Considérations de sécurité

1. **Pas de cookie** : l'identification repose uniquement sur le `sessionToken` dans l'URL — ce token est `@unique` en DB et expire après `WAVE_QR_EXPIRY_MINUTES`.
2. **Session à usage unique** : une fois le statut `completed` posé, tout appel ultérieur avec le même token retourne `409 Paiement déjà effectué`.
3. **Pas d'information sensible dans l'URL** : les params `plan` et `pharmacy` sont uniquement informatifs — l'API recalcule tout depuis le token.
4. **CORS** : `/api/payments/confirm` ne nécessite pas de cookie — veiller à ne pas exposer des données sensibles dans la réponse GET (statut uniquement).
