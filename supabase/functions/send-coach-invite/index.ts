import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Authentication required.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const emailFrom = Deno.env.get("EMAIL_FROM") || "WEAREFIT <invites@notifications.fit-training.org>";
    const appUrl = Deno.env.get("APP_URL") || "https://god-cannot-lie-ministries.github.io/WEAREFIT/";

    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) throw new Error("Authentication required.");

    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name, role")
      .eq("id", authData.user.id)
      .single();
    if (profile?.role !== "coach") throw new Error("Only coach accounts can send mentee invitations.");

    const { memberEmail } = await request.json();
    if (!memberEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(memberEmail)) {
      throw new Error("Enter a valid member email.");
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [memberEmail],
        subject: `${profile.full_name || "Your coach"} invited you to WEAREFIT`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#152033">
            <h1 style="color:#0d2859">You are invited to WEAREFIT</h1>
            <p>${profile.full_name || "A F.I.T. coach"} invited you to connect as a mentee.</p>
            <p><a href="${appUrl}" style="display:inline-block;background:#0d2859;color:white;padding:12px 18px;text-decoration:none;border-radius:6px">Open WEAREFIT</a></p>
            <p style="font-size:12px;color:#647084">Only accept coaching invitations from people you recognize.</p>
          </div>
        `,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Email provider rejected the invitation.");

    await adminClient.from("email_audit").insert({
      actor_id: authData.user.id,
      email_type: "coach_invite",
      recipient: memberEmail.toLowerCase(),
      provider_id: result.id,
      status: "sent",
    });

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
