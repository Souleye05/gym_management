# Scan QR — Design

**Date :** 2026-07-14 (révisé)
**Sous-projet :** 6 / 9 (voir découpage global en fin de document)
**Statut :** Approuvé

## Contexte

Le cahier des charges décrit le scan QR comme le moyen d'identification rapide d'un client abonné, avec deux usages précis (§2.4, priorité Haute) : « Scan QR code — Recherche par nom, numéro de téléphone ou numéro de carte » et « Vérification instantanée du statut du client via scan de la carte numérique ». Le critère d'acceptation associé fixe un objectif de rapidité : « Un agent de caisse peut vérifier le statut d'un client en moins de 10 secondes via scan ou recherche. »

Un stub existe déjà à `app/(staff)/scan/page.tsx`. Le champ `Client.cardNumber` existe déjà (généré automatiquement à la création du client, ex. `CARD-00001`) et a été explicitement réservé comme identifiant QR dans le design de Gestion Clients. Le design de Gestion Séances mentionnait déjà le QR comme méthode de recherche future dans le dialog d'enregistrement de séance abonné, reportée à ce sous-projet.

## Principe directeur (contrainte structurante de ce design)

**Le QR code, la saisie du numéro de carte, et la recherche nom/téléphone sont trois méthodes d'identification strictement équivalentes.** Aucune règle métier ne dépend de la méthode utilisée pour identifier le client — seule l'expérience utilisateur (plein écran, vitesse, boutons affichés) diffère entre les écrans. Une fois un `Client` identifié, tous les écrans appellent la **même** fonction de vérification d'éligibilité avant de proposer l'enregistrement d'une séance.

**Le QR code ne contient qu'un identifiant, jamais de donnée métier.** Le contenu encodé est exactement la chaîne `cardNumber` (ex. `CARD-00001`) — pas de JSON, pas de JWT, pas de signature. Toutes les données affichées (nom, statut d'abonnement) sont récupérées après résolution du `cardNumber` dans l'application, à la lecture. Cela signifie qu'un QR reste valable même si le nom du client change ou si son abonnement est renouvelé — il ne transporte qu'une référence stable, jamais un instantané de données.

## Rupture de comportement assumée (à valider avec attention)

Ce sous-projet **corrige un comportement déjà livré** dans le sous-projet Gestion Séances : la recherche nom/téléphone dans le dialog "Enregistrer la séance d'un abonné" sur `/seances` était jusqu'ici **non bloquante** quel que soit le statut d'abonnement (décision explicite du sous-projet précédent). Cette révision introduit une règle d'éligibilité unique appliquée à **toutes** les méthodes d'identification, y compris la recherche nom/téléphone existante — qui devient donc bloquante dans les mêmes conditions que le scan QR. C'est une conséquence directe du principe directeur ci-dessus : si le mode d'identification ne doit jamais changer la règle métier, la règle doit s'appliquer partout où elle s'applique quelque part.

Second changement de signature sur du code déjà livré : `SessionsProvider.recordSubscriberSession` passe d'un retour inconditionnel (`SubscriberSession`) à un retour pouvant échouer (`RecordSubscriberSessionResult`, voir plus bas), puisque la vérification d'éligibilité doit être imposée par le service et non seulement par l'UI. Le seul appelant existant (`app/(staff)/clients/[id]/page.tsx`, bouton "Enregistrer une séance" sur la fiche client) doit être adapté pour gérer les deux branches — à traiter explicitement comme tâche du plan, pas comme un simple détail d'implémentation.

## Objectif

- Fonction centralisée `checkSessionEligibility(subscription)` dans le domaine `lib/sessions/`, utilisée par tous les points d'entrée d'enregistrement de séance abonné.
- Trois méthodes d'identification convergentes : scan QR (caméra), saisie manuelle du numéro de carte, recherche nom/téléphone (existante).
- Page `/scan` dédiée (remplace le stub) : identification → vérification d'éligibilité → enregistrement de séance si éligible.
- Le dialog "Enregistrer la séance d'un abonné" sur `/seances` gagne les trois méthodes d'identification et applique la même vérification d'éligibilité.
- Génération d'un QR code minimal sur la fiche client (`/clients/[id]`), nécessaire pour pouvoir tester le scan de bout en bout en l'absence du sous-projet 7 (portail client, où la vraie "carte numérique" sera livrée).

