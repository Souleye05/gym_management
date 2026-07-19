# Backend Subscription/Session pour le portail client — Design

**Date :** 2026-07-19
**Statut :** Approuvé

## Contexte

Le portail client (`app/(client)/accueil`, `MyProfileProvider`) affiche aujourd'hui une identité `Client` **réelle** (via `GET /api/client/me/profile`, livré dans un chantier précédent) mais des données d'abonnement et de séances **mockées**, épissées côté frontend depuis `mockMyProfile` :

```ts
const profile: MyProfile = {
  client: query.data.client,                          // RÉEL
  subscription: mockMyProfile.subscription,            // MOCK
  subscriptionStatus: mockMyProfile.subscriptionStatus, // MOCK
  subscriptionHistory: mockMyProfile.subscriptionHistory, // MOCK
  sessionHistory: mockMyProfile.sessionHistory,         // MOCK
}
```

Ce mélange est documenté et intentionnel : `docs/superpowers/specs/2026-07-15-my-profile-real-api-design.md` conclut explicitement "`Subscription`/`Session`/`Payment` restent à construire côté backend avant qu'un futur sous-projet ne puisse brancher le reste de `/accueil` sur du réel" — ce document est ce sous-projet.

`ARCHITECTURE_RULES.md` §4 nomme la chaîne canonique `Client → Subscription → Session → Payment`. `Subscription`/`Session`/`Payment` n'existent dans aucune forme réelle : ni modèle Prisma, ni endpoint. Les écrans staff Abonnements/Séances sont eux aussi 100% mockés (`useSubscriptions()`/`useSessions()`, providers React en mémoire pur), avec des surfaces de méthodes (`createSubscription`, `renewSubscription`, `suspendSubscription`, `recordSubscriberSession`, `recordVisitorSession`...) qui indiquent un besoin CRUD bien plus large que la simple lecture du portail client.

## Décision de périmètre (validée)

**Ce chantier est lecture seule**, scopé au portail client uniquement : modèles Prisma + enrichissement de `GET /api/client/me/profile` avec les vraies données d'abonnement/séances du client connecté. Le CRUD staff (création/renouvellement/suspension d'abonnement, enregistrement de séance) est un chantier séparé, à brainstormer une fois ces modèles en place — ne pas le confondre avec ce document ni tenter de l'anticiper au-delà de ce qui est nécessaire pour éviter une migration de schéma supplémentaire (voir modélisation de `Session` ci-dessous).

## Décisions retenues (validées, avec justification)

- **`Payment` reste des champs embarqués** (`amountPaid`/`paymentMethod` sur `Subscription` et `Session`), **pas de modèle Prisma séparé**. Fidèle aux mocks actuels et au périmètre lecture seule validé — un vrai `Payment` (transactions multiples, remboursements) n'a de sens que quand le CRUD staff existera. **Écart assumé par rapport à `ARCHITECTURE_RULES.md` §4** qui nomme `Payment` comme maillon séparé de la chaîne : cet écart ne viole pas l'esprit de la règle (§4 interdit la duplication de modèles ; `Payment` ne fait ici que ne pas encore exister comme concept distinct, ses données vivent sur `Subscription`/`Session`) mais mérite d'être noté explicitement pour un futur lecteur qui comparerait ce design à `ARCHITECTURE_RULES.md` littéralement. À revisiter quand le CRUD staff décidera si `Payment` doit devenir un modèle à part entière.
- **`createdByStaffId`** ajouté sur `Subscription` et `Session` — champ d'audit optionnel (FK vers `StaffAccount.id`, `onDelete: SetNull`, même pattern que `Client.clientAccountId`), non peuplé par ce chantier (pas de write-path), prêt pour le futur CRUD staff.
- **Contrainte CHECK en base** pour la cohérence `SessionType` ↔ (`clientId`/`visitorName`/`visitorPhone`) — migration SQL manuelle (Prisma DSL ne supporte pas les contraintes conditionnelles multi-colonnes, même précédent que l'index partiel `clients_phone_active_key`). Protège même un futur bug du CRUD staff ou un script direct ; exercée immédiatement par le script de seed de ce chantier. La validation applicative (Zod) viendra s'ajouter par-dessus quand le CRUD staff introduira de vrais DTOs d'écriture — hors périmètre ici, aucun write-path à y accrocher.
- **`subscriptionStatus` reste calculé côté frontend** (`computeSubscriptionStatus()`, déjà testée) — l'API renvoie les données brutes (`endDate`, `suspended`, etc.), aucune logique métier de statut n'est portée côté backend pour ce chantier.
- **`sessionHistory` limité aux 20 séances les plus récentes** (`RECENT_SESSIONS_LIMIT`, constante interne au service) — évite une réponse non bornée pour un client fidèle sur plusieurs années. `subscriptionHistory` reste non paginé (volumes naturellement faibles).
- **Un seul `ClientHistoryService`** orchestrant `SubscriptionRepository`+`SessionRepository`, plutôt que des services séparés par agrégat — un seul consommateur (`get-my-client-profile.controller.ts`) a besoin des deux à la fois ; `SubscriptionService`/`SessionService`/`PaymentService` séparés seraient du sur-design pour ce périmètre (YAGNI). Le futur CRUD staff, avec des besoins d'écriture différenciés par agrégat, introduira probablement cette séparation à ce moment-là.
- **Les repositories restent des accès purs aux données** — `findLatestByClientId` (pas `findCurrentByClientId`) : "le plus récent par `endDate`" est un fait de données (`ORDER BY endDate DESC LIMIT 1`), tandis que "courant" (est-ce que cet abonnement est encore valide maintenant ?) est un jugement métier temporel. Ce jugement est calculé dans `ClientHistoryService`, jamais dans le repository — si la définition de "courant" évolue (période de grâce, prise en compte d'un futur `status`...), seul le service change, pas la persistance. `subscriptions` (l'ensemble) et `currentSubscription` (dérivé) sont récupérés séparément (légère redondance de requête, négligeable vu le faible volume par client) pour garder chaque méthode de repository à responsabilité unique.
- **`planId` en enum Prisma** (`MONTHLY | QUARTERLY | BIANNUAL | ANNUAL`), miroir exact de l'union frontend — **pas** de table `Plan` séparée. Le catalogue (durée/prix) reste une donnée statique frontend (`lib/subscriptions/plans.ts`) tant qu'il n'est pas éditable en base (besoin d'écriture, hors périmètre).

