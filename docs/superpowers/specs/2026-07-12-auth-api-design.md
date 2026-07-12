# API d'authentification (remplacement des mocks) — Design

**Date :** 2026-07-12
**Sous-projet :** 2b / 9 (suite directe de "Auth" — voir découpage global en fin de document)
**Statut :** Approuvé

## Contexte

Le sous-projet précédent ("Auth — staff login + client OTP + route protection") a livré une authentification entièrement simulée côté frontend : `lib/auth/auth-service.ts` valide les identifiants contre des annuaires en dur (`mock-staff-directory.ts`, `mock-client-directory.ts`) et persiste la session dans `localStorage` via `SessionRepository`. Cette architecture a été conçue dès le départ pour qu'une vraie API ne nécessite de changer que la couche de persistance/appel réseau, sans toucher `UserProvider`, `useAuth()`, ni les écrans.

Ce sous-projet construit cette vraie API : un backend REST en Route Handlers Next.js, organisé en Clean Architecture (Controllers → Services → Domain → Repositories → Infrastructure Prisma), avec PostgreSQL comme source de données, JWT + refresh token en cookies HttpOnly, hash Argon2, et bascule du frontend vers cette API via une nouvelle implémentation d'`AuthService` (`createHttpAuthService`).

## Objectif

- API REST d'authentification sous `app/api/auth/*`, organisée en couches strictement séparées (SOLID, DRY, KISS, Dependency Inversion).
- Remplacement des annuaires mockés par des tables Prisma/PostgreSQL (`StaffAccount`, `ClientAccount`).
- Access token JWT (15 min) + refresh token opaque avec rotation (30 jours), tous deux en cookies HttpOnly/Secure/SameSite.
- Hash des mots de passe (Argon2), OTP stocké/vérifié comme un vrai flux (expiration, tentatives, hash) même si l'envoi SMS reste simulé.
- Rate limiting basique des tentatives de connexion staff, journalisation des connexions (staff + client, succès et échecs).
- Révocation de session réelle (logout = suppression du refresh token en base).
- Format de réponse API homogène (`success/data/message/errors`).
- Validation Zod systématique : aucune donnée non validée n'atteint un Service.
- Bascule frontend minimale : une nouvelle implémentation d'`AuthService` (`lib/auth/http-auth-service.ts`), câblée dans `UserProvider` à la place de la version mockée. `useAuth()`, `useCurrentUser()`, `useCurrentClient()`, tous les écrans (`/login`, `/connexion`, etc.) restent inchangés.

## Hors périmètre (explicitement exclu de ce sous-projet)

- Vrai envoi SMS (OTP) — le code reste fixe/simulé, affiché à l'écran comme avant, mais désormais généré/stocké/vérifié via la table `OtpCode` (hash, expiration, compteur de tentatives) exactement comme un vrai flux le serait.
- OAuth (Google, etc.) — l'architecture (Controllers/Services séparés par flux) le permet sans réécriture, mais aucun provider OAuth n'est implémenté ici.
- Vrai envoi d'email pour "mot de passe oublié" — reste simulé côté frontend (aucun endpoint API n'est créé pour ce flux dans ce sous-projet).
- Gestion des comptes clients/staff (création, modification, désactivation) — les comptes sont insérés via un script de seed Prisma, pas d'endpoints CRUD. La vraie gestion clients est le sous-projet 3.
- Rate limiting distribué (Redis) — le compteur `LoginAttempt` est en base PostgreSQL, suffisant pour une seule instance ; passer à Redis est une optimisation future si le trafic le justifie.
- Permissions individuelles par compte — `permissions` reste dérivé du rôle via `ROLE_PERMISSIONS` (déjà livré côté frontend), l'API ne fait que renvoyer `role`, le calcul de `permissions` reste côté frontend comme aujourd'hui.
- Suppression de `lib/auth/session-repository.ts` / `localStorageSessionRepository` — laissé en place mais non utilisé par défaut, au cas où un mode démo sans backend serait encore utile ; non instancié par `UserProvider` après ce sous-projet.

## Architecture en couches (backend)

