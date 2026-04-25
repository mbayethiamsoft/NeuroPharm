# Pro forma (devis estimatif) — NeuroPharm v1

> **Règle anti-régression** : toute modification de ce flux (schéma, API, page, conversion) **doit** mettre ce fichier à jour avant le merge.

---

## 1. Vue d'ensemble

La fonctionnalité **Pro forma** permet à un pharmacien / caissier de générer un **devis estimatif** listant médicaments, quantités, références et prix, **sans aucune valeur comptable ou légale de facturation**.

Cas d'usage typique : un client demande un devis avant de commander, une assurance demande une estimation pour validation préalable, un hôpital sollicite des prix indicatifs.

**Principes métier clés** :

- **Aucune décrémentation de stock** : un devis n'immobilise rien. Le stock affiché est purement indicatif.
- **Aucun impact comptable** : les pro forma n'apparaissent pas dans `/dashboard/comptabilite`, ni dans le chiffre d'affaires, ni dans les KPI du dashboard.
- **Aucun `AuditLog` de type `SALE`** : seulement des entrées `CREATE / UPDATE / DELETE` d'entité `proforma`.
- **Pas de méthode de paiement** : un devis ne propose pas de paiement — c'est juste une estimation.
- **Différenciation visuelle forte** : palette **indigo** (≠ emerald du POS), bandeau permanent « SANS VALEUR COMPTABLE », filigrane « PRO FORMA » diagonal sur le document imprimé.

---

## 2. Fichiers principaux

| Fichier | Rôle |
|---------|------|
| `prisma/schema.prisma` | Modèles `Proforma` + `ProformaItem` |
| `src/lib/proforma.ts` | Types + `buildProformaHtml` (filigrane + bandeau légal) + `printProforma` + `formatProformaNumber` (`PF-XXXXXXXX`) |
| `src/app/api/proformas/route.ts` | `GET` (liste paginée) + `POST` (création) |
| `src/app/api/proformas/[id]/route.ts` | `GET` (détail), `PUT` (change status → `converted` / `cancelled`), `DELETE` |
| `src/app/dashboard/ventes/proforma/page.tsx` | Page de création du devis |
| `src/app/dashboard/ventes/proforma/historique/page.tsx` | Historique avec filtres + actions (réimprimer, convertir, annuler, supprimer) |
| `src/app/dashboard/ventes/layout.tsx` | Onglet « Pro forma » ajouté au shell de navigation ventes |
| `src/app/dashboard/ventes/page.tsx` | POS : hydrate le panier depuis `?proformaId=X` et marque le devis `converted` après vente |
| `src/lib/rbac.ts` | Menu key `proforma` (ADMIN + PHARMACIST + CASHIER par défaut) |
| `src/lib/i18n/fr.ts` + `en.ts` | Section `proforma` |

---

## 3. Modèles Prisma

### `Proforma`

```prisma
model Proforma {
  id             String         @id @default(cuid())
  pharmacyId     String
  userId         String         // auteur du devis
  items          ProformaItem[]

  // Montants snapshot (calculés côté serveur)
  subtotal       Float
  discount       Float          @default(0) // montant remise
  discountRate   Float          @default(0) // % remise
  total          Float

  // Client (pas de relation — snapshot)
  customerName   String?
  customerPhone  String?

  validityDays   Int            @default(15) // 0 = illimitée

  notes          String?
  status         String         @default("active") // active, converted, cancelled
  convertedSaleId String?       // id de la Sale si converti
  convertedAt    DateTime?

  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  @@index([pharmacyId, status])
  @@index([pharmacyId, createdAt])
}
```

### `ProformaItem`

```prisma
model ProformaItem {
  id             String    @id @default(cuid())
  proformaId     String
  medicationId   String?   // nullable si le médicament a été supprimé
  medicationName String    // snapshot du nom
  medicationRef  String?   // snapshot du code-barres
  quantity       Int
  unitPrice      Float
  total          Float
  createdAt      DateTime  @default(now())
}
```

> Les items stockent un **snapshot** du nom et de la référence pour survivre à la suppression d'un médicament. `medicationId` reste utile pour la conversion en vente (résolution en objet `Medication` complet).

---

## 4. Routes API

### `GET /api/proformas`

**Auth** : tout utilisateur authentifié avec `pharmacyId`.

