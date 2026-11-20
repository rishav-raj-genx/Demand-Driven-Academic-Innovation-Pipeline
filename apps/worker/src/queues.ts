import { Queue, type JobsOptions } from "bullmq";
import { createRedisConnection } from "./redis.js";
import {
  QUEUE_NAMES,
  type ChallengeProcessJobData,
  type HeiEmbedJobData,
  type NotificationJobData,
  type DeadLetterJobData,
  DEFAULT_JOB_OPTIONS,
} from "./types.js";

let redisConnection = createRedisConnection();

export function getSharedRedisConnection() {
  return redisConnection;
}

export const challengeQueue = new Queue<ChallengeProcessJobData>(
  QUEUE_NAMES.CHALLENGE_PROCESS,
  { connection: redisConnection }
);

export const challengePipelineQueue = new Queue<ChallengeProcessJobData>(
  QUEUE_NAMES.CHALLENGE_PIPELINE,
  { connection: redisConnection }
);

export const heiEmbedQueue = new Queue<HeiEmbedJobData>(
  QUEUE_NAMES.HEI_EMBED,
  { connection: redisConnection }
);

export const heiEmbeddingQueue = new Queue<HeiEmbedJobData>(
  QUEUE_NAMES.HEI_EMBEDDING,
  { connection: redisConnection }
);

export const notifySmsQueue = new Queue<NotificationJobData>(
  QUEUE_NAMES.NOTIFY_SMS,
  { connection: redisConnection }
);

export const notificationDispatchQueue = new Queue<NotificationJobData>(
  QUEUE_NAMES.NOTIFICATION_DISPATCH,
  { connection: redisConnection }
);

export const deadLetterQueue = new Queue<DeadLetterJobData>(
  QUEUE_NAMES.DEAD_LETTER,
  { connection: redisConnection }
);

export const allQueues = [
  challengeQueue,
  challengePipelineQueue,
  heiEmbedQueue,
  heiEmbeddingQueue,
  notifySmsQueue,
  notificationDispatchQueue,
  deadLetterQueue,
];

export async function enqueueNotifySms(
  data: NotificationJobData,
  options?: JobsOptions
) {
  const mergedOptions: JobsOptions = {
    ...DEFAULT_JOB_OPTIONS,
    ...options,
  };
  return notifySmsQueue.add("notify.sms", data, mergedOptions);
}

export async function enqueueChallengeProcess(
  challengeId: string,
  options?: JobsOptions
) {
  const mergedOptions: JobsOptions = {
    ...DEFAULT_JOB_OPTIONS,
    jobId: `challenge-process-${challengeId}`,
    ...options,
  };
  return challengeQueue.add("challenge.process", { challengeId }, mergedOptions);
}

export async function enqueueHeiEmbed(
  data: HeiEmbedJobData,
  options?: JobsOptions
) {
  const mergedOptions: JobsOptions = {
    ...DEFAULT_JOB_OPTIONS,
    jobId: `hei-embed-${data.institutionId}`,
    ...options,
  };
  return heiEmbedQueue.add("hei.embed", data, mergedOptions);
}

export async function enqueueDeadLetter(data: DeadLetterJobData) {
  return deadLetterQueue.add("dead-letter.job", data, {
    removeOnComplete: false,
    removeOnFail: false,
  });
}
