# Branchement de MyProfileProvider sur l'historique réel — Design

**Date :** 2026-07-20
**Statut :** Approuvé

## Contexte

`MyProfileProvider` (`components/providers/my-profile-provider.tsx`) affiche aujourd'hui une identité `Client` **réelle** (`GET /api/client/me/profile`, branché dans un chantier précédent) mais des données d'abonnement et de séances **mockées**, épissées côté frontend depuis `mockMyProfile` :

```ts
const profile: MyProfile = {
  client: query.data.client,                          // RÉEL
  subscription: mockMyProfile.subscription,            // MOCK
  subscriptionStatus: mockMyProfile.subscriptionStatus, // MOCK
  subscriptionHistory: mockMyProfile.subscriptionHistory, // MOCK
  sessionHistory: mockMyProfile.sessionHistory,         // MOCK
}
```

Le backend a livré ce chantier (`GET /api/client/me/profile` enrichi, commit `183814f`, revu et corrigé en `cd4b63f`) : la réponse contient désormais `subscription`, `subscriptionHistory`, `sessionHistory` avec des données réelles. Ce document couvre le branchement frontend de ces 3 champs restants, remplaçant `mockMyProfile`.

**Contrat backend confirmé** (partagé par l'agent backend) :
```json
{
  "success": true,
  "data": {
    "client": { "id", "cardNumber", "name", "phone", "email", "isActive", "joinedAt" },
    "subscription": {
      "id", "clientId", "planId": "monthly"|"quarterly"|"biannual"|"annual",
      "startDate", "endDate", "suspended": false, "amountPaid", "paymentMethod": "cash"|"card"|"mobile_money",
      "createdAt"
    } | null,
    "subscriptionHistory": [ /* même forme que subscription, non paginé */ ],
    "sessionHistory": [
      { "id", "type": "subscriber", "clientId", "amountPaid", "paymentMethod", "checkedInAt" }
      /* les 20 dernières, plus récentes en premier */
    ]
  },
  "message": "", "errors": null
}
```
Les 4 clés (`client`/`subscription`/`subscriptionHistory`/`sessionHistory`) sont toujours présentes, même valeurs vides (`null`/`[]`), jamais omises. `subscription` est `null` quand le client n'a pas d'abonnement en cours de validité (pas commencé OU déjà expiré) ; un abonnement `suspended: true` mais dans sa période de validité reste retourné (le statut visuel affiché reste calculé côté frontend).

**Découverte utile** : les types frontend existants (`Subscription` dans `lib/subscriptions/types.ts`, `SubscriberSession` dans `lib/sessions/types.ts`) correspondent déjà exactement à la forme de la réponse backend — enums en minuscules, dates en chaînes ISO, `type: 'subscriber'` toujours présent sur cet endpoint. Pas besoin d'un type miroir intermédiaire comme `fetch-my-profile.ts` en a un pour `Client` (`RealClient` → `toReducedClient`) : les données de la réponse peuvent être typées directement avec `Subscription`/`SubscriberSession`.

## Décisions retenues (validées en session)

- **`MyProfile.subscription` change de type** : `Subscription | undefined` → `Subscription | null`. La vraie API renvoie toujours `null` (jamais `undefined`, jamais la clé omise) ; le type frontend doit refléter cette réalité plutôt que forcer une coercition à chaque usage.
- **`subscriptionStatus` se calcule désormais dans le provider**, pas dans les données mockées : `computeSubscriptionStatus(subscription)` (déjà existant, `lib/subscriptions/status.ts`) si `subscription !== null`, sinon `'none'` — valeur déjà prévue dans `ClientStatus` (`lib/clients/types.ts`) et déjà gérée par `ClientStatusBadge`. Ce cas correspond exactement au scénario "Marc Delaunay" du seed backend (abonnement expiré uniquement → aucun abonnement courant).
- **`lib/client-portal/mock-my-profile.ts` est supprimé** — confirmé via recherche exhaustive : son seul importeur est `my-profile-provider.tsx`, qui n'en aura plus besoin une fois réécrit.
- **Le badge "Démo"** (`demo` prop sur `SubscriptionStatusSection` et les deux `HistoryList` dans `app/(client)/accueil/page.tsx`) est retiré partout — les 3 sections deviennent entièrement réelles, plus aucune raison de l'afficher.
- **Aucun nouveau design de gestion d'erreur** : `GET /api/client/me/profile` reste un seul appel réseau ; l'état `error` déjà existant du provider (avec bouton "Réessayer" déjà câblé) couvre déjà un échec portant sur n'importe laquelle des 4 données, exactement comme pour `client` seul aujourd'hui.

## Architecture

Deux fichiers modifiés en profondeur, deux touchés en surface :

1. **`lib/client-portal/fetch-my-profile.ts`** — la couche fetch/enveloppe s'étend pour lire les 3 nouvelles clés de la réponse, typées directement avec les types frontend existants.
2. **`components/providers/my-profile-provider.tsx`** — la branche `ready` construit `profile` entièrement depuis les données réelles, avec le calcul de `subscriptionStatus` désormais explicite.
3. **`lib/client-portal/types.ts`** — `MyProfile.subscription` élargi à `Subscription | null`.
4. **`app/(client)/accueil/page.tsx`** — retrait des 3 props `demo`.
5. **`components/client-portal/subscription-status-section.tsx`** — prop `subscription` élargi à `Subscription | null`, cohérent avec le nouveau type de `MyProfile`.

## Contrat frontend détaillé

```ts
// lib/client-portal/types.ts
export type MyProfile = {
  client: { name: string; phone: string; cardNumber: string }
  subscription: Subscription | null        // était: Subscription | undefined
  subscriptionStatus: ClientStatus
  subscriptionHistory: Subscription[]
  sessionHistory: SubscriberSession[]
}
```

```ts
// lib/client-portal/fetch-my-profile.ts
export type FetchMyProfileResult =
  | {
      kind: 'found'
      client: MyProfile['client']
      subscription: Subscription | null
      subscriptionHistory: Subscription[]
      sessionHistory: SubscriberSession[]
    }
  | { kind: 'not-linked' }
```

`fetchMyClientProfile()` lit ces 3 clés depuis l'enveloppe de réponse (déjà typées `Subscription | null` / `Subscription[]` / `SubscriberSession[]` directement, sans transformation — contrairement à `client` qui passe par `toReducedClient()`, ces champs correspondent déjà exactement à ce que le frontend attend).

```ts
// components/providers/my-profile-provider.tsx, branche "found"
const subscriptionStatus: ClientStatus = data.subscription
  ? computeSubscriptionStatus(data.subscription)
  : 'none'

const profile: MyProfile = {
  client: data.client,
  subscription: data.subscription,
  subscriptionStatus,
  subscriptionHistory: data.subscriptionHistory,
  sessionHistory: data.sessionHistory,
}
```

## Hors périmètre

- Toute modification du contrat backend (`GET /api/client/me/profile`) — déjà livré, inchangé.
- Le CRUD staff (`useSubscriptions()`/`useSessions()` côté `/abonnements`, `/seances`) — reste mocké, chantier backend séparé non démarré.
- Le bug "client désactivé disparaît de l'historique de ses séances passées" (`/seances`) et son fix backend `?includeInactive=true` — chantier frontend distinct, traité séparément après celui-ci.
- Pagination de `subscriptionHistory`/`sessionHistory` — le backend ne pagine pas (`sessionHistory` déjà limité aux 20 dernières côté serveur), rien à ajouter côté UI.