## Modèles Prisma

```prisma
model Subscription {
  id               String    @id @default(cuid())
  clientId         String
  planId           PlanId
  startDate        DateTime
  endDate          DateTime
  suspended        Boolean   @default(false)
  amountPaid       Int
  paymentMethod    PaymentMethod
  createdByStaffId String?
  createdAt        DateTime  @default(now())

  client         Client        @relation(fields: [clientId], references: [id], onDelete: Cascade)
  createdByStaff StaffAccount? @relation(fields: [createdByStaffId], references: [id], onDelete: SetNull)

  @@index([clientId, endDate])
  @@map("subscriptions")
}

model Session {
  id               String        @id @default(cuid())
  type             SessionType
  clientId         String?
  visitorName      String?
  visitorPhone     String?
  amountPaid       Int
  paymentMethod    PaymentMethod
  createdByStaffId String?
  checkedInAt      DateTime      @default(now())

  client         Client?       @relation(fields: [clientId], references: [id], onDelete: Cascade)
  createdByStaff StaffAccount? @relation(fields: [createdByStaffId], references: [id], onDelete: SetNull)

  @@index([clientId, checkedInAt])
  @@map("sessions")
}

enum PlanId { MONTHLY QUARTERLY BIANNUAL ANNUAL }
enum SessionType { SUBSCRIBER VISITOR }
enum PaymentMethod { CASH CARD MOBILE_MONEY }
```

**`Session` modélise déjà le cas `VISITOR`** (`clientId` nullable, `visitorName`/`visitorPhone`) même si ce chantier ne l'exploite jamais — un visiteur n'a pas de compte, donc n'appelle jamais cet endpoint. Ça évite une migration de schéma supplémentaire quand le CRUD staff (Séances) arrivera.

**Relations inverses requises sur les modèles existants** — Prisma exige une relation déclarée des deux côtés. `Client` gagne `subscriptions Subscription[]` et `sessions Session[]` ; `StaffAccount` gagne `createdSubscriptions Subscription[]` et `createdSessions Session[]`. Modification mécanique de modèles existants (ajout de champs de relation inverse uniquement, aucune colonne/contrainte nouvelle sur `Client`/`StaffAccount`), pas une décision structurante nécessitant sa propre discussion alternatives/avantages/inconvénients.

