# Résolution des clients désactivés (fiche détail + séances) — Design

**Date :** 2026-07-21
**Statut :** Approuvé

## Contexte

Le backend expose désormais `GET /api/clients/[id]?includeInactive=true` (commit `af004e4`), qui contourne le filtre `isActive` et renvoie un client désactivé (200, `isActive: false`) au lieu d'un 404. Sans ce paramètre, comportement inchangé.

Deux points d'intégration frontend concernés :

1. **`app/(staff)/clients/[id]/page.tsx`** — utilise déjà `getClientByIdRequest(id)` (`lib/clients/fetch-clients.ts`) comme repli quand un client est absent de la liste active en mémoire (cas : client actif au-delà de la première page). Ce repli échoue aujourd'hui pour un client désactivé (404).
2. **`app/(staff)/seances/page.tsx`** — le bug initialement signalé : `clientName(clientId)` résout le nom d'un abonné pour chaque ligne de séance du jour via un `.find()` synchrone sur `useClients().clients` (liste active uniquement). Une fois le client désactivé, sa séance déjà enregistrée affiche "Client inconnu", contredisant la promesse du dialogue de désactivation ("Cette action ne supprime aucune donnée.").

## Décisions retenues (validées en session)

- **`getClientByIdRequest` ajoute `?includeInactive=true` en dur**, sans paramètre — tous les appelants actuels (le repli de `/clients/[id]`, et le nouveau besoin de `/seances`) veulent ce comportement ; pas de cas d'usage identifié pour un appelant qui voudrait explicitement l'ancien comportement 404-si-inactif.
- **Fiche détail client désactivé** : un bandeau pleine largeur en haut de page (niveau layout, pas dans la Card), ton `warning` (cohérent avec `components/ui/badge.tsx`'s palette existante — ambre doux, pas `destructive`/rouge, car être désactivé n'est pas une erreur), icône `UserX` (lucide-react), texte "Ce client est désactivé — consultation seule." Les boutons "Désactiver", "Enregistrer une séance", et les actions d'abonnement (Créer/Renouveler/Suspendre/Réactiver) sont masqués quand `!client.isActive`. "Modifier" reste disponible (corriger une coquille reste légitime). `ClientStatusBadge` (statut d'abonnement) n'est pas modifié — notion orthogonale au statut actif/inactif du compte, cohérent avec la distinction Client/Abonnement d'`ARCHITECTURE_RULES.md`. Aucun bouton de réactivation du client — l'API ne l'expose pas, pas de fonctionnalité inventée hors périmètre.
- **`/seances` — résolution via `useQueries`** (TanStack Query) : pour chaque `clientId` de séance "subscriber" du jour absent de `useClients().clients`, une requête `queryKey: ['client', clientId]` appelle `getClientByIdRequest(clientId)`. Cette clé de cache est **identique** à celle déjà utilisée par le repli de `/clients/[id]/page.tsx` — les deux écrans partagent le cache React Query sans configuration supplémentaire.
- **Pendant la résolution (état `isLoading`)** : un `<Skeleton>` (déjà présent dans le design system, `components/ui/skeleton.tsx`) remplace l'avatar et le nom, plutôt qu'un flash "Client inconnu" suivi d'une correction — évite le clignotement visuel.
- **Client résolu mais désactivé** : un `<Badge variant="muted">Désactivé</Badge>` à côté du nom — exactement le même traitement visuel que le badge "Visiteur" déjà utilisé sur cette page pour les séances visiteur (aucun nouveau pattern introduit).
- **Client introuvable même avec `includeInactive=true`** (id corrompu/orphelin) : reste "Client inconnu", comportement actuel inchangé — c'est un cas d'erreur de données, pas un cas de désactivation.

## Architecture

**`lib/clients/fetch-clients.ts`** : `getClientByIdRequest` change d'URL (`/api/clients/${id}?includeInactive=true`), signature et comportement (throw/undefined) inchangés.

**`app/(staff)/clients/[id]/page.tsx`** : ajoute un bandeau conditionnel `!client.isActive` en tête de page, et conditionne l'affichage des boutons de gestion (`client.isActive &&` autour de chaque bouton/bloc d'action concerné). Le repli existant (`fallbackClientQuery`, déjà présent depuis le chantier de pagination) bénéficie automatiquement du nouveau comportement de `getClientByIdRequest` sans changement de sa propre logique.

**`app/(staff)/seances/page.tsx`** : remplace `clientName(clientId): string` par une résolution enrichie retournant l'état de chargement et le statut actif/inactif, construite sur `useQueries` :

```ts
type ResolvedSessionClient = { name: string; isLoading: boolean; isInactive: boolean }

function useResolveSessionClient(
  clients: Client[],
  missingClientIds: string[],
): (clientId: string) => ResolvedSessionClient
```

- `missingClientIds` : ensemble dédupliqué des `clientId` des séances "subscriber" du jour absents de `clients` (calculé une fois par rendu, avant d'appeler `useQueries`).
- `useQueries({ queries: missingClientIds.map((id) => ({ queryKey: ['client', id], queryFn: () => getClientByIdRequest(id) })) })` — un résultat par id manquant, chacun indépendamment mis en cache/dédupliqué par React Query.
- Le résolveur retourné : cherche d'abord dans `clients` (cas normal, majoritaire) ; sinon consulte le résultat `useQueries` correspondant (`isLoading` → nom vide + `isLoading: true` ; résolu avec un client → son nom + `isInactive: !client.isActive` ; résolu sans client → `'Client inconnu'`).

Dans le rendu de chaque ligne de séance "subscriber" : un seul appel au résolveur (au lieu des deux appels dupliqués actuels pour `Avatar`/`span`), puis :
- `isLoading` → `<Skeleton>` de la taille de l'avatar + `<Skeleton>` de la taille du nom.
- sinon → `Avatar`/nom normaux, avec `<Badge variant="muted">Désactivé</Badge>` ajouté si `isInactive`.

## Hors périmètre

- Toute modification du contrat backend — `?includeInactive=true` est déjà livré, inchangé.
- Réactivation d'un client désactivé — non exposée par l'API, pas de design pour une fonctionnalité qui n'existe pas côté backend.
- Application du même traitement (bandeau, badge) à d'autres écrans que `/clients/[id]` et `/seances` — `/abonnements`, `/scan` ne sont pas concernés par ce chantier (pas de résolution de nom historique en jeu sur ces écrans).
- Pagination ou limite sur le nombre de requêtes `useQueries` déclenchées — le nombre de séances "subscriber" par jour reste naturellement faible (gym), pas de plafond nécessaire.
