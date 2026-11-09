/** Browser-side wrapper for the REST API (`/api/v1`). Success → `data`; failure → ApiError with the backend `code`/`details`. */
export interface ApiDetail { path?: string; code?: string; message?: string; [k: string]: unknown }

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(code);
  }
  /** validation issues as a list (empty for other errors) */
  get issues(): ApiDetail[] {
    return Array.isArray(this.details) ? (this.details as ApiDetail[]) : [];
  }
  get reason(): string | undefined {
    return (this.details as { reason?: string; field?: string } | undefined)?.reason;
  }
  get field(): string | undefined {
    return (this.details as { field?: string } | undefined)?.field;
  }
}

interface Options {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
}

export async function api<T>(path: string, { method = "GET", body, token, signal }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      signal,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "NETWORK");
  }
  let json: { data?: T; code?: string; details?: unknown } | null = null;
  try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(res.status, json?.code ?? "INTERNAL", json?.details);
  return json?.data as T;
}
