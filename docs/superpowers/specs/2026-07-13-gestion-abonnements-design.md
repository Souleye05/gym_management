# Gestion Abonnements — Design

**Date :** 2026-07-13
**Sous-projet :** 4 / 9 (voir découpage global en fin de document)
**Statut :** Approuvé

## Contexte

Le sous-projet précédent ("Gestion Clients") a livré `Client.status: ClientStatus` (`'active' | 'expiring' | 'expired' | 'none'`), mais ce champ est aujourd'hui stocké en dur par client dans `lib/clients/mock-clients.ts` — rien ne le calcule réellement. La page `/abonnements` est un stub, et la fiche client (`/clients/[id]`) a une section "Paiements" en `EmptyState` explicitement réservée pour ce sous-projet.

Ce sous-projet introduit un vrai modèle d'abonnement, connecté au client, et fait de `Client.status` un champ **dérivé** plutôt que stocké.

## Objectif

- Nouveau modèle `Subscription` (formule, dates, statut, paiement), relié à un `Client` par `clientId`.
- 4 formules mockées en dur (Mensuel/30j, Trimestriel/90j, Semestriel/180j, Annuel/365j), non éditables dans ce sous-projet.
- `Subscription.status` **calculé dynamiquement** (`active`/`expiring`/`expired`) à partir de `endDate`, sauf `suspended` qui est une décision manuelle explicite.
- `Client.status` devient **dérivé** de l'abonnement courant du client — retiré du modèle `Client` stocké, calculé à la lecture.
- Un seul abonnement actif (ou expirant, ou suspendu) par client à la fois ; le renouvellement crée toujours un **nouvel enregistrement**, jamais une modification de l'ancien. Historique immuable.
- Page `/abonnements` (liste globale, recherche/filtre) et section abonnement sur `/clients/[id]` (actuel + historique), avec création/renouvellement/suspension/réactivation.
- Écran de confirmation post-paiement (récap, pas de PDF).

## Hors périmètre (explicitement exclu de ce sous-projet)

- Gestion des tarifs éditable par l'admin — les 4 formules restent des constantes en dur ; le cahier des charges classe ça priorité Basse et prévoit un écran dédié dans Paramètres (sous-projet 9).
- Génération de reçu PDF, partage SMS/WhatsApp — écran de confirmation seulement (sous-projet 9, Reçus PDF).
- Vraies notifications/alertes d'expiration J-7 — mise en évidence visuelle uniquement (déjà partiellement présente sur le dashboard existant "Abonnements à relancer"), pas de système de notification interne (sous-projet 9, Notifications).
- Montant de paiement modifiable manuellement (remises) — le prix est celui de la formule choisie, non modifiable.
- Paiement en ligne — paiement comptant déclaratif uniquement (mode de paiement enregistré, aucune validation réelle), conforme au cahier des charges V0.
- Persistance `localStorage`/API réelle — état React en mémoire, comme `ClientsProvider`.

## Modèle de données

```typescript
// lib/subscriptions/types.ts
export type PlanId = 'monthly' | 'quarterly' | 'biannual' | 'annual'

export type Plan = {
  id: PlanId
  label: string
  durationDays: number
  price: number
}

export type SubscriptionStatus = 'active' | 'expiring' | 'expired' | 'suspended'

// lib/clients/types.ts — ClientStatus étendu pour inclure 'suspended' (voir section
// "Statut client dérivé" plus bas) : un modèle cohérent plutôt qu'un cas spécial.
// export type ClientStatus = 'active' | 'expiring' | 'expired' | 'suspended' | 'none'

export type PaymentMethod = 'cash' | 'card' | 'mobile_money'

export type Subscription = {
  id: string
  clientId: string
  planId: PlanId
  startDate: string   // ISO date string
  endDate: string      // ISO date string, = startDate + plan.durationDays
  suspended: boolean   // manuel, indépendant du calcul de date
  amountPaid: number   // = plan.price au moment de la création, jamais modifié après coup
  paymentMethod: PaymentMethod
  createdAt: string
}
```

`Subscription` ne stocke pas de `status` — il se **calcule** (voir Logique de statut ci-dessous). `suspended` est le seul champ manuel qui influence le statut ; tout le reste dérive de `endDate` comparée à la date courante.

`lib/subscriptions/plans.ts` :

```typescript
export const PLANS: Plan[] = [
  { id: 'monthly', label: 'Mensuel', durationDays: 30, price: 40 },
  { id: 'quarterly', label: 'Trimestriel', durationDays: 90, price: 105 },
  { id: 'biannual', label: 'Semestriel', durationDays: 180, price: 190 },
  { id: 'annual', label: 'Annuel', durationDays: 365, price: 350 },
]
```

## Logique de statut (dérivée, pas stockée)