```
server/
  shared/
    result.ts                       — Result<T, E> + ok()/err(). Dupliqué depuis lib/auth/result.ts
                                       (même forme, zéro dépendance partagée) pour garder le
                                       backend et le frontend découplés malgré la symétrie.
    api-response.ts                 — apiSuccess(data, message), apiFailure(message, errors),
                                       apiFailureFromZod(zodError), apiFailureFromDomainError(err)
    cookies.ts                      — setAuthCookies(response, tokens), clearAuthCookies(response),
                                       readRefreshTokenCookie(request) — SEUL endroit qui pose/lit
                                       les cookies access_token/refresh_token
    container.ts                    — composition root : instancie les repositories Prisma, les
                                       services, les expose aux controllers (injection manuelle
                                       par constructeur, pas de framework DI)
    request-context.ts              — extrait ipAddress/userAgent d'une NextRequest

  auth/
    domain/
      entities.ts                   — StaffUser, ClientUser (formes métier retournées par les
                                       services, sans champs sensibles comme passwordHash)
      errors.ts                     — AuthDomainError = { code: '...'; message: string; field?: string }
                                       codes: invalid-credentials, unknown-account, invalid-otp,
                                       otp-expired, too-many-attempts, account-inactive,
                                       invalid-refresh-token, session-expired

    dto/
      staff-login.dto.ts            — StaffLoginSchema (Zod) + StaffLoginDto
      client-otp.dto.ts             — RequestOtpSchema, VerifyOtpSchema + types

    repositories/                   — interfaces (ports), zéro dépendance Prisma
      staff-account.repository.ts   — StaffAccountRepository
      client-account.repository.ts  — ClientAccountRepository
      refresh-token.repository.ts   — RefreshTokenRepository
      otp.repository.ts             — OtpRepository
      login-attempt.repository.ts   — LoginAttemptRepository
      login-log.repository.ts       — LoginLogRepository

    services/                       — logique métier (Application Services)
      password.service.ts           — PasswordService (Argon2 hash/verify)
      token.service.ts              — TokenService (JWT access token, refresh token opaque,
                                       hashage refresh token)
      otp.service.ts                — OtpService (génération code + hash, vérification)
      rate-limit.service.ts         — RateLimitService (vérifie countRecentFailures avant login)
      staff-auth.service.ts         — StaffAuthService (login, logout, getMe, refresh)
      client-auth.service.ts        — ClientAuthService (requestOtp, verifyOtp, logout, getMe)

    infrastructure/                 — implémentations Prisma des interfaces repositories
      prisma-staff-account.repository.ts
      prisma-client-account.repository.ts
      prisma-refresh-token.repository.ts
      prisma-otp.repository.ts
      prisma-login-attempt.repository.ts
      prisma-login-log.repository.ts

    http/                           — Controllers : validation → service → mapping réponse
      staff-login.controller.ts
      staff-logout.controller.ts
      staff-me.controller.ts
      client-request-otp.controller.ts
      client-verify-otp.controller.ts
      client-logout.controller.ts
      client-me.controller.ts
      refresh.controller.ts

app/api/auth/
  staff/login/route.ts              — export const POST = staffLoginController
  staff/logout/route.ts             — export const POST = staffLogoutController
  staff/me/route.ts                 — export const GET = staffMeController
  client/request-otp/route.ts       — export const POST = clientRequestOtpController
  client/verify-otp/route.ts        — export const POST = clientVerifyOtpController
  client/logout/route.ts            — export const POST = clientLogoutController
  client/me/route.ts                — export const GET = clientMeController
  refresh/route.ts                  — export const POST = refreshController

prisma/
  schema.prisma                     — StaffAccount, ClientAccount, RefreshToken, OtpCode,
                                       LoginAttempt, LoginLog, enums Role, LoginKind
  seed.ts                           — insère les 2 comptes staff et 4 comptes client actuellement
                                       en dur dans les fichiers mock (mêmes emails/téléphones/noms)
```

**Règle de couche stricte** : un Controller n'appelle jamais un Repository directement, ne contient aucun `if` métier (validation d'identifiants, calcul d'expiration, etc.) — uniquement validation d'entrée (Zod), appel service, mapping `Result` → `NextResponse`. Un Service ne connaît jamais Prisma ni `NextRequest`/`NextResponse` — uniquement les interfaces Repository et les DTO déjà validés. Un Repository (interface) ne connaît jamais Prisma dans sa signature ; seule son implémentation dans `infrastructure/` importe `@prisma/client`.

## Modèles de données (Prisma / PostgreSQL)

