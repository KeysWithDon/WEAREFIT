import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: request.headers.get("Authorization") || "" } } },
    );
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: authData, error: authError } = await auth.auth.getUser();
    if (authError || !authData.user?.email) throw new Error("Sign in as the assigned coach.");
    const coachEmail = authData.user.email.trim().toLowerCase();
    const memberEmail = String((await request.json()).memberEmail || "").trim().toLowerCase();
    const { data: memberRow, error } = await admin.from("portal_states").select("*").eq("owner_email", memberEmail).single();
    if (error || !memberRow) throw new Error("Mentee account not found.");
    if (memberRow.coach_email !== coachEmail) throw new Error("Only the assigned coach can remove this mentee.");
    const state = memberRow.state || {};
    const member = state.accounts?.[memberEmail] || {};
    member.coachEmail = null;
    member.coachName = "";
    member.coachRequestStatus = null;
    state.coachRequests = (state.coachRequests || []).map((item: Record<string, unknown>) =>
      item.memberEmail === memberEmail && item.coachEmail === coachEmail ? { ...item, status: "removed", respondedAt: new Date().toISOString() } : item
    );
    Object.values(state.forms || {}).forEach((form: any) => {
      form.sharedWith = (form.sharedWith || []).filter((email: string) => email !== coachEmail);
    });
    const { error: updateError } = await admin.from("portal_states").update({
      coach_email: null,
      state,
      updated_at: new Date().toISOString(),
    }).eq("owner_email", memberEmail).eq("coach_email", coachEmail);
    if (updateError) throw updateError;
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Removal failed." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
