import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const normalizeEmail = (value: unknown) => String(value || "").trim().toLowerCase();
const validEmail = (value: string) =>
  value.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Authentication required.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const emailFrom = Deno.env.get("EMAIL_FROM") || "WEAREFIT <invites@notifications.fit-training.org>";
    const appUrl = Deno.env.get("APP_URL") || "https://fit-training.org/";

    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) throw new Error("Authentication required.");

    const metadata = authData.user.user_metadata || {};
    if (metadata.role !== "coach") throw new Error("Only coach accounts can send mentee invitations.");
    const coachName = typeof metadata.name === "string" && metadata.name.trim()
      ? metadata.name.trim()
      : "Your coach";
    const coachEmail = normalizeEmail(authData.user.email);

    const { memberEmail } = await request.json();
    const normalizedMemberEmail = normalizeEmail(memberEmail);
    if (!validEmail(normalizedMemberEmail)) {
      throw new Error("Enter a valid member email.");
    }
    const inviteUrl = new URL(appUrl);
    inviteUrl.searchParams.set("coachInvite", coachEmail);
    const safeCoachName = escapeHtml(coachName);
    const safeInviteUrl = escapeHtml(inviteUrl.toString());

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [normalizedMemberEmail],
        subject: `${coachName} invited you to WEAREFIT`,
        text: `${coachName} invited you to connect as a mentee in WEAREFIT. Accept the invitation: ${inviteUrl.toString()}`,
        html: `
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-family:Arial,sans-serif;color:#152033">
            <tr><td align="center"><table role="presentation" width="560" cellspacing="0" cellpadding="24" style="max-width:560px;width:100%">
              <tr><td><h1 style="color:#0d2859;margin:0 0 16px">You are invited to WEAREFIT</h1>
              <p>${safeCoachName} invited you to connect as a mentee.</p>
              <p><a href="${safeInviteUrl}" style="display:inline-block;background:#0d2859;color:#ffffff;padding:12px 18px;text-decoration:none;border-radius:6px">Accept coach invitation</a></p>
              <p style="font-size:12px;color:#647084">If the button does not open, use this secure link:<br><a href="${safeInviteUrl}">${safeInviteUrl}</a></p>
              <p style="font-size:12px;color:#647084">Only accept coaching invitations from people you recognize.</p></td></tr>
            </table></td></tr>
          </table>
        `,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Email provider rejected the invitation.");

    return new Response(JSON.stringify({ ok: true, id: result.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