```prisma
enum Role {
  ADMIN
  AGENT
}

enum LoginKind {
  STAFF
  CLIENT
}

model StaffAccount {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String
  name          String
  role          Role      @default(AGENT)
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  refreshTokens RefreshToken[]
  loginAttempts LoginAttempt[]
  loginLogs     LoginLog[]

  @@map("staff_accounts")
}

model ClientAccount {
  id            String    @id @default(cuid())
  phone         String    @unique
  name          String
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  otpCodes      OtpCode[]
  refreshTokens RefreshToken[]
  loginLogs     LoginLog[]

  @@map("client_accounts")
}

model RefreshToken {
  id              String    @id @default(cuid())
  tokenHash       String    @unique
  staffAccountId  String?
  clientAccountId String?
  expiresAt       DateTime
  revokedAt       DateTime?
  createdAt       DateTime  @default(now())
  userAgent       String?
  ipAddress       String?

  staffAccount    StaffAccount?  @relation(fields: [staffAccountId], references: [id], onDelete: Cascade)
  clientAccount   ClientAccount? @relation(fields: [clientAccountId], references: [id], onDelete: Cascade)

  @@map("refresh_tokens")
}

model OtpCode {
  id              String    @id @default(cuid())
  clientAccountId String
  codeHash        String
  expiresAt       DateTime
  consumedAt      DateTime?
  attempts        Int       @default(0)
  createdAt       DateTime  @default(now())

  clientAccount   ClientAccount @relation(fields: [clientAccountId], references: [id], onDelete: Cascade)

  @@map("otp_codes")
}

model LoginAttempt {
  id             String    @id @default(cuid())
  staffAccountId String?
  identifier     String
  succeeded      Boolean
  ipAddress      String?
  createdAt      DateTime  @default(now())

  staffAccount   StaffAccount? @relation(fields: [staffAccountId], references: [id], onDelete: SetNull)

  @@index([identifier, createdAt])
  @@map("login_attempts")
}

model LoginLog {
  id              String    @id @default(cuid())
  kind            LoginKind
  staffAccountId  String?
  clientAccountId String?
  succeeded       Boolean
  reason          String?
  ipAddress       String?
  userAgent       String?
  createdAt       DateTime  @default(now())

  staffAccount    StaffAccount?  @relation(fields: [staffAccountId], references: [id], onDelete: SetNull)
  clientAccount   ClientAccount? @relation(fields: [clientAccountId], references: [id], onDelete: SetNull)

  @@map("login_logs")
}
```

- `RefreshToken.tokenHash` : SHA-256 du token brut. Le token brut n'est jamais stocké — comme un mot de passe, seule sa comparaison hashée est possible. Une ligne `RefreshToken` valide (non révoquée, non expirée) représente une session active ; sa suppression/révocation = déconnexion immédiate côté serveur, indépendamment des cookies côté client.
- `OtpCode.codeHash` : hash (SHA-256 suffit, pas Argon2 — durée de vie courte, faible espace de recherche déjà mitigé par `attempts`) du code à 6 chiffres. `attempts` incrémenté à chaque vérification échouée ; au-delà de 5, le code est traité comme invalide même s'il est correct (`too-many-attempts`).
- `LoginAttempt` alimente le rate limiting **staff uniquement** dans ce sous-projet (`identifier` = email tenté) ; le rate limiting OTP client est couvert par `OtpCode.attempts`, pas par cette table.
- `staffAccountId`/`clientAccountId` nullable + deux FK sur `RefreshToken`/`LoginLog` plutôt qu'une FK polymorphe : reste simple avec Prisma (pas de polymorphisme natif), et cohérent avec le choix "deux tables séparées" pour `StaffAccount`/`ClientAccount`.

## Interfaces des Repositories

