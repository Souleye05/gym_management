# Scan QR — Design

**Date :** 2026-07-14
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

### `lib/clients/search.ts` (nouveau)

Regroupe toutes les méthodes de résolution d'un client, y compris celle nécessaire au scan :

```typescript
import type { Client } from './types'

export function findClientByCardNumber(clients: Client[], cardNumber: string): Client | undefined {
  return clients.find((c) => c.cardNumber === cardNumber.trim())
}

export function findClientsByQuery(clients: Client[], query: string): Client[] {
  // logique déjà existante, extraite depuis ClientSearch / la page /clients pour être réutilisable
}
```

`findClientsByQuery` factorise le prédicat de filtre nom/téléphone déjà dupliqué entre `components/sessions/client-search.tsx` et `app/(staff)/clients/page.tsx` — ce sous-projet en profite pour centraliser toutes les méthodes de recherche client au même endroit, cohérent avec la remarque de regroupement par domaine.

## Composants

### `components/scan/qr-scanner.tsx` (nouveau)

```typescript
'use client'

export type QrScannerError = 'permission-denied' | 'no-camera' | 'unsupported'

export function QrScanner({
  active,
  onDetect,
  onError,
}: {
  active: boolean
  onDetect: (value: string) => void
  onError?: (error: QrScannerError) => void
}) { ... }
```

Composant strictement mécanique : accès `getUserMedia`, boucle `requestAnimationFrame` + `jsQR` sur les frames vidéo. Ne décide d'aucun affichage d'erreur ni de logique métier — se contente de rapporter ce qu'il observe via `onDetect`/`onError`. Toute décision (message affiché, repli sur saisie manuelle) reste dans le composant appelant.

**Anti-double-détection** : après un premier `onDetect` réussi, le composant cesse d'analyser les frames tant que `active` ne repasse pas par un cycle `false → true` (ou tant qu'un flag interne "en attente" n'est pas réinitialisé par le parent, à trancher précisément dans le plan). Le contrat côté consommateur est simple : recevoir un `onDetect`, cesser d'afficher le flux caméra, traiter le résultat ; un bouton explicite "Nouveau scan" est nécessaire pour rearmer la détection. Ceci évite qu'un badge immobile devant la caméra déclenche plusieurs enregistrements de séance.

`active` contrôle aussi le cycle de vie de la caméra (coupe le flux vidéo proprement quand le composant n'est plus affiché — dialog fermé, navigation hors de `/scan`).

### `components/scan/client-qr-code.tsx` (nouveau)

Composant minimal affiché sur `/clients/[id]` : encode `client.cardNumber` en QR (bibliothèque `qrcode`, rendu canvas), numéro affiché en clair dessous. Aucune donnée additionnelle encodée. Sert uniquement à disposer d'un QR testable en l'absence du portail client (sous-projet 7).

### `components/scan/client-identification.tsx` (nouveau, partagé)

Composant orchestrant les trois méthodes d'identification (onglets ou sélecteur) et exposant un résultat unique au parent :

```typescript
export function ClientIdentification({
  clients,
  onIdentified,
}: {
  clients: Client[]
  onIdentified: (client: Client) => void
}) { ... }
```

Contient : `QrScanner` (avec repli saisie manuelle du `cardNumber` si `onError` signale `permission-denied`/`no-camera`), un champ de saisie directe du `cardNumber`, et `ClientSearch` (existant, réutilisé tel quel pour la méthode nom/téléphone). Les trois méthodes appellent en interne `findClientByCardNumber` ou `findClientsByQuery` puis `onIdentified(client)` une fois résolu — le parent (page `/scan` ou dialog séance) ne connaît que le `Client` final, jamais la méthode utilisée pour l'obtenir.

## Écrans

### `app/(staff)/scan/page.tsx` (remplace le stub)

```
ClientIdentification (plein écran, QR actif par défaut)
  → onIdentified(client)
    → getCurrentSubscription(client.id)
    → checkSessionEligibility(subscription)
      → allowed: true  → bouton "Enregistrer la séance" actif → recordSubscriberSession → confirmation
      → allowed: false → bouton désactivé, message selon `reason`, lien vers /seances (Nouvelle séance journalière)
  → bouton "Nouveau scan" → réinitialise l'identification
```

Aucune étape de paiement : un abonné qui pointe sa séance ne paie rien à ce moment (le paiement a eu lieu à la souscription/au renouvellement de l'abonnement). Ceci corrige une erreur du brouillon initial de ce design, qui calquait à tort le flux visiteur (paiement à chaque passage) sur le flux abonné (déjà payé via son abonnement).

### Dialog "Enregistrer la séance d'un abonné" sur `/seances`

Remplace l'étape de recherche actuelle (`ClientSearch` seul) par `ClientIdentification` (les trois méthodes). Une fois `onIdentified(client)` déclenché, **même séquence** que sur `/scan` : `checkSessionEligibility` → bouton actif/désactivé selon le résultat, message identique, lien identique vers le flux séance journalière si bloqué. Le reste du dialog (étape paiement pour... — non, voir note ci-dessous) ne change pas de structure au-delà de l'insertion de cette vérification avant l'étape de confirmation.

**Note de cohérence** : le dialog séance abonné existant sur `/seances` n'a jamais eu d'étape "paiement" à proprement parler pour le parcours abonné — seule la sélection du mode de paiement (`PaymentMethodPicker`) était présente avant confirmation, cohérente avec le fait qu'un abonné ne paie rien lors de l'enregistrement lui-même (`recordSubscriberSession` ne prend pas de montant en entrée). Ce point est déjà correct dans le code livré ; ce sous-projet n'y touche pas au-delà d'insérer la vérification d'éligibilité avant que ce mode de paiement ne soit choisi.

### `/clients/[id]` — ajout du QR

Ajout de `ClientQrCode` sur la fiche client existante, probablement dans la carte d'en-tête (à côté du `cardNumber` déjà affiché) — emplacement précis à trancher dans le plan, aucune autre section de cette page n'est modifiée.

## Erreurs et cas limites

- QR scanné ne correspond à aucun `cardNumber` connu → message "Carte non reconnue", le scanner reste actif pour un nouvel essai (pas besoin de cliquer "Nouveau scan" dans ce cas précis, puisqu'aucune détection valide n'a eu lieu côté métier).
- Caméra refusée ou indisponible (`onError`) → repli automatique sur le champ de saisie manuelle du `cardNumber`, même chemin de résolution ensuite (`findClientByCardNumber`).
- Même QR détecté plusieurs fois d'affilée (badge immobile devant la caméra) → le scanner cesse toute nouvelle détection après le premier `onDetect` réussi jusqu'à réinitialisation explicite ("Nouveau scan") — empêche les doubles enregistrements de séance.
- Client identifié sans abonnement (`none`) → traité de façon identique à `expired`/`suspended` par `checkSessionEligibility`, même blocage, même message orienté vers le flux séance journalière.
- Recherche nom/téléphone renvoyant un client inéligible → même blocage que le scan (rupture de comportement assumée ci-dessus), pas de traitement spécial.
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
