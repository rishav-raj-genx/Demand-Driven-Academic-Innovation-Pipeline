import Redis from "ioredis";

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: false,
      enableOfflineQueue: true,
    });
    redisClient.on("error", (err) => {
      // Defensive: log error without throwing or crashing the process
      if (process.env.NODE_ENV !== "test") {
        console.warn("[RateLimit] Redis warning:", err.message);
      }
    });
  }
  return redisClient;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export async function rateLimit(
  identifier: string,
  limit = 10,
  windowMs = 60 * 1000,
  prefix = "auth"
): Promise<RateLimitResult> {
  const resetSeconds = Math.ceil(windowMs / 1000);

  try {
    const redis = getRedisClient();
    const key = `ratelimit:${prefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zadd(key, now, `${now}:${Math.random().toString(36).substring(2, 9)}`);
    pipeline.zcard(key);
    pipeline.expire(key, resetSeconds);

    const results = await pipeline.exec();
    if (!results) {
      return { success: true, limit, remaining: limit, reset: resetSeconds };
    }

    const cardResult = results[2];
    const count = typeof cardResult[1] === "number" ? cardResult[1] : 1;
    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);

    return {
      success: allowed,
      limit,
      remaining,
      reset: resetSeconds,
    };
  } catch (error) {
    // Fail-open strategy on Redis connectivity failure
    if (process.env.NODE_ENV !== "test") {
      console.warn("[RateLimit] Redis unreachable, failing open:", error);
    }
    return {
      success: true,
      limit,
      remaining: limit,
      reset: 0,
    };
  }
}
