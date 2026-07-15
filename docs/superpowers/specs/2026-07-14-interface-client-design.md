# Interface Client — Design

**Date :** 2026-07-14
**Sous-projet :** 7 / 9 (voir découpage global en fin de document)
**Statut :** Approuvé (frontend uniquement — voir proposition de contrat backend, non validée, en fin de document)

## Rôle et périmètre de ce document

Ce design est produit sous le cadrage de rôle "Architecte Frontend" : responsable UX/UI/composants/providers/hooks/pages/navigation, jamais de Prisma/SQL/JWT/logique métier backend. Il respecte `ARCHITECTURE_RULES.md`, en particulier :
- **§2 Source de vérité** : le backend est la source de vérité métier ; ce document ne modélise aucune règle métier nouvelle, il consomme celles déjà centralisées côté frontend mocké (`computeSubscriptionStatus`, `checkSessionEligibility`, etc.) exactement comme le staff le fait déjà.
- **§11 Contrats API** : le frontend ne modifie ni n'invente de contrat backend. Ce document contient une **proposition** de contrat, explicitement non implémentée, à faire valider.
- **§16 Breaking Changes** : toute évolution structurante côté backend est annoncée (problème/solution/avantages/inconvénients/impact) avant toute implémentation — voir section dédiée en fin de document.
- **§18 Convention de décision** : chaque choix structurant de ce document a été présenté avec alternatives et validé explicitement avant d'être retenu (voir historique de brainstorming).

## Contexte

Le cahier des charges (§2.3, "Interface Client") décrit un espace personnel accessible par téléphone + OTP, sans mot de passe. L'authentification OTP est déjà entièrement construite et fonctionnelle (`app/connexion/`, `app/connexion/verification/`, `useAuth()`/`useCurrentClient()` dans `components/providers/user-provider.tsx`), backée par un vrai service Postgres (`ClientAccount` via `server/auth/`). Le layout `app/(client)/layout.tsx` protège déjà les routes clientes et affiche un header minimal. La page `app/(client)/accueil/page.tsx` est un stub qui n'affiche que le nom et le téléphone masqué de la session — aucune des fonctionnalités "Haute priorité" du cahier des charges (carte numérique, statut abonnement, historique paiements) n'est construite.

**Découverte structurante de ce brainstorming** : `ARCHITECTURE_RULES.md` (§5) distingue explicitement `Client` (personne dans la salle : identité, carte, abonnements, séances) de `ClientAccount` (compte de connexion : téléphone, OTP, refresh tokens), reliés par une relation *optionnelle*. Une vérification du code réel confirme que **seul `ClientAccount` existe aujourd'hui côté backend** (`prisma/schema.prisma` ne contient que `StaffAccount`, `ClientAccount`, `RefreshToken`, `OtpCode`, `LoginAttempt`, `LoginLog`) — aucun modèle `Client`, `Subscription`, `Session`, ou `Payment` n'existe en base. Tout ce qui porte ces noms aujourd'hui (`lib/clients/`, `lib/subscriptions/`, `lib/sessions/`) est un mock frontend consommé uniquement par les écrans staff, sans schéma ni API réels derrière.

Conséquence directe : **`ClientSession.id`** (un cuid Prisma issu de `ClientAccount`) **n'a aucune correspondance possible** avec les identifiants mockés `'cl1'...'cl18'` de `lib/clients/mock-clients.ts`. Toute tentative de relier la session connectée à une fiche `Client` mockée serait une invention de correspondance, pas un contrat réel — explicitement écarté par ce brainstorming (voir décision ci-dessous).

## Décision retenue (§18 — alternatives présentées et validées)

Trois options ont été présentées : (1) construire l'UI dès maintenant sur un `MyProfileProvider` mocké et autonome, avec une proposition de contrat backend documentée séparément et non implémentée ; (2) limiter le portail au strict périmètre déjà exposé par l'auth réelle (nom/téléphone seulement) ; (3) suspendre toute conception UI en attendant la validation d'un contrat. **L'option 1 a été retenue.**

## Objectif

- `MyProfileProvider`, nouveau provider frontend, entièrement mocké et autonome — **aucune tentative de correspondance avec `session.id`/`session.phone`**, ses données ne dépendent pas de la session `ClientAccount` connectée.
- Hook `useMyProfile()`, strictement en lecture seule (aucune fonction de mutation exposée) — garantie architecturale, pas une convention.
- Écran `/accueil` reconstruit : statut abonnement, carte numérique (réutilise `ClientQrCode`, déjà construit), historique paiements (abonnements + séances fusionnés), historique séances. Une seule page, sections empilées, pas de navigation par onglets.
- Une proposition de contrat backend (modèles `Client`/`Subscription`/`Session`/`Payment` + endpoint agrégé), documentée en fin de ce document conformément à §16, non implémentée dans ce sous-projet.

