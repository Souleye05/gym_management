# Design : CRUD staff Abonnements/Séances (module `memberships`)

**Statut : Approuvé**

## Contexte

Le chantier précédent (`2026-07-19-client-portal-history-design.md`) a livré un backend **lecture seule** pour le portail client (`GET /api/client/me/profile` enrichi de `subscription`/`subscriptionHistory`/`sessionHistory`), en laissant explicitement de côté le CRUD staff : "le CRUD staff (création/renouvellement/suspension d'abonnement, enregistrement de séance) est un chantier séparé, à brainstormer une fois ces modèles en place."

Côté frontend, ce CRUD n'existe aujourd'hui que sous forme de mock en mémoire (`components/providers/subscriptions-provider.tsx`, `components/providers/sessions-provider.tsx`), qui bloque trois écrans staff : `/abonnements`, `/seances`, `/scan`. Ce chantier remplace ce mock par un vrai backend Prisma, en respectant exactement le contrat métier déjà implémenté côté mock (mêmes règles de calcul, mêmes garde-fous) pour minimiser le travail d'intégration frontend.

## Décisions retenues

Ces décisions ont été validées explicitement, une par une, avant la conception détaillée :

1. **Le backend calcule montant et dates, source de vérité** — le staff envoie `planId`/`paymentMethod`, jamais de prix ni de dates. Empêche un client modifié d'envoyer des valeurs arbitraires pour de l'argent.
2. **Catalogue de plans en constante backend statique** — miroir de `lib/subscriptions/plans.ts`, pas de nouvelle table Prisma. Cohérent avec la décision déjà prise sur le chantier précédent de garder ce catalogue statique tant qu'il n'est pas éditable en base.
3. **Chevauchement d'abonnements autorisé** — pas de garde empêchant de créer un abonnement pendant qu'un autre est en cours (renouvellement anticipé). Cohérent avec le comportement du mock ET avec `DefaultClientHistoryService` qui gère déjà ce cas côté lecture.
4. **Créer et renouveler = une seule opération backend** (`createOrRenewSubscription`) — le mock utilise déjà la même logique interne pour les deux, seul le libellé UI change.
5. **Éligibilité de séance vérifiée côté serveur** — le backend refuse d'enregistrer une séance "subscriber" si l'abonnement n'est pas valide, avec une erreur métier explicite portant la raison (pas un simple filtre côté UI).
6. **Aucune restriction de permission sur abonnements/séances** — ADMIN et AGENT ont les deux accès (actions du quotidien). Seule exception : la modification des paramètres d'application (`PATCH /api/settings`) est réservée à ADMIN, la lecture reste ouverte à tout le personnel connecté.
7. **`AppSettings` devient une vraie table persistée** (extension de périmètre décidée en cours de brainstorm, au-delà du minimum nécessaire pour ce chantier) plutôt qu'une constante backend — `sessionPrice` n'est plus un état en mémoire côté frontend uniquement.

## Architecture

**Renommage** : `server/client-portal-history/` → `server/memberships/`. Le nom reflète le périmètre réel du module une fois qu'il couvre aussi l'écriture staff, pas seulement l'historique du portail client. Une seule couche de repositories `Subscription`/`Session` (étendue avec les méthodes d'écriture), réutilisée par le service de lecture existant (`ClientHistoryService`, inchangé) et par les nouveaux services d'écriture staff — évite de dupliquer l'accès aux données pour les mêmes tables.

`server/settings/` est un module séparé — les paramètres d'application n'ont pas de lien sémantique avec les abonnements/séances.

**Règle d'organisation des contrôleurs** (à documenter explicitement pour ne pas surprendre) : un contrôleur vit avec le module dont **la route est la ressource principale**, pas avec le module qui exécute la logique métier. `get-my-client-profile.controller.ts` reste dans `server/clients/http/` parce que la route `/api/client/me/profile` est fondamentalement une ressource "profil client" qui se trouve enrichir sa réponse avec des données `memberships` — c'est une exception historique (ce contrôleur existait avant le module `memberships`), pas une règle générale "les routes client vivent dans `clients/`". Les nouveaux contrôleurs staff créent des routes qui sont fondamentalement des ressources `memberships` (`/api/subscriptions`, `/api/sessions`), donc ils vivent dans `memberships/http/`.

