// HALO — create a Stripe Checkout Session for a plan.
//
// DORMANT until STRIPE_ENABLED=true (see _stripe.js). While dormant this returns
// 200 { enabled:false, message } so the UI can always call it and get a graceful
// "coming soon" instead of an error. No Stripe network calls happen while off.
import { createClient } from "@supabase/supabase-js";
import { authenticate } from "./_auth.js";
import {
  isStripeEnabled,
  getStripe,
  priceIdForPlan,
  checkoutModeForPlan,
  PLANS,
} from "./_stripe.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  // Graceful no-op while payments are off. The UI calls this safely and shows
  // a "coming soon" message.
  if (!isStripeEnabled()) {
    return {
      statusCode: 200,
      body: JSON.stringify({ enabled: false, message: "Payments are not enabled yet." }),
    };
  }

  // Authenticated callers only.
  const auth = await authenticate(event);
  if (!auth.ok) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const { plan, eventId, origin } = body;

  // Validate the plan and resolve its price id from env.
  const validPlans = Object.values(PLANS);
  if (!plan || !validPlans.includes(plan)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Unknown or missing plan." }) };
  }
  const price = priceIdForPlan(plan);
  if (!price) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `No Stripe price configured for plan "${plan}".` }),
    };
  }

  const stripe = await getStripe();
  if (!stripe) {
    // Flag was on but the SDK/secret wasn't usable — stay safe.
    return {
      statusCode: 200,
      body: JSON.stringify({ enabled: false, message: "Payments are not enabled yet." }),
    };
  }

  // Resolve the site origin for success/cancel URLs. Prefer the explicit value
  // the caller sent, then common Netlify headers, then env, then a safe default.
  const h = event.headers || {};
  const base = (
    origin ||
    h.origin ||
    h.Origin ||
    (h.host ? `https://${h.host}` : "") ||
    process.env.URL ||
    "https://halo.finessemedia.pro"
  ).replace(/\/+$/, "");

  const mode = checkoutModeForPlan(plan);

  try {
    // Reuse or create a Stripe customer tied to this user's profile. Admin
    // callers (no userId) get a one-off session with no stored customer.
    let customerId = null;
    let supabase = null;
    if (auth.userId && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const { data: profile } = await supabase
        .from("profiles")
        .select("stripe_customer_id, email")
        .eq("id", auth.userId)
        .single();

      customerId = profile && profile.stripe_customer_id ? profile.stripe_customer_id : null;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: (profile && profile.email) || undefined,
          metadata: { halo_user_id: auth.userId },
        });
        customerId = customer.id;
        // Persist the dormant column so repeat checkouts reuse the customer.
        await supabase
          .from("profiles")
          .update({ stripe_customer_id: customerId })
          .eq("id", auth.userId);
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode,
      ...(customerId ? { customer: customerId } : {}),
      line_items: [{ price, quantity: 1 }],
      success_url: `${base}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/account?checkout=cancelled`,
      client_reference_id: auth.userId || undefined,
      metadata: {
        halo_plan: plan,
        halo_user_id: auth.userId || "",
        halo_event_id: eventId || "",
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ enabled: true, url: session.url, id: session.id }),
    };
  } catch (e) {
    console.error("create-checkout error:", e && e.message);
    return { statusCode: 500, body: JSON.stringify({ error: "Could not start checkout." }) };
  }
}
