import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const ADMIN_EMAIL = "geschaeftsstelle@bielersee-suedwest.ch";
const FROM_EMAIL = `GVöS Bielersee Süd-West <${ADMIN_EMAIL}>`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function keyFromEnvironment(primary: string, collection: string) {
  const direct = Deno.env.get(primary);
  if (direct) return direct;
  try {
    const values = JSON.parse(Deno.env.get(collection) || "{}");
    return values.default || Object.values(values)[0];
  } catch {
    return undefined;
  }
}

function fill(template: string, values: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] || "");
}

function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]!);
}

function htmlBody(value: string) {
  return `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#17202a;max-width:680px">${htmlEscape(value).replace(/\n/g, "<br>")}</div>`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Zurich",
  }).format(new Date(value));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Methode nicht erlaubt" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Nicht angemeldet" }, 401);

  const publishableKey = keyFromEnvironment("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
  const secretKey = keyFromEnvironment("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");
  if (!publishableKey || !secretKey) return json({ error: "Supabase-Schlüssel fehlen" }, 500);

  const userClient = createClient(SUPABASE_URL, publishableKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const admin = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Ungültige Anmeldung" }, 401);

  const { data: profile } = await admin
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .single();
  if (!profile?.active) return json({ error: "Zugang ist nicht aktiv" }, 403);
  const internal = ["admin", "responder"].includes(profile.role);

  let input: { action?: string; reservation_id?: string; reservation_ids?: string[]; deadline?: string };
  try {
    input = await req.json();
  } catch {
    return json({ error: "Ungültige Anfrage" }, 400);
  }

  if (input.action === "health") {
    return json({ ok: true, configured: Boolean(RESEND_API_KEY), from: FROM_EMAIL, admin: ADMIN_EMAIL });
  }
  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY ist nicht hinterlegt" }, 500);

  const { data: templateRows, error: templateError } = await admin
    .from("mail_templates")
    .select("template_key, subject, body")
    .eq("active", true);
  if (templateError) return json({ error: "E-Mail-Vorlagen konnten nicht geladen werden" }, 500);
  const templates = Object.fromEntries((templateRows || []).map((row) => [row.template_key, row]));

  async function deliver(args: {
    reservationId?: string;
    recipient: string;
    mailType: string;
    subject: string;
    body: string;
    replyTo?: string;
    deduplicate?: boolean;
  }) {
    if (!/^\S+@\S+\.\S+$/.test(args.recipient)) throw new Error(`Ungültige E-Mail-Adresse: ${args.recipient}`);
    if (args.deduplicate !== false && args.reservationId) {
      const { data: existing } = await admin
        .from("mail_outbox")
        .select("id, provider_message_id")
        .eq("reservation_id", args.reservationId)
        .eq("recipient_email", args.recipient)
        .eq("mail_type", args.mailType)
        .eq("status", "sent")
        .maybeSingle();
      if (existing) return { id: existing.provider_message_id, duplicate: true };
    }

    const { data: queued, error: queueError } = await admin
      .from("mail_outbox")
      .insert({
        reservation_id: args.reservationId || null,
        recipient_email: args.recipient,
        mail_type: args.mailType,
        subject: args.subject,
        body: args.body,
        status: "queued",
      })
      .select("id")
      .single();
    if (queueError) throw queueError;

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [args.recipient],
          reply_to: args.replyTo || ADMIN_EMAIL,
          subject: args.subject,
          text: args.body,
          html: htmlBody(args.body),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.message || `Resend-Fehler ${response.status}`);
      await admin.from("mail_outbox").update({
        status: "sent",
        provider_message_id: result.id,
        sent_at: new Date().toISOString(),
        error_message: null,
      }).eq("id", queued.id);
      return { id: result.id, duplicate: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await admin.from("mail_outbox").update({ status: "failed", error_message: message }).eq("id", queued.id);
      throw error;
    }
  }

  async function reservationById(id?: string) {
    if (!id) throw new Error("Reservation fehlt");
    const { data, error } = await admin.from("reservations").select("*").eq("id", id).single();
    if (error || !data) throw new Error("Reservation nicht gefunden");
    if (!internal && data.requester_user_id !== user.id) throw new Error("Keine Berechtigung für diese Reservation");
    return data;
  }

  try {
    if (input.action === "inquiry") {
      const reservation = await reservationById(input.reservation_id);
      if (reservation.status !== "pending") return json({ error: "Die Reservation ist nicht mehr offen" }, 409);
      const values = {
        name: reservation.customer_name,
        object: reservation.product_name_snapshot,
        from: formatDate(reservation.starts_at),
        to: formatDate(reservation.ends_at),
      };
      const customerBody = `${fill(templates.inquiry?.body || "Guten Tag {{name}}\n\nWir haben Ihre Anfrage für {{object}} erhalten.", values)}\n\n${fill(templates.footer?.body || "", values)}`.trim();
      const customer = await deliver({
        reservationId: reservation.id,
        recipient: reservation.email,
        mailType: "inquiry",
        subject: fill(templates.inquiry?.subject || "Ihre Reservationsanfrage", values),
        body: customerBody,
      });
      const adminBody = [
        "Eine neue Reservationsanfrage ist eingegangen.",
        "",
        `Objekt: ${reservation.product_name_snapshot}`,
        `Zeitraum: ${values.from} bis ${values.to}`,
        `Name: ${reservation.customer_name}`,
        reservation.organisation ? `Organisation: ${reservation.organisation}` : "",
        `E-Mail: ${reservation.email}`,
        reservation.phone ? `Telefon: ${reservation.phone}` : "",
        reservation.note ? `Bemerkung: ${reservation.note}` : "",
      ].filter(Boolean).join("\n");
      const office = await deliver({
        reservationId: reservation.id,
        recipient: ADMIN_EMAIL,
        mailType: "inquiry",
        subject: `Neue Reservationsanfrage: ${reservation.product_name_snapshot}`,
        body: adminBody,
        replyTo: reservation.email,
      });
      return json({ ok: true, sent: 2, customer, office });
    }

    if (input.action === "confirmation") {
      if (!internal) return json({ error: "Nur interne Benutzer dürfen Bestätigungen versenden" }, 403);
      const reservation = await reservationById(input.reservation_id);
      if (reservation.status !== "confirmed") return json({ error: "Die Reservation ist nicht bestätigt" }, 409);
      if (!reservation.email) return json({ ok: true, sent: 0, skipped: "Keine E-Mail-Adresse" });
      const values = {
        name: reservation.customer_name,
        object: reservation.product_name_snapshot,
        from: formatDate(reservation.starts_at),
        to: formatDate(reservation.ends_at),
      };
      const body = `${fill(templates.confirmation?.body || "Guten Tag {{name}}\n\nIhre Reservation für {{object}} wurde bestätigt.", values)}\n\n${fill(templates.footer?.body || "", values)}`.trim();
      const sent = await deliver({
        reservationId: reservation.id,
        recipient: reservation.email,
        mailType: "confirmation",
        subject: fill(templates.confirmation?.subject || "Ihre Reservation wurde bestätigt", values),
        body,
      });
      return json({ ok: true, sent: 1, result: sent });
    }

    if (input.action === "emergency") {
      if (!internal) return json({ error: "Nur interne Benutzer dürfen Einsatzmails versenden" }, 403);
      const ids = [...new Set(input.reservation_ids || [])].slice(0, 200);
      if (!ids.length) return json({ ok: true, sent: 0 });
      const deadline = input.deadline ? formatDate(input.deadline) : formatDate(new Date(Date.now() + 12 * 3600000).toISOString());
      const { data: reservations, error } = await admin
        .from("reservations")
        .select("*")
        .in("id", ids)
        .eq("status", "confirmed");
      if (error) throw error;
      const results = [];
      for (const reservation of reservations || []) {
        if (!reservation.email) continue;
        const values = {
          name: reservation.customer_name,
          object: reservation.product_name_snapshot,
          deadline,
          from: formatDate(reservation.starts_at),
          to: formatDate(reservation.ends_at),
        };
        const body = `${fill(templates.emergency?.body || "Guten Tag {{name}}\n\nBitte retournieren Sie {{object}} bis spätestens {{deadline}}.", values)}\n\n${fill(templates.footer?.body || "", values)}`.trim();
        results.push(await deliver({
          reservationId: reservation.id,
          recipient: reservation.email,
          mailType: "emergency",
          subject: fill(templates.emergency?.subject || "Dringende Rückgabe aufgrund eines Einsatzes", values),
          body,
          deduplicate: false,
        }));
      }
      return json({ ok: true, sent: results.length, results });
    }

    if (input.action === "access_code_update") {
      if (profile.role !== "admin") return json({ error: "Nur Administratoren dürfen Codeinhaber informieren" }, 403);

      const { data: assignments, error: assignmentError } = await admin
        .from("access_code_assignments")
        .select("access_code_id, user_id")
        .eq("active", true);
      if (assignmentError) throw assignmentError;

      const assignedUserIds = [...new Set((assignments || []).map((assignment) => assignment.user_id))];
      if (!assignedUserIds.length) return json({ ok: true, sent: 0 });

      const { data: profiles, error: profilesError } = await admin
        .from("profiles")
        .select("id, display_name, organisation")
        .in("id", assignedUserIds)
        .eq("active", true);
      if (profilesError) throw profilesError;

      const recipients = new Map<string, { email: string; name: string }>();
      for (const recipientProfile of profiles || []) {
        const { data: authData, error: authError } = await admin.auth.admin.getUserById(recipientProfile.id);
        if (authError) throw authError;
        const email = authData.user?.email?.trim();
        if (!email) continue;
        recipients.set(email.toLowerCase(), {
          email,
          name: recipientProfile.display_name || recipientProfile.organisation || "Codeinhaberin oder Codeinhaber",
        });
      }

      const results = [];
      for (const recipient of recipients.values()) {
        const body = [
          `Guten Tag ${recipient.name}`,
          "",
          "Bei den Ihnen im BSW Reservationsportal zugewiesenen Zutrittscodes gab es Änderungen.",
          "",
          "Bitte melden Sie sich im Portal an und prüfen Sie Ihre aktuell freigeschalteten Codes.",
          "",
          "Freundliche Grüsse",
          "Gemeindeverband öffentliche Sicherheit Bielersee Süd-West",
        ].join("\n");
        results.push(await deliver({
          recipient: recipient.email,
          mailType: "other",
          subject: "Änderung bei den Zutrittscodes",
          body,
          deduplicate: false,
        }));
      }
      return json({ ok: true, sent: results.length, results });
    }

    return json({ error: "Unbekannte Aktion" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
});
