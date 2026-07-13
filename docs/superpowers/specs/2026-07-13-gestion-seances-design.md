# Gestion Séances journalières — Design

**Date :** 2026-07-13 (révisé)
**Sous-projet :** 5 / 9 (voir découpage global en fin de document)
**Statut :** Approuvé — révision 2

## Historique des révisions

- **Révision 1 (livrée, sur `main`)** : un seul parcours, une séance était toujours rattachée à un `Client` existant (`Session.clientId: string` obligatoire). Pas de parcours visiteur occasionnel.
- **Révision 2 (ce document)** : introduit un second parcours métier — **visiteur occasionnel** — qui ne crée jamais de fiche `Client`. `Session` devient une union discriminée (`SubscriberSession | VisitorSession`). Cette révision **remplace** le modèle de données et les écrans de la révision 1 ; le reste de l'architecture (providers, patterns, tarif configurable) est conservé et étendu, pas réécrit.

## Contexte

La révision 1 de ce sous-projet a livré un flux unique : toute séance journalière suppose un client déjà inscrit, retrouvé par recherche nom/téléphone. En pratique, la salle reçoit aussi des visiteurs occasionnels qui paient une séance unique sans vouloir de compte ni d'abonnement — les forcer dans le modèle `Client` remplirait la base de fiches qui ne reviendront jamais.

Cette révision distingue explicitement deux parcours métier :
- **Client abonné** : le client existe déjà, on vérifie (à titre informatif) son abonnement, on enregistre sa séance — rattachée à son `clientId`.
- **Visiteur occasionnel** : aucune fiche client n'existe et aucune n'est créée. On saisit seulement nom, téléphone, mode de paiement ; le montant vient de la configuration ; un ticket de traçabilité est généré.

## Objectif

- `Session` devient une **union discriminée** (`SubscriberSession | VisitorSession`) — impossible de représenter un état incohérent (ni les deux à la fois, ni ni l'un ni l'autre) ; le compilateur TypeScript garantit la cohérence, pas une convention de code.
- Un visiteur occasionnel ne crée **jamais** de `Client` — aucune écriture dans `ClientsProvider` depuis le parcours visiteur.
- Le parcours abonné reste non bloquant sur le statut d'abonnement (décision déjà validée en révision 1) : le statut est affiché à titre informatif pendant la sélection du client, mais n'empêche jamais l'enregistrement.
- Deux points d'entrée UI clairement séparés sur `/seances` : **"Nouvelle séance journalière"** (visiteur) et **"Enregistrer la séance d'un abonné"** (abonné).
- Un ticket/reçu de traçabilité (id de séance, nom, téléphone, date/heure, montant, mode de paiement) est généré après validation, pour les deux parcours — un seul composant, adapté au type de séance via le discriminant.
- Le tarif reste piloté par `settings.sessionPrice` (révision 1, inchangé) — copié dans `amountPaid` à la création, pour les deux types de séance.

## Hors périmètre (explicitement exclu de cette révision)

- Blocage de l'enregistrement abonné en cas d'abonnement invalide — reste une décision humaine, non bloquante (cf. révision 1).
- Conversion a posteriori d'un `VisitorSession` en `Client` (« ce visiteur est finalement revenu, créer sa fiche et rattacher son historique ») — hors périmètre, aucun outil de fusion n'est construit ici.
- Génération de PDF téléchargeable ou partage SMS du ticket — le ticket est un écran de confirmation enrichi, pas un document exportable (sous-projet 9, Reçus PDF).
- Historique consultable des `VisitorSession` par nom/téléphone (retrouver "tous les passages de ce visiteur") — puisqu'aucune fiche n'existe, il n'y a pas d'identifiant stable pour grouper ses passages ; seule la liste globale `/seances` (du jour) les affiche.
- QR Code — mentionné dans le parcours abonné comme méthode de recherche future, reste au sous-projet 6 (Scan QR) ; la recherche reste nom/téléphone dans ce sous-projet.

## Modèle de données

```typescript
// lib/sessions/types.ts
import type { PaymentMethod } from '@/lib/subscriptions/types'

type SessionBase = {
  id: string
  amountPaid: number      // copié depuis settings.sessionPrice au moment de la création, jamais modifié après coup
  paymentMethod: PaymentMethod
  checkedInAt: string     // ISO datetime string (date + heure de l'entrée)
}

export type SubscriberSession = SessionBase & {
  type: 'subscriber'
  clientId: string
}

export type VisitorSession = SessionBase & {
  type: 'visitor'
  fullName: string
  phoneNumber: string
}

export type Session = SubscriberSession | VisitorSession
```

Le champ `type` est le discriminant : `SubscriberSession` ne peut exister sans `clientId`, `VisitorSession` ne peut exister sans `fullName`/`phoneNumber`, et aucun des deux ne peut porter les champs de l'autre. Tout code consommant `Session` doit `switch`/`if` sur `session.type` avant d'accéder aux champs spécifiques — TypeScript refuse la compilation sinon. C'est un remplacement, pas une extension, du type `Session` plat de la révision 1 (`{ id, clientId, amountPaid, paymentMethod, checkedInAt }`).