```typescript
// server/auth/repositories/staff-account.repository.ts
export interface StaffAccountRepository {
  findByEmail(email: string): Promise<StaffAccountRecord | null>
  findById(id: string): Promise<StaffAccountRecord | null>
}

// server/auth/repositories/client-account.repository.ts
export interface ClientAccountRepository {
  findByPhone(phone: string): Promise<ClientAccountRecord | null>
  findById(id: string): Promise<ClientAccountRecord | null>
}

// server/auth/repositories/refresh-token.repository.ts
export interface RefreshTokenRepository {
  create(input: {
    tokenHash: string
    ownerId: string
    ownerKind: 'staff' | 'client'
    expiresAt: Date
    userAgent?: string
    ipAddress?: string
  }): Promise<void>
  findValidByHash(tokenHash: string): Promise<RefreshTokenRecord | null>
  revoke(tokenHash: string): Promise<void>
}

// server/auth/repositories/otp.repository.ts
export interface OtpRepository {
  create(input: { clientAccountId: string; codeHash: string; expiresAt: Date }): Promise<void>
  findLatestValid(clientAccountId: string): Promise<OtpRecord | null>
  incrementAttempts(id: string): Promise<void>
  consume(id: string): Promise<void>
}

// server/auth/repositories/login-attempt.repository.ts
export interface LoginAttemptRepository {
  record(input: { identifier: string; succeeded: boolean; staffAccountId?: string; ipAddress?: string }): Promise<void>
  countRecentFailures(identifier: string, sinceMinutesAgo: number): Promise<number>
}

// server/auth/repositories/login-log.repository.ts
export interface LoginLogRepository {
  record(input: {
    kind: 'staff' | 'client'
    succeeded: boolean
    staffAccountId?: string
    clientAccountId?: string
    reason?: string
    ipAddress?: string
    userAgent?: string
  }): Promise<void>
}
```

`StaffAccountRecord`/`ClientAccountRecord`/`RefreshTokenRecord`/`OtpRecord` sont des types de lecture minimaux (les champs Prisma nécessaires, définis dans chaque fichier de repository) — pas les entités `StaffUser`/`ClientUser` du domaine, qui elles excluent les champs sensibles (`passwordHash`) et sont construites par le Service.

## Services (logique métier)

```typescript
// server/auth/services/staff-auth.service.ts
export interface StaffAuthService {
  login(input: StaffLoginDto, context: RequestContext): Promise<Result<{ user: StaffUser; tokens: AuthTokens }, AuthDomainError>>
  logout(refreshToken: string): Promise<void>
  getMe(accessToken: string): Promise<Result<StaffUser, AuthDomainError>>
  refresh(refreshToken: string): Promise<Result<AuthTokens, AuthDomainError>>
}

// server/auth/services/client-auth.service.ts
export interface ClientAuthService {
  requestOtp(input: RequestOtpDto): Promise<Result<void, AuthDomainError>>
  verifyOtp(input: VerifyOtpDto, context: RequestContext): Promise<Result<{ user: ClientUser; tokens: AuthTokens }, AuthDomainError>>
  logout(refreshToken: string): Promise<void>
  getMe(accessToken: string): Promise<Result<ClientUser, AuthDomainError>>
}

// server/auth/services/token.service.ts
export interface TokenService {
  issueAccessToken(payload: { sub: string; kind: 'staff' | 'client'; role?: Role }): string
  issueRefreshToken(): string                                     // chaîne aléatoire opaque (crypto.randomBytes)
  verifyAccessToken(token: string): Result<AccessTokenPayload, AuthDomainError>
  hashRefreshToken(token: string): string                          // sha256 hex
}

// server/auth/services/password.service.ts
export interface PasswordService {
  hash(plain: string): Promise<string>
  verify(plain: string, hash: string): Promise<boolean>
}

// server/auth/services/otp.service.ts
export interface OtpService {
  generate(): { code: string; hash: string }
  verify(plain: string, hash: string): boolean
}

// server/auth/services/rate-limit.service.ts
export interface RateLimitService {
  assertNotLocked(identifier: string): Promise<Result<void, AuthDomainError>>  // countRecentFailures >= 5 sur 15 min → too-many-attempts
}
```

Chaque implémentation reçoit ses dépendances par le constructeur (injection manuelle, pas de framework DI — cohérent avec le `createAuthService(repository)` déjà utilisé côté frontend). `server/shared/container.ts` instancie tout une fois (repositories Prisma → services → export des instances), importé par les controllers.