## Hors périmètre (explicitement exclu de ce sous-projet)

- Génération d'une véritable "carte numérique" avec mise en page dédiée, partage, export — le QR sur la fiche client est un utilitaire de test minimal, pas une fonctionnalité livrable du portail client (sous-projet 7).
- Sécurisation cryptographique du contenu du QR (signature, expiration du code lui-même, rotation) — le `cardNumber` en clair est jugé suffisant pour cette V0 ; la vraie sécurité viendra du serveur (sous-projet 2b / API réelle), pas du contenu du QR.
- Élargissement de `checkSessionEligibility` au-delà des 5 statuts déjà modélisés (paiement en attente, blocage administratif, accès VIP, quota de séances, période de grâce) — la signature `(subscription: Subscription | undefined) => SessionEligibility` est conçue pour absorber ces règles plus tard sans rupture d'API, mais aucune n'est implémentée ici.
- Recherche par numéro de téléphone/carte dans un scan multi-format (code-barres, NFC) — uniquement QR (`jsQR`), conforme au cahier des charges.
- Historique des scans, logs d'accès dédiés — hors périmètre, pas mentionné au cahier des charges pour ce sous-projet.

## Modèle de données et logique métier

### `lib/sessions/eligibility.ts` (nouveau)

```typescript
import { computeSubscriptionStatus } from '@/lib/subscriptions/status'
import type { Subscription } from '@/lib/subscriptions/types'

export type SessionEligibility =
  | { allowed: true }
  | { allowed: false; reason: 'expired' | 'suspended' | 'none' }

export function checkSessionEligibility(subscription: Subscription | undefined): SessionEligibility {
  if (!subscription) return { allowed: false, reason: 'none' }
  const status = computeSubscriptionStatus(subscription)
  if (status === 'expired' || status === 'suspended') return { allowed: false, reason: status }
  return { allowed: true } // 'active' | 'expiring'
}
```

Reçoit l'abonnement courant brut (obtenu via `getCurrentSubscription(clientId)`, déjà exposé par `SubscriptionsProvider`) plutôt qu'un `ClientStatus` déjà calculé — recalcule elle-même le statut via `computeSubscriptionStatus` (fonction existante, inchangée). Ce choix de signature évite une double source de vérité et permet à cette fonction d'évoluer (accès à `startDate`, `suspended`, `amountPaid`, etc.) sans jamais changer sa signature publique si de nouvelles règles apparaissent plus tard.

Placée dans `lib/sessions/` (et non `lib/clients/` ni `lib/subscriptions/`) car il s'agit d'une règle métier concernant l'accès à une séance, pas la gestion des clients ni celle des abonnements — cohérent avec la séparation déjà en place entre ces trois domaines.

### La règle est appliquée par le service, pas seulement par l'UI

L'UI désactive le bouton "Enregistrer la séance" quand `checkSessionEligibility` renvoie `allowed: false` — mais un bouton désactivé n'est qu'une commodité d'interface, pas une garantie. `SessionsProvider.recordSubscriberSession` doit lui-même appeler `checkSessionEligibility` avant de créer l'enregistrement, et refuser (retourner une erreur, ne rien créer) si le résultat est `allowed: false`, indépendamment de ce que l'UI a déjà vérifié. Ainsi la règle reste valable même appelée directement (tests, un futur endpoint API, un futur client mobile) sans passer par un écran qui aurait pu désactiver le mauvais bouton ou en oublier un.

Ceci fait évoluer la signature de `recordSubscriberSession` pour qu'elle retourne un résultat pouvant échouer plutôt qu'un `SubscriberSession` inconditionnel :

```typescript
type RecordSubscriberSessionResult =
  | { ok: true; session: SubscriberSession }
  | { ok: false; eligibility: SessionEligibility & { allowed: false } }

recordSubscriberSession(input: { clientId: string; paymentMethod: PaymentMethod }): RecordSubscriberSessionResult
```

C'est un changement de signature pour une méthode déjà livrée (sous-projet Séances) — à traiter comme telle dans le plan (tous les appelants existants doivent être mis à jour pour gérer les deux branches). En pratique l'UI ne devrait jamais recevoir la branche `ok: false` puisqu'elle a déjà désactivé le bouton correspondant — mais le type le rend explicite et vérifiable plutôt qu'une simple convention non appliquée.

