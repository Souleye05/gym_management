# Statistiques du tableau de bord staff — Design

> Chantier backend uniquement (Architecte Backend principal). Périmètre : le tableau de bord staff (`app/(staff)/page.tsx`), actuellement alimenté par `lib/mock-data.ts`. La page `/statistiques` reste hors périmètre — c'est un simple placeholder "bientôt disponible" sans aucun besoin défini à ce jour ; elle fera l'objet d'un chantier séparé le moment venu.

## 1. Contexte

Le dashboard staff affiche 7 widgets, tous actuellement branchés sur des données statiques dans `lib/mock-data.ts` :
`StatCards` (4 KPIs), `RevenueChart`, `PlanDistribution`, `AttendanceChart`, `RecentActivity`, `ExpiringSubscriptions`, `TopMembers`.

Le backend abonnements/séances/paramètres (`server/memberships/`, `server/settings/`) est complet et livré. Ce chantier construit la couche d'agrégation en lecture seule qui manque pour remplacer ces mocks par des données réelles — sans toucher aux chemins d'écriture déjà livrés/testés.

## 2. Approche retenue

**Un seul endpoint agrégé** (`GET /api/statistics/dashboard`) plutôt que 7 endpoints séparés — la page charge tous les widgets ensemble au premier rendu, un seul aller-retour suffit ; découper en 7 endpoints ajouterait du boilerplate sans besoin exprimé (YAGNI). Si un widget a un jour besoin d'un rafraîchissement indépendant, il sera sorti à part à ce moment-là.