## Hors périmètre (explicitement exclu de ce sous-projet)

- Toute tentative de relier le portail aux vraies données du client connecté — impossible tant que le contrat proposé n'est pas validé et implémenté côté backend (voir section dédiée).
- Reçus numériques PDF/image (cahier des charges, priorité Moyenne) — reporté au sous-projet 9 (Reçus PDF), qui n'existe pas encore et mérite son propre design.
- Toute modification de `prisma/schema.prisma`, migrations, endpoints API, services backend, JWT, ou logique d'authentification — strictement hors périmètre de ce document par cadrage de rôle.
- Navigation par onglets/multi-écrans — un seul écran `/accueil` suffit pour ce périmètre (validé).
- Toute mutation depuis le portail client (modifier son profil, annuler un abonnement, etc.) — le cahier des charges §2.3 ne décrit que de la consultation ; aucune mutation n'est dans le périmètre "Haute priorité" retenu.

## Modèle de données (frontend, mocké)

```typescript
// lib/client-portal/types.ts
import type { PaymentMethod } from '@/lib/subscriptions/types'
import type { ClientStatus } from '@/lib/clients/types'
import type { Subscription } from '@/lib/subscriptions/types'
import type { SubscriberSession } from '@/lib/sessions/types'

export type MyProfile = {
  client: {
    name: string
    phone: string
    cardNumber: string
  }
  subscription: Subscription | undefined
  subscriptionStatus: ClientStatus
  subscriptionHistory: Subscription[]
  sessionHistory: SubscriberSession[]
}
```

Réutilise les types déjà existants (`Subscription`, `SubscriberSession`, `ClientStatus`, `PaymentMethod`) plutôt que d'en inventer de nouveaux — cohérent avec §4 ("les modèles métier sont uniques, ils ne doivent jamais être dupliqués"), même si la source de ces types reste aujourd'hui un mock frontend et non un modèle Prisma partagé.

`lib/client-portal/mock-my-profile.ts` fournit un unique profil fictif représentatif (client avec abonnement actif, historique varié incluant au moins un abonnement expiré et plusieurs séances) — suffisant pour démontrer chaque état d'affichage de l'écran sans dépendre d'aucune session réelle.

## Provider et hook

```typescript
// components/providers/my-profile-provider.tsx
type MyProfileContextValue = {
  profile: MyProfile
  status: 'loading' | 'ready'
}
```