### `lib/clients/repository.ts` (nouveau) et recherche

Plutôt que d'interroger directement le tableau `clients` en mémoire depuis les composants, la résolution d'un client passe par une interface de repository — même si l'implémentation reste en mémoire aujourd'hui :

```typescript
// lib/clients/repository.ts
import type { Client } from './types'

export type ClientRepository = {
  findByCardNumber(cardNumber: string): Client | undefined
  search(query: string): Client[]
}

export function createInMemoryClientRepository(clients: Client[]): ClientRepository {
  return {
    findByCardNumber: (cardNumber) => clients.find((c) => c.cardNumber === cardNumber.trim()),
    search: (query) => {
      // logique déjà existante, extraite depuis ClientSearch / la page /clients pour être réutilisable
    },
  }
}
```

`ClientsProvider` expose une instance de ce repository (recréée à chaque changement de `clients`, ou mémoïsée) plutôt que le tableau brut pour les besoins de recherche. Ceci isole la façon dont un client est retrouvé de la façon dont il est stocké — quand `ClientsProvider` sera remplacé par un client Prisma/API, `ClientRepository` devient une implémentation HTTP sans que `ClientIdentification` ni la page `/scan` n'aient à changer. `search()` factorise au passage le prédicat de filtre nom/téléphone déjà dupliqué entre `components/sessions/client-search.tsx` et `app/(staff)/clients/page.tsx`.

## Composants

### `components/scan/qr-scanner.tsx` (nouveau)

```typescript
'use client'

export type QrScannerError = 'permission-denied' | 'no-camera' | 'unsupported' | 'unreadable'

export type QrScannerHandle = {
  reset: () => void
}

export const QrScanner = forwardRef<QrScannerHandle, {
  active: boolean
  onDetect: (value: string) => void
  onError?: (error: QrScannerError) => void
}>(function QrScanner({ active, onDetect, onError }, ref) { ... })
```

Composant strictement mécanique : accès `getUserMedia`, boucle `requestAnimationFrame` + `jsQR` sur les frames vidéo. Ne décide d'aucun affichage d'erreur ni de logique métier — se contente de rapporter ce qu'il observe via `onDetect`/`onError`. Toute décision (message affiché, repli sur saisie manuelle) reste dans le composant appelant.

**Anti-double-détection, pilotée explicitement** : après un premier `onDetect` réussi, le composant cesse d'analyser les frames — pas de nouvelle détection tant que le parent n'a pas appelé `reset()` via la ref. Contrairement à un pilotage indirect par `active` (qui mélangerait "caméra allumée/éteinte" avec "prêt à détecter/en attente"), `reset()` exprime l'intention sans ambiguïté : le composant sait remettre son propre état de détection à zéro sur demande explicite, tandis que `active` continue de ne gérer que le cycle de vie de la caméra (flux vidéo coupé proprement quand `active` passe à `false` — dialog fermé, navigation hors de `/scan`). Un bouton "Nouveau scan" côté parent appelle `reset()`.

**QR illisible vs QR reconnu comme invalide — deux cas distincts** : `onError('unreadable')` signale qu'aucun QR n'a pu être décodé dans le flux (image floue, pas de code dans le cadre, format non pris en charge) — situation transitoire et normale pendant le positionnement de la caméra, ne mérite pas de message d'erreur intrusif. À l'inverse, un QR parfaitement décodé mais dont le `cardNumber` ne correspond à aucun client (`findByCardNumber` renvoie `undefined`) n'est PAS une erreur du scanner — c'est un résultat métier normal transmis via `onDetect` comme toute autre détection ; c'est au composant appelant (`ClientIdentification`) d'afficher "Carte non reconnue" dans ce cas, pas au `QrScanner` de le savoir.

### `components/scan/client-qr-code.tsx` (nouveau)

Composant minimal affiché sur `/clients/[id]` : encode `client.cardNumber` en QR (bibliothèque `qrcode`, rendu canvas), numéro affiché en clair dessous. Aucune donnée additionnelle encodée. Sert uniquement à disposer d'un QR testable en l'absence du portail client (sous-projet 7).

### `components/scan/client-identification.tsx` (nouveau, partagé)

