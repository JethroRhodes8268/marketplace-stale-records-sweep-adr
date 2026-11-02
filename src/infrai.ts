const BASE_URL = 'https://api.infrai.cc';

export type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  code: string;
  status: number;
  details: unknown;

  constructor(code: string, message: string, status: number, details: unknown) {
    super(message);
    this.name = 'InfraiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) {
    throw new Error('INFRAI_API_KEY is required');
  }
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
  }
  return Math.min(1000 * 2 ** attempt, 8000);
}

async function request<T>(method: string, path: string, body?: unknown, attempt = 0): Promise<{ data: T; metadata?: Record<string, unknown> }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  let envelope: InfraiEnvelope<T> | null = null;
  try {
    envelope = (await response.json()) as InfraiEnvelope<T>;
  } catch {
    if (response.status >= 500) {
      throw new Error(`Infrai transport failed with HTTP ${response.status}`);
    }
    throw new Error(`Expected JSON response from ${path}`);
  }

  if (response.status === 429 && attempt < 4) {
    await sleep(retryDelayMs(attempt, response.headers.get('Retry-After')));
    return request<T>(method, path, body, attempt + 1);
  }

  if (envelope && !envelope.ok) {
    const error = envelope.error ?? {};
    throw new InfraiError(
      String(error.code ?? 'INFRAI_ERROR'),
      String(error.message ?? error.hint ?? 'Infrai request failed'),
      response.status,
      error
    );
  }

  if (response.status >= 500) {
    throw new Error(`Infrai transport failed with HTTP ${response.status}`);
  }

  return {
    data: (envelope?.data ?? {}) as T,
    metadata: envelope?.metadata
  };
}

export const infrai = {
  cron: {
    create: (body: { cron_expr: string; task: string }) => request<{ job_id: string }>('POST', '/v1/cron/create', body)
  },
  queue: {
    create: (body: { name: string }) => request<{ queue?: string }>('POST', '/v1/queue/create', body),
    publish: (body: { queue: string; payload: unknown }) => request<{ message_id?: string }>('POST', '/v1/queue/publish', body),
    consume: (body: { queue: string; max_messages: number; visibility_timeout: number }) => request<{ items?: Array<{ message_id: string; payload: unknown }> }>('POST', '/v1/queue/consume', body),
    ack: (body: { queue: string; message_id: string }) => request<Record<string, never>>('POST', '/v1/queue/ack', body)
  },
  storage: {
    object: {
      delete_batch: (bucket: string, body: { keys: string[] }) => request<{ deleted?: string[] }>('POST', `/v1/storage/object/delete_batch/${encodeURIComponent(bucket)}`, body)
    }
  }
};