**Activité récente dérivée à la volée**, jamais stockée — cohérent avec le principe déjà établi du projet ("le statut est dérivé, il n'est jamais stocké", `ARCHITECTURE_RULES.md` section 6). Une table `ActivityLog` dédiée (chaque service insère une ligne à chaque action) a été écartée : elle dupliquerait la logique métier dans deux endroits (l'action réelle + le log) et rouvrirait des services déjà livrés/review/testés pour un gain marginal à cette échelle.

## 3. Structure du module

Nouveau module `server/statistics/`, lecture seule, aucune nouvelle table Prisma.

```
server/statistics/
  domain/
    merge-activity-feed.ts       # fusion + tri + troncature des 4 sources d'activité (pur)
    classify-subscription-status.ts  # 'expiring' | 'expired' + daysLeft (pur)
    derive-kpi-delta.ts          # calcul de variation % (pur)
    entities.ts                  # types partagés (DashboardStatistics, ActivityItem, ...)
  repositories/
    statistics.repository.ts     # interface, requêtes d'agrégation
  infrastructure/
    prisma-statistics.repository.ts  # impl Prisma (groupBy/aggregate/count)
  services/
    statistics.service.ts        # orchestration : repository -> fonctions pures -> réponse
  http/
    get-dashboard-statistics.controller.ts
```

**Pourquoi un nouveau repository plutôt que réutiliser `SubscriptionRepository`/`SessionRepository`** : ces repositories existants exposent du CRUD par entité (`findAllByClientId`, `findById`, `create`...), pas de l'agrégat SQL. Les réutiliser obligerait à charger des lignes en mémoire pour les additionner/compter en JS — inutilement coûteux pour des besoins comme "somme des revenus ce mois" que SQL fait nativement en une requête (`SUM ... WHERE createdAt BETWEEN ...`).

## 4. Définitions métier

1. **Revenus** = `SUM(Subscription.amountPaid)` (créées dans le mois) + `SUM(Session.amountPaid)` (pointées dans le mois). Toute somme réellement encaissée, peu importe la source.
2. **Clients actifs** = clients ayant un abonnement avec `startDate <= référence <= endDate`. Pour la comparaison "vs mois dernier", le même critère est recalculé à une date de référence passée — mais `suspended` n'a pas d'historique (booléen sur la ligne actuelle uniquement), donc la comparaison rétroactive ignore la suspension et ne regarde que les dates. Approximation assumée et documentée ; un historique de suspension serait un chantier séparé, non demandé.
3. **Séances du jour** = séances (abonné + visiteur confondus) pointées le jour de référence, comparées à la veille.
4. **Abonnements expirés (KPI)** = `endDate <= référence`, peu importe `suspended`.
5. **Widget "à relancer" (`expiringSubscriptions`)** : seuil `expiring` = 7 jours (`0 <= daysLeft <= 7`), `expired` = `daysLeft < 0`. Les abonnements suspendus sont **exclus** de ce widget — un abonnement suspendu n'est pas "à relancer" (paiement), c'est une action staff différente (réactiver) ; les inclure aurait demandé d'inventer un 4ᵉ statut absent du besoin. Liste plafonnée à 10, triée par `daysLeft` croissant (les plus en retard/urgents d'abord) — sans plafond, cette liste grossirait indéfiniment avec les abonnements expirés jamais relancés.
6. **Activité récente** — fusion de 4 sources, triées par `occurredAt` décroissant, tronquée à 20 :
   - `payment` vs `renewal` : un abonnement créé est `payment` si c'est le tout premier abonnement de ce client (comparaison à la date de création la plus ancienne par client, calculée via `groupBy` sur les clientId concernés — pas de requête N+1), sinon `renewal`.
   - `session` : séances abonné ET visiteur (`clientId: null` pour un visiteur).
   - `signup` : nouveaux clients (`Client.createdAt`).
   - `expired` : `occurredAt` = `Subscription.endDate` (l'horodatage naturel de l'événement).
   - Fenêtre de recherche bornée (30 jours en arrière) pour éviter de scanner tout l'historique lors de la fusion.
   - Format exact de `detail` par type (chaîne opaque déjà formatée par le backend, le composant `RecentActivity` l'affiche telle quelle sans la parser) :
     - `payment`/`renewal` : `"{label du plan} · {amountPaid} €"` (ex. `"Trimestriel · 120 €"`)
     - `session` (abonné) : `"Séance validée"` ; `session` (visiteur) : `"Séance visiteur"`
     - `signup` : `"Nouveau membre"`
     - `expired` : `"À relancer"`
   - `PLAN_CATALOG` (`server/memberships/domain/plan-catalog.ts`) gagne un champ `label: string` par plan, miroir exact des labels déjà présents dans `lib/subscriptions/plans.ts` (Mensuel/Trimestriel/Semestriel/Annuel) — ajout non cassant (les consommateurs actuels détructurent `{durationDays, price}`), évite de dupliquer cette correspondance dans un second endroit.
7. **Top membres** : nombre de séances sur les 30 derniers jours glissants, top 5, triés par nombre de séances décroissant.
8. **Format des horodatages** : le backend renvoie systématiquement des timestamps ISO bruts (`occurredAt`, `lastVisitAt`), jamais de texte relatif pré-formaté ("il y a 4 min", "2 j") — c'est un souci d'affichage frontend, pas de donnée. Un timestamp brut reste correct indéfiniment ; un texte relatif pré-calculé devient faux dès qu'il est mis en cache ou re-rendu plus tard.
9. **Hors périmètre explicitement écarté** : le champ "objectif" de revenu mensuel du graphique mocké (`revenus` vs `objectif`) n'a aucun concept backend existant (`AppSettings` n'a que `sessionPrice`). Le graphique n'affiche que les revenus réels. Si un objectif configurable est vraiment souhaité, ce sera un ajout à `server/settings/` (nouveau champ, permission ADMIN, même pattern que `sessionPrice`) — un chantier à part, pas assez de détails aujourd'hui pour le concevoir.

## 5. Contrat API

```
GET /api/statistics/dashboard
Permission : tout staff connecté (lecture seule, même modèle que GET /api/settings)
```

