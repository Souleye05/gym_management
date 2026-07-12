# Fondations & Shell applicatif — Design

**Date :** 2026-07-12
**Sous-projet :** 1 / 9 (voir découpage global en fin de document)
**Statut :** Approuvé

## Contexte

Le projet a été initialement généré via v0.app à partir d'un prompt demandant un design system complet pour une PWA de gestion de salle de musculation (cahier des charges : `Cahier_des_charges_Salle_Musculation_V0.docx.pdf`). L'audit du code généré a montré que seul `app/page.tsx` (placeholder par défaut de v0) existe comme route réelle. En revanche, un shell admin complet (`components/shell/*`) et 8 widgets de dashboard (`components/dashboard/*`) existent en pièces détachées, jamais assemblés.

Ce document couvre le premier sous-projet : assembler l'existant en une première route fonctionnelle, et poser la structure de navigation/rôles qui portera tous les sous-projets suivants.

## Objectif

- Monter le shell existant (sidebar desktop, bottom nav mobile, topbar, command palette) dans une vraie route.
- Brancher le dashboard admin déjà codé sur `/`.
- Poser une structure de routes par zone (staff vs client) qui accueillera les futurs sous-projets sans refonte.
- Filtrer la navigation selon le rôle connecté (admin / agent de caisse), simulé via mock.
- Éviter les liens morts : chaque entrée de nav mène à une page réelle (dashboard ou stub état vide).

## Hors périmètre (explicitement exclu de ce sous-projet)

- Authentification réelle (login, OTP, session, garde de route bloquante).
- Contenu métier des pages Clients / Abonnements / Séances / Scan / Statistiques / Paramètres — seulement des stubs.
- Zone `(client)` — portail client mobile, traité comme sous-projet séparé (layout radicalement différent : pas de sidebar/topbar admin).
- Extension de `lib/mock-data.ts` au-delà de ce qui existe déjà (suffisant pour le dashboard).

## Architecture des routes

```
app/
  layout.tsx                      (existant, inchangé — ThemeProvider, police Inter, métadonnées)
  page.tsx                        (SUPPRIMÉ — remplacé par la redirection du groupe (staff))
  (staff)/
    layout.tsx                    NEW — monte AppShell, fournit UserProvider
    page.tsx                      NEW — Dashboard (assemble les widgets existants)
    clients/page.tsx              NEW — stub état vide
    abonnements/page.tsx          NEW — stub état vide
    seances/page.tsx              NEW — stub état vide
    scan/page.tsx                 NEW — stub état vide
    statistiques/page.tsx         NEW — stub état vide
    parametres/page.tsx           NEW — stub état vide (visible admin uniquement)
```

Le route group `(staff)` n'apparaît pas dans l'URL : le dashboard reste accessible sur `/`. Ce choix isole le layout applicatif (staff) du layout racine, et laisse la place à un futur groupe `(client)` avec son propre layout mobile, sans collision de routes ni logique conditionnelle dans un layout unique.

## Simulation du rôle utilisateur

Pas de vraie auth dans ce sous-projet. Un utilisateur courant est mocké en dur :

- `lib/current-user.ts` — exporte un objet `CurrentUser` (`id`, `name`, `role: "admin" | "agent"`, `avatarUrl`) avec une valeur par défaut (`role: "admin"`) pour voir le shell complet immédiatement.
- `components/providers/user-provider.tsx` — Context React qui expose `currentUser` (et rien d'autre — pas de `login`/`logout` dans ce sous-projet, ça viendra avec l'auth réelle). Monté dans `(staff)/layout.tsx`.

Pour tester la vue "agent", on change la constante dans `lib/current-user.ts`. Ce n'est pas un vrai switch de rôle en UI — volontairement, pour ne pas construire une fausse feature d'auth qui sera de toute façon remplacée.

## Navigation filtrée par rôle

`components/shell/nav-config.ts` existe déjà avec 7 entrées. Chaque entrée gagne un champ `roles: Role[]` :

| Route | Label | admin | agent |
|---|---|---|---|
| `/` | Dashboard | ✓ | ✓ |
| `/clients` | Clients | ✓ | ✓ |
| `/abonnements` | Abonnements | ✓ | ✓ |
| `/seances` | Séances | ✓ | ✓ |
| `/scan` | Scan QR | ✓ | ✓ |
| `/statistiques` | Statistiques | ✓ | ✓ |
| `/parametres` | Paramètres | ✓ | ✗ |

Seul **Paramètres** est masqué pour l'agent (cahier des charges : "Gestion des tarifs" et permissions employés sont des tâches admin). Le composant `AppSidebar`/`BottomNav` filtre `NAV_ITEMS` via `item.roles.includes(currentUser.role)` avant de rendre.

## Dashboard (`/`)

Assemble tel quel les composants déjà écrits et déjà alimentés par `lib/mock-data.ts` :
`StatCards`, `RevenueChart`, `AttendanceChart`, `PlanDistribution`, `ExpiringSubscriptions`, `RecentActivity`, `TopMembers`, `QuickActions`.

Aucune modification de leur logique interne dans ce sous-projet — seul le montage dans la page change. Si un composant a une erreur d'intégration (import cassé, prop manquante), elle sera corrigée a minima pour que le rendu fonctionne, sans réécriture.

## Pages stub (état vide)

Composant réutilisable `components/ui/empty-state.tsx` :
- Props : `icon` (Lucide icon component), `title`, `description`, `action?` (optionnel, pour plus tard).
- Rendu centré, cohérent avec les tokens du design system déjà présents dans `globals.css`.

Chaque page stub (`clients`, `abonnements`, `seances`, `scan`, `statistiques`, `parametres`) rend `<EmptyState icon={...} title="..." description="Bientôt disponible" />` avec une icône Lucide contextuelle (ex: `Users` pour Clients, `CreditCard` pour Abonnements, `QrCode` pour Scan). Ces pages seront remplacées section par section dans les sous-projets suivants — elles ne sont pas jetables, juste incomplètes.

## Erreurs / edge cases

- Si `currentUser.role === "agent"` et qu'un accès direct à `/parametres` est tenté (URL tapée à la main) : dans ce sous-projet, la page reste accessible (pas de garde bloquante, cf. hors périmètre). Elle sera protégée quand l'auth réelle arrivera.
- Pas de `loading.tsx` / `error.tsx` spécifiques dans ce sous-projet — les pages sont statiques (mock data synchrone), rien à charger de façon asynchrone pour l'instant.

## Découpage global du projet (rappel, pour contexte)

1. **Fondations & Shell** ← ce document
2. Auth (login staff, OTP client, session/rôle réel)
3. Gestion Clients
4. Gestion Abonnements
5. Gestion Séances journalières
6. Scan QR
7. Interface Client (portail mobile : carte numérique, historique, statut)
8. Statistiques (page dédiée au-delà du dashboard)
9. Paramètres, Notifications, Reçus PDF

Chaque sous-projet suivant aura son propre cycle brainstorming → spec → plan.