Composant orchestrant les trois méthodes d'identification (onglets ou sélecteur) et exposant un résultat unique au parent :

```typescript
export function ClientIdentification({
  clientRepository,
  onIdentified,
}: {
  clientRepository: ClientRepository
  onIdentified: (client: Client) => void
}) { ... }
```

Contient : `QrScanner` (avec repli saisie manuelle du `cardNumber` si `onError` signale `permission-denied`/`no-camera`, et message discret — pas de blocage — sur `unreadable`), un champ de saisie directe du `cardNumber`, et `ClientSearch` (existant, réutilisé tel quel pour la méthode nom/téléphone). Les trois méthodes appellent `clientRepository.findByCardNumber(...)` ou `clientRepository.search(...)` puis `onIdentified(client)` une fois résolu — le parent (page `/scan` ou dialog séance) ne connaît que le `Client` final, jamais la méthode utilisée pour l'obtenir. Reçoit le repository en prop plutôt que le tableau `clients` brut, cohérent avec l'indirection introduite ci-dessus.

## Écrans

### `app/(staff)/scan/page.tsx` (remplace le stub)

```
ClientIdentification (plein écran, QR actif par défaut)
  → onIdentified(client)
    → getCurrentSubscription(client.id)
    → checkSessionEligibility(subscription)
      → allowed: true  → bouton "Enregistrer la séance" actif → recordSubscriberSession → confirmation
      → allowed: false → action(s) proposée(s) selon `reason` (voir tableau ci-dessous)
  → bouton "Nouveau scan" (appelle QrScanner.reset()) → réinitialise l'identification
```

### Actions proposées selon la raison de l'inéligibilité

Rediriger systématiquement vers "Nouvelle séance journalière" traite tous les cas d'inéligibilité comme équivalents, alors qu'ils appellent des réactions différentes de la part du personnel. Chaque `reason` propose donc l'action la plus naturelle pour ce cas précis :

