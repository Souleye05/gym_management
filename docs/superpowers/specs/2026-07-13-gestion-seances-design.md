# Gestion Séances journalières — Design

**Date :** 2026-07-13
**Sous-projet :** 5 / 9 (voir découpage global en fin de document)
**Statut :** Approuvé

## Contexte

Le cahier des charges (§2.2) décrit un besoin non couvert aujourd'hui : les séances journalières (paiement unique à l'entrée, sans abonnement) ne font l'objet d'aucun suivi numérique — le personnel dépend d'un cahier papier. Deux stubs existent déjà et sont explicitement réservés à ce sous-projet : la page `app/(staff)/seances/page.tsx` ("L'enregistrement et l'historique des séances arrivent bientôt") et la carte "Historique des séances" sur `/clients/[id]` ("sera disponible avec la gestion des séances").

Ce sous-projet introduit un modèle `Session` (une entrée payante datée, liée à un client), un `SessionsProvider`, et une première brique de configuration applicative (`SettingsProvider`) pour le tarif de la séance — posée ici en prévision du sous-projet 9 (Paramètres).

## Objectif

- Nouveau modèle `Session` (client, montant payé, mode de paiement, horodatage), relié à un `Client` par `clientId`.
- Le client doit être une fiche existante — pas de walk-in sans profil ; la recherche se fait par nom/téléphone comme le décrit le cahier des charges.
- Une séance peut être enregistrée pour n'importe quel client, quel que soit son statut d'abonnement (pas de blocage métier).
- Le tarif de la séance n'est **pas** une constante codée en dur : il vient d'une configuration applicative (`lib/settings/`, `SettingsProvider`), copiée dans `Session.amountPaid` au moment de la création et figée définitivement ensuite.
- Page `/seances` (remplace le stub) : liste des séances du jour, avec recherche/enregistrement d'une nouvelle séance.
- Section "Historique des séances" sur `/clients/[id]` (remplace le stub) : historique complet du client, avec enregistrement rapide depuis la fiche.
- Écran de confirmation post-paiement (récap, pas de PDF).

## Hors périmètre (explicitement exclu de ce sous-projet)

- Walk-in sans fiche client — un client doit exister avant d'enregistrer une séance ; s'il n'a pas de fiche, le personnel la crée d'abord via le flux `/clients` existant.
- Blocage/avertissement si le client a un abonnement actif — enregistrement toujours libre, aucune règle métier de ce type.
- Écran Paramètres complet pour modifier le tarif — `SettingsProvider` expose déjà `updateSettings`, mais aucune UI d'administration n'est construite dans ce sous-projet (sous-projet 9).
- Génération de reçu PDF, SMS de confirmation, partage — écran de confirmation seulement (sous-projet 9, Reçus PDF).
- Historique multi-jours sur `/seances` (filtre par date, pagination) — la liste est strictement "aujourd'hui uniquement" dans ce sous-projet.
- Statistiques (nombre de passages/jour, revenus) — alimentées par ces données mais construites au sous-projet 8.
- Paiement en ligne — paiement comptant déclaratif uniquement (mode de paiement enregistré, aucune validation réelle), conforme au cahier des charges V0.
- Persistance `localStorage`/API réelle — état React en mémoire, comme `ClientsProvider`/`SubscriptionsProvider`.

## Modèle de données

```typescript
// lib/sessions/types.ts
import type { PaymentMethod } from '@/lib/subscriptions/types'

export type Session = {
  id: string
  clientId: string
  amountPaid: number      // copié depuis settings.sessionPrice au moment de la création, jamais modifié après coup
  paymentMethod: PaymentMethod
  checkedInAt: string     // ISO datetime string (date + heure de l'entrée)
}
```

```typescript
// lib/settings/types.ts
export type AppSettings = {
  sessionPrice: number
}
```

```typescript
// lib/settings/mock-settings.ts
export const DEFAULT_SETTINGS: AppSettings = {
  sessionPrice: 8,
}
```

`Session` réutilise `PaymentMethod` (`'cash' | 'card' | 'mobile_money'`) déjà défini dans `lib/subscriptions/types.ts` — pas de redéfinition. `Session` ne stocke aucun statut : une séance est un fait accompli dès sa création, rien à dériver.

