import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

// Called by a Database Webhook every time a row is inserted into `notifications`.
// Finds the phones of the recipients and sends the Web Push. Dead subscriptions are deleted.
webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)
// the key is stored under SUPABASE_SERVICE_ROLE_KEY (built in) or SERVICE_ROLE_KEY (your own secret)
const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  (Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
)

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) {
    return new Response('forbidden', { status: 403 })
  }
  const { record: n } = await req.json()
  if (!n) return new Response('no record')

  let userIds: string[] = []
  if (n.recipient_id) userIds = [n.recipient_id]
  else if (n.recipient_role) {
    const roles = n.recipient_role === 'admin' ? ['admin', 'super_admin'] : [n.recipient_role]
    const { data } = await db.from('profiles').select('id').in('role', roles)
    userIds = (data ?? []).map((p: { id: string }) => p.id)
  }
  if (!userIds.length) return new Response('no recipients')

  const { data: subs } = await db.from('push_subscriptions').select('*').in('user_id', userIds)
  const payload = JSON.stringify({ title: n.title, body: n.message, url: n.link_path || '/', tag: n.id })

  await Promise.all((subs ?? []).map(async (s: any) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
    } catch (e: any) {
      // 404 / 410 = the phone removed the subscription: forget it. Anything else is written to the logs.
      if (e.statusCode === 404 || e.statusCode === 410) await db.from('push_subscriptions').delete().eq('id', s.id)
      else console.error('push failed', e.statusCode, String(e.body || e.message).slice(0, 200))
    }
  }))
  console.log('push sent to', (subs ?? []).length, 'device(s) for notification', n.id)
  return new Response('ok')
})
