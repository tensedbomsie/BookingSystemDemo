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
    const { bookingId } = await req.json()
    if (!bookingId) {
      return new Response(JSON.stringify({ error: 'bookingId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Look up the booking + the business's price/name server-side — never
    // trust an amount passed in from the client.
    const { data: booking, error: bookingErr } = await supabaseAdmin
      .from('bookings')
      .select('id, customer_name, booking_date, booking_time, payment_status')
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
      .select('business_name, default_price')
      .limit(1)
      .maybeSingle()
    if (settingsErr) throw settingsErr
    if (!settings?.default_price || settings.default_price <= 0) {
      throw new Error('No service price configured — set it in Settings first.')
    }

    const origin = req.headers.get('origin') ?? Deno.env.get('SITE_URL') ?? ''

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(settings.default_price * 100),
            product_data: {
              name: `${settings.business_name} — Appointment (${booking.booking_date} ${booking.booking_time})`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: { booking_id: booking.id },
      success_url: `${origin}/?booking_id=${booking.id}&paid=1`,
      cancel_url: `${origin}/?booking_id=${booking.id}&paid=0`,
    })

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