```
server/memberships/
  domain/
    entities.ts                        (existant, inchangé : Subscription, Session, enums)
    errors.ts                          (existant vide → rempli)
    plan-catalog.ts                    (NOUVEAU)
    derive-current-subscription.ts     (NOUVEAU, fonction pure extraite)
  repositories/
    subscription.repository.ts         (étendu : + create, + findById, + setSuspended)
    session.repository.ts              (étendu : + create)
  infrastructure/
    prisma-subscription.repository.ts  (étendu)
    prisma-session.repository.ts       (étendu)
  services/
    client-history.service.ts / default-client-history.service.ts       (existant, réutilise derive-current-subscription.ts, comportement inchangé)
    staff-subscription.service.ts / default-staff-subscription.service.ts (NOUVEAU)
    staff-session.service.ts / default-staff-session.service.ts           (NOUVEAU)
  http/
    subscriptions/
      create-or-renew.controller.ts
      suspend.controller.ts
      reactivate.controller.ts
    sessions/
      record-subscriber.controller.ts
      record-visitor.controller.ts

server/settings/
  domain/entities.ts                   (AppSettings)
  repositories/settings.repository.ts
  infrastructure/prisma-settings.repository.ts
  services/settings.service.ts / default-settings.service.ts
  http/get-settings.controller.ts, update-settings.controller.ts
```

## Modèles Prisma

Aucun changement sur `Subscription`/`Session` — tous les champs nécessaires existent déjà (`createdByStaffId` notamment, laissé vide jusqu'ici faute de chemin d'écriture).

Nouveau modèle, singleton (une seule ligne, toujours) :

```prisma
model AppSettings {
  id           String   @id @default("singleton")
  sessionPrice Int
  updatedAt    DateTime @updatedAt

  @@map("app_settings")
}
```

Pas de contrainte applicative pour garantir l'unicité de la ligne — le `SettingsRepository.get()` fait toujours un `upsert` sur l'id fixe `"singleton"`, donc il ne peut structurellement jamais y avoir deux lignes créées par le code applicatif.

## `PLAN_CATALOG` (constante backend)

```ts
// server/memberships/domain/plan-catalog.ts
export const PLAN_CATALOG: Record<PlanId, { durationDays: number; price: number }> = {
  MONTHLY:   { durationDays: 30,  price: 40 },
  QUARTERLY: { durationDays: 90,  price: 105 },
  BIANNUAL:  { durationDays: 180, price: 190 },
  ANNUAL:    { durationDays: 365, price: 350 },
}
```
Miroir exact de `lib/subscriptions/plans.ts` (mêmes valeurs, enum en majuscules côté backend comme partout ailleurs dans ce module).

## `deriveCurrentSubscription` (fonction pure, extraite pour réutilisation)

```ts
// server/memberships/domain/derive-current-subscription.ts
export function deriveCurrentSubscription(subscriptions: Subscription[], now: Date): Subscription | null {
  const latestStarted = subscriptions.find((s) => s.startDate <= now) ?? null
  return latestStarted && latestStarted.endDate > now ? latestStarted : null
}
```
Logique identique à celle déjà en place dans `DefaultClientHistoryService.getHistory()` (qui sera refactorée pour appeler cette fonction plutôt que de dupliquer la logique inline — comportement strictement inchangé, zéro nouveau test de régression nécessaire sur le chantier précédent puisque la logique ne change pas, seulement son emplacement).

## Repositories — méthodes ajoutées

```ts
// SubscriptionRepository (étendu)
findById(id: string): Promise<Subscription | null>
create(input: CreateSubscriptionInput): Promise<Subscription>
setSuspended(id: string, suspended: boolean): Promise<Subscription>

type CreateSubscriptionInput = {
  clientId: string
  planId: PlanId
  startDate: Date
  endDate: Date
  amountPaid: number
  paymentMethod: PaymentMethod
  createdByStaffId: string
}
```

```ts
// SessionRepository (étendu)
create(input: CreateSessionInput): Promise<Session>

type CreateSessionInput =
  | { type: 'SUBSCRIBER'; clientId: string; amountPaid: number; paymentMethod: PaymentMethod; createdByStaffId: string }
  | { type: 'VISITOR'; visitorName: string; visitorPhone: string; amountPaid: number; paymentMethod: PaymentMethod; createdByStaffId: string }
```
`CreateSessionInput` en union discriminée (contrairement au type `Session` existant qui reste un objet plat avec des champs nullable) — empêche de construire en TypeScript une combinaison invalide (ex. `SUBSCRIBER` avec `visitorName` renseigné) avant même d'atteindre la contrainte CHECK en base. Amélioration ciblée, scopée uniquement à l'entrée d'écriture ; le type `Session` de lecture existant n'est pas touché.

