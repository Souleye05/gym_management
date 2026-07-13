import type { Subscription } from './types'

function daysFromNow(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

export const mockSubscriptions: Subscription[] = [
  { id: 'sub1', clientId: 'cl1', planId: 'quarterly', startDate: daysFromNow(-60), endDate: daysFromNow(30), suspended: false, amountPaid: 105, paymentMethod: 'cash', createdAt: daysFromNow(-60) },
  { id: 'sub2', clientId: 'cl2', planId: 'monthly', startDate: daysFromNow(-15), endDate: daysFromNow(15), suspended: false, amountPaid: 40, paymentMethod: 'card', createdAt: daysFromNow(-15) },
  { id: 'sub3', clientId: 'cl3', planId: 'monthly', startDate: daysFromNow(-27), endDate: daysFromNow(3), suspended: false, amountPaid: 40, paymentMethod: 'cash', createdAt: daysFromNow(-27) },
  { id: 'sub4', clientId: 'cl4', planId: 'annual', startDate: daysFromNow(-100), endDate: daysFromNow(265), suspended: false, amountPaid: 350, paymentMethod: 'mobile_money', createdAt: daysFromNow(-100) },
  { id: 'sub5', clientId: 'cl5', planId: 'monthly', startDate: daysFromNow(-45), endDate: daysFromNow(-15), suspended: false, amountPaid: 40, paymentMethod: 'cash', createdAt: daysFromNow(-45) },
  { id: 'sub6', clientId: 'cl6', planId: 'quarterly', startDate: daysFromNow(-85), endDate: daysFromNow(5), suspended: false, amountPaid: 105, paymentMethod: 'card', createdAt: daysFromNow(-85) },
  { id: 'sub7', clientId: 'cl7', planId: 'monthly', startDate: daysFromNow(-28), endDate: daysFromNow(2), suspended: false, amountPaid: 40, paymentMethod: 'cash', createdAt: daysFromNow(-28) },
  { id: 'sub8', clientId: 'cl8', planId: 'biannual', startDate: daysFromNow(-50), endDate: daysFromNow(130), suspended: false, amountPaid: 190, paymentMethod: 'card', createdAt: daysFromNow(-50) },
  { id: 'sub9', clientId: 'cl9', planId: 'annual', startDate: daysFromNow(-200), endDate: daysFromNow(165), suspended: false, amountPaid: 350, paymentMethod: 'mobile_money', createdAt: daysFromNow(-200) },
  { id: 'sub10', clientId: 'cl10', planId: 'monthly', startDate: daysFromNow(-10), endDate: daysFromNow(20), suspended: false, amountPaid: 40, paymentMethod: 'cash', createdAt: daysFromNow(-10) },
  { id: 'sub11', clientId: 'cl11', planId: 'quarterly', startDate: daysFromNow(-40), endDate: daysFromNow(50), suspended: false, amountPaid: 105, paymentMethod: 'card', createdAt: daysFromNow(-40) },
  { id: 'sub12', clientId: 'cl12', planId: 'monthly', startDate: daysFromNow(-60), endDate: daysFromNow(-30), suspended: false, amountPaid: 40, paymentMethod: 'cash', createdAt: daysFromNow(-60) },
  { id: 'sub15', clientId: 'cl15', planId: 'biannual', startDate: daysFromNow(-70), endDate: daysFromNow(110), suspended: true, amountPaid: 190, paymentMethod: 'card', createdAt: daysFromNow(-70) },
  { id: 'sub16', clientId: 'cl16', planId: 'monthly', startDate: daysFromNow(-90), endDate: daysFromNow(-60), suspended: false, amountPaid: 40, paymentMethod: 'cash', createdAt: daysFromNow(-90) },
  { id: 'sub17', clientId: 'cl17', planId: 'monthly', startDate: daysFromNow(-29), endDate: daysFromNow(1), suspended: false, amountPaid: 40, paymentMethod: 'mobile_money', createdAt: daysFromNow(-29) },
  { id: 'sub18', clientId: 'cl18', planId: 'annual', startDate: daysFromNow(-150), endDate: daysFromNow(215), suspended: false, amountPaid: 350, paymentMethod: 'card', createdAt: daysFromNow(-150) },
]
