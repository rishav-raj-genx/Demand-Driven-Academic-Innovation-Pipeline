import { Queue } from "bullmq";
import Redis from "ioredis";

// ============================================================================
// Queue Definitions & Types
// ============================================================================

export const QUEUE_NAMES = {
  CHALLENGE_PIPELINE: "challenge-pipeline",
  HEI_EMBEDDING: "hei-embedding",
  NOTIFICATION_DISPATCH: "notification-dispatch",
  NOTIFY_SMS: "notify.sms",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface ChallengeProcessJobData {
  challengeId: string;
}

export interface HeiEmbeddingJobData {
  institutionId: string;
  domains?: string[];
  facultySpecializations?: string[];
  labFacilities?: string[];
  profileSummary?: string;
}

export interface NotificationDispatchJobData {
  userId: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface NotificationJobData {
  recipientId: string;
  phoneNumber?: string;
  title: string;
  message: string;
  type?: string;
  metadata?: Record<string, unknown>;
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
  notifySmsQueue?: Queue<NotificationJobData>;
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

export function getNotifySmsQueue(): Queue<NotificationJobData> {
  if (!globalForQueues.notifySmsQueue) {
    globalForQueues.notifySmsQueue = new Queue<NotificationJobData>(
      QUEUE_NAMES.NOTIFY_SMS,
      {
        connection: getQueueRedisConnection(),
      }
    );
  }
  return globalForQueues.notifySmsQueue;
}

export const challengeQueue = getChallengeQueue();
export const heiEmbeddingQueue = getHeiEmbeddingQueue();
export const notificationQueue = getNotificationQueue();
export const notifySmsQueue = getNotifySmsQueue();

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
        delay: 2000,
      },
    }
  );
}

export async function enqueueHeiEmbed(data: HeiEmbeddingJobData) {
  const queue = getHeiEmbeddingQueue();
  return queue.add(
    "hei.embed",
    data,
    {
      jobId: `hei-embed-${data.institutionId}-${Date.now()}`,
      removeOnComplete: true,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    }
  );
}

export async function enqueueNotifySms(data: NotificationJobData) {
  const queue = getNotifySmsQueue();
  return queue.add(
    "notify.sms",
    data,
    {
      jobId: `notify-sms-${data.recipientId}-${Date.now()}`,
      removeOnComplete: true,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    }
  );
}