`MyProfileProvider` seede son état depuis `mock-my-profile.ts` au montage (`status: 'loading'` bref puis `'ready'`, pour que l'UI ait un état de chargement à afficher — utile quand ce provider sera remplacé par un vrai fetch). Monté dans `app/(client)/layout.tsx`, à l'intérieur de `ClientGuard` (après la vérification d'authentification, jamais avant).

`useMyProfile()` est le seul point d'accès exposé aux écrans — pas de `useContext(MyProfileContext)` direct ailleurs. Aucune fonction de mutation n'existe sur `MyProfileContextValue` : la garantie "lecture seule" est structurelle (le type ne contient tout simplement aucune fonction), pas une discipline de code à faire respecter en revue.

## Écrans

### `app/(client)/accueil/page.tsx` (reconstruit)

Remplace le stub actuel. Sections empilées verticalement, dans cet ordre :

1. **En-tête** : nom du client (`profile.client.name`), badge `ClientStatusBadge` (composant existant, réutilisé) avec `profile.subscriptionStatus`, et si `expiring`, un texte "Expire dans N jours" calculé depuis `profile.subscription.endDate`.
2. **Carte numérique** : `ClientQrCode` (composant existant, réutilisé tel quel, prend `cardNumber: string`) avec `profile.client.cardNumber`, dans une présentation légèrement plus grande/mise en avant que sur la fiche staff (c'est l'écran principal du client, pas un détail secondaire) — mais reste le même composant, pas une réimplémentation.
3. **Historique paiements** : fusion de `profile.subscriptionHistory` et `profile.sessionHistory`, triée par date décroissante (`createdAt`/`checkedInAt` selon le type), chaque ligne affichant le type (abonnement/séance), le montant, la date, le mode de paiement — même pattern de formatage (`Intl.NumberFormat('fr-FR', ...)`, `toLocaleDateString('fr-FR')`) que le reste de l'app.
4. **Historique séances** : liste de `profile.sessionHistory` seule, date + heure d'entrée — répond spécifiquement à l'item "Moyenne priorité" du cahier des charges distinct de l'historique paiements.

Chargement (`status === 'loading'`) : état de chargement simple, cohérent avec `ClientGuard`'s "Chargement…" existant.

## Erreurs et cas limites

- `profile.subscription === undefined` (client sans abonnement) → en-tête affiche `ClientStatusBadge` avec `'none'`, pas de section "jours restants", carte numérique reste affichée (elle ne dépend pas de l'abonnement).
- `subscriptionHistory`/`sessionHistory` vides → message inline "Aucun historique pour l'instant.", même pattern que les états vides déjà utilisés côté staff (pas de composant `EmptyState` complet, une simple ligne de texte suffit dans ce contexte de sous-section).
- Le provider est mocké et statique : aucune interaction utilisateur ne peut faire évoluer `profile` dans ce sous-projet (pas de bouton "rafraîchir", pas de polling) — cohérent avec le fait qu'aucune vraie donnée n'est disponible à rafraîchir.

## Proposition de contrat backend (§16 — non implémentée, à valider)

**Problème** : Le portail client a besoin de données `Client` (identité complète, carte), `Subscription` (statut, historique), `Session` (historique de passages) liées au compte connecté. Aucun de ces modèles n'existe dans `prisma/schema.prisma` aujourd'hui — seul `ClientAccount` (identité de connexion) existe. `ARCHITECTURE_RULES.md` §5 prévoit déjà cette distinction et une relation optionnelle `Client ↔ ClientAccount`, mais elle n'est pas encore implémentée.

**Solution proposée** :
- Ajouter les modèles Prisma `Client`, `Subscription`, `Session` (probablement discriminé `SubscriberSession`/`VisitorSession` comme déjà modélisé côté frontend mocké, ou un champ `type` sur un modèle unique — au choix du backend), et `Payment` si distinct de `Subscription`/`Session`.
- Relation optionnelle `Client.clientAccountId String? @unique` (ou l'inverse), conforme à §5 : "Un Client peut exister sans ClientAccount. Un ClientAccount peut être créé ultérieurement."
- Un endpoint agrégé unique : `GET /api/client/me/profile`, authentifié via la session `ClientAccount` déjà en place (cookie existant, aucun changement d'auth), retournant une forme équivalente au `MyProfile` frontend ci-dessus.

**Avantages** : un seul appel réseau pour le portail (simplicité côté état de chargement frontend) ; réutilise l'authentification déjà construite sans aucun changement ; la forme de réponse proposée correspond exactement à ce que le frontend attend déjà, migration transparente de `MyProfileProvider` (mock → fetch) sans toucher aux écrans.

**Inconvénients** : travail backend non négligeable (3-4 nouveaux modèles, migration, repository, service, controller) ; nécessite de décider comment/quand un `Client` est créé pour un `ClientAccount` existant (au premier login ? migration manuelle des 18 clients mockés vers de vraies lignes ?) — question métier explicitement laissée au backend, pas tranchée ici.

**Impact Frontend** : seule l'implémentation interne de `MyProfileProvider` change (mock local → `fetch('/api/client/me/profile')`) ; `useMyProfile()` et tous les composants d'écran restent identiques, aucune modification requise.

**Impact Backend** : nouveaux modèles Prisma + migration, nouveau repository/service/controller pour `Client`/`Subscription`/`Session`/`Payment`, décision sur le peuplement initial (seed vs. création à la volée) — hors périmètre de ce document, à concevoir et valider par l'agent/équipe backend.

Cette proposition n'est ni implémentée ni présumée acceptée par ce document (§18) — elle est transmise pour validation.

## Découpage global du projet (rappel, pour contexte)

1. ~~Fondations & Shell~~ — terminé
2. ~~Auth (V0 mockée)~~ — terminé
2b. API d'authentification (remplacement des mocks) — terminé (auth réelle Postgres en place)
3. ~~Gestion Clients~~ — terminé (`2026-07-13-gestion-clients-design.md`)
4. ~~Gestion Abonnements~~ — terminé (`2026-07-13-gestion-abonnements-design.md`)
5. ~~Gestion Séances journalières~~ — terminé (`2026-07-13-gestion-seances-design.md`, révisé pour le parcours visiteur)
6. ~~Scan QR~~ — terminé (`2026-07-14-scan-qr-design.md`)
7. **Interface Client** ← ce document (frontend mocké ; contrat backend réel proposé, non validé)
8. Statistiques
9. Paramètres, Notifications, Reçus PDF

Chaque sous-projet suivant aura son propre cycle brainstorming → spec → plan.
