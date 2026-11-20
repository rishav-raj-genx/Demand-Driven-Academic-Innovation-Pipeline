import { Redis, type RedisOptions } from "ioredis";
import pino from "pino";

export const logger = pino({
  name: "sih-worker",
  level: process.env["LOG_LEVEL"] || "info",
});

export function getRedisConfig(): RedisOptions {
  const redisUrl = process.env["REDIS_URL"];
  if (redisUrl) {
    return {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }

  return {
    host: process.env["REDIS_HOST"] || "localhost",
    port: Number(process.env["REDIS_PORT"]) || 6379,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

export function createRedisConnection(): Redis {
  const redisUrl = process.env["REDIS_URL"];
  if (redisUrl) {
    return new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }

  return new Redis(getRedisConfig());
}

export async function checkRedisHealth(client?: Redis): Promise<boolean> {
  const redis = client ?? createRedisConnection();
  try {
    const pong = await redis.ping();
    logger.info({ pong }, "Redis ping check responded successfully");
    return pong === "PONG";
  } catch (error) {
    logger.error({ error }, "Redis ping check failed");
    return false;
  } finally {
    if (!client) {
      await redis.quit();
    }
  }
}
