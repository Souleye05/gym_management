# API Clients — Design

**Date :** 2026-07-14
**Sous-projet :** suite de 3 / 9 (voir `2026-07-13-gestion-clients-design.md`) — remplace l'annuaire mocké par un backend réel
**Statut :** Approuvé

## Contexte

Le sous-projet "Gestion Clients" (`2026-07-13-gestion-clients-design.md`) a livré une UI complète (liste, recherche, filtre, CRUD, fiche profil) branchée sur un annuaire mocké en mémoire (`lib/clients/mock-clients.ts`, `components/providers/clients-provider.tsx`). Ce document explicite plusieurs points comme hors périmètre à l'époque : contrainte d'unicité du téléphone, persistance réelle.

Suite au succès du remplacement du mock d'authentification par une vraie API (`2026-07-12-auth-api-design.md`), ce document conçoit le backend réel du module Clients, en Clean Architecture identique à `server/auth/**`, pour que `clients-provider.tsx` puisse être branché sur de vraies routes REST au lieu de l'état React en mémoire.

Ce module est le premier module métier (hors Auth) à obtenir un vrai backend. Abonnements, Séances et Scan QR en dépendent tous (ils référencent un `clientId`) et suivront le même schéma une fois Clients livré.

## Objectif

- Persister les clients en base (Postgres/Prisma), remplaçant l'état React en mémoire.
- CRUD complet : création, lecture (par id, recherche par nom/téléphone/numéro de carte), mise à jour, désactivation (soft delete).
- Générer un numéro de carte lisible et durable (`CARD-00001`), sans race condition.
- Poser (sans l'exploiter) le lien optionnel vers `ClientAccount` (authentification), pour un rattachement futur.
- Zéro breaking change sur le contrat de données déjà consommé par le frontend (`Client { id, cardNumber, name, phone, email?, joinedAt }`).

## Hors périmètre (explicitement exclu de cette étape)

- Rattachement effectif d'un `Client` à un `ClientAccount` (recherche/validation par téléphone, endpoint de liaison manuelle) — le champ `clientAccountId` existe dans le schéma mais aucune logique ne l'exploite.
- Intégration frontend (`clients-provider.tsx` continue de lire les mocks jusqu'à un sous-projet suivant validé séparément).
- Abonnements, Séances, Scan QR réels — ce module fournit uniquement la fondation `Client` dont ces modules auront besoin.
- Pagination de la recherche/liste — non demandé, ajoutable plus tard sans réécriture du contrat (ajout de `page`/`limit` en query params).
- Restriction de rôle sur les opérations (création/modification/désactivation) — accessible à `admin` et `agent` de la même façon, cohérent avec le CRUD frontend existant.

## Modèle de données

```prisma
model Client {
  id              String    @id @default(cuid())
  clientAccountId String?   @unique
  cardSequence    Int       @unique @default(autoincrement())
  name            String
  phone           String
  email           String?
  isActive        Boolean   @default(true)
  deletedAt       DateTime?
  joinedAt        DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  clientAccount ClientAccount? @relation(fields: [clientAccountId], references: [id], onDelete: SetNull)

  @@index([phone, isActive])
  @@map("clients")
}
```

Décisions et justifications :

- **`clientAccountId` optionnel** : un `Client` peut exister sans jamais avoir de compte de connexion (créé au comptoir), et un `ClientAccount` peut être rattaché plus tard. `onDelete: SetNull` — si le compte d'authentification est un jour supprimé, la fiche client métier reste intacte.
- **`cardSequence` (entier, pas la string formatée)** : Postgres gère l'incrémentation de façon atomique via sa propre séquence (`@default(autoincrement())` sur un champ non-clé-primaire crée une séquence dédiée). Le format `"CARD-00001"` n'est **jamais stocké** — il est dérivé à la lecture via un helper partagé `formatCardNumber(sequence: number): string`, utilisé partout où un numéro de carte est exposé (API, QR code, UI future). Le frontend ne connaît que `cardNumber: string`, jamais `cardSequence`.
- **`phone` sans `@unique` en base** : voir section dédiée ci-dessous. Index composite `@@index([phone, isActive])` plutôt que `@@index([phone])` seul, pour que `findByPhone(phone, { activeOnly: true })` (le chemin le plus fréquent : vérification d'unicité à chaque création/modification, et recherche à l'accueil) reste indexé même quand la table grossit.
- **Soft delete (`isActive`/`deletedAt`)**, cohérent avec `StaffAccount`/`ClientAccount` — un hard delete casserait l'intégrité référentielle dès que Abonnements/Séances existeront réellement (FK vers `Client.id`). **`isActive` est l'unique source de vérité** pour "client désactivé" : c'est le seul champ que toute query (recherche, liste, `findByPhone`, unicité) doit filtrer (`isActive: true`). `deletedAt` n'est qu'un horodatage d'audit (quand la désactivation a eu lieu) — jamais utilisé comme condition de filtrage (`deletedAt IS NULL`) dans aucune requête, pour éviter d'avoir deux sources de vérité divergentes.

### Unicité du téléphone : index unique partiel scopé aux clients actifs (révisé 2026-07-16)

Le téléphone est central (recherche, identification à l'accueil, futur rattachement à `ClientAccount`). Une contrainte `@unique` **globale** sur `phone` bloquerait un cas légitime : la réutilisation d'un numéro après désactivation définitive d'un ancien client.

**Décision initiale (obsolète)** : ce document recommandait à l'origine "pas de contrainte Prisma `@unique`", l'unicité étant appliquée uniquement au niveau Service via un pattern vérifier-puis-agir (`findByPhone(phone, { activeOnly: true })` avant `create`/`update`). Une revue de code a démontré que ce pattern est vulnérable à une race condition : deux requêtes `POST /api/clients` concurrentes avec le même numéro passent toutes deux le check avant qu'aucune n'ait committé, produisant deux `Client` actifs avec le même téléphone — violation silencieuse de la règle métier que ce pattern était censé garantir.

**Décision révisée** : un **index unique partiel PostgreSQL**, scopé aux clients actifs (`CREATE UNIQUE INDEX ... ON clients (phone) WHERE is_active = true`), remplace le check applicatif comme mécanisme d'application. Ce n'est pas une contrainte Prisma `@unique` classique (Prisma ne supporte pas nativement les index partiels dans le schema — la clause `WHERE` est ajoutée à la main dans le SQL de migration généré) mais elle ferme la race au niveau base de données, à l'image du pattern déjà établi pour la rotation des refresh tokens (`RefreshTokenRepository.revoke`, une opération atomique conditionnelle plutôt qu'une réorganisation du code applicatif).

Cette révision ne change **aucun comportement observable** : le Service continue d'appeler `findByPhone(phone, { activeOnly: true })` en amont pour retourner une erreur `409 phone-already-used` propre dans le cas non-concurrent (meilleure expérience développeur/UX qu'une violation de contrainte brute) ; l'index partiel n'intervient que comme filet de sécurité pour le cas concurrent, où la violation de contrainte (Prisma `P2002`) est interceptée et retraduite dans la même erreur `phone-already-used` plutôt que de fuiter comme une erreur 500. Un client désactivé ne bloque toujours jamais la réutilisation de son ancien numéro — l'index ne s'applique qu'aux lignes `is_active = true`.

Note : la clause "un foyer partageant un numéro" de la décision initiale ne correspondait déjà pas au comportement réellement implémenté — `findByPhone(phone, { activeOnly: true })` rejette déjà toute création d'un deuxième client actif avec le même numéro, foyer ou non. L'index partiel ne fait donc que rendre atomique une règle déjà en vigueur, sans en élargir la portée.

## Architecture (Clean Architecture, miroir de `server/auth/**`)

```
server/clients/
  domain/
    entities.ts             — Client { id, cardNumber, name, phone, email, isActive, joinedAt }
    errors.ts                — ClientDomainErrorCode: 'not-found' | 'validation-error' | 'phone-already-used'
  dto/
    client.dto.ts             — Zod: CreateClientSchema { name, phone, email? }, UpdateClientSchema (Partial)
  repositories/
    client.repository.ts      — interface : create, findById, findByPhone, findByCardSequence, search, update, deactivate
  infrastructure/
    prisma-client.repository.ts
    format-card-number.ts     — formatCardNumber(sequence: number): string / parseCardNumber(cardNumber: string): number | null — seul endroit qui connaît le format "CARD-xxxxx", dans les deux sens
  services/
    client.service.ts             — interface ClientService
    default-client.service.ts     — validation métier, traduit toute erreur Prisma en ClientDomainError, ne laisse jamais une exception brute atteindre le Controller
  http/
    list-clients.controller.ts     — GET  /api/clients
    create-client.controller.ts    — POST /api/clients
    get-client.controller.ts       — GET  /api/clients/:id
    update-client.controller.ts    — PATCH /api/clients/:id
    deactivate-client.controller.ts — DELETE /api/clients/:id
```

Le domaine n'utilise jamais de terminologie liée à Prisma/persistance (pas de `ClientRecord`) — `Client` est le type du domaine ; le modèle Prisma généré (`PrismaClient.client`) reste cantonné à la couche infrastructure.

### Nommage métier : désactivation, pas suppression

Aucune suppression physique n'ayant lieu, le Service expose `deactivateClient(id)`, jamais `deleteClient`. Le Repository peut garder une méthode nommée `deactivate(id)` en interne (soft delete technique) — le vocabulaire "delete" reste circonscrit à la couche infrastructure/HTTP (le verbe HTTP `DELETE` reste conventionnel pour la route), jamais utilisé dans les noms de méthode Service/Domain.

### Recherche : un seul point d'entrée REST, méthodes spécialisées en interne

```
GET /api/clients?q=&phone=&cardNumber=&status=
```

Un seul endpoint, extensible par paramètres — pas de multiplication de routes (`/clients/by-phone`, `/clients/by-card`, etc.). Le Controller inspecte les query params reçus et dispatche vers la méthode Service/Repository appropriée :
- `cardNumber` fourni → `parseCardNumber(cardNumber)` (depuis `format-card-number.ts`, jamais un `parseInt`/regex ad hoc dans le Controller) puis `findByCardSequence` ; `parseCardNumber` retournant `null` (format invalide) → traité comme "aucun résultat", pas une erreur 400 (une recherche par numéro de carte mal formé doit juste ne rien trouver)
- `phone` fourni (sans `q`) → `findByPhone`
- `q` fourni → `search(q)` (substring insensible à la casse sur nom et téléphone, même sémantique que `createInMemoryClientRepository.search` actuel)
- aucun param → liste complète des clients actifs

Ces méthodes spécialisées (`findByPhone`, `findByCardSequence`, `findById`, `search`) restent exposées sur l'interface `ClientRepository`/`ClientService` pour être réutilisées directement par les futurs modules (Scan QR appellera `findByCardSequence` sans passer par HTTP, une fois construit dans la même codebase serveur).

`status` (filtre `ClientStatus`) est hors périmètre technique de ce module — il dépend d'un abonnement (module Abonnements, pas encore réel) ; le paramètre est réservé dans le contrat mais non implémenté tant qu'Abonnements n'existe pas.

## Erreurs métier

`DefaultClientService` ne laisse jamais une exception Prisma brute remonter :

| Cas | Code erreur | Statut HTTP |
|---|---|---|
| `getClient`/`updateClient`/`deactivateClient` sur un id inexistant ou déjà désactivé | `not-found` | 404 |
| `createClient`/`updateClient` avec un téléphone déjà utilisé par un client actif | `phone-already-used` | 409 |
| Payload invalide (Zod) | `validation-error` | 400 — géré au Controller, avant d'atteindre le Service |
| Exception Prisma imprévue (connexion, contrainte inattendue) | — catchée, loggée en détail côté serveur | 500, réponse `{ error: 'internal-error' }` uniquement — le message Prisma brut (détails de schéma/contrainte) ne doit jamais atteindre la réponse HTTP |

## Contrat API — zéro breaking change

```ts
// Toutes les réponses success (GET liste, GET détail, POST, PATCH)
{
  id: string
  cardNumber: string       // "CARD-00001", dérivé de cardSequence, jamais cardSequence brut
  name: string
  phone: string
  email: string | null
  joinedAt: string          // ISO 8601
  isActive: boolean
}
```

Identique au type `Client` mocké actuel (`lib/clients/types.ts`), à l'exception de `email` qui devient explicitement `string | null` (JSON n'a pas d'`undefined`) au lieu de `email?: string` — le frontend devra traiter `null` comme "absent" au moment de l'intégration (changement mineur, à traiter dans le sous-projet d'intégration frontend, pas ici).

## Découpage de l'implémentation (rappel du mode de livraison)

Comme pour l'API Auth, l'implémentation se fait couche par couche, avec revue de code automatique après chaque étape et validation explicite avant de passer à la suivante :

1. Schéma Prisma (`Client` + migration)
2. Repository (interface + implémentation Prisma)
3. Service (règles métier, erreurs de domaine)
4. Controllers HTTP + routes `app/api/clients/**`
5. Tests (unitaires services, intégration repository/controllers contre Postgres réel)

L'intégration frontend (`clients-provider.tsx` → vrais appels API) est un sous-projet séparé, à brainstormer une fois ce backend validé.
