// Payment + pickup helpers for the comptoir screens.
// The app never sets repair_orders.is_paid. Payment is derived like this:
//   not delivered yet            -> 'pending'  (the client pays at pickup)
//   delivered, no open debt      -> 'paid'
//   delivered, debt still open   -> 'partial'  (remaining = debt.amount - debt.paid_amount)
// A debt row (kind 'client_unpaid') is created by mark_order_unpaid() when the client leaves without paying everything.
export function paymentOf(order) {
  const total = order.final_price != null ? Number(order.final_price) - Number(order.discount || 0) : null
  const debt = (order.debts || []).find((d) => d.kind === 'client_unpaid')
  const remaining = debt ? Math.max(0, Number(debt.amount) - Number(debt.paid_amount)) : 0
  let state = 'pending'
  if (order.status === 'delivered') state = remaining > 0 ? 'partial' : 'paid'
  const paid = total != null ? Math.max(0, total - remaining) : null
  return { state, total, remaining, paid }
}

export function formatEta(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleString('fr-TN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
