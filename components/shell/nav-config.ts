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

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  badge?: string
}

export const primaryNav: NavItem[] = [
  { label: 'Tableau de bord', href: '/', icon: LayoutDashboard },
  { label: 'Clients', href: '/clients', icon: Users, badge: '486' },
  { label: 'Abonnements', href: '/abonnements', icon: CreditCard, badge: '27' },
  { label: 'Séances', href: '/seances', icon: CalendarDays },
  { label: 'Scan QR', href: '/scan', icon: QrCode },
  { label: 'Statistiques', href: '/statistiques', icon: BarChart3 },
]

export const secondaryNav: NavItem[] = [
  { label: 'Paramètres', href: '/parametres', icon: Settings },
]

/* Condensed set for the mobile bottom navigation */
export const bottomNav: NavItem[] = [
  { label: 'Accueil', href: '/', icon: LayoutDashboard },
  { label: 'Clients', href: '/clients', icon: Users },
  { label: 'Scan', href: '/scan', icon: QrCode },
  { label: 'Séances', href: '/seances', icon: CalendarDays },
  { label: 'Stats', href: '/statistiques', icon: BarChart3 },
]
