import { NextResponse } from "next/server";
import { supabaseRest } from "@/services/supabase-server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SESSION_SECONDS = 86400;
const MAX_SESSION_POKES = 1000000;

type SessionPayload = {
  visitor_id?: unknown;
  session_id?: unknown;
  started_at?: unknown;
  duration_seconds?: unknown;
  pokes?: unknown;
  give_jelly_opened?: unknown;
  sound_muted?: unknown;
  share_clicked?: unknown;
};

function parseBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function parseBoundedInteger(value: unknown, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) {
    return null;
  }

  return value;
}

function parseIsoDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

export async function POST(request: Request) {
  let payload: SessionPayload;

  try {
    payload = await request.json() as SessionPayload;
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const duration = parseBoundedInteger(payload.duration_seconds, MAX_SESSION_SECONDS);
  const pokes = parseBoundedInteger(payload.pokes, MAX_SESSION_POKES);
  const giveJellyOpened = parseBoolean(payload.give_jelly_opened);
  const startedAt = parseIsoDate(payload.started_at);
  const visitorId = typeof payload.visitor_id === "string" && UUID_PATTERN.test(payload.visitor_id) ? payload.visitor_id : null;
  const sessionId = typeof payload.session_id === "string" && UUID_PATTERN.test(payload.session_id) ? payload.session_id : null;
  const soundMuted = typeof payload.sound_muted === "boolean" ? payload.sound_muted : null;
  const shareClicked = typeof payload.share_clicked === "boolean" ? payload.share_clicked : null;

  if (!visitorId || !sessionId || !startedAt || duration === null || pokes === null || giveJellyOpened === null) {
    return NextResponse.json({ error: "Invalid session analytics payload." }, { status: 400 });
  }

  try {
    await supabaseRest("/rest/v1/jelly_sessions?on_conflict=session_id", {
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: {
        visitor_id: visitorId,
        session_id: sessionId,
        started_at: startedAt,
        last_seen_at: new Date().toISOString(),
        duration_seconds: duration,
        pokes,
        give_jelly_opened: giveJellyOpened,
        sound_muted: soundMuted,
        share_clicked: shareClicked,
        user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
        updated_at: new Date().toISOString()
      }
    });

    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update analytics session." }, { status: 500 });
  }
}
