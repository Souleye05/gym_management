# Gestion Clients — Design

**Date :** 2026-07-13
**Sous-projet :** 3 / 9 (voir découpage global en fin de document)
**Statut :** Approuvé

## Contexte

Le sous-projet précédent ("Auth") a livré l'authentification staff/client et la protection des routes. La page `app/(staff)/clients/page.tsx` est aujourd'hui un stub (`EmptyState`, "Bientôt disponible"). Le cahier des charges décrit la gestion clients comme un bloc fonctionnel prioritaire : liste, recherche, filtres, création, modification, suppression, et une fiche client riche (profil, historique, paiements, QR code, carte numérique).

Une bonne partie de cette fiche riche dépend de sous-projets pas encore construits (Abonnements = sous-projet 4, Séances = 5, Scan QR = 6). Ce sous-projet livre donc la partie autonome — liste + CRUD + profil basique — et prépare (sans les construire) les emplacements pour le reste.

## Objectif

- Liste des clients avec recherche (nom/téléphone) et filtre par statut d'abonnement.
- Création, modification, suppression d'un client (Dialog + confirmation).
- Page de profil client basique (infos, statut, actions), avec emplacements réservés pour Historique/Paiements (stubs, pas de fausse donnée).
- Nouvel annuaire clients mocké, indépendant des mocks existants (dashboard, OTP).
- État en mémoire (contexte React), reset au rechargement — pas de fausse persistance à migrer plus tard.
- Deux nouveaux composants UI réutilisables : `Dialog`, `Table`.

## Hors périmètre (explicitement exclu de ce sous-projet)

- Historique de séances/paiements réels — stubs `EmptyState` uniquement sur la page profil, pas de données mockées à ce niveau (elles seraient de toute façon reconstruites par les sous-projets Abonnements/Séances).
- QR code / carte numérique réels — le champ `cardNumber` existe sur le modèle `Client` (le cahier des charges l'exige dès la création d'un client), mais aucun rendu QR ni carte visuelle n'est construit ici (sous-projet 6 / 7).
- Tri de la liste (nom, date) — non demandé, ajoutable plus tard sans réécriture.
- Restriction de rôle sur la suppression — suppression accessible à `admin` et `agent` de la même façon que création/modification, cohérent avec le reste du CRUD.
- Persistance `localStorage` ou API réelle — état React en mémoire, remis à zéro au rechargement de page.
- Fusion avec `lib/mock-data.ts` (dashboard) ou `lib/auth/mock-client-directory.ts` (annuaire OTP) — trois sources de données mockées séparées, volontairement non couplées à ce stade.

## Modèle de données

```typescript
// lib/clients/types.ts
export type ClientStatus = 'active' | 'expiring' | 'expired' | 'none'

export type Client = {
  id: string
  name: string
  phone: string
  email?: string
  cardNumber: string
  status: ClientStatus
  joinedAt: string   // ISO date string
}
```

`status: 'none'` couvre un client créé sans abonnement (cas normal avant que le sous-projet Abonnements existe — tout nouveau client démarre à `'none'`). `cardNumber` est généré automatiquement à la création (voir Écrans ci-dessous), jamais saisi manuellement.

`lib/clients/mock-clients.ts` — ~15-20 clients mockés avec des statuts variés (mélange de `active`/`expiring`/`expired`/`none`) pour que la recherche et le filtre soient testables de façon réaliste.

## Gestion d'état

`components/providers/clients-provider.tsx` — contexte React :

```typescript
type ClientsContextValue = {
  clients: Client[]
  addClient(input: Omit<Client, 'id' | 'cardNumber' | 'status' | 'joinedAt'>): Client
  updateClient(id: string, input: Partial<Pick<Client, 'name' | 'phone' | 'email'>>): void
  deleteClient(id: string): void
  getClient(id: string): Client | undefined
}
```

- Initialisé depuis `mock-clients.ts` au montage (`useState(() => [...mockClients])`), jamais relu ensuite.
- `addClient` génère `id` (ex: `crypto.randomUUID()` ou un compteur incrémental simple), `cardNumber` (format lisible, ex: `CARD-${sequential}`), `status: 'none'`, `joinedAt: new Date().toISOString()`.
- Monté dans `app/(staff)/layout.tsx`, aux côtés de `AppShell` (à l'intérieur du guard existant — inutile de charger l'annuaire clients pour un visiteur non authentifié).
- Pas de logique de validation métier dans le provider — un `addClient`/`updateClient` avec des champs invalides serait un bug appelant, pas un cas à gérer ici (la validation vit dans le formulaire, voir plus bas).

## Nouveaux composants UI

### `components/ui/dialog.tsx`

Dialog modal générique, sur le même modèle que `command-palette.tsx` existant (`AnimatePresence`/`motion`, overlay cliquable pour fermer, `Escape` pour fermer) mais généralisé pour un contenu arbitraire (pas seulement une liste de résultats) :

```typescript
export function Dialog({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode })
export function DialogHeader({ children }: { children: ReactNode })
export function DialogTitle({ children }: { children: ReactNode })
export function DialogDescription({ children }: { children: ReactNode })
export function DialogFooter({ children }: { children: ReactNode })
```

