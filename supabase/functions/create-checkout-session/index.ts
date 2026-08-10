// Supabase Edge Function — creates a Stripe Checkout Session for a booking
// that already exists (inserted as status='confirmed', payment_status=
// 'pending_payment' by the client). Runs server-side only: this is the one
// place the Stripe SECRET key is used, read from an Edge Function secret
// (`supabase secrets set STRIPE_SECRET_KEY=sk_...`), never sent to the
// browser.
//
// Deploy: supabase functions deploy create-checkout-session

import Stripe from 'npm:stripe@17'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
})

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { bookingId, amount } = await req.json()
    if (!bookingId) {
      return new Response(JSON.stringify({ error: 'bookingId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Look up the booking server-side — never trust a price the client
    // computed on its own.
    const { data: booking, error: bookingErr } = await supabaseAdmin
      .from('bookings')
      .select('id, customer_name, booking_date, booking_time, payment_status, price')
      .eq('id', bookingId)
      .single()
    if (bookingErr || !booking) throw new Error('Booking not found')
    if (booking.payment_status === 'paid') {
      return new Response(JSON.stringify({ error: 'This booking is already paid.' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: settings, error: settingsErr } = await supabaseAdmin
      .from('booking_settings')
      .select('business_name, default_price, stripe_connected_account_id, stripe_charges_enabled')
      .limit(1)
      .maybeSingle()
    if (settingsErr) throw settingsErr
    if (!settings?.stripe_connected_account_id || !settings.stripe_charges_enabled) {
      throw new Error('This business has not finished connecting their Stripe account yet.')
    }

    // Prefer an explicit amount (owner assessed the job and is requesting
    // payment for this specific booking), falling back to the booking's
    // already-stored price, then a flat default_price if the business set
    // one. At least one of these must resolve to a positive number.
    const resolvedAmount = Number(amount ?? booking.price ?? settings?.default_price ?? 0)
    if (!resolvedAmount || resolvedAmount <= 0) {
      throw new Error('No price given — set an amount before requesting payment.')
    }
    if (resolvedAmount < 0.5) {
      throw new Error('Stripe requires a minimum charge of $0.50.')
    }

    const origin = req.headers.get('origin') ?? Deno.env.get('SITE_URL') ?? ''

    // Created directly on the connected account (Stripe-Account header, via
    // the { stripeAccount } request option below) — this is a Standard
    // Connect account the business owns outright, so the money settles
    // straight to their own bank account. We never take a cut and the funds
    // never pass through our platform account.
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: Math.round(resolvedAmount * 100),
              product_data: {
                name: `${settings?.business_name ?? 'Appointment'} — ${booking.booking_date} ${booking.booking_time}`,
              },
            },
            quantity: 1,
          },
        ],
        metadata: { booking_id: booking.id },
        success_url: `${origin}/?booking_id=${booking.id}&paid=1`,
        cancel_url: `${origin}/?booking_id=${booking.id}&paid=0`,
      },
      { stripeAccount: settings.stripe_connected_account_id },
    )

    await supabaseAdmin
      .from('bookings')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', booking.id)

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
