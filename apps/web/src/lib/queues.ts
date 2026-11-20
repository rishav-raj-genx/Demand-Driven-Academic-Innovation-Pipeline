import { Queue } from "bullmq";
import Redis from "ioredis";

// ============================================================================
// Queue Definitions & Types
// ============================================================================

export const QUEUE_NAMES = {
  CHALLENGE_PIPELINE: "challenge-pipeline",
  HEI_EMBEDDING: "hei-embedding",
  NOTIFICATION_DISPATCH: "notification-dispatch",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface ChallengeProcessJobData {
  challengeId: string;
}

export interface HeiEmbeddingJobData {
  institutionId: string;
}

export interface NotificationDispatchJobData {
  userId: string;
  type: string;
  payload: Record<string, unknown>;
}

// ============================================================================
// Redis Connection for BullMQ
// ============================================================================

export function createQueueRedisConnection(): Redis {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });
}

// Singleton storage on globalThis to prevent connection leaks across hot reloads
const globalForQueues = globalThis as unknown as {
  queueRedisConnection?: Redis;
  challengeQueue?: Queue<ChallengeProcessJobData>;
  heiEmbeddingQueue?: Queue<HeiEmbeddingJobData>;
  notificationQueue?: Queue<NotificationDispatchJobData>;
};

export function getQueueRedisConnection(): Redis {
  if (!globalForQueues.queueRedisConnection) {
    globalForQueues.queueRedisConnection = createQueueRedisConnection();
  }
  return globalForQueues.queueRedisConnection;
}

// ============================================================================
// BullMQ Queue Producers
// ============================================================================

export function getChallengeQueue(): Queue<ChallengeProcessJobData> {
  if (!globalForQueues.challengeQueue) {
    globalForQueues.challengeQueue = new Queue<ChallengeProcessJobData>(
      QUEUE_NAMES.CHALLENGE_PIPELINE,
      {
        connection: getQueueRedisConnection(),
      }
    );
  }
  return globalForQueues.challengeQueue;
}

export function getHeiEmbeddingQueue(): Queue<HeiEmbeddingJobData> {
  if (!globalForQueues.heiEmbeddingQueue) {
    globalForQueues.heiEmbeddingQueue = new Queue<HeiEmbeddingJobData>(
      QUEUE_NAMES.HEI_EMBEDDING,
      {
        connection: getQueueRedisConnection(),
      }
    );
  }
  return globalForQueues.heiEmbeddingQueue;
}

export function getNotificationQueue(): Queue<NotificationDispatchJobData> {
  if (!globalForQueues.notificationQueue) {
    globalForQueues.notificationQueue = new Queue<NotificationDispatchJobData>(
      QUEUE_NAMES.NOTIFICATION_DISPATCH,
      {
        connection: getQueueRedisConnection(),
      }
    );
  }
  return globalForQueues.notificationQueue;
}

export const challengeQueue = getChallengeQueue();
export const heiEmbeddingQueue = getHeiEmbeddingQueue();
export const notificationQueue = getNotificationQueue();

// ============================================================================
// Job Enqueue Helpers
// ============================================================================

export async function enqueueChallengeProcess(challengeId: string) {
  const queue = getChallengeQueue();
  return queue.add(
    "challenge.process",
    { challengeId },
    {
      jobId: `challenge-process-${challengeId}`,
      removeOnComplete: true,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    }
  );
}
