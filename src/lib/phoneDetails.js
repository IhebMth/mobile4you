// Supabase returns the embedded phone_details row as a single OBJECT when accessory_id is UNIQUE
// (one-to-one), and as an ARRAY otherwise. Code that did a.phone_details?.[0] therefore read
// "nothing" and the IMEI looked empty. This helper handles both shapes.
export function phoneOf(item) {
  const pd = item?.phone_details
  if (!pd) return null
  return Array.isArray(pd) ? pd[0] || null : pd
}

export const CONDITION_LABEL = { new: 'جديد', used: 'مستعمل' }
export const SOURCE_LABEL = { supplier: 'مورّد', client_trade_in: 'شراء من حريف' }