```typescript
// lib/subscriptions/status.ts
export function computeSubscriptionStatus(subscription: Subscription, now: Date = new Date()): SubscriptionStatus {
  if (subscription.suspended) return 'suspended'
  const end = new Date(subscription.endDate)
  if (end.getTime() <= now.getTime()) return 'expired'
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
  if (end.getTime() - now.getTime() <= sevenDaysMs) return 'expiring'
  return 'active'
}
```

### `ClientStatus` étendu à `'suspended'`

`ClientStatus` (`lib/clients/types.ts`) gagne la valeur `'suspended'` : `'active' | 'expiring' | 'expired' | 'suspended' | 'none'`. Un `Subscription.status === 'suspended'` se reflète donc directement en `Client.status === 'suspended'`, sans mapping ni cas spécial — un seul modèle de statut cohérent entre `Subscription` et `Client`, pas de traitement dérogatoire. `ClientStatusBadge` (`components/clients/client-status-badge.tsx`) gagne une entrée `suspended` dans sa table `STATUS_CONFIG` (label "Suspendu", variant `warning` ou `muted` — à trancher visuellement dans le plan, pas structurant).

`Client.status` devient calculé ainsi :
- Si le client n'a **aucun** abonnement → `'none'`.
- Sinon → le statut de son **abonnement courant** (voir "Un seul abonnement courant par client" ci-dessous — déterminé par ses dates métier, pas par `createdAt`), calculé via `computeSubscriptionStatus`.

## Retrait de `Client.status` du modèle stocké

