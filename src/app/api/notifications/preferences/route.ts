import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const preferenceSchema = z.object({
  channel: z.enum(["email", "sms", "whatsapp", "in_app"]),
  eventType: z.string(),
  enabled: z.boolean(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = preferenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { channel, eventType, enabled, quietHoursStart, quietHoursEnd } = parsed.data;

  const { error } = await supabase.from("notification_preferences").upsert(
    {
      user_id: user.id,
      channel,
      event_type: eventType,
      enabled,
      quiet_hours_start: quietHoursStart || null,
      quiet_hours_end: quietHoursEnd || null,
    },
    { onConflict: "user_id,channel,event_type" }
  );

  if (error) {
    return NextResponse.json({ error: "Failed to update preference" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch preferences" }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