**`StaffAuthService.login`** (déroulé complet) :
1. `RateLimitService.assertNotLocked(email)` → si verrouillé, `err({ code: 'too-many-attempts', ... })`.
2. `StaffAccountRepository.findByEmail(email)` → si absent ou `isActive === false`, enregistrer un échec (`LoginAttemptRepository.record`, `LoginLogRepository.record`) et retourner `err({ code: 'invalid-credentials', ... })` (même message que mot de passe incorrect — ne jamais révéler qu'un email existe).
3. `PasswordService.verify(password, account.passwordHash)` → si faux, même traitement que 2.
4. Succès : `LoginAttemptRepository.record({ succeeded: true })`, `LoginLogRepository.record({ succeeded: true })`, `TokenService.issueAccessToken` + `issueRefreshToken`, `RefreshTokenRepository.create(hash(refreshToken), ...)`, retourne `ok({ user, tokens })`.

**`ClientAuthService.verifyOtp`** (déroulé complet) :
1. `ClientAccountRepository.findByPhone(phone)` → absent → `err({ code: 'unknown-account', ... })`.
2. `OtpRepository.findLatestValid(clientAccountId)` → absent/expiré → `err({ code: 'otp-expired', ... })`.
3. Si `otp.attempts >= 5` → `err({ code: 'too-many-attempts', ... })`.
4. `OtpService.verify(code, otp.codeHash)` → faux → `OtpRepository.incrementAttempts(otp.id)`, `err({ code: 'invalid-otp', ... })`.
5. Vrai → `OtpRepository.consume(otp.id)`, émission tokens comme le staff, `LoginLogRepository.record`, retourne `ok({ user, tokens })`.

## Controllers

Un Controller = une fonction `(req: NextRequest) => Promise<NextResponse>`, branchée 1:1 sur un Route Handler.

```typescript
// server/auth/http/staff-login.controller.ts
export async function staffLoginController(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null)
  const parsed = StaffLoginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(apiFailureFromZod(parsed.error), { status: 400 })
  }

  const { staffAuthService } = getContainer()
  const result = await staffAuthService.login(parsed.data, extractRequestContext(req))

  if (!result.ok) {
    return NextResponse.json(apiFailureFromDomainError(result.error), { status: statusForDomainError(result.error) })
  }

  const response = NextResponse.json(apiSuccess({ user: result.value.user }, 'Connexion réussie'))
  setAuthCookies(response, result.value.tokens)
  return response
}
```

```typescript
// app/api/auth/staff/login/route.ts
export const POST = staffLoginController
```

Chaque endpoint suit ce schéma. `staffMeController`/`clientMeController` lisent `access_token` via `readAccessTokenCookie(req)`, appellent `TokenService.verifyAccessToken`, puis `getMe`. `staffLogoutController`/`clientLogoutController` lisent `refresh_token`, appellent `logout` (révocation), puis `clearAuthCookies(response)` inconditionnellement (même si le token était déjà invalide — le logout doit toujours réussir côté client). `refreshController` est commun aux deux audiences : lit `ownerKind` depuis le `RefreshTokenRecord` retrouvé pour savoir quel service déléguer.

`statusForDomainError` mappe chaque code d'erreur à un statut HTTP : `invalid-credentials`/`unknown-account`/`invalid-otp`/`otp-expired` → 401, `too-many-attempts` → 429, `account-inactive` → 403, `invalid-refresh-token`/`session-expired` → 401.

## DTO & validation (Zod)

```typescript
// server/auth/dto/staff-login.dto.ts
export const StaffLoginSchema = z.object({
  email: z.string().email({ message: 'Adresse e-mail incorrecte' }),
  password: z.string().min(1, { message: 'Mot de passe requis' }),
})
export type StaffLoginDto = z.infer<typeof StaffLoginSchema>

// server/auth/dto/client-otp.dto.ts
export const RequestOtpSchema = z.object({
  phone: z.string().regex(/^\+\d{8,15}$/, { message: 'Numéro de téléphone invalide' }),
})
export type RequestOtpDto = z.infer<typeof RequestOtpSchema>

export const VerifyOtpSchema = z.object({
  phone: z.string().regex(/^\+\d{8,15}$/, { message: 'Numéro de téléphone invalide' }),
  code: z.string().length(6, { message: 'Le code doit contenir 6 chiffres' }),
})
export type VerifyOtpDto = z.infer<typeof VerifyOtpSchema>
```

`apiFailureFromZod` convertit `ZodError.issues` en `{ field: issue.path.join('.'), message: issue.message }[]` — c'est la seule source du tableau `errors` dans une réponse d'échec de validation. Les erreurs métier (`AuthDomainError`) produisent, elles, `errors: null` avec un `message` global (pas d'erreur de champ pour "identifiants invalides" — volontaire, pour ne pas indiquer si c'est l'email ou le mot de passe qui est faux).

## Format de réponse API

```typescript
export type ApiSuccess<T> = { success: true; data: T; message: string; errors: null }
export type ApiFailure = { success: false; data: null; message: string; errors: { field: string; message: string }[] | null }
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure
```

Exemple succès (`POST /api/auth/staff/login`) :
```json
{ "success": true, "data": { "user": { "id": "s1", "name": "Admin Studio", "email": "admin@atlas.fit", "role": "ADMIN" } }, "message": "Connexion réussie", "errors": null }
```

Exemple échec validation :
```json
{ "success": false, "data": null, "message": "Requête invalide", "errors": [{ "field": "email", "message": "Adresse e-mail incorrecte" }] }
```

Exemple échec métier :
```json
{ "success": false, "data": null, "message": "Identifiants invalides", "errors": null }
```

## Endpoints

| Méthode | Route | Cookie requis | Corps | Réponse `data` |
|---|---|---|---|---|
| POST | `/api/auth/staff/login` | — | `{ email, password }` | `{ user: StaffUser }` |
| POST | `/api/auth/staff/logout` | `refresh_token` | — | `null` |
| GET | `/api/auth/staff/me` | `access_token` | — | `{ user: StaffUser }` |
| POST | `/api/auth/client/request-otp` | — | `{ phone }` | `null` |
| POST | `/api/auth/client/verify-otp` | — | `{ phone, code }` | `{ user: ClientUser }` |
| POST | `/api/auth/client/logout` | `refresh_token` | — | `null` |
| GET | `/api/auth/client/me` | `access_token` | — | `{ user: ClientUser }` |
| POST | `/api/auth/refresh` | `refresh_token` | — | `null` (nouveaux cookies posés) |

`StaffUser = { id, name, email, role }` (`permissions` n'est plus renvoyé par l'API — calculé côté frontend via `ROLE_PERMISSIONS[role]`, comme avant, pour ne pas dupliquer cette table). `ClientUser = { id, name, phone }`.

## Tokens & cookies

- **Access token** : JWT (HS256, `AUTH_JWT_SECRET` en variable d'environnement), payload `{ sub, kind, role? }`, expiration **15 minutes**.
- **Refresh token** : chaîne aléatoire opaque (`crypto.randomBytes(32).toString('hex')`), jamais un JWT. Stocké hashé (SHA-256) dans `RefreshToken.tokenHash`. Expiration **30 jours**. Rotation à chaque appel `/api/auth/refresh` réussi : l'ancien est révoqué (`revoke`), un nouveau est créé — limite l'impact d'un vol de refresh token (rejeu détectable si l'ancien est réutilisé après rotation, traité comme `invalid-refresh-token`).
- **Cookies** : `access_token` (`Path=/`) et `refresh_token` (`Path=/api/auth`, pour limiter son exposition aux seules routes d'auth) — tous deux `HttpOnly; Secure; SameSite=Lax`. `Secure` désactivé uniquement si `NODE_ENV !== 'production'` (nécessaire pour tester en HTTP local).
- **Révocation** = suppression/`revokedAt` de la ligne `RefreshToken` → déconnexion effective côté serveur immédiatement pour `/refresh` et pour toute tentative de réutilisation du refresh token ; l'access token JWT déjà émis reste valide jusqu'à ses 15 minutes résiduelles (compromis assumé, documenté — évite une vérification DB à chaque requête protégée).

## Workflow complet — Staff login

```
1. Frontend (UserProvider.loginStaff) → fetch POST /api/auth/staff/login
   credentials: 'include', body: { email, password }

2. Route Handler → staffLoginController
   a. Zod validate (StaffLoginSchema) — échec → 400 + errors[]
   b. StaffAuthService.login(dto, context)
      - RateLimitService.assertNotLocked(email) — échec → 429
      - StaffAccountRepository.findByEmail(email)
      - PasswordService.verify(password, account.passwordHash)
      - échec (l'un ou l'autre) → LoginAttemptRepository.record(false), LoginLogRepository.record(false)
        → err({ code: 'invalid-credentials' }) → 401, message "Identifiants invalides"
      - succès → LoginAttemptRepository.record(true), LoginLogRepository.record(true)
        → TokenService.issueAccessToken + issueRefreshToken
        → RefreshTokenRepository.create(hash(refreshToken), ownerId, 'staff', +30j)
        → ok({ user, tokens })
   c. Controller → apiSuccess({ user }) + setAuthCookies(response, tokens) → 200

3. Frontend reçoit { success: true, data: { user } }
   → UserProvider.setSession(user mappé en StaffSession), status = 'authenticated'
   → cookies posés automatiquement par le navigateur (Set-Cookie), invisibles au JS
```

**Refresh silencieux** (remplace l'`setInterval` existant appelant `refreshSession()`) :
```
Toutes les 5-10 min (intervalle existant conservé) :
  fetch POST /api/auth/refresh, credentials: 'include' (cookie refresh_token envoyé automatiquement)
    → RefreshTokenRepository.findValidByHash(hash(cookie))
    → valide : revoke ancien, create nouveau, nouveaux cookies posés → 200
    → invalide/expiré/révoqué : 401 { success:false, message: "Session expirée" }
      → frontend : logout local (efface le state, ne redirige pas immédiatement —
        la prochaine navigation protégée déclenchera la redirection via le garde de route existant)
```

**Workflow client OTP** : symétrique — `request-otp` ne pose aucun cookie (juste `ok(undefined)` si le téléphone existe, mais retourne **toujours** `apiSuccess(null)` même si le compte est inconnu, pour ne pas révéler quels numéros sont enregistrés ; le message reste générique "Si ce numéro est enregistré, un code a été envoyé" — **écart volontaire par rapport au sous-projet précédent**, voir section suivante). `verify-otp` pose les cookies en cas de succès, exactement comme `staff/login`.

## Écart assumé par rapport au sous-projet Auth précédent (V0 mockée)

Le design V0 faisait échouer `requestClientOtp` avec `unknown-account` si le téléphone n'était pas dans l'annuaire mocké, affichant "Compte introuvable" sur `/connexion`. Ce sous-projet **change ce comportement** pour `request-otp` : l'API renvoie toujours un succès générique, qu'un compte existe ou non, afin de ne pas permettre à un tiers de découvrir quels numéros de téléphone sont des clients enregistrés (énumération de comptes) — pratique standard pour un vrai flux OTP en production. L'erreur "Compte introuvable" du frontend actuel (`app/connexion/page.tsx`) doit être retirée à l'implémentation ; l'écran redirige systématiquement vers `/connexion/verification` après `request-otp`, et un téléphone inconnu échoue silencieusement plus tard, à l'étape `verify-otp`, avec le même message générique `invalid-otp` que n'importe quel code refusé (pas de distinction "compte inconnu" vs "code faux" observable côté client). Ce changement de comportement UX est mineur (un écran de moins à distinguer) et sera implémenté dans ce sous-projet, pas reporté.

## Sécurité — récapitulatif

| Mesure | Statut dans ce sous-projet |
|---|---|
| Hash mots de passe (Argon2) | Réel |
| JWT access token signé | Réel (15 min) |
| Refresh token opaque + rotation + révocation | Réel (30 jours, hashé en base) |
| Cookies HttpOnly + Secure + SameSite | Réel |
| Rate limiting tentatives login staff | Réel mais basique (compteur PostgreSQL, pas de Redis ; 5 échecs / 15 min) |
| Rate limiting tentatives OTP | Réel (compteur `OtpCode.attempts`, 5 tentatives max par code) |
| Journalisation des connexions | Réel (table `LoginLog`, staff + client, succès et échecs) |
| OTP — génération/expiration/hash | Réel |
| OTP — envoi SMS réel | Simulé (code fixe affiché à l'écran, comme en V0) |
| Email "mot de passe oublié" réel | Simulé (aucun endpoint créé, comportement frontend inchangé) |
| OAuth | Non implémenté — architecture Service/Controller compatible avec un ajout futur |
| Anti-énumération de comptes (login + OTP) | Réel (mêmes messages d'erreur génériques pour "compte inconnu" vs "identifiants/code faux") |

## Bascule frontend

**Un seul fichier change de comportement observable, un seul fichier est ajouté :**

- **Ajouté** : `lib/auth/http-auth-service.ts` — `createHttpAuthService(): AuthService`, implémente exactement la même interface `AuthService` que `lib/auth/auth-service.ts` (déjà définie dans le sous-projet précédent), mais chaque méthode fait un `fetch` vers `/api/auth/*` (`credentials: 'include'`) au lieu de consulter les annuaires mockés / `SessionRepository`. Mappe la réponse `ApiResponse<T>` vers `Result<T, AuthError>` (même type `AuthError` déjà défini dans `lib/auth/types.ts`).
- **Modifié** : `components/providers/user-provider.tsx`, une seule ligne : `const authService = createAuthService(localStorageSessionRepository)` devient `const authService = createHttpAuthService()`.
- **Inchangé** : `useAuth()`, `useCurrentUser()`, `useCurrentClient()`, `app/login/page.tsx`, `app/connexion/page.tsx` (hormis le retrait du message "Compte introuvable", voir écart ci-dessus), `app/connexion/verification/page.tsx`, `app/(staff)/layout.tsx`, `app/(client)/layout.tsx`, `components/shell/topbar.tsx`, `components/shell/command-palette.tsx` — aucun de ces fichiers ne dépend de l'implémentation d'`AuthService`, seulement de sa forme.
- **`getSession()`** (appelé au montage de `UserProvider`) devient un `fetch GET /api/auth/staff/me` puis, si 401, `GET /api/auth/client/me` (ou l'inverse — l'ordre n'a pas d'impact fonctionnel, un seul des deux peut réussir à la fois puisqu'un seul cookie de session existe). Alternative plus propre envisagée mais écartée pour ce sous-projet : un endpoint unique `GET /api/auth/me` déduisant `kind` du payload JWT — laissé en dette explicite si le double appel s'avère gênant en pratique (deux requêtes réseau au lieu d'une à chaque chargement de page protégée).
- `lib/auth/session-repository.ts`, `lib/auth/mock-staff-directory.ts`, `lib/auth/mock-client-directory.ts`, `lib/auth/auth-service.ts` (version mockée) restent dans le repo mais ne sont plus importés par `UserProvider` après ce sous-projet — conservés pour référence/tests, suppression laissée à un nettoyage ultérieur si jugé utile.

## Erreurs et cas limites

- Email inconnu ou mot de passe faux (staff) → même message "Identifiants invalides", 401, pas d'indication de quel champ est en cause.
- Compte staff `isActive: false` → même message "Identifiants invalides" (ne pas révéler que le compte existe mais est désactivé).
- 5 échecs de connexion staff en 15 minutes pour un même email → `too-many-attempts`, 429, "Trop de tentatives, réessayez plus tard."
- Téléphone client inconnu à `request-otp` → succès générique quand même (voir écart assumé ci-dessus).
- Code OTP faux → `invalid-otp`, 401, compteur `attempts` incrémenté, champ vidé côté frontend (comportement déjà existant).
- 5 tentatives de code faux sur un même OTP → `too-many-attempts`, 429, même si un 6e essai aurait le bon code.
- OTP expiré (au-delà de sa durée de validité, ex: 10 minutes) → `otp-expired`, 401, message invite à redemander un code (retour à `/connexion`).
- `refresh_token` absent, invalide, expiré ou révoqué à `/api/auth/refresh` → 401, frontend traite comme session expirée (logout local, pas de redirection forcée immédiate — le garde de route existant s'en charge à la prochaine navigation protégée).
- Requête vers `/me` sans cookie `access_token` (jamais connecté, ou access token expiré sans refresh actif) → 401, `getSession()` retourne `null`, `status` passe à `unauthenticated`.
- Logout appelé alors que le refresh token est déjà invalide → révocation no-op côté service, cookies effacés quand même côté controller (le logout doit toujours "réussir" du point de vue du client).
- Corps de requête non-JSON ou champ manquant → 400 avec `errors[]` détaillant le(s) champ(s) en cause (via Zod).

## Variables d'environnement (nouvelles)

- `DATABASE_URL` — connexion PostgreSQL (Prisma).
- `AUTH_JWT_SECRET` — secret de signature des access tokens JWT.

## Découpage global du projet (rappel, pour contexte)

1. ~~Fondations & Shell~~ — terminé
2. ~~Auth (V0 mockée)~~ — terminé (`2026-07-12-auth-design.md`)
2b. **API d'authentification (remplacement des mocks)** ← ce document
3. Gestion Clients
4. Gestion Abonnements
5. Gestion Séances journalières
6. Scan QR
7. Interface Client (portail mobile complet)
8. Statistiques
9. Paramètres, Notifications, Reçus PDF

Chaque sous-projet suivant aura son propre cycle brainstorming → spec → plan.
