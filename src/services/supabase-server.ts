const SUPABASE_REST_TIMEOUT_MS = 5000;

type SupabaseRequestOptions = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  prefer?: string;
};

export function assertSupabaseServerEnv() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return {
    url: url.replace(/\/$/, ""),
    serviceKey
  };
}

export async function supabaseRest<T>(path: string, options: SupabaseRequestOptions = {}) {
  const { url, serviceKey } = assertSupabaseServerEnv();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_REST_TIMEOUT_MS);

  try {
    const response = await fetch(`${url}${path}`, {
      method: options.method ?? "GET",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
        ...(options.prefer ? { prefer: options.prefer } : {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      signal: controller.signal
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) as T : null as T;

    if (!response.ok) {
      const message = typeof data === "object" && data && "message" in data ? String(data.message) : response.statusText;
      throw new Error(message);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}