```ts
200 {
  success: true,
  data: {
    kpis: {
      revenue: { value: number; deltaPercent: number; trend: 'up' | 'down' }
      activeClients: { value: number; deltaPercent: number; trend: 'up' | 'down' }
      sessionsToday: { value: number; deltaPercent: number; trend: 'up' | 'down' }
      expiredSubscriptions: { value: number; deltaPercent: number; trend: 'up' | 'down' }
    }
    revenueSeries: { month: string; revenue: number }[]        // "2026-07", 12 derniers mois, du plus ancien au plus récent
    attendanceSeries: { day: string; sessions: number }[]      // "2026-07-16", 7 derniers jours, du plus ancien au plus récent
    planDistribution: { planId: 'monthly' | 'quarterly' | 'biannual' | 'annual'; count: number }[]
    recentActivity: {
      id: string
      type: 'payment' | 'renewal' | 'session' | 'signup' | 'expired'
      clientId: string | null   // null pour une séance visiteur
      name: string
      detail: string             // ex. "Trimestriel · 120 €"
      occurredAt: string         // ISO datetime
    }[]                                                        // top 20, plus récent en premier
    expiringSubscriptions: {
      clientId: string
      name: string
      planId: 'monthly' | 'quarterly' | 'biannual' | 'annual'
      status: 'expiring' | 'expired'
      daysLeft: number           // négatif si déjà expiré
      lastVisitAt: string | null // dernière séance pointée, ISO datetime brut
    }[]                                                        // top 10, daysLeft croissant (plus urgent en premier)
    topMembers: {
      clientId: string
      name: string
      planId: 'monthly' | 'quarterly' | 'biannual' | 'annual'
      sessionsCount: number
    }[]                                                        // 30 derniers jours, top 5
  }
  message: ''
  errors: null
}
```

`planId` traduit en minuscule à la frontière HTTP, même pattern de traduction que `session.dto.ts`/`subscription.dto.ts` (table `Record<...>` exhaustive).

`deriveKpiDelta(current, previous)` : cas `previous === 0` → `deltaPercent: current > 0 ? 100 : 0` (convention explicite, évite une division par zéro / `Infinity`).

## 6. Gestion des erreurs

Aucun échec métier attendu sur cet endpoint (pas de "not found", pas de règle à violer) — c'est un agrégat en lecture pure. `requireStaffAuth()` en premier (401 si non connecté), puis tout le reste passe par `withInternalErrorHandling` déjà établi ailleurs dans le projet. Pas de nouveau type d'erreur domaine.

## 7. Plan de tests

- **Domaine (pur, sans DB)** : `mergeActivityFeed()` sur fixtures fabriquées (ordre de tri, troncature à 20, mix des 5 types) ; `classifySubscriptionStatus()` sur les bornes exactes (`daysLeft` = 0, 7, 8, -1) ; `deriveKpiDelta()` y compris `previous === 0`.
- **Repository (intégration Postgres réelle)** : chaque méthode d'agrégation testée avec des données seedées connues — `getRevenueForMonth` (somme correcte abonnements+séances, exclut les autres mois), `getPlanDistribution` (comptage groupé correct), `getTopMembersByRecentSessions` (fenêtre 30 jours respectée, une séance à J-31 exclue), `countActiveClients`/`countExpiredSubscriptions` sur des cas limites de dates.
- **Service** : orchestration avec repository fake — vérifie les bonnes plages de dates passées au repository et l'assemblage correct de la réponse finale (couche fine, la vraie logique est couverte au niveau domaine).
- **Contrôleur** : 401 sans session staff, 200 avec la forme de réponse attendue.

## 8. Hors périmètre

- Page `/statistiques` (aucun besoin défini à ce jour).
- Objectif de revenu configurable (section 4.9).
- Pagination/"Tout voir" sur l'activité récente (le bouton existe dans le mock mais aucun comportement réel n'est demandé pour l'instant — l'endpoint renvoie un top 20 fixe).
- Historique de suspension (section 4.2).
