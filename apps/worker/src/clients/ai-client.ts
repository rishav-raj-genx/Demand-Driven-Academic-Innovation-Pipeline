import { logger } from "../redis.js";

export interface MatchItem {
  institution_id: string;
  institution_code: string;
  institution_name: string;
  tier: string;
  final_score: number;
  raw_similarity: number;
  distance_km: number;
  geo_boost: number;
  utilization: number;
  capacity_penalty: number;
  explanation: string;
}

export interface AnalyzeChallengeMatchedResult {
  status: "ok";
  action: "MATCHED";
  challenge_id: string;
  is_duplicate: false;
  matches_count: number;
  matches: MatchItem[];
}

export interface DuplicateCandidate {
  id: string;
  title: string;
  problem_statement: string;
  domain: string | null;
  endorsement_count: number;
  similarity: number;
}

export interface AnalyzeChallengeDuplicateResult {
  status: "ok";
  action: "DUPLICATE_MERGED";
  challenge_id: string;
  is_duplicate: true;
  canonical_id: string;
  duplicate_of_id?: string | null;
  duplicate_similarity: number;
  canonical_title: string;
  message: string;
  top_candidates?: DuplicateCandidate[];
}

export type AnalyzeChallengeResult =
  | AnalyzeChallengeMatchedResult
  | AnalyzeChallengeDuplicateResult;

export interface EmbedInstitutionRequest {
  institution_id: string;
  domains?: string[];
  faculty_specializations?: string[];
  lab_facilities?: string[];
  profile_summary?: string;
}

export interface EmbedInstitutionResult {
  status: "ok";
  institution_id: string;
  code: string;
  name: string;
  tier: string;
  embedding_dimensions: number;
  canonical_text: string;
}

export interface AiHealthResult {
  status: string;
  pgvector: boolean;
  error?: string;
}

export class AiClientError extends Error {
  public readonly statusCode: number;
  public readonly endpoint: string;
  public readonly responseBody: unknown;
  public readonly isTimeout: boolean;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      endpoint: string;
      responseBody?: unknown;
      isTimeout?: boolean;
      cause?: unknown;
    }
  ) {
    super(message, { cause: options.cause });
    this.name = "AiClientError";
    this.statusCode = options.statusCode ?? 500;
    this.endpoint = options.endpoint;
    this.responseBody = options.responseBody;
    this.isTimeout = options.isTimeout ?? false;
  }
}

export interface AiClientConfig {
  baseUrl?: string;
  internalServiceKey?: string;
  timeoutMs?: number;
}

export class AiClient {
  private readonly baseUrl: string;
  private readonly internalServiceKey: string;
  private readonly timeoutMs: number;

  constructor(config?: AiClientConfig) {
    this.baseUrl = (
      config?.baseUrl ??
      process.env["AI_ENGINE_URL"] ??
      "http://127.0.0.1:8000"
    ).replace(/\/+$/, "");
    this.internalServiceKey =
      config?.internalServiceKey ??
      process.env["INTERNAL_AI_SERVICE_KEY"] ??
      "dev_internal_ai_service_secret_key";
    this.timeoutMs = config?.timeoutMs ?? 30_000;
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      body?: unknown;
      requireAuth?: boolean;
    } = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
    const method = options.method ?? "GET";
    const requireAuth = options.requireAuth ?? true;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (requireAuth) {
      headers["X-Internal-Service-Key"] = this.internalServiceKey;
    }

    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const durationMs = Date.now() - startTime;
      const responseText = await response.text();

      let parsedBody: unknown = null;
      if (responseText) {
        try {
          parsedBody = JSON.parse(responseText);
        } catch {
          parsedBody = responseText;
        }
      }

      if (!response.ok) {
        logger.error(
          {
            endpoint,
            statusCode: response.status,
            durationMs,
            body: parsedBody,
          },
          "AI Engine HTTP error"
        );
        throw new AiClientError(
          `AI Engine request to ${endpoint} failed with HTTP ${response.status}: ${JSON.stringify(parsedBody)}`,
          {
            statusCode: response.status,
            endpoint,
            responseBody: parsedBody,
          }
        );
      }

      logger.debug(
        { endpoint, statusCode: response.status, durationMs },
        "AI Engine request succeeded"
      );
      return parsedBody as T;
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      if (err instanceof AiClientError) {
        throw err;
      }

      const isTimeout =
        (err instanceof Error && err.name === "AbortError") ||
        (err instanceof DOMException && err.name === "AbortError");

      if (isTimeout) {
        logger.error(
          { endpoint, timeoutMs: this.timeoutMs, durationMs },
          "AI Engine request timed out after 30s"
        );
        throw new AiClientError(
          `AI Engine request to ${endpoint} timed out after ${this.timeoutMs}ms`,
          {
            statusCode: 504,
            endpoint,
            isTimeout: true,
            cause: err,
          }
        );
      }

      logger.error(
        { endpoint, durationMs, error: err instanceof Error ? err.message : String(err) },
        "AI Engine request network error"
      );
      throw new AiClientError(
        `AI Engine request to ${endpoint} failed: ${err instanceof Error ? err.message : String(err)}`,
        {
          statusCode: 503,
          endpoint,
          cause: err,
        }
      );
    } finally {
      clearTimeout(timer);
    }
  }

  public async checkHealth(): Promise<AiHealthResult> {
    return this.request<AiHealthResult>("/health", {
      method: "GET",
      requireAuth: false,
    });
  }

  public async ping(): Promise<{ status: string; message: string }> {
    return this.request<{ status: string; message: string }>("/internal/v1/ping", {
      method: "GET",
      requireAuth: true,
    });
  }

  public async analyzeChallenge(challengeId: string): Promise<AnalyzeChallengeResult> {
    return this.request<AnalyzeChallengeResult>(
      `/internal/v1/challenges/${encodeURIComponent(challengeId)}/analyze`,
      {
        method: "POST",
        requireAuth: true,
      }
    );
  }

  public async embedInstitution(
    req: EmbedInstitutionRequest
  ): Promise<EmbedInstitutionResult> {
    return this.request<EmbedInstitutionResult>("/internal/v1/embed/institution", {
      method: "POST",
      body: req,
      requireAuth: true,
    });
  }
}

export const aiClient = new AiClient();
