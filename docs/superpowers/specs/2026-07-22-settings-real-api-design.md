# Branchement de Settings sur l'API réelle — Design

**Date :** 2026-07-22
**Statut :** Approuvé

## Contexte

Premier des 3 sous-projets remplaçant le CRUD staff Abonnements/Séances entièrement mocké par le vrai backend `memberships`/`settings` désormais livré (`docs/superpowers/specs/2026-07-21-staff-memberships-crud-design.md`). Ordre choisi selon la chaîne de dépendance réelle des providers frontend : `SettingsProvider` (autonome) → `SubscriptionsProvider` (autonome) → `SessionsProvider` (dépend des deux). Ce document couvre uniquement `SettingsProvider` et `/parametres`.

**Découverte utile faite en explorant le code** : `/parametres` n'est aujourd'hui qu'un `EmptyState` placeholder — aucune UI d'édition n'existe encore, alors que le backend a déjà livré `GET`/`PATCH /api/settings` (ce dernier réservé au rôle ADMIN via la permission `settings:update`). Autre découverte : `lib/auth/permissions.ts` dérive aujourd'hui les permissions **côté client** à partir du rôle (`ROLE_PERMISSIONS[role]`, dans `lib/auth/auth-service.ts`), avec une permission nommée `settings:manage` — qui ne correspond pas au nom réel `settings:update` utilisé par le backend.

## Décisions retenues (validées en session)

- **Périmètre étendu à une vraie UI d'édition sur `/parametres`**, pas seulement le branchement en lecture — le backend a livré `PATCH /api/settings` spécifiquement pour ce cas d'usage, autant en profiter maintenant plutôt que de laisser le placeholder.
- **Vue AGENT (non-ADMIN)** : lecture seule du tarif de séance actuel, pas de formulaire d'édition — reste une information utile au quotidien sans donner accès à la modification.
- **Vue ADMIN** : lecture seule identique, plus un formulaire d'édition sous l'affichage.
- **Renommage ciblé `settings:manage` → `settings:update`** dans `lib/auth/permissions.ts`, pour matcher exactement le nom de permission backend et permettre au frontend de gater correctement le formulaire d'édition. Aucun autre changement au système de permissions (dérivation côté client depuis le rôle, les 6 autres permissions) — question distincte, hors périmètre.
- **`SettingsProvider` réécrit sur React Query**, même architecture que `ClientsProvider`/`MyProfileProvider` (`useQuery` pour la lecture, `useMutation` pour la mise à jour avec callbacks `{onSuccess?, onError?}`, invalidation du cache au succès).
- **`lib/settings/mock-settings.ts` supprimé** une fois `SettingsProvider` réécrit — plus aucun importeur.
- **Aucune nouvelle route ni composant `ui/`** — tout tient dans `app/(staff)/parametres/page.tsx`.

## Architecture

`lib/settings/fetch-settings.ts` (nouveau, même pattern que `lib/clients/fetch-clients.ts`) expose `fetchSettings(): Promise<AppSettings>` et `updateSettingsRequest(input: { sessionPrice: number }): Promise<AppSettings>`, déballant l'enveloppe `{success, data: {settings}, message, errors}` — forme confirmée par le backend (`GET`/`PATCH /api/settings` renvoient tous deux `200 { settings }`).

`components/providers/settings-provider.tsx` :
```ts
type SettingsContextValue = {
  settings: AppSettings | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => void
  updateSettings(input: { sessionPrice: number }, opts?: { onSuccess?: () => void; onError?: (message: string) => void }): void
  isUpdating: boolean
}
```
`settings: AppSettings | undefined` (pas de valeur par défaut synthétique) — les consommateurs (`SessionsProvider`, futur sous-projet ; `/parametres`) gèrent `isLoading`/`isError` explicitement, même discipline que `ClientsProvider`.

`app/(staff)/parametres/page.tsx` :
- `isLoading`/`isError` standard (message + "Réessayer") avant tout rendu de contenu.
- Affichage lecture seule du tarif de séance actuel (visible ADMIN et AGENT).
- Si `useCurrentUser().permissions.includes('settings:update')` : formulaire d'édition sous l'affichage (champ numérique `sessionPrice`, bouton "Enregistrer", `isSubmitting` désactive le bouton, erreur serveur affichée inline si le backend rejette la valeur — ex. prix négatif/zéro, validé côté backend par Zod).

`lib/auth/permissions.ts` : `'settings:manage'` → `'settings:update'` dans le type `Permission` et dans `ROLE_PERMISSIONS` (reste réservé au rôle `admin`, `agent` continue de ne pas l'avoir).

## Gestion des erreurs

| Cas | Comportement |
|---|---|
| Chargement initial des paramètres échoue | `isError: true`, message + bouton "Réessayer" (même pattern que `ClientsProvider`) |
| Mise à jour du tarif échoue (validation backend, ex. valeur négative) | `onError` reçoit le message backend, affiché sous le champ du formulaire, pas de fermeture/reset du formulaire |
| Utilisateur sans permission `settings:update` | Formulaire jamais rendu — pas de tentative de soumission possible côté UI (le backend refuserait de toute façon avec 403, mais l'UI ne doit pas laisser croire que l'action est possible) |

## Hors périmètre

- Toute modification du contrat backend (`GET`/`PATCH /api/settings`) — déjà livré, inchangé.
- Réconciliation plus large du système de permissions frontend (dérivation côté client depuis le rôle plutôt que depuis une vraie réponse backend ; les 6 autres permissions mockées) — question architecturale distincte, non traitée ici.
- `SubscriptionsProvider`/`SessionsProvider` réels — sous-projets suivants, dans cet ordre.
- Tout autre paramètre au-delà de `sessionPrice` — `AppSettings` n'a qu'un seul champ aujourd'hui.
