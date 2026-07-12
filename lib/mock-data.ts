export type SubscriptionStatus = 'active' | 'expiring' | 'expired'

export const currency = (value: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)

export const kpis = [
  {
    id: 'revenue',
    label: 'Revenus du mois',
    value: 24680,
    format: 'currency' as const,
    delta: 12.4,
    trend: 'up' as const,
    hint: 'vs. mois dernier',
  },
  {
    id: 'active',
    label: 'Clients actifs',
    value: 486,
    format: 'number' as const,
    delta: 5.2,
    trend: 'up' as const,
    hint: '32 nouveaux ce mois',
  },
  {
    id: 'sessions',
    label: 'Séances du jour',
    value: 128,
    format: 'number' as const,
    delta: -3.1,
    trend: 'down' as const,
    hint: 'vs. hier',
  },
  {
    id: 'expired',
    label: 'Abonnements expirés',
    value: 27,
    format: 'number' as const,
    delta: 8.0,
    trend: 'up' as const,
    hint: 'à relancer',
  },
]

export const revenueSeries = [
  { month: 'Jan', revenus: 15200, objectif: 18000 },
  { month: 'Fév', revenus: 17600, objectif: 18000 },
  { month: 'Mar', revenus: 16900, objectif: 19000 },
  { month: 'Avr', revenus: 19800, objectif: 19000 },
  { month: 'Mai', revenus: 21400, objectif: 20000 },
  { month: 'Juin', revenus: 20100, objectif: 21000 },
  { month: 'Juil', revenus: 23200, objectif: 22000 },
  { month: 'Août', revenus: 22050, objectif: 22000 },
  { month: 'Sep', revenus: 24680, objectif: 23000 },
]

export const attendanceSeries = [
  { day: 'Lun', sessions: 96 },
  { day: 'Mar', sessions: 128 },
  { day: 'Mer', sessions: 112 },
  { day: 'Jeu', sessions: 134 },
  { day: 'Ven', sessions: 158 },
  { day: 'Sam', sessions: 182 },
  { day: 'Dim', sessions: 74 },
]

export const planDistribution = [
  { name: 'Mensuel', value: 210, key: 'chart-1' },
  { name: 'Trimestriel', value: 148, key: 'chart-2' },
  { name: 'Annuel', value: 92, key: 'chart-4' },
  { name: 'Journalier', value: 36, key: 'chart-5' },
]

export type Activity = {
  id: string
  name: string
  action: string
  detail: string
  time: string
  type: 'payment' | 'session' | 'signup' | 'renewal' | 'expired'
}

export const recentActivity: Activity[] = [
  {
    id: 'a1',
    name: 'Yasmine Kaddour',
    action: 'a réglé un abonnement',
    detail: 'Trimestriel · 120 €',
    time: 'Il y a 4 min',
    type: 'payment',
  },
  {
    id: 'a2',
    name: 'Marc Delaunay',
    action: 'a scanné son QR code',
    detail: 'Séance validée',
    time: 'Il y a 11 min',
    type: 'session',
  },
  {
    id: 'a3',
    name: 'Inès Fabre',
    action: 'a rejoint la salle',
    detail: 'Nouveau membre',
    time: 'Il y a 38 min',
    type: 'signup',
  },
  {
    id: 'a4',
    name: 'Karim Benali',
    action: 'a renouvelé son abonnement',
    detail: 'Annuel · 720 €',
    time: 'Il y a 1 h',
    type: 'renewal',
  },
  {
    id: 'a5',
    name: 'Sofia Moretti',
    action: 'abonnement expiré',
    detail: 'À relancer',
    time: 'Il y a 2 h',
    type: 'expired',
  },
]

export type Member = {
  id: string
  name: string
  plan: string
  status: SubscriptionStatus
  daysLeft: number
  lastVisit: string
}

export const expiringMembers: Member[] = [
  { id: 'm1', name: 'Sofia Moretti', plan: 'Mensuel', status: 'expired', daysLeft: -2, lastVisit: '2 j' },
  { id: 'm2', name: 'Thomas Girard', plan: 'Mensuel', status: 'expiring', daysLeft: 1, lastVisit: 'Aujourd’hui' },
  { id: 'm3', name: 'Léa Rousseau', plan: 'Trimestriel', status: 'expiring', daysLeft: 3, lastVisit: 'Hier' },
  { id: 'm4', name: 'Omar Haddad', plan: 'Mensuel', status: 'expiring', daysLeft: 5, lastVisit: '3 j' },
]

export const topMembers = [
  { id: 't1', name: 'Nadia Cherif', sessions: 24, plan: 'Annuel' },
  { id: 't2', name: 'Lucas Bernard', sessions: 21, plan: 'Trimestriel' },
  { id: 't3', name: 'Amel Ziani', sessions: 19, plan: 'Annuel' },
  { id: 't4', name: 'Hugo Lefevre', sessions: 18, plan: 'Mensuel' },
]
