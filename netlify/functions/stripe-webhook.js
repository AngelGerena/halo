// HALO — Stripe webhook receiver.
//
// DORMANT until STRIPE_ENABLED=true (see _stripe.js). While dormant it returns a
// 200 no-op so a misfired delivery can never crash the function. When enabled it
// verifies the Stripe signature with STRIPE_WEBHOOK_SECRET and, on the events we
// care about, updates the user's profile (subscription_status, plan,
// stripe_subscription_id) and/or an event's `paid` flag via the service role.
//
// These writes target the DORMANT columns added in the Phase 1 SQL
// (profiles.plan, profiles.stripe_customer_id, profiles.stripe_subscription_id,
// profiles.subscription_status; events.paid, events.stripe_payment_intent). This
// function does NOT create those columns — it only writes to them once live.
import { createClient } from "@supabase/supabase-js";
import { isStripeEnabled, getStripe, webhookSecret } from "./_stripe.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  // Graceful no-op while payments are off — nothing to verify, nothing to do.
  if (!isStripeEnabled()) {
    return { statusCode: 200, body: JSON.stringify({ enabled: false }) };
  }

  const secret = webhookSecret();
  const stripe = await getStripe();
  if (!secret || !stripe) {
    // Can't verify without a signing secret or SDK — refuse rather than trust.
    console.error("stripe-webhook: missing signing secret or Stripe client.");
    return { statusCode: 200, body: JSON.stringify({ enabled: false }) };
  }

  const h = event.headers || {};
  const sig = h["stripe-signature"] || h["Stripe-Signature"];
  if (!sig) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing signature." }) };
  }

  // Stripe signature verification requires the EXACT raw request body. Netlify
  // may base64-encode it (isBase64Encoded), so decode back to the raw string.
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : (event.body || "");

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (e) {
    console.error("stripe-webhook signature check failed:", e && e.message);
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid signature." }) };
  }

  // Service-role client for the privileged profile/event updates.
  let supabase = null;
  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    }
  } catch (e) {
    console.error("stripe-webhook supabase init warning:", e && e.message);
  }

  try {
    switch (stripeEvent.type) {
      case "checkout.session.completed": {
        const session = stripeEvent.data.object;
        const userId = (session.metadata && session.metadata.halo_user_id) || session.client_reference_id || null;
        const plan = (session.metadata && session.metadata.halo_plan) || null;
        const eventId = (session.metadata && session.metadata.halo_event_id) || null;

        if (supabase && userId) {
          const patch = {};
          if (plan) patch.plan = plan;
          if (session.mode === "subscription") {
            if (session.subscription) patch.stripe_subscription_id = session.subscription;
            patch.subscription_status = "active";
          }
          if (session.customer) patch.stripe_customer_id = session.customer;
          if (Object.keys(patch).length) {
            await supabase.from("profiles").update(patch).eq("id", userId);
          }
        }

        // One-time per-event purchase: mark that event paid.
        if (supabase && eventId && session.mode === "payment") {
          await supabase
            .from("events")
            .update({ paid: true, stripe_payment_intent: session.payment_intent || null })
            .eq("id", eventId);
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = stripeEvent.data.object;
        const userId = sub.metadata && sub.metadata.halo_user_id;
        if (supabase) {
          const patch = {
            subscription_status: sub.status,
            stripe_subscription_id: sub.id,
          };
          if (userId) {
            await supabase.from("profiles").update(patch).eq("id", userId);
          } else if (sub.customer) {
            // Fall back to matching by the stored customer id.
            await supabase.from("profiles").update(patch).eq("stripe_customer_id", sub.customer);
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = stripeEvent.data.object;
        if (supabase && sub.customer) {
          await supabase
            .from("profiles")
            .update({ subscription_status: "canceled" })
            .eq("stripe_customer_id", sub.customer);
        }
        break;
      }

      default:
        // Ignore unhandled event types — just acknowledge receipt.
        break;
    }
  } catch (e) {
    // Never 500 on a handler error: log it, ack the event so Stripe doesn't
    // hammer retries, and let it be reconciled manually if needed.
    console.error("stripe-webhook handler warning:", e && e.message);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
}
