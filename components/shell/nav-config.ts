import {
  BarChart3,
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  QrCode,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/lib/auth/types'

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  badge?: string
  roles: Role[]
}

const ALL_ROLES: Role[] = ['admin', 'agent']

export const primaryNav: NavItem[] = [
  { label: 'Tableau de bord', href: '/', icon: LayoutDashboard, roles: ALL_ROLES },
  { label: 'Clients', href: '/clients', icon: Users, badge: '486', roles: ALL_ROLES },
  { label: 'Abonnements', href: '/abonnements', icon: CreditCard, badge: '27', roles: ALL_ROLES },
  { label: 'Séances', href: '/seances', icon: CalendarDays, roles: ALL_ROLES },
  { label: 'Scan QR', href: '/scan', icon: QrCode, roles: ALL_ROLES },
  { label: 'Statistiques', href: '/statistiques', icon: BarChart3, roles: ALL_ROLES },
]

export const secondaryNav: NavItem[] = [
  { label: 'Paramètres', href: '/parametres', icon: Settings, roles: ['admin'] },
]

/* Condensed set for the mobile bottom navigation */
export const bottomNav: NavItem[] = [
  { label: 'Accueil', href: '/', icon: LayoutDashboard, roles: ALL_ROLES },
  { label: 'Clients', href: '/clients', icon: Users, roles: ALL_ROLES },
  { label: 'Scan', href: '/scan', icon: QrCode, roles: ALL_ROLES },
  { label: 'Séances', href: '/seances', icon: CalendarDays, roles: ALL_ROLES },
  { label: 'Stats', href: '/statistiques', icon: BarChart3, roles: ALL_ROLES },
]
