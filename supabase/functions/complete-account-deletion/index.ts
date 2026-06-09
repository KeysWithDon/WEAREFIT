import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const normalizeEmail = (value: unknown) => String(value || "").trim().toLowerCase();
async function sha256(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { email: rawEmail, token } = await request.json();
    const email = normalizeEmail(rawEmail);
    if (!email || !token || String(token).length < 60) throw new Error("This verification link is invalid.");
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const tokenHash = await sha256(String(token));
    const { data: deletionRequest, error: lookupError } = await adminClient
      .from("account_deletion_requests")
      .select("id, user_id, email, account_role, expires_at, used_at")
      .eq("email", email)
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!deletionRequest) throw new Error("This verification link is invalid.");
    if (deletionRequest.used_at) throw new Error("This verification link has already been used.");
    if (new Date(deletionRequest.expires_at) <= new Date()) throw new Error("This verification link has expired.");
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", deletionRequest.user_id)
      .eq("email", email)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || !["user", "coach"].includes(profile.role)) {
      throw new Error("This account could not be verified.");
    }
    if (deletionRequest.account_role && deletionRequest.account_role !== profile.role) {
      throw new Error("This verification link does not match the account.");
    }

    const usedAt = new Date().toISOString();
    const { data: markedRequest, error: markError } = await adminClient
      .from("account_deletion_requests")
      .update({ used_at: usedAt })
      .eq("id", deletionRequest.id)
      .is("used_at", null)
      .select("id")
      .maybeSingle();
    if (markError) throw markError;
    if (!markedRequest) throw new Error("This verification link has already been used.");

    for (const bucket of ["profile-photos", "financial-documents"]) {
      const { data: categories } = await adminClient.storage.from(bucket).list(deletionRequest.user_id, {
        limit: 1000,
      });
      for (const category of categories || []) {
        const categoryPath = `${deletionRequest.user_id}/${category.name}`;
        const { data: files } = await adminClient.storage.from(bucket).list(categoryPath, { limit: 1000 });
        if (files?.length) {
          await adminClient.storage.from(bucket).remove(files.map((file) => `${categoryPath}/${file.name}`));
        }
      }
    }
    const { data: connectedMembers } = await adminClient
      .from("portal_states")
      .select("owner_id, owner_email, state")
      .eq("coach_email", email);
    for (const row of connectedMembers || []) {
      const state = row.state || {};
      const member = state.accounts?.[row.owner_email];
      if (member) {
        member.coachEmail = null;
        member.coachName = "";
        member.coachRequestStatus = null;
      }
      state.coachRequests = (state.coachRequests || []).filter(
        (item: { coachEmail?: string }) => normalizeEmail(item.coachEmail) !== email,
      );
      state.coachInvites = (state.coachInvites || []).filter(
        (item: { coachEmail?: string }) => normalizeEmail(item.coachEmail) !== email,
      );
      await adminClient
        .from("portal_states")
        .update({ coach_email: null, state, updated_at: usedAt })
        .eq("owner_id", row.owner_id);
    }
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(deletionRequest.user_id);
    if (deleteError) throw deleteError;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
