import { notifyAuthenticationRequired } from "./authentication-events";

export type ApiRequestOptions = {
  method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  body?: unknown;
  headers?: HeadersInit;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

export type ApiClientOptions = {
  baseUrl: string;
  createCorrelationId?: () => string;
  fetchFn?: typeof fetch;
  getAccessToken?: () => Promise<string | null> | string | null;
};

type ApiProblem = {
  code?: string;
  message?: string;
};

export class ApiError extends Error {
  readonly code: string | null;
  readonly correlationId: string;
  readonly status: number;

  constructor({
    code,
    correlationId,
    message,
    status,
  }: {
    code: string | null;
    correlationId: string;
    message: string;
    status: number;
  }) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.correlationId = correlationId;
    this.status = status;
  }
}

export class ApiClient {
  private readonly baseUrl: URL;
  private readonly createCorrelationId: () => string;
  private readonly fetchFn: typeof fetch;
  private readonly getAccessToken: () => Promise<string | null>;

  constructor(options: ApiClientOptions) {
    this.baseUrl = new URL(options.baseUrl);
    this.createCorrelationId = options.createCorrelationId ?? defaultCorrelationId;
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    this.getAccessToken = async () => (await options.getAccessToken?.()) ?? null;
  }

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const correlationId = this.createCorrelationId();
    const headers = new Headers(options.headers);
    const accessToken = await this.getAccessToken();

    headers.set("Accept", "application/json");
    headers.set("X-Correlation-ID", correlationId);

    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
    if (options.body !== undefined) headers.set("Content-Type", "application/json");

    const requestInit: RequestInit = {
      headers,
      method: options.method ?? "GET",
    };

    if (options.body !== undefined) requestInit.body = JSON.stringify(options.body);
    if (options.signal) requestInit.signal = options.signal;

    const response = await this.fetchFn(new URL(path, this.baseUrl), requestInit);
    const responseBody = await response.text();

    if (!response.ok) {
      const problem = parseProblem(responseBody);
      if (response.status === 401) notifyAuthenticationRequired();
      throw new ApiError({
        code: problem.code ?? null,
        correlationId,
        message: problem.message ?? `Request failed with status ${response.status}.`,
        status: response.status,
      });
    }

    if (responseBody.length === 0) return undefined as T;
    return JSON.parse(responseBody) as T;
  }
}

function defaultCorrelationId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `request-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function parseProblem(responseBody: string): ApiProblem {
  try {
    const parsed = JSON.parse(responseBody) as ApiProblem;
    return parsed;
  } catch {
    return {};
  }
}