`lib/settings/` est un module générique et minimal (un seul champ aujourd'hui) — il n'appartient pas à `lib/sessions/` afin que le sous-projet 9 (Paramètres) puisse l'étendre sans toucher au domaine séances. C'est la même séparation de responsabilités que `Client`/`Subscription` : chaque domaine ne connaît que ce qui le concerne directement.

## Gestion d'état

### `components/providers/settings-provider.tsx`

```typescript
type SettingsContextValue = {
  settings: AppSettings
  updateSettings(patch: Partial<AppSettings>): void
}
```

Contexte React, état en mémoire, seedé depuis `DEFAULT_SETTINGS`. `updateSettings` fusionne le patch dans l'état courant (`setSettings(prev => ({ ...prev, ...patch }))`). Monté dans `app/(staff)/layout.tsx`, au même niveau que `ClientsProvider`/`SubscriptionsProvider` (settings est un concept transverse, pas propre aux séances).

### `components/providers/sessions-provider.tsx`

```typescript
type SessionsContextValue = {
  sessions: Session[]
  recordSession(input: { clientId: string; paymentMethod: PaymentMethod }): Session
  getSessionsForClient(clientId: string): Session[]   // historique complet, plus récent en premier
  getSessionsForToday(): Session[]                     // séances dont checkedInAt tombe le jour courant
}
```

Même pattern que `SubscriptionsProvider` : contexte React, état en mémoire seedé depuis un mock de départ, ajout uniquement (jamais de modification/suppression d'une séance existante).

`recordSession` lit `settings.sessionPrice` via `useSettings()` (le provider consomme le contexte Settings — `SessionsProvider` doit donc être monté à l'intérieur ou après `SettingsProvider` dans l'arbre), construit :

```typescript
{
  id: generateId(),
  clientId: input.clientId,
  amountPaid: settings.sessionPrice,
  paymentMethod: input.paymentMethod,
  checkedInAt: new Date().toISOString(),
}
```

et l'ajoute à la liste (`[...prev, created]`). Le tarif est donc **copié** au moment T, jamais recalculé après coup — si l'administrateur change `sessionPrice` plus tard, les séances déjà enregistrées conservent leur `amountPaid` d'origine.

`getSessionsForToday()` filtre `sessions` sur `checkedInAt` correspondant à la date du jour (comparaison année/mois/jour en heure locale, pas une fenêtre glissante de 24h).

`getSessionsForClient(clientId)` trie par `checkedInAt` décroissant.

Mock de départ (`lib/sessions/mock-sessions.ts`) : quelques séances réparties sur les derniers jours (dont certaines aujourd'hui, pour que `/seances` ne soit pas vide au premier chargement) pour 3-4 clients mockés existants, montants cohérents avec `DEFAULT_SETTINGS.sessionPrice`.

## Écrans

### `app/(staff)/seances/page.tsx` — Liste du jour

Remplace le stub. Contenu :
- En-tête avec le nombre de séances du jour et un bouton "Enregistrer une séance".
- Table des séances d'aujourd'hui (`getSessionsForToday()`) : Client (nom, clic → fiche client), Heure, Montant, Mode de paiement.
- Vide → `EmptyState` ("Aucune séance aujourd'hui").
- Pas de filtre de date dans ce sous-projet (liste strictement "aujourd'hui").

Le bouton "Enregistrer une séance" ouvre un `Dialog` avec :
1. Recherche de client par nom/téléphone (réutilise le pattern de recherche de `/clients` — champ texte, filtrage en mémoire sur `clients`).
2. Sélection du client dans les résultats.
3. Sélection du mode de paiement (Espèces / Carte / Mobile Money).
4. Bouton de confirmation → appelle `recordSession`, ferme le dialog, affiche l'écran de confirmation.

Aucun résultat de recherche → état vide inline ("Aucun client trouvé"), pas de création de client inline (cohérent avec "client existant obligatoire" — le personnel va sur `/clients` créer la fiche si besoin, puis revient).

### Section "Historique des séances" sur `/clients/[id]`

Remplace le stub existant (la carte reste à sa place actuelle dans la grille, à côté de la carte Abonnement) :
- Liste des séances du client (`getSessionsForClient(client.id)`) : date, heure, montant, mode de paiement. Triée du plus récent au plus ancien.
- Vide → message inline ("Aucune séance enregistrée"), même pattern que l'historique abonnement vide.
- Bouton "Enregistrer une séance" : ouvre directement la sélection du mode de paiement (le client est déjà connu, pas d'étape de recherche) → confirmation → appelle `recordSession({ clientId: client.id, paymentMethod })`.

### Écran de confirmation post-paiement

Après `recordSession` réussi : `Dialog` ou état inline récapitulant client, montant, mode de paiement, heure — pas de génération PDF, pas de SMS, pas de bouton de partage (hors périmètre, sous-projet 9). Mêmes composants visuels que `SubscriptionConfirmation` (nouveau composant `components/sessions/session-confirmation.tsx`, structure similaire).

## Erreurs et cas limites

- Recherche client sans résultat → état vide inline dans le dialog, pas une erreur bloquante.
- Client déjà venu plusieurs fois le même jour → autorisé sans avertissement ; chaque passage est une séance distincte (le cahier des charges ne prévoit aucune restriction de ce type).
- Double-clic sur "Confirmer" → pas de garde anti-double-soumission dans ce sous-projet, cohérent avec le niveau de rigueur déjà appliqué au CRUD abonnements.
- `settings.sessionPrice` modifié entre deux séances → chaque `recordSession` lit la valeur courante au moment de l'appel ; les séances déjà enregistrées ne sont jamais recalculées.
- `SessionsProvider` monté sans `SettingsProvider` au-dessus dans l'arbre → erreur de développement à la compilation logique (contexte `undefined`), à éviter simplement en respectant l'ordre de montage documenté ci-dessus dans `app/(staff)/layout.tsx`.

## Découpage global du projet (rappel, pour contexte)

1. ~~Fondations & Shell~~ — terminé
2. ~~Auth (V0 mockée)~~ — terminé
2b. API d'authentification (remplacement des mocks) — en cours, par un autre agent
3. ~~Gestion Clients~~ — terminé (`2026-07-13-gestion-clients-design.md`)
4. ~~Gestion Abonnements~~ — terminé (`2026-07-13-gestion-abonnements-design.md`)
5. **Gestion Séances journalières** ← ce document
6. Scan QR
7. Interface Client (portail mobile complet)
8. Statistiques
9. Paramètres, Notifications, Reçus PDF

Chaque sous-projet suivant aura son propre cycle brainstorming → spec → plan.