| `reason` | Message affiché | Action(s) proposée(s) |
|---|---|---|
| `expired` | "Abonnement expiré." | Bouton "Renouveler l'abonnement" → ouvre le flux de renouvellement existant (celui de `/clients/[id]`, ou une variante accessible depuis `/scan` — à trancher dans le plan) |
| `none` | "Aucun abonnement." | Deux boutons : "Créer un abonnement" (flux existant) **et** "Nouvelle séance journalière" (flux visiteur existant, réutilisable même pour un client déjà fiché) |
| `suspended` | "Abonnement suspendu." | Bouton "Voir la fiche client" (renvoie vers `/clients/[id]`, où l'action "Réactiver" existe déjà) — pas de réactivation en un clic depuis `/scan`, une décision de suspension mérite d'être levée depuis la fiche complète, pas depuis un écran de passage rapide |

Ce tableau s'applique identiquement sur `/scan` et dans le dialog séance abonné sur `/seances` — seule la présentation (plein écran vs dans un dialog) diffère, conformément au principe directeur.

Aucune étape de paiement : un abonné qui pointe sa séance ne paie rien à ce moment (le paiement a eu lieu à la souscription/au renouvellement de l'abonnement). Ceci corrige une erreur du brouillon initial de ce design, qui calquait à tort le flux visiteur (paiement à chaque passage) sur le flux abonné (déjà payé via son abonnement).

### Dialog "Enregistrer la séance d'un abonné" sur `/seances`

Remplace l'étape de recherche actuelle (`ClientSearch` seul) par `ClientIdentification` (les trois méthodes). Une fois `onIdentified(client)` déclenché, **même séquence** que sur `/scan` : `checkSessionEligibility` → si éligible, sélection du mode de paiement puis confirmation (comportement déjà en place, inchangé) ; si non éligible, mêmes messages et mêmes actions différenciées par `reason` que le tableau ci-dessus. Le reste du dialog ne change pas de structure au-delà de l'insertion de cette vérification avant l'étape de sélection du mode de paiement.

**Note de cohérence** : le dialog séance abonné existant sur `/seances` n'a jamais eu d'étape "paiement" à proprement parler pour le parcours abonné — seule la sélection du mode de paiement (`PaymentMethodPicker`) était présente avant confirmation, cohérente avec le fait qu'un abonné ne paie rien lors de l'enregistrement lui-même (`recordSubscriberSession` ne prend pas de montant en entrée). Ce point est déjà correct dans le code livré ; ce sous-projet n'y touche pas au-delà d'insérer la vérification d'éligibilité avant que ce mode de paiement ne soit choisi.

### `/clients/[id]` — ajout du QR et alignement du bouton "Enregistrer une séance"

Ajout de `ClientQrCode` sur la fiche client existante, probablement dans la carte d'en-tête (à côté du `cardNumber` déjà affiché) — emplacement précis à trancher dans le plan.

Un quatrième point d'entrée existe déjà et doit être aligné sur le principe directeur : le bouton "Enregistrer une séance" de la carte "Historique des séances" sur cette même page appelle directement `recordSubscriberSession` (le client est déjà connu, aucune étape d'identification n'est nécessaire ici). Ce bouton doit lui aussi respecter `checkSessionEligibility` — puisque le service l'impose désormais lui-même (voir plus haut), ce point d'entrée reçoit automatiquement la même garantie sans changement de logique métier côté page ; seule la gestion de la réponse `{ ok: false, eligibility }` doit être ajoutée (afficher le même type de message que sur `/scan`, avec les mêmes actions différenciées par `reason` si l'espace de la carte le permet, ou a minima un message clair renvoyant vers l'action pertinente déjà présente sur cette page — "Renouveler"/"Réactiver" existent déjà juste à côté dans la carte Abonnement).

## Erreurs et cas limites

- QR lisible mais `cardNumber` décodé ne correspond à aucun client (`clientRepository.findByCardNumber` renvoie `undefined`) → message "Carte non reconnue" affiché par `ClientIdentification`, ce n'est pas une erreur du `QrScanner` (qui a fait son travail : décoder une chaîne) — le scanner appelle `reset()` automatiquement pour permettre un nouvel essai immédiat sans action du personnel.
- QR illisible/absent du cadre (`onError('unreadable')`) → aucun message intrusif, état transitoire normal pendant le positionnement de la caméra.
- Caméra refusée ou indisponible (`onError('permission-denied' | 'no-camera')`) → repli automatique sur le champ de saisie manuelle du `cardNumber`, même chemin de résolution ensuite (`clientRepository.findByCardNumber`).
- Même QR détecté plusieurs fois d'affilée (badge immobile devant la caméra) → le scanner cesse toute nouvelle détection après le premier `onDetect` réussi jusqu'à appel explicite de `reset()` — empêche les doubles enregistrements de séance.
- Client identifié sans abonnement (`none`) → actions dédiées ("Créer un abonnement" / "Nouvelle séance journalière"), voir tableau ci-dessus — pas de traitement identique à `expired`/`suspended`.
- Recherche nom/téléphone renvoyant un client inéligible → même blocage et mêmes actions différenciées que le scan (rupture de comportement assumée ci-dessus), pas de traitement spécial selon la méthode d'identification utilisée.
- `recordSubscriberSession` appelé alors que le service détermine `allowed: false` (ne devrait jamais arriver depuis l'UI, mais le type le permet) → retourne `{ ok: false, eligibility }`, aucun `SubscriberSession` créé ; l'appelant doit gérer cette branche même si elle reste inatteignable en pratique via l'UI livrée dans ce sous-projet.
- Client avec plusieurs abonnements passés → `getCurrentSubscription` (fonction existante, inchangée) détermine le bon, cohérent avec la règle "un seul abonnement courant par client" déjà établie au sous-projet Abonnements.

## Découpage global du projet (rappel, pour contexte)

1. ~~Fondations & Shell~~ — terminé
2. ~~Auth (V0 mockée)~~ — terminé
2b. API d'authentification (remplacement des mocks) — en cours, par un autre agent
3. ~~Gestion Clients~~ — terminé (`2026-07-13-gestion-clients-design.md`)
4. ~~Gestion Abonnements~~ — terminé (`2026-07-13-gestion-abonnements-design.md`)
5. ~~Gestion Séances journalières~~ — terminé (`2026-07-13-gestion-seances-design.md`, révisé pour le parcours visiteur)
6. **Scan QR** ← ce document
7. Interface Client (portail mobile complet)
8. Statistiques
9. Paramètres, Notifications, Reçus PDF

Chaque sous-projet suivant aura son propre cycle brainstorming → spec → plan.
