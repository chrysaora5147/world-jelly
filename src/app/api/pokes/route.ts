import { NextResponse } from "next/server";
import { supabaseRest } from "@/services/supabase-server";

const MAX_DELTA_PER_REQUEST = 500;

type JellyStatsRow = {
  total_pokes: number | string;
  fortune_baht: number | string;
  updated_at: string;
};

function normalizeStats(row: JellyStatsRow) {
  return {
    totalPokes: Number(row.total_pokes),
    fortuneBaht: Number(row.fortune_baht),
    updatedAt: row.updated_at
  };
}

function parseDelta(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  if (value <= 0 || value > MAX_DELTA_PER_REQUEST) {
    return null;
  }

  return value;
}

export async function GET() {
  try {
    const rows = await supabaseRest<JellyStatsRow[]>("/rest/v1/jelly_stats?select=total_pokes,fortune_baht,updated_at&id=eq.singleton&limit=1");
    const row = rows[0];

    if (!row) {
      return NextResponse.json({ error: "Stats record was not found." }, { status: 500 });
    }

    return NextResponse.json(normalizeStats(row), {
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load poke stats." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const delta = parseDelta(typeof payload === "object" && payload ? (payload as { delta?: unknown }).delta : undefined);

  if (!delta) {
    return NextResponse.json({ error: `delta must be an integer from 1 to ${MAX_DELTA_PER_REQUEST}.` }, { status: 400 });
  }

  try {
    const result = await supabaseRest<JellyStatsRow[] | JellyStatsRow>("/rest/v1/rpc/add_pokes", {
      method: "POST",
      body: { delta }
    });
    const row = Array.isArray(result) ? result[0] : result;

    if (!row) {
      return NextResponse.json({ error: "Stats record was not updated." }, { status: 500 });
    }

    return NextResponse.json(normalizeStats(row), {
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update poke stats." }, { status: 500 });
  }
}
