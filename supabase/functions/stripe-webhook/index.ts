// Supabase Edge Function — receives Stripe webhook events. Verifies the
// signature (never trust an unsigned request claiming "payment succeeded"),
// and on checkout.session.completed marks the matching booking as paid.
//
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
// (must be --no-verify-jwt: Stripe calls this directly, it can't send a
// Supabase auth header)
//
// Two webhook destinations point at this same URL (register both in the
// Stripe Dashboard -> Developers -> Webhooks):
//   1. Scope "Your account" — our own platform-account test payments.
//   2. Scope "Connected accounts" — real payments on behalf of businesses
//      onboarded via Stripe Connect (where real customer payments land).
// Each destination gets its own signing secret from Stripe. Set both via
// the CLI secrets command (see project notes for exact env var names).

import Stripe from 'npm:stripe@17'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
})

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const platformSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const connectSecret = Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET')

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  const body = await req.text()

  let event: Stripe.Event
  try {
    if (!signature) throw new Error('Missing stripe-signature header')
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, platformSecret)
    } catch (platformErr) {
      if (!connectSecret) throw platformErr
      event = await stripe.webhooks.constructEventAsync(body, signature, connectSecret)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature'
    return new Response(`Webhook signature verification failed: ${message}`, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const bookingId = session.metadata?.booking_id
    if (bookingId) {
      const { error } = await supabaseAdmin
        .from('bookings')
        .update({ payment_status: 'paid' })
        .eq('id', bookingId)
        .eq('stripe_checkout_session_id', session.id)
      if (error) {
        console.error('Failed to mark booking paid', bookingId, error)
        return new Response('DB update failed', { status: 500 })
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
