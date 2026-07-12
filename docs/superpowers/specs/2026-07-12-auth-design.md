# Auth (staff login + client OTP + route protection) — Design

**Date :** 2026-07-12
**Sous-projet :** 2 / 9 (voir découpage global en fin de document)
**Statut :** Approuvé

## Contexte

Le sous-projet précédent ("Fondations & Shell") a assemblé le shell admin et un dashboard fonctionnel sous `app/(staff)/*`, avec un utilisateur courant entièrement mocké en dur (`lib/current-user.ts` exporte une constante `currentUser` fixe, toujours "Admin Studio", rôle `admin`). Il n'existe aucune notion de "connecté/déconnecté" : n'importe qui accède à toutes les routes `(staff)` sans authentification, et aucune interface client n'existe.

Ce sous-projet introduit une vraie authentification (simulée, sans backend) pour deux audiences distinctes — le personnel (admin/agent, login + mot de passe) et les clients (téléphone + OTP) — avec protection réelle des routes et persistance de session entre rechargements de page.

## Objectif

- Écrans de connexion staff (email + mot de passe) et client (téléphone + OTP simulé), fidèles au cahier des charges.
- Écran "mot de passe oublié" (staff) présent mais non fonctionnel (pas de vrai envoi d'email).
- Protection réelle de `app/(staff)/*` : redirection vers `/login` si aucune session staff valide.
- Nouvelle zone `app/(client)/*` protégée : redirection vers `/connexion` si aucune session client valide, avec une page stub prouvant que la session fonctionne bout-en-bout.
- Déconnexion (staff et client), qui efface la session et redirige vers l'écran de login correspondant.
- Persistance de session via `localStorage`, survit aux rechargements de page.
- **Architecture en couches (Repository → Service → Provider/hooks)** conçue pour que la migration future vers une vraie authentification (cookies HttpOnly, JWT, OAuth) ne nécessite de réécrire que la couche de persistance (`SessionRepository`) et éventuellement l'appel réseau dans `AuthService` — `UserProvider`, les hooks, et tous les composants consommateurs restent inchangés.
- `SessionRepository` **asynchrone** dès ce sous-projet (résout immédiatement en V0, mais la signature ne changera pas le jour d'un vrai appel réseau/cookie).
- Résultats d'authentification typés via un vrai type **`Result<T, E>`** plutôt qu'une union directe `Session | AuthError`, pour une discrimination explicite et sûre.
- **Permissions dérivées du rôle** : `Session` (staff) expose `permissions: Permission[]`, calculées à la connexion depuis une table `role → permissions`, sans gestion individuelle par utilisateur.
- **Expiration de session simulée** avec **refresh silencieux périodique** : durée fixe à la connexion (30 min staff, 24h client), vérifiée à chaque lecture, prolongée automatiquement tant que l'app est ouverte — imite un vrai comportement de refresh token sans backend réel.
- Filtrage de la Command Palette par rôle (dette explicitement notée à la fin du sous-projet précédent, traitée ici car l'auth réelle est le moment naturel pour ça).

## Hors périmètre (explicitement exclu de ce sous-projet)

- Vrai backend, vraie API REST, vraie base de données.
- Vrai envoi SMS (OTP) ou email (mot de passe oublié) — tout est simulé/mocké.
- Vraie limite de tentatives OTP (anti-bruteforce) — l'expiration/refresh de session, en revanche, EST dans le périmètre (voir ci-dessous).
- Contenu réel de la zone client au-delà d'une page stub de bienvenue — la carte numérique, l'historique, les paiements sont un sous-projet dédié plus tard (sous-projet 7 du découpage global).
- Gestion des comptes clients (création, modification) — la liste de clients éligibles à l'OTP est mockée en dur dans ce sous-projet ; la vraie gestion clients est le sous-projet 3.
- Permissions individuelles par utilisateur — `permissions` reste dérivé du rôle via une table statique, pas de gestion granulaire par compte.

## Architecture en couches

```
lib/auth/
  result.ts                       — type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }
                                     + helpers ok(value) / err(error). Zéro dépendance.

  types.ts                        — types purs : Session (discriminated union StaffSession/
                                     ClientSession, avec expiresAt et permissions — voir plus bas),
                                     StaffCredentials, AuthError, Permission, etc.
                                     Zéro dépendance vers React ou localStorage.

  permissions.ts                  — Permission (union de chaînes littérales, ex: 'settings:manage',
                                     'dashboard:view', 'clients:view', 'scan:use') + table statique
                                     ROLE_PERMISSIONS: Record<Role, Permission[]>. Seul endroit qui
                                     mappe un rôle vers ses permissions.

  session-repository.ts           — interface SessionRepository (ASYNCHRONE) :
                                       get(): Promise<Session | null>
                                       set(session: Session): Promise<void>
                                       clear(): Promise<void>
                                     + localStorageSessionRepository: SessionRepository
                                     (implémentation V0 — résout immédiatement via Promise.resolve,
                                     SEUL fichier du projet qui touche window.localStorage)

  mock-staff-directory.ts         — liste de comptes staff mockés (email, mot de passe, rôle, nom)
  mock-client-directory.ts        — liste de clients mockés (téléphone, nom) éligibles à l'OTP

  auth-service.ts                 — class/factory AuthService, reçoit un SessionRepository en
                                     paramètre (injection simple, pas de framework DI) :
                                       - loginStaff(credentials): Promise<Result<StaffSession, AuthError>>
                                       - requestClientOtp(phone): Promise<Result<void, AuthError>>
                                       - verifyClientOtp(phone, code): Promise<Result<ClientSession, AuthError>>
                                       - logout(): Promise<void>
                                       - getSession(): Promise<Session | null>
                                         (vérifie expiresAt ; si expirée, clear() + retourne null)
                                       - refreshSession(): Promise<void>
                                         (si une session valide existe, prolonge expiresAt et
                                         persiste via le repository — no-op si pas de session ou
                                         session déjà expirée)
                                     Contient TOUTE la logique métier (validation contre les
                                     annuaires mockés, construction de l'objet Session avec
                                     expiresAt + permissions calculées via ROLE_PERMISSIONS).
                                     Délègue uniquement la persistance au repository.

components/providers/
  user-provider.tsx (MODIFIÉ)     — instancie AuthService une fois (avec
                                     localStorageSessionRepository), expose via contexte React :
                                     { session, status: 'loading'|'authenticated'|'unauthenticated',
                                       loginStaff, requestClientOtp, verifyClientOtp, logout }
                                     Ne contient AUCUNE logique de validation ni de stockage —
                                     pur reflet d'état + passe-plat vers AuthService (déballe les
                                     Result en interne pour l'ergonomie des appelants — voir
                                     "Contrat des actions" plus bas).
                                     Au montage : appelle authService.getSession() (async),
                                     status passe loading → authenticated/unauthenticated.
                                     Pendant qu'une session existe : setInterval (5 min) appelant
                                     authService.refreshSession(), nettoyé au démontage / à la
                                     déconnexion.
                                     Nouveau hook exporté : useAuth().
                                     useCurrentUser() (existant, utilisé par sidebar/bottom-nav)
                                     devient dérivé de useAuth(): suppose une session de type
                                     'staff' (n'est appelé que sous (staff)) et lève une erreur
                                     explicite si session.kind !== 'staff' — évite un bug silencieux.
```

**Contrat des actions exposées par `useAuth()`** : pour l'ergonomie des composants (pas de `.ok`/`.value` partout dans les formulaires), `UserProvider` déballe les `Result` renvoyés par `AuthService` : `loginStaff`/`requestClientOtp`/`verifyClientOtp` renvoient directement `Promise<AuthError | null>` (`null` = succès, la session est déjà mise à jour dans le contexte). `AuthService` lui-même garde son contrat `Result<T, E>` complet — c'est la couche service qui doit rester rigoureuse, la couche provider peut s'autoriser une ergonomie adaptée à ses appelants React.

**Principe de migration future :** remplacer `localStorageSessionRepository` par une implémentation cookie/JWT/OAuth (et ajuster `AuthService` pour appeler une vraie API au lieu des annuaires mockés) sont les SEULS changements nécessaires. La signature déjà asynchrone de `SessionRepository` absorbe un vrai appel réseau sans rupture. `UserProvider`, `useAuth()`, `useCurrentUser()`, et tous les composants (pages de login, sidebar, layouts protégés) ne dépendent que de la forme de `AuthService`/`Session`/`Result`, jamais de leur implémentation — aucun ne sera modifié lors de cette migration.

## Types de session

```typescript
type Permission =
  | 'dashboard:view'
  | 'clients:view'
  | 'subscriptions:manage'
  | 'sessions:manage'
  | 'scan:use'
  | 'statistics:view'
  | 'settings:manage'

type StaffSession = {
  kind: 'staff'
  id: string
  name: string
  email: string
  role: 'admin' | 'agent'
  permissions: Permission[]   // dérivées de `role` via ROLE_PERMISSIONS, calculées à la connexion
  expiresAt: number           // epoch ms ; 30 min après connexion/dernier refresh
}

type ClientSession = {
  kind: 'client'
  id: string
  name: string
  phone: string
  expiresAt: number           // epoch ms ; 24h après connexion/dernier refresh
}

type Session = StaffSession | ClientSession
```

Le discriminant `kind` permet de distinguer proprement les deux audiences partout où `Session` est consommée (gardes de route, hooks dérivés). `permissions` n'existe que côté `StaffSession` — un client n'a pas de notion de permission dans ce modèle (son accès est binaire : connecté ou non, à la seule zone `(client)`).

**Table `ROLE_PERMISSIONS`** (`lib/auth/permissions.ts`) :

| Rôle | Permissions |
|---|---|
| `admin` | toutes : `dashboard:view`, `clients:view`, `subscriptions:manage`, `sessions:manage`, `scan:use`, `statistics:view`, `settings:manage` |
| `agent` | toutes sauf `settings:manage` |

**`permissions` et `roles: Role[]` (nav-config.ts) restent deux systèmes séparés dans ce sous-projet.** `nav-config.ts` continue d'utiliser `roles: Role[]` tel quel (déjà livré et review-approuvé) — suffisant pour filtrer 7 entrées de menu. `permissions` est porté par `Session` pour préparer une vérification plus fine que "voir un lien de menu" (ex: autoriser une action précise), sans justification suffisante aujourd'hui pour migrer la nav. Le filtrage de la Command Palette (dette à corriger dans ce sous-projet) utilise donc `roles`, exactement comme `AppSidebar`/`BottomNav`, pas `permissions`.

## Architecture des routes

```
app/
  login/
    page.tsx                      NEW — formulaire staff (email + mot de passe)
    mot-de-passe-oublie/
      page.tsx                    NEW — formulaire email, confirmation simulée, pas de vrai envoi
  connexion/
    page.tsx                      NEW — formulaire téléphone client
    verification/
      page.tsx                    NEW — saisie code OTP à 6 chiffres
  (staff)/
    layout.tsx                    MODIFIÉ — ajoute la garde de route (redirige vers /login)
    [...routes existantes inchangées]
  (client)/
    layout.tsx                    NEW — layout mobile simple, garde de route (redirige vers
                                   /connexion), header minimal + déconnexion
    page.tsx                      NEW — stub "Bienvenue {name}" + téléphone masqué + déconnexion
```

`/login` et `/connexion` (+ sous-routes) sont des pages publiques, en dehors des route groups `(staff)` et `(client)` — cohérent avec le fait qu'elles ne nécessitent aucune session.

## Écrans et flux — Staff

- **`/login`** : champs email + mot de passe (nouveau composant `Input` réutilisable dans `components/ui/`, n'existe pas encore). Soumission → `useAuth().loginStaff({ email, password })` (déballé : renvoie `AuthError | null`). Erreur inline sous le formulaire si identifiants invalides, le champ email reste rempli. Lien "Mot de passe oublié ?" vers l'écran suivant. Succès (`null`) → redirection vers `/` (dashboard).
- **`/login/mot-de-passe-oublie`** : champ email, soumission affiche un message de confirmation simulé ("Si ce compte existe, un email a été envoyé"), aucun envoi réel, pas d'appel à AuthService au-delà de l'affichage du message.
- **Comptes staff mockés** (`lib/auth/mock-staff-directory.ts`) :
  - `admin@atlas.fit` / `admin123` → rôle `admin`, nom "Admin Studio"
  - `agent@atlas.fit` / `agent123` → rôle `agent`, nom "Agent Caisse"

## Écrans et flux — Client

- **`/connexion`** : champ téléphone. Soumission → `useAuth().requestClientOtp(phone)` (déballé : `AuthError | null`). Si le numéro n'est pas dans `mock-client-directory.ts` → erreur inline "Compte introuvable", pas de passage à l'écran suivant. Si trouvé (`null`) → redirection vers `/connexion/verification?phone=...`.
- **`/connexion/verification`** : saisie code à 6 chiffres. Code mocké fixe : `123456`, affiché à l'écran en petit texte gris ("Code de démonstration : 123456") — disparaîtra avec le vrai backend SMS. Soumission → `useAuth().verifyClientOtp(phone, code)` (déballé : `AuthError | null`). Code incorrect → erreur inline, champ vidé, pas de limite de tentatives. Succès (`null`) → redirection vers `/` (zone client).
- **Clients mockés** (`lib/auth/mock-client-directory.ts`) : réutilise/complète les noms déjà présents dans `lib/mock-data.ts` (ex: Yasmine Kaddour, Marc Delaunay) avec un numéro de téléphone factice chacun, pour rester cohérent avec les données déjà visibles dans le dashboard admin.

## Garde de route

- **`app/(staff)/layout.tsx`** : lit `status` via `useAuth()`. Si `status === 'loading'` → affiche un écran de chargement minimal (pas le contenu protégé, pas de redirection). Si `status === 'unauthenticated'` ou `session.kind !== 'staff'` → redirige vers `/login`. Sinon → rend `AppShell` comme aujourd'hui.
- **`app/(client)/layout.tsx`** : même logique, redirige vers `/connexion` si `status !== 'authenticated'` ou `session.kind !== 'client'`.
- Une session du mauvais type pour la zone visitée (ex : session `client` visitant une route `(staff)`) est traitée comme non authentifiée pour cette zone — redirection, pas d'erreur d'accès refusé distincte dans ce sous-projet.

## Déconnexion

- Bouton "Déconnexion" ajouté au menu utilisateur existant dans `Topbar` (staff) et au header minimal de `(client)/layout.tsx`. Les deux appellent `logout()` (via `useAuth()`) puis redirigent respectivement vers `/login` et `/connexion`.

## Expiration et refresh de session

- **Durées** : 30 minutes pour une session staff, 24 heures pour une session client (cohérent avec un vrai flux OTP mobile, où on ne redemande pas le code à chaque ouverture d'app dans la journée).
- **Vérification** : `AuthService.getSession()` compare `session.expiresAt` à l'heure courante à chaque appel. Si dépassée → appelle `repository.clear()` et retourne `null` (déconnexion automatique, traitée comme "non authentifié" par les gardes de route existantes — pas de nouveau chemin de code).
- **Refresh silencieux** : `UserProvider` démarre un `setInterval` (5 minutes) dès qu'une session existe, qui appelle `authService.refreshSession()`. Celui-ci relit la session courante ; si elle est valide (non expirée), recalcule `expiresAt` (+30 min ou +24h à partir de maintenant) et persiste via le repository. Si la session est déjà expirée ou absente, `refreshSession()` ne fait rien (l'utilisateur sera déconnecté au prochain `getSession()`). L'intervalle est nettoyé au démontage de `UserProvider` et immédiatement à la déconnexion.
- **Pourquoi un intervalle plutôt qu'un déclenchement sur interaction** : plus simple à écrire/tester dans ce sous-projet sans backend réel, et le comportement observable (une session active reste active tant que l'onglet est ouvert) est équivalent pour les besoins de cette V0. Le déclenchement sur interaction utilisateur reste une amélioration possible documentée ici pour un sous-projet auth ultérieur, si le vrai backend a des raisons de le préférer (ex: coût d'un appel réseau par refresh).

## Command Palette — filtrage par rôle (dette du sous-projet précédent)

`components/shell/command-palette.tsx` liste actuellement `[...primaryNav, ...secondaryNav]` sans filtrage. Ce sous-projet ajoute le même filtrage par rôle que `AppSidebar`/`BottomNav` (`item.roles.includes(user.role)`), en utilisant `useCurrentUser()`. Aligne enfin les trois surfaces de navigation.

## Erreurs et cas limites

- Login staff incorrect → erreur inline, pas de redirection, email conservé dans le formulaire.
- OTP téléphone inconnu → erreur inline sur `/connexion`, pas de passage à l'écran suivant.
- OTP code incorrect → erreur inline sur `/connexion/verification`, champ vidé, pas de limite de tentatives (hors périmètre).
- Accès direct à une URL protégée sans session → redirection propre, pas de flash de contenu protégé (géré par l'état `loading` explicite).
- Session du mauvais type pour la zone visitée → traitée comme non authentifiée pour cette zone.
- Rafraîchissement de page en étant connecté → pas de redirection, session relue depuis le repository au montage (`status` passe par `loading` puis `authenticated`).
- Session expirée (30 min staff / 24h client sans refresh silencieux actif — ex: onglet resté ouvert en arrière-plan au-delà de la durée) → `getSession()` la traite comme absente, redirection vers l'écran de login correspondant au prochain rendu protégé, comme un utilisateur jamais connecté.

## Découpage global du projet (rappel, pour contexte)

1. ~~Fondations & Shell~~ — terminé (voir `2026-07-12-fondations-shell-design.md`)
2. **Auth** ← ce document
3. Gestion Clients
4. Gestion Abonnements
5. Gestion Séances journalières
6. Scan QR
7. Interface Client (portail mobile complet : carte numérique, historique, statut — construit sur la zone `(client)` créée ici)
8. Statistiques (page dédiée au-delà du dashboard)
9. Paramètres, Notifications, Reçus PDF

Chaque sous-projet suivant aura son propre cycle brainstorming → spec → plan.
