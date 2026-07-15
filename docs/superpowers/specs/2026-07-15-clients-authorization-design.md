# Autorisation Clients API + Endpoint Self-Service — Design

**Date :** 2026-07-15
**Statut :** Approuvé

## Contexte

Une revue technique du module Clients API backend (`server/clients/**`, `app/api/clients/**`, mergé dans `main`) a remonté trois problèmes liés entre eux :

1. **Faille de sécurité** : `/api/clients/*` (list/get/create/update/deactivate) n'a aucune vérification d'authentification. `middleware.ts` ne protège que les routes de pages (`/clients/:path*`), pas les routes API (`/api/:path*`). N'importe qui peut aujourd'hui lister, créer, modifier ou désactiver un client sans être connecté.
2. **Endpoint self-service manquant** : le portail client (déjà construit côté frontend sur des données mockées, `docs/superpowers/specs/2026-07-14-interface-client-design.md`) a besoin de récupérer la fiche `Client` liée au `ClientAccount` actuellement connecté. Aucune route ne fait ça — les routes existantes sont toutes des opérations CRUD staff par `id` arbitraire.
3. **Seed incomplet** : `prisma/seed.ts` crée des `ClientAccount` (identité de connexion) mais aucun `Client` (fiche membre), donc aucun lien `Client.clientAccountId` n'existe en base — impossible de tester le endpoint self-service même avec un compte connecté.

Aucun mécanisme d'autorisation par rôle n'existe nulle part dans le projet aujourd'hui : `Role` (`ADMIN`/`AGENT`) est porté dans le JWT et dans `StaffUser.role`, mais rien ne le compare jamais. Ce chantier introduit donc le premier système d'autorisation par rôle du projet, avec une exigence explicite : **centralisé et extensible**, pas des `if (role === 'ADMIN')` dispersés dans les controllers.

## Décisions retenues

- **Vérification complète à chaque requête protégée** (JWT + rechargement du compte staff en base), pas seulement décodage JWT — cohérent avec `staffAuthService.getMe()`, détecte un compte désactivé après émission du token. La légère latence d'un aller-retour DB par requête est acceptée : la sécurité prime sur cette optimisation prématurée.
- **`requireStaffAuth()` retourne un objet métier** (`AuthenticatedStaff`), jamais un modèle Prisma — la vérification `isActive` est encapsulée dans le Repository (`findActiveById`), pas dans le helper HTTP.
- **Autorisation par matrice de permissions par rôle**, pas par policy nommée par action. Compact et extensible à de futurs rôles (`MANAGER`, `COACH`) sans multiplier les fonctions.
- **Désactivation d'un client réservée à `ADMIN`** ; toutes les autres actions CRUD (list/get/create/update) ouvertes à tout staff authentifié, quel que soit son rôle.
- **Endpoint self-service minimal** : `{ client: Client | null }` uniquement. `Subscription`/`Session`/`Payment` n'existent pas encore en base — hors périmètre ici, resteront mockés côté frontend.
- **Compte sans fiche liée = état normal**, pas une erreur : `200 { client: null }`, jamais un 404.

## Architecture

### 1. `requireStaffAuth()` — authentification centralisée

Nouveau fichier `server/auth/http/require-staff-auth.ts` (dans `server/auth/**`, pas `server/shared/**`, car dépend de concepts Auth : `TokenService`, `StaffAccountRepository`).

```ts
export type AuthenticatedStaff = { id: string; email: string; name: string; role: Role }

export type RequireStaffAuthResult =
  | { ok: true; staff: AuthenticatedStaff }
  | { ok: false; response: NextResponse }

export async function requireStaffAuth(req: NextRequest): Promise<RequireStaffAuthResult>
```

