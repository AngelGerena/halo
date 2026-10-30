// HALO: a one-tap "confirm my email and sign me in" link for a new host.
//
// Supabase's built-in mailer is not reliable for us (it can silently skip
// addresses), so HALO sends the confirmation itself through Resend.
//
// We use a "recovery" link on purpose: opening it marks the email confirmed
// and signs the person in (then lands them on their dashboard), and unlike a
// "magiclink" it never creates an account for an unknown address.
import { siteBase } from "./_email.js";

export async function confirmLinkFor(supabase, email) {
  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${siteBase()}/dashboard` },
    });
    if (error || !data) return null;
    const link = (data.properties && data.properties.action_link) || null;
    return link ? { link, user: data.user || null } : null;
  } catch {
    return null;
  }
}
