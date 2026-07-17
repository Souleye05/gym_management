# Branchement de ClientsProvider sur le vrai backend — Design

**Date :** 2026-07-17
**Statut :** Approuvé

## Contexte

Le backend Clients API (`server/clients/**`, `app/api/clients/**`) est réel, testé et protégé depuis plusieurs sessions. Le frontend staff, lui, est resté 100% mocké : `ClientsProvider` (`components/providers/clients-provider.tsx`) seed depuis `lib/clients/mock-clients.ts` (ids `'cl1'..'cl18'`, jamais des cuids), et toutes ses opérations (`addClient`, `updateClient`, `deleteClient`, `clientRepository.search`/`findByCardNumber`) sont synchrones.

Ce chantier est un prérequis explicite au prochain sous-projet (backend réel `Subscription`/`Session`) : construire ces modules contre des ids `'cl1'`-style serait une base à refaire dès que `ClientsProvider` basculerait sur le réel. Autant le faire maintenant.

**Consommateurs concernés** (aucun autre fichier n'importe `useClients()`/`ClientRepository` directement, confirmé par recherche exhaustive) :
- `app/(staff)/clients/page.tsx` — liste + création
- `app/(staff)/clients/[id]/page.tsx` — détail, édition, désactivation
- `app/(staff)/abonnements/page.tsx` — lecture liste seule
- `app/(staff)/seances/page.tsx` — lecture liste + `clientRepository` pour identification
- `app/(staff)/scan/page.tsx` — `clientRepository.findByCardNumber` pour identification QR/carte

## Découverte structurante et décision (§16/§18 ARCHITECTURE_RULES)

**Problème** : `GET /api/clients` sans paramètre `q` retourne intentionnellement `[]` — le service backend existant (`ClientService.listClients`) n'a jamais eu vocation à "tout lister", seule la recherche substring est supportée, comportement déjà testé et approuvé. Mais `app/(staff)/clients/page.tsx` affiche aujourd'hui la liste complète des clients par défaut, la recherche ne faisant que filtrer en plus.

**Options présentées** :
- **A. Étendre le backend** — nouvelle méthode paginée pour lister tous les clients actifs quand `q` est absent. Préserve le comportement UX actuel de la page la plus consultée du module. Coût : modifie un service déjà livré, nécessite une pagination minimale.
- **B. Le frontend abandonne la liste par défaut** — exige une recherche avant d'afficher quoi que ce soit. Zéro changement backend, mais dégrade l'UX d'un écran très utilisé.

**Décision : Option A.** Nouvelle méthode `ClientRepository.listActive({ page, limit })`, séparée de `search(query)` (qui garde sa sémantique actuelle inchangée — pas de risque de régression sur du code déjà testé). `ClientService.listClients(query?, pagination?)` route vers `search()` si `query` est non-vide, sinon vers `listActive(pagination ?? { page: 1, limit: 100 })`. Pagination simple `page`/`limit`, valeurs par défaut généreuses ; aucun contrôle de pagination dans l'UI pour l'instant (YAGNI — la base de clients reste petite).

## Modèle de données asynchrone

Le provider mocké est entièrement synchrone (state React en mémoire). Le backend réel est forcément asynchrone (fetch réseau). Décisions, cohérentes avec le pattern déjà établi par `MyProfileProvider` (React Query, déjà une dépendance du projet) :

- **Lecture de la liste** : `useQuery({ queryKey: ['clients', ...], queryFn: fetchClients })`, miroir de `fetch-my-profile.ts`.
- **Mutations** (`addClient`, `updateClient`, `deactivateClient`) : `useMutation`, exposées avec callbacks `{ onSuccess?, onError? }` plutôt qu'un retour synchrone — nécessaire pour remonter proprement une erreur `409 phone-already-used` au formulaire (champ `phone`) au lieu de l'avaler silencieusement.
- **`clientRepository` (recherche/scan)** : passe en async (`Promise<Client[]>`/`Promise<Client | undefined>`). Le flux de scan QR affiche un état "recherche en cours" bref plutôt que de prétendre à une réponse instantanée — latence réseau réelle, mais rapide en pratique pour une requête indexée (`clientAccountId`/`cardSequence` sont `@unique`, `phone` a un index composite).

## Contrat

### Backend

```ts
// server/clients/repositories/client.repository.ts
export type ListActivePagination = { page: number; limit: number }
export type ListActiveResult = { clients: Client[]; total: number }

export interface ClientRepository {
  // ... méthodes existantes inchangées ...
  listActive(pagination: ListActivePagination): Promise<ListActiveResult>
}

// server/clients/services/client.service.ts
export interface ClientService {
  // ... méthodes existantes inchangées ...
  listClients(query?: string, pagination?: ListActivePagination): Promise<ListActiveResult>
  // query non-vide → délègue à repository.search(query) ; total = clients.length (pas de
  // pagination sur la recherche, cohérent avec le comportement déjà approuvé).
  // query absente/vide → délègue à repository.listActive(pagination ?? { page: 1, limit: 100 }).
}
```

`GET /api/clients?page=&limit=` (nouveaux params optionnels, `q`/`phone`/`cardNumber` inchangés) → `{ clients: Client[], total: number }` dans l'enveloppe `{ success, data, message, errors }` existante. `Client.email` est déjà `string | null` côté backend — aucun changement de forme nécessaire côté domaine ; c'est uniquement le frontend qui rattrape son retard.

### Frontend

`lib/clients/types.ts` — `Client` aligné sur la forme backend (miroir direct de la réponse API) :
```ts
export type Client = {
  id: string
  name: string
  phone: string
  email: string | null   // était email?: string — undefined n'existe plus, toujours null explicite
  cardNumber: string
  joinedAt: string        // ISO string, sérialisation JSON de Date
  isActive: boolean       // nouveau champ, permet d'afficher un client désactivé si un écran en a besoin plus tard
}
```

`lib/clients/fetch-clients.ts` (nouveau, miroir de `fetch-my-profile.ts`) : fonctions `fetchClients(params)`, `createClientRequest(input)`, `updateClientRequest(id, input)`, `deactivateClientRequest(id)` — chacune fait le `fetch()` + parse l'enveloppe + lève une erreur avec le `message` backend en cas d'échec (409, 400, etc.), à charge de React Query/`onError` de la propager au composant.

`components/providers/clients-provider.tsx` réécrit :
```ts
type ClientsContextValue = {
  clients: Client[]
  isLoading: boolean
  isError: boolean
  clientRepository: AsyncClientRepository
  addClient(input: NewClientInput, opts?: { onSuccess?: (client: Client) => void; onError?: (message: string) => void }): void
  updateClient(id: string, input: UpdateClientInput, opts?: { onSuccess?: () => void; onError?: (message: string) => void }): void
  deactivateClient(id: string, opts?: { onSuccess?: () => void; onError?: (message: string) => void }): void
  getClient(id: string): Client | undefined   // reste synchrone — lit le cache déjà chargé par useQuery ;
  // retourne undefined tant que isLoading est true même si le client existe réellement, exactement
  // comme aujourd'hui avec le mock au tout premier rendu (aucun changement de garantie observable)
}

type AsyncClientRepository = {
  findByCardNumber(cardNumber: string): Promise<Client | undefined>
  search(query: string): Promise<Client[]>
}
```

`deleteClient` est renommé `deactivateClient` partout (provider, `DeleteClientDialog` → `DeactivateClientDialog`, texte UI "Supprimer" → "Désactiver") — aligne le vocabulaire frontend sur celui déjà établi côté backend/design doc (`ARCHITECTURE_RULES.md` : "delete" ne dépasse jamais le verbe HTTP `DELETE`).

Validation frontend du téléphone (`components/clients/client-form.tsx`) alignée sur le pattern backend exact (`/^\+\d{8,15}$/`, requiert un `+` initial) au lieu du contrôle actuel "au moins 8 chiffres" — évite un aller-retour serveur pour un format déjà invalide côté client.

`app/(staff)/layout.tsx` gagne un `QueryClientProvider` (actuellement monté seulement côté `app/(client)/layout.tsx`) — un seul `QueryClient` par arbre de rendu, pas de partage entre les deux layouts (déjà isolés aujourd'hui).

## Gestion des erreurs

| Cas | Comportement |
|---|---|
| Création/édition, téléphone déjà utilisé par un client actif | `onError` reçoit le message backend (`"Ce numéro de téléphone est déjà utilisé par un autre client."`), affiché sous le champ `phone` du formulaire, pas de fermeture du dialogue |
| Création/édition, validation Zod backend échoue (ne devrait pas arriver si la validation frontend est bien alignée, mais reste possible en cas de contournement) | `onError` reçoit le message backend, affiché en erreur générale du formulaire |
| Recherche/scan échoue (réseau, 500) | `clientRepository.search`/`findByCardNumber` rejettent la Promise ; l'appelant (page scan/liste) affiche un état d'erreur inline, pas de crash |
| Chargement initial de la liste échoue | `isError: true` exposé par le provider ; la page affiche un état d'erreur avec un bouton "Réessayer" (`query.refetch()`), même pattern que `MyProfileProvider` |

## Hors périmètre

- Contrôles de pagination visibles dans l'UI (page suivante/précédente) — le paramétrage existe côté backend, non exploité côté frontend pour l'instant.
- Vraie création de `ClientAccount` liée depuis l'écran de création client (`clientAccountId` reste non exploité, comme documenté dans le design Clients API original).
- Backend `Subscription`/`Session` réels — chantier suivant, explicitement débloqué par celui-ci.
- Toute modification du contrat d'authentification déjà en place (`requireStaffAuth`, permissions `client:deactivate` ADMIN-only) — inchangé, déjà couvert par les routes existantes.
