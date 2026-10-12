import { createClient } from "@supabase/supabase-js";
import { getProvider, type Channel } from "./provider";
import { templates, type TemplateKey } from "./templates";

interface QueueNotificationParams {
  associationId: string;
  userId: string;
  channel: Channel;
  eventType: TemplateKey;
  referenceId?: string;
  recipient: string;
}

export async function queueNotification(params: QueueNotificationParams) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const idempotencyKey = `${params.eventType}_${params.userId}_${params.referenceId || "none"}`;

  const { data: existing } = await supabase
    .from("notification_logs")
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .single();

  if (existing) return { status: "duplicate", logId: existing.id };

  const { data: preference } = await supabase
    .from("notification_preferences")
    .select("enabled")
    .eq("user_id", params.userId)
    .eq("channel", params.channel)
    .eq("event_type", params.eventType)
    .single();

  if (preference && !preference.enabled) return { status: "opted_out" };

  const { data: log, error } = await supabase
    .from("notification_logs")
    .insert({
      association_id: params.associationId,
      user_id: params.userId,
      channel: params.channel,
      event_type: params.eventType,
      recipient_hash: await hashRecipient(params.recipient),
      status: "queued",
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to queue notification: ${error.message}`);
  return { status: "queued", logId: log.id };
}

export async function processQueuedNotifications(limit = 50) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: queued } = await supabase
    .from("notification_logs")
    .select("*")
    .eq("status", "queued")
    .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (!queued || queued.length === 0) return { processed: 0 };

  let processed = 0;

  for (const log of queued) {
    try {
      const recipient = "recipient@example.com";
      const template = templates[log.event_type as TemplateKey];
      if (!template) throw new Error(`Unknown template: ${log.event_type}`);

      const provider = getProvider(log.channel as Channel);
      const result = await provider.send({
        to: recipient,
        subject: template.subject,
        body: template.body("placeholder", 0),
        template: log.event_type,
      });

      if (result.success) {
        await supabase.from("notification_logs").update({
          status: "sent",
          provider_message_id: result.messageId,
          sent_at: new Date().toISOString(),
        }).eq("id", log.id);
      } else {
        throw new Error(result.error || "Send failed");
      }
      processed++;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      const nextRetryAt = new Date(Date.now() + Math.pow(2, log.attempt_count) * 60000);

      await supabase.from("notification_logs").update({
        status: log.attempt_count >= 3 ? "failed" : "queued",
        error_message: errorMessage,
        attempt_count: log.attempt_count + 1,
        next_retry_at: nextRetryAt.toISOString(),
      }).eq("id", log.id);
    }
  }

  return { processed };
}

async function hashRecipient(recipient: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(recipient);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
