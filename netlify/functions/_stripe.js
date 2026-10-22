// HALO — shared Stripe helper for Netlify functions.
//
// DORMANT BY DESIGN. Everything here is inert until BOTH of these are true in
// the Netlify environment:
//   STRIPE_ENABLED = "true"
//   STRIPE_SECRET_KEY = sk_... (a real Stripe secret key)
//
// With STRIPE_ENABLED unset or "false" (the default, and how HALO ships today):
//   - the Stripe SDK is NEVER imported or initialized
//   - no Stripe network calls happen
//   - every helper returns a safe, no-op value instead of throwing
// So the functions and the app build and run exactly as before.
//
// Env vars (set in Netlify → halo-frame → Environment variables AT ACTIVATION):
//   STRIPE_ENABLED          — "true" to turn payments on (default: unset/false)
//   STRIPE_SECRET_KEY       — Stripe secret key (sk_live_... or sk_test_...)
//   STRIPE_WEBHOOK_SECRET   — signing secret for the webhook endpoint (whsec_...)
//   STRIPE_PRICE_EVENT      — price id for the per-event "Event" tier
//   STRIPE_PRICE_PREMIER    — price id for the per-event "Premier" tier
//   STRIPE_PRICE_STARTER    — price id for the per-event "Starter" tier (optional)
//   STRIPE_PRICE_HOST       — price id for the "Host" subscription
//   STRIPE_PRICE_PRO        — price id for the "Pro" subscription
//   STRIPE_PRICE_STUDIO     — price id for the "Studio" subscription
//
// NOTE: prices are NEVER hardcoded in code. We only read Stripe PRICE IDs from
// env. The dollar amounts live in Stripe and on the marketing page.

// The Stripe SDK is imported lazily (dynamic import) so the module is only ever
// loaded when payments are actually enabled. This keeps it out of the cold-start
// path and guarantees nothing breaks if the dependency is somehow unavailable
// while dormant.
let _stripe = null;
let _loadAttempted = false;

// True only when the flag is on AND a secret key is present. This is the single
// gate every other function should check before touching Stripe.
export function isStripeEnabled() {
  return process.env.STRIPE_ENABLED === "true" && !!process.env.STRIPE_SECRET_KEY;
}

// Lazily initialize and return the Stripe client, or null if payments are
// disabled / not configured. Never throws just because Stripe is off.
export async function getStripe() {
  if (!isStripeEnabled()) return null;
  if (_stripe) return _stripe;
  if (_loadAttempted) return _stripe; // don't retry a failed import in a loop
  _loadAttempted = true;
  try {
    const mod = await import("stripe");
    const Stripe = mod.default || mod;
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      // Pin an API version so behavior is stable once activated.
      apiVersion: "2025-08-27.basil",
      appInfo: { name: "HALO by Finesse Media" },
    });
    return _stripe;
  } catch (e) {
    // If the SDK isn't installed or fails to load, stay dormant rather than crash.
    console.error("Stripe init failed (staying disabled):", e && e.message);
    _stripe = null;
    return null;
  }
}

// Plan identifiers — mirror the marketing page tiers (public/landing.html).
// These are STRINGS the UI/functions pass around; the actual prices come from
// the matching price id in env (see priceIdForPlan below).
export const PLANS = {
  // Per-event (one-time) tiers
  STARTER: "starter",
  EVENT: "event",
  PREMIER: "premier",
  // Subscription tiers
  HOST: "host",
  PRO: "pro",
  STUDIO: "studio",
};

// Which plans are subscriptions vs. one-time per-event purchases.
export const SUBSCRIPTION_PLANS = [PLANS.HOST, PLANS.PRO, PLANS.STUDIO];
export const PER_EVENT_PLANS = [PLANS.STARTER, PLANS.EVENT, PLANS.PREMIER];

// Checkout mode for a given plan: "subscription" for recurring, "payment" for one-time.
export function checkoutModeForPlan(plan) {
  return SUBSCRIPTION_PLANS.includes(plan) ? "subscription" : "payment";
}

// Map a plan identifier → the Stripe price id held in env. Returns null if the
// plan is unknown or its price id isn't configured.
export function priceIdForPlan(plan) {
  const map = {
    [PLANS.STARTER]: process.env.STRIPE_PRICE_STARTER,
    [PLANS.EVENT]: process.env.STRIPE_PRICE_EVENT,
    [PLANS.PREMIER]: process.env.STRIPE_PRICE_PREMIER,
    [PLANS.HOST]: process.env.STRIPE_PRICE_HOST,
    [PLANS.PRO]: process.env.STRIPE_PRICE_PRO,
    [PLANS.STUDIO]: process.env.STRIPE_PRICE_STUDIO,
  };
  return map[plan] || null;
}

// Convenience: all configured price ids keyed by plan (null where unset).
export function allPriceIds() {
  return {
    [PLANS.STARTER]: process.env.STRIPE_PRICE_STARTER || null,
    [PLANS.EVENT]: process.env.STRIPE_PRICE_EVENT || null,
    [PLANS.PREMIER]: process.env.STRIPE_PRICE_PREMIER || null,
    [PLANS.HOST]: process.env.STRIPE_PRICE_HOST || null,
    [PLANS.PRO]: process.env.STRIPE_PRICE_PRO || null,
    [PLANS.STUDIO]: process.env.STRIPE_PRICE_STUDIO || null,
  };
}

// The webhook signing secret (or null while dormant / unconfigured).
export function webhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET || null;
}