`lib/clients/types.ts` perd le champ `status: ClientStatus` (il n'est plus une donnée persistée sur `Client`). `lib/clients/mock-clients.ts` perd les valeurs `status: '...'` codées en dur sur chacun des 18 clients mockés. `ClientsProvider`/`useClients()` ne change pas de responsabilité (toujours le CRUD client pur) — le statut n'est plus quelque chose qu'il connaît ou expose ; c'est `SubscriptionsProvider` (voir plus bas) qui, combiné à la liste de clients, permet de calculer le statut d'affichage à la demande via un hook dédié.

## Gestion d'état

`components/providers/subscriptions-provider.tsx` — même pattern que `ClientsProvider` (contexte React, état en mémoire, seedé depuis un mock de départ) :

```typescript
type SubscriptionsContextValue = {
  subscriptions: Subscription[]
  createSubscription(input: { clientId: string; planId: PlanId; paymentMethod: PaymentMethod }): Subscription
  renewSubscription(clientId: string, input: { planId: PlanId; paymentMethod: PaymentMethod }): Subscription
  suspendSubscription(subscriptionId: string): void
  reactivateSubscription(subscriptionId: string): void
  getCurrentSubscription(clientId: string): Subscription | undefined
  getSubscriptionHistory(clientId: string): Subscription[]
}
```

### Un seul abonnement courant par client — déterminé par les dates métier, pas `createdAt`

`getCurrentSubscription(clientId)` renvoie l'abonnement du client avec l'**`endDate` la plus tardive** parmi tous ses abonnements (pas `createdAt`). `createdAt` reste utile pour l'ordre d'affichage de l'historique (voir `getSubscriptionHistory` plus bas) mais ne doit **jamais** servir à déterminer quel abonnement est "courant" — deux abonnements créés le même jour civil, ou un renouvellement anticipé créé avant l'expiration du précédent, pourraient sinon se classer dans le mauvais ordre. `endDate` est la seule source de vérité métier pour "lequel est actif maintenant".

### Création et renouvellement — préserver les jours restants

```typescript
function computeStartDate(currentSubscription: Subscription | undefined, now: Date): Date {
  if (!currentSubscription) return now
  const currentEnd = new Date(currentSubscription.endDate)
  return currentEnd.getTime() > now.getTime() ? currentEnd : now
}
```

- `createSubscription(clientId, ...)` : utilisé quand le client n'a **aucun** abonnement (`getCurrentSubscription` renvoie `undefined`) — `startDate = now`.
- `renewSubscription(clientId, ...)` : utilisé quand le client a déjà un abonnement (courant ou passé). `startDate = computeStartDate(getCurrentSubscription(clientId), now)` :
  - Si l'abonnement courant est encore `active`/`expiring` (son `endDate` est dans le futur) → `startDate` = son `endDate` exact. Le client ne perd **aucun jour restant** : le nouvel abonnement s'enchaîne immédiatement après l'ancien.
  - Si l'abonnement courant est `expired` (son `endDate` est dans le passé) → `startDate = now`. Repartir de l'ancienne date créerait un abonnement "renouvelé" déjà expiré le jour même, ce qui n'a pas de sens.
- Dans les deux cas : `endDate = startDate + plan.durationDays`, `amountPaid = plan.price` au moment de la création, un nouvel enregistrement est toujours créé (jamais de modification de l'ancien).
- `suspendSubscription`/`reactivateSubscription` : bascule `suspended` sur l'abonnement courant (au sens `endDate` la plus tardive) uniquement — pas de sens de suspendre un abonnement déjà dépassé par un plus récent.
- `getSubscriptionHistory(clientId)` : tous les abonnements du client, triés par `createdAt` décroissant (ordre chronologique de création — approprié ici puisqu'il s'agit d'un simple historique d'affichage, pas d'une détermination de "lequel est actif").

Mock de départ (`lib/subscriptions/mock-subscriptions.ts`) : génère un abonnement pour la majorité des 18 clients mockés existants (statuts variés obtenus en choisissant des `endDate` passées/proches/lointaines), et laisse 2-3 clients sans aucun abonnement (`status: 'none'`) pour couvrir ce cas — cohérent avec les statuts déjà visibles aujourd'hui dans `mock-clients.ts` avant leur retrait.

## Écrans

### `app/(staff)/abonnements/page.tsx` — Liste globale

Remplace le stub. Table de tous les abonnements **courants** (un par client ayant un abonnement), avec :
- Colonnes : Client (nom, clic → fiche client), Formule, Statut (badge), Date d'expiration.
- Filtre par statut (`Tous`/`Actif`/`Expire bientôt`/`Expiré`/`Suspendu`).
- Recherche par nom de client (réutilise le pattern de recherche de `/clients`).
- Pas de création directe depuis cette liste dans ce sous-projet — la création se fait depuis la fiche client (un abonnement a toujours besoin d'un client cible ; chercher le client d'abord est le flux naturel, cohérent avec le cahier des charges qui place la création d'abonnement dans le contexte du profil client).

### Section abonnement sur `/clients/[id]`

Remplace le stub "Paiements" existant :
- **Abonnement courant** (`Card`) : formule, dates début/fin, statut (badge), montant payé, mode de paiement. Actions contextuelles selon le statut :
  - Pas d'abonnement (`none`) → bouton "Créer un abonnement".
  - `active`/`expiring` → boutons "Renouveler" et "Suspendre".
  - `suspended` → bouton "Réactiver".
  - `expired` → bouton "Renouveler" (un abonnement expiré se renouvelle comme n'importe quel autre).
- **Historique des abonnements** (`Card` séparée, remplace le stub "Paiements" uniquement — le stub "Historique des séances" existant reste inchangé, il concerne un sous-projet différent) : liste des abonnements passés (formule, dates, montant, statut au moment de l'expiration/renouvellement), triée du plus récent au plus ancien. Vide si le client n'a jamais eu d'abonnement (message inline, pas `EmptyState` complet — cohérent avec le pattern déjà utilisé sur `/clients` pour "aucun résultat").

### Formulaire création/renouvellement

`Dialog` (réutilise le composant existant) avec :
- Sélection de formule (4 boutons/cards, prix affiché, non modifiable après sélection).
- Sélection de mode de paiement (Espèces / Carte / Mobile Money).
- Bouton de confirmation → crée l'abonnement, ferme le dialog, affiche l'écran de confirmation.

### Écran de confirmation post-paiement

Après création/renouvellement réussi : `Dialog` ou état inline récapitulant formule, montant, mode de paiement, dates de début/fin — pas de génération PDF, pas de bouton de partage (hors périmètre).

## Erreurs et cas limites

- Client sans abonnement visitant sa fiche → section abonnement affiche l'état "Aucun abonnement" avec le bouton de création, pas une erreur.
- Tentative de suspendre un abonnement déjà expiré → action non disponible (bouton absent pour ce statut), pas un cas d'erreur à gérer côté logique.
- Renouveler un abonnement suspendu → autorisé, cohérent avec `computeStartDate` : si sa `endDate` est encore future, le nouvel abonnement démarre à cette `endDate` (le client ne perd pas les jours restants de la période suspendue) ; l'ancien enregistrement suspendu reste tel quel dans l'historique. Pas besoin de réactiver avant de renouveler.
- Deux renouvellements rapides du même client (double-clic) → chaque clic crée un enregistrement distinct avec son propre `createdAt` ; pas de garde anti-double-soumission dans ce sous-projet (cohérent avec le niveau de rigueur du reste du CRUD mocké). Note : comme `getCurrentSubscription` se base sur `endDate` et non `createdAt`, un double-clic produirait deux abonnements avec la même `startDate`/`endDate` calculée (tous deux dérivés du même abonnement précédent) — un cas limite mineur, sans garde dans ce sous-projet.

## Découpage global du projet (rappel, pour contexte)

1. ~~Fondations & Shell~~ — terminé
2. ~~Auth (V0 mockée)~~ — terminé
2b. API d'authentification (remplacement des mocks) — en cours, par un autre agent
3. ~~Gestion Clients~~ — terminé (`2026-07-13-gestion-clients-design.md`)
4. **Gestion Abonnements** ← ce document
5. Gestion Séances journalières
6. Scan QR
7. Interface Client (portail mobile complet)
8. Statistiques
9. Paramètres, Notifications, Reçus PDF

Chaque sous-projet suivant aura son propre cycle brainstorming → spec → plan.