## `StaffSubscriptionService`

```ts
export interface StaffSubscriptionService {
  createOrRenewSubscription(input: {
    clientId: string
    planId: PlanId
    paymentMethod: PaymentMethod
    createdByStaffId: string
  }): Promise<Result<Subscription, MembershipDomainError>>
  suspendSubscription(id: string): Promise<Result<Subscription, MembershipDomainError>>
  reactivateSubscription(id: string): Promise<Result<Subscription, MembershipDomainError>>
}
```

`createOrRenewSubscription` :
1. Vérifie que le client existe et est actif (`client-not-found` / `client-inactive` sinon).
2. `latest = (await subscriptionRepository.findAllByClientId(clientId))[0] ?? null`.
3. `startDate = latest && latest.endDate > now ? latest.endDate : now`.
4. `endDate = startDate + PLAN_CATALOG[planId].durationDays` (en jours).
5. `amountPaid = PLAN_CATALOG[planId].price`.
6. `subscriptionRepository.create({ clientId, planId, startDate, endDate, amountPaid, paymentMethod, createdByStaffId })`.

`suspendSubscription`/`reactivateSubscription` : vérifient l'existence (`subscription-not-found` sinon), basculent `suspended`. Pas de garde sur l'état actuel — suspendre un abonnement déjà suspendu (ou réactiver un abonnement déjà actif) est un no-op silencieux, comme le mock.

## `StaffSessionService`

```ts
export interface StaffSessionService {
  recordSubscriberSession(input: {
    clientId: string
    paymentMethod: PaymentMethod
    createdByStaffId: string
  }): Promise<Result<Session, MembershipDomainError>>
  recordVisitorSession(input: {
    visitorName: string
    visitorPhone: string
    paymentMethod: PaymentMethod
    createdByStaffId: string
  }): Promise<Result<Session, MembershipDomainError>>
}
```

`recordSubscriberSession` :
1. Vérifie que le client existe et est actif (même garde que pour l'abonnement).
2. `latest = (await subscriptionRepository.findAllByClientId(clientId))[0] ?? null`.
3. `checkSessionEligibility(latest, now)` — priorité suspendu > expiré > pas-encore-commencé > éligible (reproduit exactement `computeSubscriptionStatus`/`checkSessionEligibility` du mock). Si refusé : erreur `session-ineligible` avec `reason`.
4. Si éligible : `amountPaid = (await settingsService.getSettings()).sessionPrice`, crée la séance `type: 'SUBSCRIBER'`.

`recordVisitorSession` : aucune vérification d'éligibilité. `amountPaid` vient aussi de `SettingsService`. Validation Zod du téléphone (`^\+\d{8,15}$`) côté DTO.

```ts
// server/memberships/domain/check-session-eligibility.ts
export type SessionEligibility = { allowed: true } | { allowed: false; reason: 'none' | 'expired' | 'suspended' }

export function checkSessionEligibility(latest: Subscription | null, now: Date): SessionEligibility {
  if (!latest) return { allowed: false, reason: 'none' }
  if (latest.suspended) return { allowed: false, reason: 'suspended' }
  if (latest.endDate <= now) return { allowed: false, reason: 'expired' }
  if (latest.startDate > now) return { allowed: false, reason: 'none' }
  return { allowed: true }
}
```
Fonction pure du domaine, testable isolément sans repository. Choix délibéré : la raison `'none'` recouvre deux cas distincts (jamais eu d'abonnement, ou le dernier abonnement n'a pas encore commencé) plutôt que d'ajouter un 4ᵉ code — le mock n'a jamais ce second cas (ses renouvellements chaînent toujours depuis `max(fin actuelle, maintenant)`), donc aucun message existant ne le distingue ; pas la peine d'inventer une nuance que l'UI ne sait pas encore afficher.

## `SettingsService`

```ts
export interface SettingsService {
  getSettings(): Promise<AppSettings>
  updateSettings(input: { sessionPrice: number }): Promise<AppSettings>
}
```
Pas de `Result` — aucun mode d'échec métier réel (`sessionPrice` est validé en amont par Zod ; `getSettings` ne peut pas échouer par absence de ligne grâce à l'upsert du repository).