**Contrainte CHECK** (migration SQL manuelle, en complément du schema.prisma qui ne peut pas l'exprimer) :

```sql
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_type_consistency_check" CHECK (
  ("type" = 'SUBSCRIBER' AND "clientId" IS NOT NULL AND "visitorName" IS NULL AND "visitorPhone" IS NULL)
  OR
  ("type" = 'VISITOR' AND "clientId" IS NULL AND "visitorName" IS NOT NULL AND "visitorPhone" IS NOT NULL)
);
```

## Architecture

Miroir du pattern `server/clients/**`/`server/auth/**` déjà validé :

```
server/client-portal-history/
  domain/
    entities.ts        — Subscription, Session (types TS purs, Date natif)
    errors.ts           — quasi vide : lecture seule, pas de validation d'entrée, pas de règle métier bloquante
  repositories/
    subscription.repository.ts   — interface : findAllByClientId, findLatestByClientId
    session.repository.ts        — interface : findRecentByClientId
  infrastructure/
    prisma-subscription.repository.ts
    prisma-session.repository.ts
    test-helpers/clean-client-portal-history-tables.ts
  services/
    client-history.service.ts         — interface : getHistory(clientId): Promise<ClientHistory>
    default-client-history.service.ts — implémentation, dérive currentSubscription
```

```ts
// repositories/subscription.repository.ts
export interface SubscriptionRepository {
  /** Tous les abonnements d'un client, triés par endDate décroissant. */
  findAllByClientId(clientId: string): Promise<Subscription[]>
  /** L'abonnement avec l'endDate le plus récent, ou null. Accès pur — aucun jugement
   *  sur sa validité ("courant" ou non), c'est le rôle du service. */
  findLatestByClientId(clientId: string): Promise<Subscription | null>
}

// repositories/session.repository.ts
export interface SessionRepository {
  /** Les N séances les plus récentes d'un client, triées par checkedInAt décroissant. */
  findRecentByClientId(clientId: string, limit: number): Promise<Session[]>
}
```

```ts
// services/client-history.service.ts
export type ClientHistory = {
  currentSubscription: Subscription | null
  subscriptions: Subscription[]
  recentSessions: Session[]
}

export interface ClientHistoryService {
  getHistory(clientId: string): Promise<ClientHistory>
}
```

```ts
// services/default-client-history.service.ts
const RECENT_SESSIONS_LIMIT = 20

/**
 * Même frontière anti-fuite que DefaultClientService (server/clients/services/default-client.service.ts) :
 * toute erreur inattendue (Prisma, connexion) est journalisée côté serveur puis retraduite en
 * une erreur générique — jamais de détail Prisma qui traverse jusqu'à la réponse HTTP.
 */
async function guardAgainstLeakingInternals<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (cause) {
    console.error('[ClientHistoryService] unexpected repository failure', cause)
    throw new Error('internal-error')
  }
}

export class DefaultClientHistoryService implements ClientHistoryService {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly sessionRepository: SessionRepository,
  ) {}

  async getHistory(clientId: string): Promise<ClientHistory> {
    return guardAgainstLeakingInternals(async () => {
      const [subscriptions, latestSubscription, recentSessions] = await Promise.all([
        this.subscriptionRepository.findAllByClientId(clientId),
        this.subscriptionRepository.findLatestByClientId(clientId),
        this.sessionRepository.findRecentByClientId(clientId, RECENT_SESSIONS_LIMIT),
      ])

      // "Courant" est un jugement métier temporel (cet abonnement est-il encore valide
      // maintenant ?), pas une question d'accès aux données — délibérément gardé hors du
      // repository pour que cette règle puisse évoluer (suspension, période de grâce...)
      // sans toucher à la persistance. Un abonnement suspendu mais non expiré reste "courant"
      // ici : la distinction actif/suspendu/expirant est affinée côté frontend par
      // computeSubscriptionStatus(), pas par ce backend (cf. décision "statut non calculé").
      const now = new Date()
      const currentSubscription = latestSubscription && latestSubscription.endDate > now ? latestSubscription : null

      return { currentSubscription, subscriptions, recentSessions }
    })
  }
}
```

**Pas de nouveau controller** — `server/clients/http/get-my-client-profile.controller.ts` (existant) est étendu pour orchestrer `clientService.findByClientAccountId()` (existant) et `clientHistoryService.getHistory()` (nouveau).

## Contrat API

```ts
// server/clients/http/get-my-client-profile.controller.ts (étendu)
export async function getMyClientProfileController(req: NextRequest): Promise<NextResponse> {
  const auth = await requireClientAuth(req)
  if (!auth.ok) return auth.response

  return withInternalErrorHandling(async () => {
    const { clientService, clientHistoryService } = getContainer()
    const client = await clientService.findByClientAccountId(auth.client.id)

    if (!client) {
      return NextResponse.json(apiSuccess({
        client: null,
        subscription: null,
        subscriptionHistory: [],
        sessionHistory: [],
      }))
    }

    const history = await clientHistoryService.getHistory(client.id)
    return NextResponse.json(apiSuccess({
      client,
      subscription: history.currentSubscription,
      subscriptionHistory: history.subscriptions,
      sessionHistory: history.recentSessions,
    }))
  })
}
```

`GET /api/client/me/profile` → `{ success, data: { client, subscription, subscriptionHistory, sessionHistory }, message, errors }`. **Forme toujours constante** : même quand `client: null`, les 3 autres clés restent présentes (`null`/`[]`), jamais omises — évite au frontend de vérifier "la clé existe" en plus de "la valeur est vide". Nommage public (`subscription`, `subscriptionHistory`, `sessionHistory`) traduit depuis le nommage interne (`currentSubscription`, `subscriptions`, `recentSessions`) au niveau du controller, pour matcher exactement le type `MyProfile` déjà attendu par le frontend — `MyProfileProvider` n'aura qu'à retirer sa logique de splice avec `mockMyProfile`, aucun changement de type/écran requis.

Pas de DTO de sortie séparé : les entités domaine (`Date` natif) sont retournées directement via `apiSuccess()`, `NextResponse.json()` les sérialise en ISO string automatiquement — même précédent que `Client.joinedAt`.

## Gestion des erreurs

`errors.ts` du module reste quasi vide — aucune règle métier bloquante en lecture seule. Toute défaillance technique (DB) passe par la frontière `guardAgainstLeakingInternals` (service, à ajouter dans `DefaultClientHistoryService`)/`withInternalErrorHandling` (controller, déjà en place) déjà établie ailleurs dans le projet — aucun code d'erreur métier propre à ce chantier.

## Seed data

Étend `prisma/seed.ts` pour les 3 `Client` déjà liés à un `ClientAccount` (seed du chantier Autorisation : Yasmine Kaddour, Marc Delaunay, Inès Fabre), couvrant les états à vérifier visuellement dans le portail :

- **Yasmine Kaddour** : abonnement courant actif (trimestriel, démarré il y a 30j, expire dans 60j) + 1-2 abonnements passés en historique + quelques séances récentes.
- **Marc Delaunay** : abonnement expiré uniquement (`currentSubscription` doit résoudre à `null`) + séances datant d'avant l'expiration.
- **Inès Fabre** : abonnement courant mais `suspended: true` (non expiré, donc "courant" au sens backend — teste le badge suspendu côté frontend).

`createdByStaffId` peuplé avec l'id du compte `admin@atlas.fit` déjà seedé.

## Tests

- **Repository** (intégration Postgres réelle) : `findAllByClientId`, `findLatestByClientId`, `findRecentByClientId` contre de vraies lignes insérées ; un test dédié vérifie que la contrainte CHECK rejette une ligne `SUBSCRIBER` avec `visitorName` renseigné (preuve que la contrainte fonctionne réellement, pas juste qu'elle existe dans la migration).
- **Service** (fakes) : dérivation "courant" — dernier+non-expiré → courant ; dernier+expiré → `null` ; aucun abonnement → `null` ; suspendu-mais-non-expiré → reste courant.
- **Controller** (intégration complète, étend `get-my-client-profile.controller.test.ts`) : réponse fusionnée pour client avec historique, client sans abonnement (historique vide mais client présent), aucun client lié (cas `null` existant, doit rester inchangé), `sessionHistory` respecte la limite de 20.

## Hors périmètre

- CRUD staff (créer/renouveler/suspendre abonnement, enregistrer séance subscriber/visitor) — chantier séparé futur, brainstormé une fois ces modèles en place.
- `Plan` comme table éditable en base — reste une constante statique frontend (`lib/subscriptions/plans.ts`).
- Validation Zod d'écriture pour `Subscription`/`Session` — aucun write-path dans ce chantier pour l'accrocher ; viendra avec le futur CRUD staff.
- Pagination sur `subscriptionHistory` — non bornée, volumes naturellement faibles (quelques abonnements par an).
- Migration des données mockées `cl1`..`cl18` (staff Abonnements/Séances) vers de vraies lignes — seuls les 3 clients déjà liés à un `ClientAccount` reçoivent des données de seed réalistes, pour les besoins de ce chantier.
- Calcul de `subscriptionStatus` côté backend — le frontend garde `computeSubscriptionStatus()` inchangée, opérant sur les données brutes désormais réelles.
- Un modèle `Payment` séparé — écart assumé par rapport à `ARCHITECTURE_RULES.md` §4, documenté ci-dessus, à revisiter au moment du CRUD staff.