Accessibilité : `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointant vers `DialogTitle`, focus piégé dans le dialog tant qu'il est ouvert, focus rendu à l'élément déclencheur à la fermeture, fermeture au `Escape`.

### `components/ui/table.tsx`

Table simple, cohérente avec le style `Card` existant :

```typescript
export function Table({ children }: { children: ReactNode })
export function TableHeader({ children }: { children: ReactNode })
export function TableBody({ children }: { children: ReactNode })
export function TableRow({ children, onClick }: { children: ReactNode; onClick?: () => void })
export function TableHead({ children }: { children: ReactNode })
export function TableCell({ children }: { children: ReactNode })
```

## Écrans

### `app/(staff)/clients/page.tsx` — Liste

- Barre de recherche (`Input`) filtrant en temps réel sur `name` (insensible à la casse) et `phone` (correspondance partielle).
- Filtre par statut (liste déroulante simple ou groupe de boutons — 5 options : Tous, Actif, Expire bientôt, Expiré, Aucun abonnement).
- Recherche et filtre combinés (ET logique).
- Table des résultats : Nom, Téléphone, Statut (Badge coloré, réutilise les variants `Badge` déjà existants — `success`/`warning`/`destructive`/`muted`), Date d'inscription. Clic sur une ligne → navigue vers `/clients/[id]`.
- État vide de résultats (recherche/filtre sans correspondance) → message inline simple ("Aucun client trouvé"), pas besoin du composant `EmptyState` complet (réservé aux pages entièrement vides).
- Bouton "Ajouter un client" (haut de page) → ouvre le `Dialog` de création.

### Formulaire client (partagé création/modification)

`components/clients/client-form.tsx` — utilisé dans le `Dialog` pour les deux cas (création et modification), avec les champs :
- Nom (`Input`, requis, non vide après `trim()`)
- Téléphone (`Input type="tel"`, requis, format simple validé — au moins 8 chiffres, cohérent avec le pattern déjà utilisé dans `lib/auth` pour les numéros mockés)
- Email (`Input type="email"`, optionnel — si rempli, doit être un email valide via la validation native du navigateur `type="email"` + `required` conditionnel)

Erreurs de validation affichées inline sous chaque champ (même pattern que les pages de login : `role="alert"`, texte `text-destructive`). Soumission bloquée tant que les champs requis ne sont pas valides.

### `app/(staff)/clients/[id]/page.tsx` — Profil

- En-tête : `Avatar` (initiales), nom, téléphone, email si présent, `Badge` de statut, numéro de carte.
- Actions : bouton "Modifier" (ouvre le `Dialog` avec le formulaire pré-rempli), bouton "Supprimer" (ouvre un `Dialog` de confirmation : "Supprimer [nom] ? Cette action est irréversible.", boutons Annuler/Supprimer — le bouton Supprimer utilise la variante `destructive` du `Button` existant).
- Suppression réussie → redirection vers `/clients` (liste).
- Section "Historique" et "Paiements" (deux `Card` ou deux onglets simples) : chacune affiche `EmptyState` avec un message contextualisé ("L'historique des séances sera disponible avec la gestion des séances." / "L'historique des paiements sera disponible avec la gestion des abonnements.") — pas de tableau vide trompeur, pas de fausse donnée.
- Client introuvable (ID invalide dans l'URL) → `EmptyState` "Client introuvable" avec lien de retour vers `/clients`, pas d'erreur brute.

## Navigation

`nav-config.ts` a déjà une entrée "Clients" (`/clients`, badge `486` — badge statique existant, non connecté à `clients.length` dans ce sous-projet, car le connecter créerait une dépendance entre `nav-config.ts` et le nouveau `ClientsProvider` non justifiée pour un simple compteur d'affichage ; à revoir si ça devient gênant). Aucun changement à la nav elle-même.

## Erreurs et cas limites

- Recherche/filtre sans résultat → message inline, pas de crash, pas d'`EmptyState` pleine page.
- Soumission du formulaire avec téléphone déjà existant dans l'annuaire → pas de contrainte d'unicité vérifiée dans ce sous-projet (hors périmètre — l'annuaire mocké n'a pas vocation à simuler cette contrainte métier ; un vrai backend la validerait).
- Suppression d'un client déjà supprimé (double-clic rapide, onglet dupliqué) → `deleteClient` sur un `id` inexistant est un no-op silencieux (filtre qui ne retire rien), pas d'erreur.
- Navigation directe vers `/clients/[id]` avec un ID qui n'existe pas → écran "Client introuvable" (voir ci-dessus), pas de 404 Next.js brut ni de crash React.

## Découpage global du projet (rappel, pour contexte)

1. ~~Fondations & Shell~~ — terminé
2. ~~Auth (V0 mockée)~~ — terminé (`2026-07-12-auth-design.md`)
2b. API d'authentification (remplacement des mocks) — en cours, par un autre agent (`2026-07-12-auth-api-design.md`)
3. **Gestion Clients** ← ce document
4. Gestion Abonnements
5. Gestion Séances journalières
6. Scan QR
7. Interface Client (portail mobile complet)
8. Statistiques
9. Paramètres, Notifications, Reçus PDF

Chaque sous-projet suivant aura son propre cycle brainstorming → spec → plan.
