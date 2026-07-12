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
- Filtrage de la Command Palette par rôle (dette explicitement notée à la fin du sous-projet précédent, traitée ici car l'auth réelle est le moment naturel pour ça).

## Hors périmètre (explicitement exclu de ce sous-projet)

- Vrai backend, vraie API REST, vraie base de données.
- Vrai envoi SMS (OTP) ou email (mot de passe oublié) — tout est simulé/mocké.
- Expiration de session, refresh token, vraie limite de tentatives OTP (anti-bruteforce).
- Contenu réel de la zone client au-delà d'une page stub de bienvenue — la carte numérique, l'historique, les paiements sont un sous-projet dédié plus tard (sous-projet 7 du découpage global).
- Gestion des comptes clients (création, modification) — la liste de clients éligibles à l'OTP est mockée en dur dans ce sous-projet ; la vraie gestion clients est le sous-projet 3.
- Gestion des employés/permissions granulaires au-delà des deux rôles `admin`/`agent` déjà existants.

## Architecture en couches

```
lib/auth/
  types.ts                        — types purs : Session (discriminated union staff/client),
                                     StaffCredentials, ClientOtpRequest, AuthError, etc.
                                     Zéro dépendance vers React ou localStorage.

  session-repository.ts           — interface SessionRepository { get(): Session | null;
                                     set(session: Session): void; clear(): void }
                                     + localStorageSessionRepository: SessionRepository
                                     (implémentation V0 — SEUL fichier du projet qui touche
                                     window.localStorage)

  mock-staff-directory.ts         — liste de comptes staff mockés (email, mot de passe, rôle, nom)
  mock-client-directory.ts        — liste de clients mockés (téléphone, nom) éligibles à l'OTP

  auth-service.ts                 — class/factory AuthService, reçoit un SessionRepository en
                                     paramètre (injection simple, pas de framework DI) :
                                       - loginStaff(credentials): Session | AuthError
                                       - requestClientOtp(phone): { ok: boolean }
                                       - verifyClientOtp(phone, code): Session | AuthError
                                       - logout(): void
                                       - getSession(): Session | null
                                     Contient TOUTE la logique métier (validation contre les
                                     annuaires mockés, construction de l'objet Session). Délègue
                                     uniquement la persistance au repository.

components/providers/
  user-provider.tsx (MODIFIÉ)     — instancie AuthService une fois (avec
                                     localStorageSessionRepository), expose via contexte React :
                                     { session, status: 'loading'|'authenticated'|'unauthenticated',
                                       loginStaff, requestClientOtp, verifyClientOtp, logout }
                                     Ne contient AUCUNE logique de validation ni de stockage —
                                     pur reflet d'état + passe-plat vers AuthService.
                                     Nouveau hook exporté : useAuth().
                                     useCurrentUser() (existant, utilisé par sidebar/bottom-nav)
                                     devient dérivé de useAuth(): suppose une session de type
                                     'staff' (n'est appelé que sous (staff)) et lève une erreur
                                     explicite si session.kind !== 'staff' — évite un bug silencieux.
```

**Principe de migration future :** remplacer `localStorageSessionRepository` par une implémentation cookie/JWT/OAuth (et ajuster `AuthService` pour appeler une vraie API au lieu des annuaires mockés) sont les SEULS changements nécessaires. `UserProvider`, `useAuth()`, `useCurrentUser()`, et tous les composants (pages de login, sidebar, layouts protégés) ne dépendent que de la forme de `AuthService`/`Session`, jamais de leur implémentation — aucun ne sera modifié lors de cette migration.

## Types de session

```typescript
type StaffSession = {
  kind: 'staff'
  id: string
  name: string
  email: string
  role: 'admin' | 'agent'
}

type ClientSession = {
  kind: 'client'
  id: string
  name: string
  phone: string
}

type Session = StaffSession | ClientSession
```

Le discriminant `kind` permet de distinguer proprement les deux audiences partout où `Session` est consommée (gardes de route, hooks dérivés).

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

- **`/login`** : champs email + mot de passe (nouveau composant `Input` réutilisable dans `components/ui/`, n'existe pas encore). Soumission → `authService.loginStaff({ email, password })`. Erreur inline sous le formulaire si identifiants invalides, le champ email reste rempli. Lien "Mot de passe oublié ?" vers l'écran suivant. Succès → redirection vers `/` (dashboard).
- **`/login/mot-de-passe-oublie`** : champ email, soumission affiche un message de confirmation simulé ("Si ce compte existe, un email a été envoyé"), aucun envoi réel, pas d'appel à AuthService au-delà de l'affichage du message.
- **Comptes staff mockés** (`lib/auth/mock-staff-directory.ts`) :
  - `admin@atlas.fit` / `admin123` → rôle `admin`, nom "Admin Studio"
  - `agent@atlas.fit` / `agent123` → rôle `agent`, nom "Agent Caisse"

## Écrans et flux — Client

- **`/connexion`** : champ téléphone. Soumission → `authService.requestClientOtp(phone)`. Si le numéro n'est pas dans `mock-client-directory.ts` → erreur inline "Compte introuvable", pas de passage à l'écran suivant. Si trouvé → redirection vers `/connexion/verification?phone=...`.
- **`/connexion/verification`** : saisie code à 6 chiffres. Code mocké fixe : `123456`, affiché à l'écran en petit texte gris ("Code de démonstration : 123456") — disparaîtra avec le vrai backend SMS. Soumission → `authService.verifyClientOtp(phone, code)`. Code incorrect → erreur inline, champ vidé, pas de limite de tentatives. Succès → redirection vers `/` (zone client).
- **Clients mockés** (`lib/auth/mock-client-directory.ts`) : réutilise/complète les noms déjà présents dans `lib/mock-data.ts` (ex: Yasmine Kaddour, Marc Delaunay) avec un numéro de téléphone factice chacun, pour rester cohérent avec les données déjà visibles dans le dashboard admin.

## Garde de route

- **`app/(staff)/layout.tsx`** : lit `status` via `useAuth()`. Si `status === 'loading'` → affiche un écran de chargement minimal (pas le contenu protégé, pas de redirection). Si `status === 'unauthenticated'` ou `session.kind !== 'staff'` → redirige vers `/login`. Sinon → rend `AppShell` comme aujourd'hui.
- **`app/(client)/layout.tsx`** : même logique, redirige vers `/connexion` si `status !== 'authenticated'` ou `session.kind !== 'client'`.
- Une session du mauvais type pour la zone visitée (ex : session `client` visitant une route `(staff)`) est traitée comme non authentifiée pour cette zone — redirection, pas d'erreur d'accès refusé distincte dans ce sous-projet.

## Déconnexion

- Bouton "Déconnexion" ajouté au menu utilisateur existant dans `Topbar` (staff) et au header minimal de `(client)/layout.tsx`. Les deux appellent `logout()` (via `useAuth()`) puis redirigent respectivement vers `/login` et `/connexion`.

## Command Palette — filtrage par rôle (dette du sous-projet précédent)

`components/shell/command-palette.tsx` liste actuellement `[...primaryNav, ...secondaryNav]` sans filtrage. Ce sous-projet ajoute le même filtrage par rôle que `AppSidebar`/`BottomNav` (`item.roles.includes(user.role)`), en utilisant `useCurrentUser()`. Aligne enfin les trois surfaces de navigation.

## Erreurs et cas limites

- Login staff incorrect → erreur inline, pas de redirection, email conservé dans le formulaire.
- OTP téléphone inconnu → erreur inline sur `/connexion`, pas de passage à l'écran suivant.
- OTP code incorrect → erreur inline sur `/connexion/verification`, champ vidé, pas de limite de tentatives (hors périmètre).
- Accès direct à une URL protégée sans session → redirection propre, pas de flash de contenu protégé (géré par l'état `loading` explicite).
- Session du mauvais type pour la zone visitée → traitée comme non authentifiée pour cette zone.
- Rafraîchissement de page en étant connecté → pas de redirection, session relue depuis le repository au montage (`status` passe par `loading` puis `authenticated`).

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