## Gestion d'état

### `components/providers/sessions-provider.tsx` (révisé)

```typescript
type SessionsContextValue = {
  sessions: Session[]
  recordSubscriberSession(input: { clientId: string; paymentMethod: PaymentMethod }): SubscriberSession
  recordVisitorSession(input: { fullName: string; phoneNumber: string; paymentMethod: PaymentMethod }): VisitorSession
  getSessionsForClient(clientId: string): SubscriberSession[]
  getSessionsForToday(): Session[]
}
```

Changements par rapport à la révision 1 :
- `recordSession(input: { clientId, paymentMethod })` est **remplacé** par deux méthodes explicites, `recordSubscriberSession` et `recordVisitorSession` — le nom de la méthode porte le choix du parcours, pas un paramètre `type` que l'appelant pourrait mal renseigner.
- `getSessionsForClient(clientId)` retourne désormais `SubscriberSession[]` (et non plus `Session[]`) — un visiteur n'ayant pas de `clientId`, il ne peut logiquement pas apparaître dans l'historique d'un client. Le filtre `s.clientId === clientId` ne peut de toute façon matcher que des `SubscriberSession` une fois `Session` scindé en union ; le typage du retour rend cette garantie explicite plutôt qu'implicite.
- `getSessionsForToday()` retourne l'union complète `Session[]`, inchangé dans sa forme — les deux types de séances cohabitent dans la liste du jour.

Les deux méthodes de création lisent `settings.sessionPrice` via `useSettings()` au moment de l'appel (comportement de la révision 1, inchangé) et ajoutent le nouvel enregistrement en fin de tableau (`[...prev, created]`) — jamais de mutation, historique append-only.

```typescript
const recordSubscriberSession = useCallback(
  (input: { clientId: string; paymentMethod: PaymentMethod }): SubscriberSession => {
    const created: SubscriberSession = {
      type: 'subscriber',
      id: `sess${Date.now()}`,
      clientId: input.clientId,
      amountPaid: settings.sessionPrice,
      paymentMethod: input.paymentMethod,
      checkedInAt: new Date().toISOString(),
    }
    setSessions((prev) => [...prev, created])
    return created
  },
  [settings.sessionPrice],
)

const recordVisitorSession = useCallback(
  (input: { fullName: string; phoneNumber: string; paymentMethod: PaymentMethod }): VisitorSession => {
    const created: VisitorSession = {
      type: 'visitor',
      id: `sess${Date.now()}`,
      fullName: input.fullName,
      phoneNumber: input.phoneNumber,
      amountPaid: settings.sessionPrice,
      paymentMethod: input.paymentMethod,
      checkedInAt: new Date().toISOString(),
    }
    setSessions((prev) => [...prev, created])
    return created
  },
  [settings.sessionPrice],
)
```

`getSessionsForClient` filtre désormais explicitement sur `type === 'subscriber'` avant de comparer `clientId`, ce qui narrow le type en `SubscriberSession[]` sans cast :

```typescript
const getSessionsForClient = useCallback(
  (clientId: string): SubscriberSession[] =>
    sessions
      .filter((s): s is SubscriberSession => s.type === 'subscriber' && s.clientId === clientId)
      .sort((a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime()),
  [sessions],
)
```

`ClientsProvider` n'est appelé par aucun chemin du parcours visiteur — aucune écriture, aucune lecture même, `recordVisitorSession` ne connaît pas `ClientsProvider`.

### Mock de départ (`lib/sessions/mock-sessions.ts`)

