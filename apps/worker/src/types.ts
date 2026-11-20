export const QUEUE_NAMES = {
  CHALLENGE_PROCESS: "challenge.process",
  CHALLENGE_PIPELINE: "challenge-pipeline",
  HEI_EMBED: "hei.embed",
  HEI_EMBEDDING: "hei-embedding",
  NOTIFY_SMS: "notify.sms",
  NOTIFICATION_DISPATCH: "notification-dispatch",
  DEAD_LETTER: "dead-letter.queue",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface ChallengeProcessJobData {
  challengeId: string;
}

export interface HeiEmbedJobData {
  institutionId: string;
  domains?: string[];
  facultySpecializations?: string[];
  labFacilities?: string[];
  profileSummary?: string;
}

export interface NotificationJobData {
  recipientId: string;
  phoneNumber?: string;
  title: string;
  message: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

export interface DeadLetterJobData {
  originalQueue: string;
  originalJobId?: string;
  originalJobName: string;
  originalData: unknown;
  attemptsMade: number;
  failedReason: string;
  failedAt: string;
  stackTrace?: string;
}

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 2000,
  },
  removeOnComplete: true,
  removeOnFail: false,
};