**Query params :** `page`, `limit` (défaut 20), `search` (nom client / téléphone / fin d'id), `dateFrom`, `dateTo`, `status` (`active` / `converted` / `cancelled`).

**Réponse :**
```json
{
  "proformas": [ { "id": "...", "total": 12500, "customerName": "...", "status": "active", "_count": { "items": 3 } } ],
  "pagination": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
}
```

### `POST /api/proformas`

**Auth** : tout utilisateur authentifié avec `pharmacyId`.

**Corps :**
```json
{
  "items": [
    { "medicationId": "clxxx", "medicationName": "Paracétamol 500mg", "medicationRef": "BARCODE123", "quantity": 2, "unitPrice": 1500 }
  ],
  "discountRate": 10,
  "customerName": "Amadou Diallo",
  "customerPhone": "771234567",
  "validityDays": 15,
  "notes": "Validité sous réserve de disponibilité stock"
}
```

**Comportement serveur :**

1. Valide `items` non vide, chaque `quantity > 0`, `unitPrice ≥ 0`.
2. Vérifie que les `medicationId` fournis appartiennent à la pharmacie (si présents).
3. Calcule **côté serveur** (autoritaire) : `subtotal`, `discount` (= subtotal × rate/100), `total`.
4. Clampe `discountRate` ∈ [0, 100] et `validityDays` ∈ [0, 365].
5. Crée la `Proforma` + ses `ProformaItem` en une seule écriture Prisma.
6. Écrit un `AuditLog` `CREATE` / `proforma`.

> ⚠ **Aucune transaction atomique n'est nécessaire** car il n'y a pas de décrémentation de stock ni d'autres effets de bord — juste une insertion.

### `GET /api/proformas/[id]`

Renvoie le devis avec `items` triés par date + `author` (nom de l'utilisateur créateur, résolu séparément).

### `PUT /api/proformas/[id]`

**Corps :** `{ status: 'active' | 'converted' | 'cancelled', convertedSaleId?: string }`

Change uniquement le statut. Pour `converted`, stocke l'id de la Sale résultante et la date.

> **Choix de design** : on ne permet pas d'éditer le contenu d'un devis. Pour modifier les articles, supprimer et recréer — simplifie les règles métier et évite de désynchroniser les snapshots.

### `DELETE /api/proformas/[id]`

**Hard delete** (pas de soft delete). Un devis n'a aucune valeur à conserver obligatoirement. Cascade automatique sur `ProformaItem` via `onDelete: Cascade`.

---

## 5. Interface utilisateur

### 5.1 Onglet « Pro forma » dans `/dashboard/ventes`

Visible pour `ADMIN`, `SUPER_ADMIN`, ou tout utilisateur avec la permission `proforma` = `true` (par défaut aussi `PHARMACIST` et `CASHIER` via `DEFAULT_PERMISSIONS` dans `src/lib/rbac.ts`).

Icône `FileText`, label « Pro forma ».

### 5.2 Page création `/dashboard/ventes/proforma`

**Bandeau permanent** en haut de page (indigo) : « Document d'estimation — sans valeur comptable ni légale de facturation » + lien vers l'historique.

**Zone gauche** :
- Recherche médicaments (même API `/api/medications` que le POS).
- Grille de résultats : cartes cliquables. **Pas de désactivation** en cas de rupture stock (c'est un devis) — le stock est affiché à titre indicatif avec un label orange « Rupture » si `shelfQuantity = 0`.
- Panier : chaque ligne permet d'**éditer librement quantité ET prix unitaire** (le prix d'un devis peut différer du catalogue).

**Zone droite** :
- Destinataire (nom + téléphone, tous deux optionnels).
- Durée de validité en jours (défaut 15, 0 = illimitée).
- Remise %.
- Notes libres.
- Hint jaune : « Stock indicatif uniquement — un devis n'immobilise pas le stock ».
- Totaux : sous-total → remise → **Total estimatif** (indigo).
- Deux boutons : « Enregistrer le devis » et « Enregistrer & Imprimer ».

### 5.3 Page historique `/dashboard/ventes/proforma/historique`

Filtres : recherche, date from/to, statut.

**Tableau desktop** : Date, N° devis (`PF-XXXXXXXX`), destinataire, nb articles, total, statut, actions.

**Actions par ligne** :

| Action | Icône | Comportement |
|--------|-------|--------------|
| Voir détail | `Eye` | Modal avec tous les items + totaux + notes |
| Réimprimer | `Printer` | Re-télécharge le devis + `printProforma()` |
| Convertir en vente | `ShoppingCart` | Navigue vers `/dashboard/ventes?proformaId=X` (uniquement si statut `active`) |
| Annuler | `XCircle` | `PUT status=cancelled` après confirmation (uniquement si statut `active`) |
| Supprimer | `Trash2` | `DELETE` définitif après confirmation |

**Statuts** :

| Statut | Couleur badge | Sémantique |
|--------|---------------|------------|
| `active` | Indigo | Devis valide, actionnable |
| `converted` | Vert | Transformé en vente réelle |
| `cancelled` | Rouge | Annulé — consultable mais non actionnable |

### 5.4 Document imprimé

Format A4, police Helvetica, style **facture professionnelle** (≠ ticket POS monospace).

Éléments clés :

1. **Filigrane diagonal** « PRO FORMA » à -30° en gris indigo translucide sur toute la page.
2. **Bandeau légal** en haut : `DOCUMENT D'ESTIMATION — SANS VALEUR COMPTABLE NI LÉGALE DE FACTURATION` (bordure tiretée, fond indigo clair).
3. **En-tête** : infos pharmacie à gauche, badge « DEVIS PRO FORMA » + numéro `PF-XXXXXXXX` + date + auteur à droite.
4. **Bloc destinataire** si renseigné.
5. **Tableau des articles** : #, désignation (+ référence si présente), qté, prix unitaire, total.
6. **Totaux** alignés à droite : sous-total, remise (%), **Total estimatif**.
7. **Validité** : « Validité : N jours (jusqu'au DD/MM/YYYY) » ou « Validité : illimitée ».
8. **Notes** éventuelles dans un encart ambre.
9. **Pied de page** : rappel que le document est indicatif, que seule une facture officielle fait foi.

Si le devis est `converted` ou `cancelled`, une bannière de statut apparaît au-dessus de l'en-tête.

---

## 6. Conversion proforma → vente

### 6.1 Flux utilisateur

1. Depuis l'historique, l'utilisateur clique sur « Convertir en vente » sur une ligne `active`.
2. Confirmation (`confirm` natif).
3. Redirection vers `/dashboard/ventes?proformaId=X`.
4. Le POS détecte le query param, fetch le devis, résout les médicaments du catalogue, pré-remplit le panier + destinataire + remise.
5. Un **bandeau indigo** s'affiche au-dessus du POS : « Vente en provenance du devis PF-XXXXXXXX. Le panier a été pré-rempli — validez pour convertir. »
6. L'utilisateur ajuste éventuellement (mode de paiement, ordonnance, client crédit…) puis valide la vente normalement.
7. À la réussite, le POS appelle `PUT /api/proformas/{id}` avec `status=converted, convertedSaleId=<newSaleId>` (best-effort, n'impacte pas la vente si échec).
8. L'URL est nettoyée (suppression du `?proformaId=...`) pour qu'un refresh ne re-hydrate pas.

### 6.2 Comportements particuliers

**Médicament supprimé du catalogue** : l'item du devis a toujours son snapshot `medicationName` / `medicationRef`, mais la résolution vers un objet `Medication` complet échoue. Le POS affiche un bandeau ambre : « Articles non disponibles dans le catalogue (à ajouter manuellement) : X, Y ». Les autres items sont ajoutés normalement.

**Toutes les règles POS standard s'appliquent à la vente finale** : stock en rayon suffisant, customer requis pour CREDIT, institution+bénéficiaire requis pour INSURANCE, etc. La conversion n'est **pas** un contournement des règles — c'est juste un pré-remplissage de panier.

**Prix** : les prix unitaires du devis sont repris dans le panier. S'ils diffèrent du catalogue actuel, le POS les conserve tels quels (comportement voulu — le pharmacien s'est engagé sur le prix du devis). L'utilisateur peut modifier la qté via les boutons +/−.

**Détacher du devis** : un bouton ✕ sur le bandeau permet de détacher le POS du devis courant sans recharger (si l'utilisateur veut finalement faire une vente indépendante).

---

## 7. Permissions

| Rôle | Accès par défaut |
|------|-------------------|
| `SUPER_ADMIN` | Accès complet (bypass RBAC) |
| `ADMIN` | Accès complet (bypass RBAC) |
| `PHARMACIST` | ✅ (via `DEFAULT_PERMISSIONS`) |
| `CASHIER` | ✅ (via `DEFAULT_PERMISSIONS`) |
| `ACCOUNTANT` | ❌ |

Surcharge individuelle possible via `/dashboard/permissions` (admin pharmacie).

---

## 8. Règles anti-régression

1. **Un proforma ne décrémente jamais le stock.** Aucun `prisma.medication.update({ quantity: { decrement: ... } })` dans les routes `/api/proformas/*`.
2. **Un proforma ne crée jamais de `StockMovement`.**
3. **Un proforma n'entre dans aucun agrégat financier** (`/dashboard/comptabilite`, KPI dashboard, rapports carnet/assurance…).
4. **Numérotation distincte** : préfixe `PF-` obligatoire dans `formatProformaNumber`, ne jamais confondre avec les reçus de vente (8 derniers chars uppercase seuls).
5. **Bandeau légal et filigrane obligatoires** sur tout document imprimé. Ne jamais retirer `DOCUMENT D'ESTIMATION — SANS VALEUR COMPTABLE` ni le watermark `PRO FORMA`.
6. **La conversion passe par le POS standard** : ne jamais créer une route dédiée qui contournerait les validations stock / crédit / assurance.
7. **Multi-tenant** : toute requête Prisma sur `Proforma` / `ProformaItem` filtre par `pharmacyId` issu du JWT.