Les séances déjà mockées (livrées en révision 1) migrent vers `SubscriberSession` en ajoutant `type: 'subscriber'` à chaque enregistrement existant — aucune autre valeur ne change. Deux ou trois `VisitorSession` mockées sont ajoutées (nom/téléphone fictifs, dont au moins une aujourd'hui) pour que la liste `/seances` illustre les deux parcours dès le premier chargement.

## Écrans

### `app/(staff)/seances/page.tsx` — Liste du jour (révisé)

Le bouton unique "Enregistrer une séance" est remplacé par deux boutons distincts dans l'en-tête :
- **"Nouvelle séance journalière"** → ouvre le dialog visiteur.
- **"Enregistrer la séance d'un abonné"** → ouvre le dialog abonné (reprend le flux existant : recherche → paiement).

La table du jour (`getSessionsForToday()`) affiche les deux types mélangés, triés comme aujourd'hui (plus récent en premier). Colonne "Client" adaptée par narrowing sur `session.type` :
- `subscriber` → nom du client (lookup via `clients`), ligne cliquable vers `/clients/[id]` (comportement actuel, inchangé).
- `visitor` → `fullName`, badge "Visiteur" à côté du nom, ligne **non cliquable** (aucune fiche à ouvrir).

#### Dialog "Enregistrer la séance d'un abonné"

Reprend le flux de la révision 1 (recherche `ClientSearch` → sélection → mode de paiement → confirmation), avec un ajout : une fois le client sélectionné, son statut d'abonnement courant (`useClientStatus(client.id)`, hook déjà existant) est affiché via `ClientStatusBadge` (déjà existant) à titre purement informatif, à côté de son nom — aucune logique ne bloque la suite du flux quel que soit le statut affiché (y compris `'none'`, `'expired'`, `'suspended'`). Appelle `recordSubscriberSession({ clientId, paymentMethod })` à la confirmation.

#### Dialog "Nouvelle séance journalière" (nouveau)

Formulaire direct, une seule étape :
- Nom complet (texte, obligatoire).
- Numéro de téléphone (texte, obligatoire).
- Mode de paiement (même sélecteur `PaymentMethodPicker` que le parcours abonné).
- Bouton de confirmation → appelle `recordVisitorSession({ fullName, phoneNumber, paymentMethod })`, ferme le dialog, affiche le ticket.

Pas de recherche, pas de vérification d'existence — chaque soumission crée une nouvelle `VisitorSession`, y compris pour un nom/téléphone déjà vu (cohérent avec « pas de fiche, pas d'historique groupé » — hors périmètre ci-dessus).

### Section "Historique des séances" sur `/clients/[id]`

Inchangée dans son comportement : `getSessionsForClient(client.id)` ne renvoie que des `SubscriberSession`, donc aucun visiteur n'y apparaît jamais — cohérent avec le fait qu'un visiteur n'a pas de fiche à consulter. Le bouton "Enregistrer une séance" de cette page appelle désormais `recordSubscriberSession` (renommage de l'appel, comportement identique).

### Ticket / écran de confirmation (révisé)

`SessionConfirmation` change de props : au lieu de recevoir `amountPaid`/`paymentMethod`/`checkedInAt` épars, il reçoit le `Session` complet (l'union) et, pour le parcours abonné, le nom du client résolu séparément (le composant ne doit pas dépendre de `ClientsProvider` pour rester un composant de présentation pur) :

```typescript
export function SessionConfirmation({
  session,
  clientName,
}: {
  session: Session
  clientName?: string // fourni uniquement pour session.type === 'subscriber'
}) {
  ...
}
```

Contenu affiché, commun aux deux parcours : identifiant de séance (`session.id`), date et heure (`session.checkedInAt`), montant (`session.amountPaid`), mode de paiement (`session.paymentMethod`) — c'est le socle qui satisfait l'exigence de traçabilité du cahier des charges pour les deux parcours.

Contenu additionnel par narrowing sur `session.type` :
- `subscriber` → nom du client (`clientName`, passé par l'appelant).
- `visitor` → `session.fullName` et `session.phoneNumber`.

Toujours pas de génération PDF, pas de bouton de partage (hors périmètre, sous-projet 9) — l'écran lui-même sert de "ticket" au sens de la traçabilité affichée, comme demandé.

## Erreurs et cas limites

- Formulaire visiteur soumis avec nom ou téléphone vide → validation inline (champ obligatoire), pas de `VisitorSession` créée tant que les deux champs ne sont pas renseignés — même rigueur que les formulaires existants (`ClientForm`).
- Recherche abonné sans résultat → inchangé (état vide inline, pas de création de client inline, pas de bascule automatique vers le parcours visiteur — le personnel choisit explicitement le bon bouton dès le départ).
- Un même visiteur revient plusieurs fois (même nom/téléphone saisi à nouveau) → autorisé sans avertissement, chaque passage crée une `VisitorSession` indépendante ; aucune détection de doublon n'est construite (cohérent avec « pas de fiche visiteur », hors périmètre ci-dessus).
- Abonnement `expired`/`suspended`/`none` affiché pendant la sélection du client dans le parcours abonné → n'empêche jamais la confirmation ; c'est strictement un affichage informatif, pas une garde métier.
- Double-clic sur "Confirmer" (les deux parcours) → pas de garde anti-double-soumission, cohérent avec le niveau de rigueur déjà appliqué au reste du CRUD mocké de ce sous-projet.

## Découpage global du projet (rappel, pour contexte)

1. ~~Fondations & Shell~~ — terminé
2. ~~Auth (V0 mockée)~~ — terminé
2b. API d'authentification (remplacement des mocks) — en cours, par un autre agent
3. ~~Gestion Clients~~ — terminé (`2026-07-13-gestion-clients-design.md`)
4. ~~Gestion Abonnements~~ — terminé (`2026-07-13-gestion-abonnements-design.md`)
5. **Gestion Séances journalières** ← ce document (révision 2 : ajout du parcours visiteur occasionnel)
6. Scan QR
7. Interface Client (portail mobile complet)
8. Statistiques
9. Paramètres, Notifications, Reçus PDF

Chaque sous-projet suivant aura son propre cycle brainstorming → spec → plan.
