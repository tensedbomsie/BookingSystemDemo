// Supabase Edge Function — Stripe Connect onboarding for the business owner.
//
// Standard Connect account: once onboarded, the business owns that Stripe
// account outright (their own dashboard, their own bank account, their own
// Stripe ToS acceptance). We only ever call the Stripe API "on behalf of"
// that account id when creating Checkout Sessions — money never passes
// through our platform account.
//
// Two actions, both POST { action: 'onboard' | 'status' }:
//  - onboard: creates the connected account if it doesn't exist yet, returns
//    a fresh Account Link URL to send the owner to Stripe's hosted
//    onboarding flow.
//  - status: re-checks the connected account with Stripe and syncs
//    charges_enabled into booking_settings (call this when the owner lands
//    back on /dashboard after onboarding).
//
// Deploy: supabase functions deploy connect-stripe

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { action } = await req.json()
    const origin = req.headers.get('origin') ?? Deno.env.get('SITE_URL') ?? ''

    const { data: settings, error: settingsErr } = await supabaseAdmin
      .from('booking_settings')
      .select('id, business_name, stripe_connected_account_id')
      .limit(1)
      .maybeSingle()
    if (settingsErr) throw settingsErr
    if (!settings) throw new Error('booking_settings row not found — run schema.sql first.')

    if (action === 'status') {
      if (!settings.stripe_connected_account_id) {
        return json({ connected: false, chargesEnabled: false })
      }
      const account = await stripe.accounts.retrieve(settings.stripe_connected_account_id)
      await supabaseAdmin
        .from('booking_settings')
        .update({ stripe_charges_enabled: account.charges_enabled })
        .eq('id', settings.id)
      return json({ connected: true, chargesEnabled: account.charges_enabled })
    }

    if (action === 'onboard') {
      let accountId = settings.stripe_connected_account_id

      if (!accountId) {
        const account = await stripe.accounts.create({
          type: 'standard',
          business_profile: settings.business_name ? { name: settings.business_name } : undefined,
        })
        accountId = account.id
        await supabaseAdmin
          .from('booking_settings')
          .update({ stripe_connected_account_id: accountId })
          .eq('id', settings.id)
      }

      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${origin}/dashboard?stripe_connect=refresh`,
        return_url: `${origin}/dashboard?stripe_connect=return`,
        type: 'account_onboarding',
      })

      return json({ url: accountLink.url })
    }

    return json({ error: 'action must be "onboard" or "status"' }, 400)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
