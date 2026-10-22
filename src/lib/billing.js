// HALO — frontend billing helper.
//
// DORMANT by default. The pay buttons/UI should hide or disable themselves while
// billing is off, which they can check with isBillingEnabled(). Even if the UI
// calls startCheckout() while off, the function returns a graceful "coming soon"
// (comingSoon:true) instead of erroring — no charge, no crash.
//
// This file builds NO UI. It only exposes the plan constants and the helpers the
// account/pricing UI (built by other agents) can call.
//
// Env (Vite, exposed to the browser):
//   VITE_STRIPE_ENABLED — "true" to show pay buttons (default: unset/false)

// Plan identifiers — mirror the marketing tiers on public/landing.html and the
// server-side PLANS in netlify/functions/_stripe.js. Keep these in sync.
export const PLANS = {
  // Per-event (one-time)
  STARTER: "starter",
  EVENT: "event",
  PREMIER: "premier",
  // Subscription (monthly)
  HOST: "host",
  PRO: "pro",
  STUDIO: "studio",
};

export const SUBSCRIPTION_PLANS = [PLANS.HOST, PLANS.PRO, PLANS.STUDIO];
export const PER_EVENT_PLANS = [PLANS.STARTER, PLANS.EVENT, PLANS.PREMIER];

// Whether the pay UI should be shown at all. Reads the Vite env flag; defaults
// to false so buttons stay hidden until launch. Wrapped so a missing
// import.meta.env never throws.
export function isBillingEnabled() {
  try {
    return import.meta.env.VITE_STRIPE_ENABLED === "true";
  } catch {
    return false;
  }
}

// Start a checkout for the given plan.
//
//   plan    — one of the PLANS values
//   session — the user's Supabase session (for the Bearer access token). Pass
//             the session object or just the access token string.
//   opts    — optional { eventId } for a per-event purchase.
//
// Returns one of:
//   { ok:true, url }                 → redirect the browser here to pay
//   { ok:false, comingSoon:true, message } → billing is off; show the message
//   { ok:false, error }              → something went wrong; show the error
//
// The UI decides how to surface each. startCheckout never throws for a normal
// "payments off" response — that's the comingSoon flag.
export async function startCheckout(plan, session, opts = {}) {
  // Local guard so we don't even hit the network while the flag is off. The
  // function also returns enabled:false, but this is the fast path.
  if (!isBillingEnabled()) {
    return { ok: false, comingSoon: true, message: "Payments are coming soon." };
  }

  const token =
    typeof session === "string"
      ? session
      : session && session.access_token
      ? session.access_token
      : null;

  const origin = typeof window !== "undefined" && window.location ? window.location.origin : undefined;

  try {
    const res = await fetch("/.netlify/functions/create-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ plan, origin, eventId: opts.eventId || undefined }),
    });

    const data = await res.json().catch(() => ({}));

    // The function returns 200 { enabled:false } when payments are off.
    if (data && data.enabled === false) {
      return { ok: false, comingSoon: true, message: data.message || "Payments are coming soon." };
    }
    if (!res.ok) {
      return { ok: false, error: (data && data.error) || "Could not start checkout." };
    }
    if (data && data.url) {
      return { ok: true, url: data.url };
    }
    return { ok: false, error: "Checkout did not return a URL." };
  } catch (e) {
    return { ok: false, error: (e && e.message) || "Network error starting checkout." };
  }
}

// Convenience: redirect the browser straight to Stripe Checkout for a plan.
// Returns the same shape as startCheckout when it can't redirect (so the UI can
// show the coming-soon/error message); on success it navigates away.
export async function goToCheckout(plan, session, opts = {}) {
  const result = await startCheckout(plan, session, opts);
  if (result.ok && result.url && typeof window !== "undefined") {
    window.location.href = result.url;
  }
  return result;
}
