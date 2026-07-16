# Interface Client — Branchement réel sur `GET /api/client/me/profile` — Design

**Date :** 2026-07-15
**Sous-projet :** 7 / 9 (suivi — sous-partie ciblée du sous-projet Interface Client déjà livré)
**Statut :** Approuvé

## Rôle et périmètre de ce document

Ce design est produit sous le même cadrage de rôle "Architecte Frontend" que le sous-projet Interface Client d'origine — responsable UX/UI/composants/providers/hooks/pages, jamais de Prisma/SQL/JWT/logique métier backend. Il respecte `ARCHITECTURE_RULES.md`, notamment §11 (le frontend ne modifie jamais un contrat backend, il le consomme tel quel) et §16 (tout changement structurant est annoncé avant implémentation).

## Contexte

Le sous-projet Interface Client a livré `/accueil` avec un `MyProfileProvider` entièrement mocké, conçu explicitement pour être remplacé sans toucher aux écrans consommateurs — seule sa forme interne devait changer le jour où un vrai contrat backend existerait. Ce jour est arrivé : le backend a livré `GET /api/client/me/profile`, authentifié via `requireClientAuth()`, retournant le vrai `Client` (ou `null` si le `ClientAccount` connecté n'est lié à aucune fiche).

**Écart de périmètre confirmé** : l'API réelle ne retourne que `{ client: Client | null }`. Les modèles `Subscription`, `Session`, `Payment` n'existent toujours pas côté backend (`prisma/schema.prisma` ne les contient pas). Ce sous-projet ne peut donc brancher que la partie identité/carte du profil — le statut d'abonnement et les deux historiques restent mockés, comme documenté dans la proposition de contrat du sous-projet précédent qui prévoyait explicitement une livraison incrémentale.

**Forme réelle du `Client` backend** (`server/clients/domain/entities.ts`) :
```typescript
type Client = { id: string; cardNumber: string; name: string; phone: string; email: string | null; isActive: boolean; joinedAt: Date }
```
Plus riche que `MyProfile.client` actuel (`{name, phone, cardNumber}`) — ce document ne réduit pas cette richesse à la marge, il ajoute ce qui est utile à l'écran, sans inventer d'usage pour les champs non affichés (`id`, `isActive`, `joinedAt`, `email` restent disponibles dans le type mais ne sont pas nécessairement tous affichés — voir Écrans).

**Enveloppe de réponse** (`server/shared/api-response.ts`, déjà utilisée par les routes auth — cohérence confirmée) :
```typescript
type ApiSuccess<T> = { success: true; data: T; message: string; errors: null }
type ApiFailure = { success: false; data: null; message: string; errors: {field, message}[] | null }
```

## Décisions retenues (§18 — alternatives présentées et validées)

- **React Query** (`@tanstack/react-query`) plutôt qu'un fetch manuel via `useState`/`useEffect` — nouvelle dépendance acceptée en anticipation d'autres providers qui migreront plus tard vers du fetch réel avec mutations.
- **`Client` réel branché ; `Subscription`/historiques restent mockés**, avec un badge "Données de démonstration" visible sur les 3 sections concernées (statut abonnement, historique paiements, historique séances) — seule la carte numérique (nom + `cardNumber` réels) n'a pas ce badge.
- **`client: null`** (compte non lié à une fiche) traité comme un état dédié `'no-profile'`, pas une erreur — message clair invitant à contacter l'accueil.
- **Échec réseau/serveur** : message + bouton "Réessayer" déclenchant un refetch manuel ; pas de repli silencieux sur l'ancien profil intégralement mocké.

## Objectif

- `MyProfileProvider` interrogeant réellement `GET /api/client/me/profile` via React Query, fusionnant le `client` réel avec les données mockées d'abonnement/historique.
- `useMyProfile()` expose un état à 4 valeurs (`loading` / `error` / `no-profile` / `ready`) au lieu de l'actuel `loading` / `ready` binaire.
- Écran `/accueil` mis à jour pour gérer les 4 états, avec un badge "Données de démonstration" sur les sections encore mockées.
- Aucun changement de `SubscriptionStatusSection`, `DigitalCardSection`, `HistoryList` au-delà de l'ajout optionnel du badge — leurs props/contrats restent identiques.

## Hors périmètre (explicitement exclu de ce sous-projet)

- Branchement de `Subscription`/historiques sur du réel — impossible tant que ces modèles n'existent pas côté backend (`prisma/schema.prisma`). Reste hors périmètre jusqu'à ce qu'un contrat correspondant soit livré.
- Toute mutation côté portail client (modifier son profil, etc.) — l'API réelle actuelle est en lecture seule (`GET` uniquement), cohérent avec la garantie de lecture seule déjà en place côté `MyProfileProvider`.
- Modification de `app/api/client/me/profile/route.ts`, `server/clients/`, ou tout code backend — strictement hors périmètre par cadrage de rôle.
- Retry automatique en arrière-plan configuré manuellement — le comportement par défaut de React Query (retries limités avant d'exposer l'état `error`) est jugé suffisant, pas de configuration `retry`/`staleTime` personnalisée dans ce sous-projet.

## Modèle de données (révisé)

```typescript
// lib/client-portal/types.ts (révisé)
export type MyProfile = {
  client: {
    name: string
    phone: string
    cardNumber: string
  }
  subscription: Subscription | undefined      // toujours mocké
  subscriptionStatus: ClientStatus            // toujours mocké
  subscriptionHistory: Subscription[]         // toujours mocké
  sessionHistory: SubscriberSession[]         // toujours mocké
}
```

`MyProfile.client` garde volontairement sa forme actuelle (`{name, phone, cardNumber}`, un sous-ensemble du vrai `Client`) — pas de raison d'exposer `id`/`isActive`/`joinedAt`/`email` aux composants d'écran tant qu'aucun n'en a besoin (YAGNI). Le mapping du vrai `Client` vers cette forme se fait dans le provider, pas dans les composants.

```typescript
// lib/client-portal/fetch-my-profile.ts (nouveau)
type RealClient = { id: string; cardNumber: string; name: string; phone: string; email: string | null; isActive: boolean; joinedAt: string }
type MyProfileApiData = { client: RealClient | null }
```

## Gestion d'état

### `useMyProfile()` — contrat révisé

```typescript
type MyProfileState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'no-profile' }
  | { status: 'ready'; profile: MyProfile }
```

Remplace l'actuel `{ profile: MyProfile; status: 'loading' | 'ready' }` — c'est un changement de signature sur du code déjà livré, à traiter comme tel dans le plan (le seul call site actuel, `app/(client)/accueil/page.tsx`, doit être adapté pour gérer les 4 branches au lieu de 2).

### `MyProfileProvider` — implémentation

Utilise `useQuery({ queryKey: ['my-client-profile'], queryFn: fetchMyClientProfile })` en interne. `fetchMyClientProfile()` :
1. Appelle `fetch('/api/client/me/profile')` (cookie de session envoyé automatiquement, cohérent avec le reste de l'app).
2. Déballe `ApiResponse<MyProfileApiData>` — si `success: false`, lève une erreur (React Query la capture et bascule `isError`).
3. Si `data.client === null` → ne lève pas d'erreur, retourne un marqueur distinct (ex. `null` en valeur de retour de `queryFn`) que le provider traduit en `status: 'no-profile'`, distinct de `status: 'error'`.
4. Si `data.client` existe → construit le `MyProfile` complet : `client` mappé depuis `RealClient` vers la forme réduite, `subscription`/`subscriptionStatus`/`subscriptionHistory`/`sessionHistory` copiés tels quels depuis `mockMyProfile` (import inchangé de `lib/client-portal/mock-my-profile.ts`).

`retry()` (exposé uniquement dans l'état `error`) appelle `refetch()` de React Query.

`QueryClientProvider` (avec un `QueryClient` créé une fois, via `useState(() => new QueryClient())` pour éviter une recréation à chaque rendu) est monté dans `app/(client)/layout.tsx`, entre `ClientGuard`'s authenticated branch et `MyProfileProvider` — `MyProfileProvider` reste à l'intérieur, inchangé dans sa position relative au reste de l'arbre.

## Écrans

### `app/(client)/accueil/page.tsx` (révisé)

Quatre branches sur `status` :
- `'loading'` → écran de chargement (reprend le texte "Chargement…" déjà utilisé).
- `'error'` → message "Impossible de charger votre profil." + bouton "Réessayer" appelant `retry()`.
- `'no-profile'` → message "Votre compte n'est pas encore relié à une fiche client. Contactez l'accueil." — pas de sections affichées en dessous (rien à afficher sans `client`).
- `'ready'` → les 4 sections actuelles inchangées dans leur ordre, avec un badge "Données de démonstration" ajouté sur `SubscriptionStatusSection` et les deux instances de `HistoryList` (paiements, séances). `DigitalCardSection` n'a pas de badge — ses données (`profile.client.name`, `profile.client.cardNumber`) sont désormais réelles.

Le badge est une petite pastille discrète (ex. `Badge` existant, variante `muted`, texte "Démo") positionnée dans l'en-tête de chaque `Card` concernée — implémentation exacte laissée au plan, contrainte : ne doit pas perturber la lisibilité du contenu réel en dessous.

## Erreurs et cas limites

- `GET /api/client/me/profile` renvoie 401 (session expirée pendant la consultation) → traité comme `status: 'error'` par ce provider ; la redirection vers `/connexion` reste la responsabilité de `ClientGuard` (`app/(client)/layout.tsx`, inchangé) — pas de logique de redirection dupliquée dans `MyProfileProvider`.
- Client trouvé mais `isActive: false` (déjà relevé comme faille Minor lors de la review backend — l'API ne filtre pas les clients désactivés) → affiché tel quel par ce sous-projet ; **note explicite** : si le backend corrige ce filtrage plus tard (renvoyant `null` pour un client désactivé), ce provider n'a rien à changer, le cas tombe naturellement dans `'no-profile'`.
- Réponse JSON malformée ou `fetch` qui échoue avant même d'atteindre le serveur (coupure réseau) → capturé par le `try/catch` implicite de `queryFn`, React Query bascule en état d'erreur, même traitement que tout autre échec.
- Changement de compte connecté en cours de session (déconnexion/reconnexion) → hors périmètre : `queryKey: ['my-client-profile']` n'est pas invalidé automatiquement au changement de session dans ce sous-projet ; un rechargement de page après reconnexion suffit (comportement actuel du reste de l'app, pas une régression introduite ici).

## Découpage global du projet (rappel, pour contexte)

1. ~~Fondations & Shell~~ — terminé
2. ~~Auth (V0 mockée)~~ — terminé
2b. API d'authentification (remplacement des mocks) — terminé
3. ~~Gestion Clients~~ — terminé
4. ~~Gestion Abonnements~~ — terminé
5. ~~Gestion Séances journalières~~ — terminé
6. ~~Scan QR~~ — terminé
7. **Interface Client** — livré en mock (`2026-07-14-interface-client-design.md`) ; ce document branche la partie identité/carte sur le vrai backend `Client` livré entre-temps
8. Statistiques
9. Paramètres, Notifications, Reçus PDF

`Subscription`/`Session`/`Payment` restent à construire côté backend avant qu'un futur sous-projet ne puisse brancher le reste de `/accueil` sur du réel.
