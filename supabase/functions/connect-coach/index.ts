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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user?.email) throw new Error("Authentication required.");
    if (authData.user.user_metadata?.role === "coach") {
      throw new Error("Coach accounts cannot designate another coach.");
    }

    const body = await request.json();
    const acceptedCoachInvite = body.invite === true;
    const coachEmail = String(body.coachEmail || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(coachEmail)) {
      throw new Error("Enter a valid coach email.");
    }
    const { data: coachRow, error: coachError } = await adminClient
      .from("portal_states")
      .select("owner_email, state")
      .eq("owner_email", coachEmail)
      .eq("role", "coach")
      .maybeSingle();
    if (coachError) throw coachError;
    if (!coachRow) throw new Error("No coach account exists for that email yet.");

    const memberEmail = authData.user.email.toLowerCase();
    const { data: memberRow, error: memberError } = await adminClient
      .from("portal_states")
      .select("state")
      .eq("owner_id", authData.user.id)
      .single();
    if (memberError || !memberRow) throw new Error("Complete your financial profile before connecting a coach.");

    const state = memberRow.state || {};
    const member = state.accounts?.[memberEmail] || {};
    const coachAccount = coachRow.state?.accounts?.[coachEmail] || {};
    const coachName = coachAccount.name || "F.I.T. coach";
    member.coachEmail = coachEmail;
    member.coachName = coachName;
    member.coachRequestStatus = acceptedCoachInvite ? "approved" : "pending";
    state.accounts = { ...(state.accounts || {}), [memberEmail]: member };
    state.coachRequests = (state.coachRequests || []).map((item: Record<string, unknown>) =>
      item.memberEmail === memberEmail && item.status === "pending"
        ? { ...item, status: "replaced" }
        : item
    );
    state.coachRequests.push({
      id: crypto.randomUUID(),
      memberEmail,
      coachEmail,
      status: acceptedCoachInvite ? "approved" : "pending",
      createdAt: new Date().toISOString(),
      respondedAt: acceptedCoachInvite ? new Date().toISOString() : null,
    });

    const { error: updateError } = await adminClient
      .from("portal_states")
      .update({ coach_email: coachEmail, state, updated_at: new Date().toISOString() })
      .eq("owner_id", authData.user.id);
    if (updateError) throw updateError;

    return new Response(JSON.stringify({ ok: true, coachEmail, coachName }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