Logique interne : lit le cookie `access_token` (`readAccessTokenCookie`, déjà existant) → si absent, retourne `{ ok: false, response: 401 session-expired }` → `tokenService.verifyAccessToken(token)` → si `!ok` ou `payload.kind !== 'staff'`, 401 → `staffAccountRepository.findActiveById(payload.sub)` (nouvelle méthode Repository) → si `null` (compte supprimé ou désactivé depuis l'émission du token), 401 → sinon `{ ok: true, staff: { id, email, name, role } }`.

Chaque controller protégé fait exactement :
```ts
const auth = await requireStaffAuth(req)
if (!auth.ok) return auth.response
```

**`StaffAccountRepository.findActiveById`** (nouvelle méthode, à côté de `findById` existant) :
```ts
findActiveById(id: string): Promise<StaffAccountRecord | null>  // null si absent OU isActive: false
```
Implémentation Prisma : `findFirst({ where: { id, isActive: true } })`. Encapsule le filtre d'activité dans le Repository, comme demandé — le helper HTTP ne connaît que "trouvé ou pas trouvé".

### 1bis. `requireClientAuth()` — symétrique côté client

Nouveau fichier `server/auth/http/require-client-auth.ts`. Contrairement au staff, la logique de vérification complète (JWT + rechargement + `isActive`) existe déjà côté service — `clientAuthService.getMe()` (`server/auth/services/default-client-auth.service.ts:116-129`) fait exactement ce travail et retourne un `Result<ClientUser, AuthDomainError>`. `requireClientAuth()` est donc un wrapper HTTP fin autour de ce service, pas une réimplémentation via le Repository (pas de nouvelle méthode `ClientAccountRepository.findActiveById` nécessaire) :

```ts
export type RequireClientAuthResult =
  | { ok: true; client: ClientUser }
  | { ok: false; response: NextResponse }

export async function requireClientAuth(req: NextRequest): Promise<RequireClientAuthResult>
```

Logique interne : `readAccessTokenCookie(req)` → si absent, `{ ok: false, response: 401 session-expired }` → `clientAuthService.getMe(token)` → si `!ok`, `{ ok: false, response: NextResponse.json(apiFailureFromDomainError(result.error), { status: statusForDomainError(result.error) }) }` → sinon `{ ok: true, client: result.value }`.

Même ergonomie d'appel que `requireStaffAuth()` :
```ts
const auth = await requireClientAuth(req)
if (!auth.ok) return auth.response
```

**`client-me.controller.ts` migre vers ce helper** — il duplique aujourd'hui exactement cette logique inline ; ce chantier l'élimine en même temps qu'il évite d'introduire une nouvelle duplication dans `get-my-client-profile.controller.ts`. Comportement HTTP inchangé (mêmes codes, mêmes messages), seule l'organisation du code change.

### 2. Permissions — matrice par rôle

Nouveau fichier `server/shared/authorization/permissions.ts` (transverse, pas scopé à un domaine — appelé à grandir avec d'autres modules et rôles) :

```ts
export type Permission = 'client:list' | 'client:read' | 'client:create' | 'client:update' | 'client:deactivate'

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ['client:list', 'client:read', 'client:create', 'client:update', 'client:deactivate'],
  AGENT: ['client:list', 'client:read', 'client:create', 'client:update'],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}
```

Seul `deactivate-client.controller.ts` consulte `hasPermission` ; les autres controllers Clients n'ont besoin que de `requireStaffAuth()`. Ajouter une permission future = ajouter une entrée au type `Permission` et à la matrice — pas de nouvelle fonction, pas de nouveau fichier.

### 3. Controllers Clients — intégration

Chacun des 5 controllers (`list/get/create/update/deactivate-client.controller.ts`) gagne, en toute première ligne du corps (avant tout accès au `ClientService`) :

```ts
const auth = await requireStaffAuth(req)
if (!auth.ok) return auth.response
```

`deactivate-client.controller.ts` gagne en plus, juste après :
```ts
if (!hasPermission(auth.staff.role, 'client:deactivate')) {
  return NextResponse.json(apiFailure('forbidden'), { status: 403 })
}
```

`'forbidden'` est une chaîne de message HTTP directe (pas un `ClientDomainError`) — l'autorisation est une préoccupation transverse au-dessus de la couche domaine, pas une règle métier du domaine Clients.

### 4. `GET /api/client/me/profile` — endpoint self-service

Nouveau fichier `server/clients/http/get-my-client-profile.controller.ts`. Utilise `requireClientAuth()` (§1bis) pour identifier le `ClientAccount` connecté :

```ts
const auth = await requireClientAuth(req)
if (!auth.ok) return auth.response

const { clientService } = getContainer()
const client = await clientService.findByClientAccountId(auth.client.id)
return NextResponse.json(apiSuccess({ client }))  // client peut être null — toujours 200
```

**`ClientService.findByClientAccountId`** (nouvelle méthode) et **`ClientRepository.findByClientAccountId`** (nouvelle méthode) : recherche par la colonne `Client.clientAccountId` (FK optionnelle déjà en base depuis Task 1 du backend Clients). Suit exactement le pattern déjà établi par `findByPhone`/`findByCardSequence` — pas de filtre `activeOnly` nécessaire ici puisqu'un `ClientAccount` n'est lié qu'à un seul `Client` par construction (`clientAccountId` est `@unique`).

Route : `app/api/client/me/profile/route.ts` — un seul `GET`, re-export direct comme les autres routes du module.

### 5. Seed — lier des Client aux ClientAccount existants

`prisma/seed.ts` étendu : 3 des 4 `ClientAccount` seedés (`+33612345601`, `+33612345602`, `+33612345603`) gagnent une fiche `Client` liée (`clientAccountId`), avec des données cohérentes (même `name`/`phone` que le compte, `email` optionnel). Le 4ᵉ (`+33612345604`) reste volontairement sans fiche liée pour tester le cas `{ client: null }` sans configuration manuelle.

## Gestion des erreurs

| Cas | Réponse |
|---|---|
| Routes staff (list/get/create/update), pas de cookie ou JWT invalide | 401 `{ success: false, message: 'session-expired' }` |
| `deactivate-client`, staff authentifié mais rôle `AGENT` | 403 `{ success: false, message: 'forbidden' }` |
| `deactivate-client`, staff authentifié rôle `ADMIN` | comportement inchangé (200 ou erreur domaine existante) |
| `GET /api/client/me/profile`, pas de session client valide | 401 `{ success: false, message: 'session-expired' }` |
| `GET /api/client/me/profile`, session valide, aucun Client lié | 200 `{ success: true, data: { client: null } }` |
| `GET /api/client/me/profile`, session valide, Client lié | 200 `{ success: true, data: { client: {...} } }` |

Aucun changement de contrat pour les réponses de succès déjà existantes — uniquement l'ajout d'un check en amont.

## Tests

- `require-staff-auth.test.ts` : pas de cookie, JWT invalide, `kind !== 'staff'`, compte introuvable, compte désactivé (`findActiveById` retourne `null`), compte actif → `AuthenticatedStaff` correct.
- `require-client-auth.test.ts` : pas de cookie, `clientAuthService.getMe()` en échec (JWT invalide, `kind !== 'client'`, compte désactivé) → `response` correspondant, `getMe()` en succès → `ClientUser` correct.
- `permissions.test.ts` : matrice complète (`ADMIN`/`AGENT` × les 5 permissions), fonction pure sans dépendance.
- Chaque controller Clients protégé (5) : test 401 sans cookie (nouveau test ajouté aux fichiers de test existants).
- `deactivate-client.controller.test.ts` : test 403 avec un staff `AGENT`, test 200 inchangé avec un staff `ADMIN`.
- `client-me.controller.test.ts` : migration vers `requireClientAuth()` — tests existants (200 avec session valide, 401 sans cookie, 401 JWT malformé) doivent continuer à passer sans modification, garantissant que le comportement HTTP est inchangé après le refactor.
- `get-my-client-profile.controller.test.ts` (nouveau) : 401 sans session, 200 `{ client: null }` avec session valide sans lien, 200 `{ client: {...} }` avec session valide et lien.
- `prisma-staff-account.repository.test.ts` : cas ajoutés pour `findActiveById` (trouvé actif, trouvé mais inactif → `null`, introuvable → `null`).
- `prisma-client.repository.test.ts` : cas ajoutés pour `findByClientAccountId` (trouvé, introuvable → `null`).

## Hors périmètre

- Wiring du frontend staff (`clients-provider.tsx`) sur le vrai backend — chantier séparé, suite logique une fois ce correctif de sécurité en place.
- Wiring du frontend `MyProfileProvider` sur ce nouvel endpoint self-service — chantier séparé également ; ce document ne fait qu'exposer l'API.
- `Subscription`/`Session`/`Payment` réels — n'existent pas en base, hors périmètre.
- Rôles futurs (`MANAGER`, `COACH`) — la matrice est conçue pour les accueillir facilement mais aucun n'est ajouté ici.
- Protection au niveau `middleware.ts` pour les routes `/api/*` en général — ce document protège uniquement les routes Clients concernées ; une protection middleware générique pour toutes les routes API futures est une décision architecturale plus large, non tranchée ici.