`SettingsRepository.get()` fait un `upsert` sur l'id fixe `"singleton"` (crée avec `sessionPrice: 8` par défaut si absent — auto-réparateur, aucune dépendance à l'ordre d'exécution du seed).

## Contrat API

Toutes les routes sont protégées par `requireStaffAuth`. Traduction minuscule↔majuscule des enums (`planId`, `paymentMethod`, `type`) à la frontière HTTP, même pattern que `get-my-client-profile.controller.ts`.

| Route | Permission | Corps | Succès |
|---|---|---|---|
| `POST /api/subscriptions` | tout staff | `{ clientId, planId, paymentMethod }` | `201 { subscription }` |
| `PATCH /api/subscriptions/[id]/suspend` | tout staff | — | `200 { subscription }` |
| `PATCH /api/subscriptions/[id]/reactivate` | tout staff | — | `200 { subscription }` |
| `POST /api/sessions/subscriber` | tout staff | `{ clientId, paymentMethod }` | `201 { session }` |
| `POST /api/sessions/visitor` | tout staff | `{ fullName, phoneNumber, paymentMethod }` | `201 { session }` |
| `GET /api/settings` | tout staff | — | `200 { settings }` |
| `PATCH /api/settings` | ADMIN (nouvelle permission `settings:update`) | `{ sessionPrice }` | `200 { settings }` |

## Gestion des erreurs

`MembershipDomainError` (nouveau, remplit `server/memberships/domain/errors.ts` jusqu'ici vide) :
```ts
export type MembershipDomainErrorCode = 'client-not-found' | 'client-inactive' | 'subscription-not-found' | 'session-ineligible'

export type MembershipDomainError = {
  code: MembershipDomainErrorCode
  message: string
  reason?: 'none' | 'expired' | 'suspended'   // uniquement pour session-ineligible
}
```
`session-ineligible` → HTTP `422`. Le corps suit le format d'erreur partagé de l'app (`apiFailure`, déjà utilisé partout ailleurs) plutôt qu'un `{ code, reason }` dédié : `{ success: false, data: null, message, errors: [{ field: 'reason', message: reason }] }` — `reason` est donc dans `errors[0].message`, pas un champ `code` séparé. Suffisant pour que le frontend affiche le même message que `IneligibilityNotice` (mêmes trois raisons), juste à un chemin différent dans la réponse.

Toute erreur technique inattendue passe par la frontière `guardAgainstLeakingInternals` (service) / `withInternalErrorHandling` (contrôleur) déjà établie ailleurs dans le projet — aucun détail Prisma ne traverse jusqu'à la réponse HTTP.

## Données de seed

Étendre `prisma/seed.ts` : une ligne `AppSettings` (`sessionPrice: 8`, cohérent avec `DEFAULT_SETTINGS` du mock) — même si `get()` s'auto-répare, le seed la crée explicitement pour la cohérence avec le reste du script. Pas de nouvelles données de test pour les abonnements/séances eux-mêmes (déjà couvertes par le seed du chantier précédent) ; le staff CRUD sera vérifié en direct en créant/modifiant réellement via les nouveaux endpoints.

## Tests

Même approche que les deux chantiers précédents :
- Tests d'intégration des repositories (`create`, `findById`, `setSuspended` sur `Subscription` ; `create` sur `Session`, y compris un test prouvant que la contrainte CHECK rejette toujours une combinaison invalide même via le nouveau chemin d'écriture) contre Postgres réel.
- Tests unitaires des fonctions pures du domaine (`deriveCurrentSubscription`, `checkSessionEligibility`) — aucun repository/fake nécessaire.
- Tests unitaires des services avec des fakes (chaînage de dates, calcul du montant, garde client actif, éligibilité, mapping des erreurs).
- Tests d'intégration des contrôleurs (permissions ADMIN vs AGENT sur `/api/settings`, traduction d'enum à la frontière, codes HTTP).

## Hors périmètre

- Pas de suppression d'abonnement/séance (aucun cas d'usage identifié).
- Pas de modification d'un abonnement/séance déjà créé (changer le plan, la date, le montant a posteriori) — seulement suspendre/réactiver.
- Pas de remboursement/paiement partiel — `amountPaid` reste toujours le prix plein du plan ou de la séance, comme le mock.
- Catalogue de plans éditable en base — reste une constante backend statique.
- Autres paramètres d'application au-delà de `sessionPrice` — la table `AppSettings` est conçue pour pouvoir grandir (nouvelle colonne + migration), mais rien d'autre n'est ajouté maintenant.
