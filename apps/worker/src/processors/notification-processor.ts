import { Job } from "bullmq";
import { prisma, type Prisma } from "@sih/db";
import { logger } from "../redis.js";
import { type NotificationJobData } from "../types.js";

export interface NotificationProcessorResult {
  delivered: boolean;
  status: "DELIVERED_MOCK";
  notificationId: string;
  recipientId: string;
  phoneNumber?: string;
  timestamp: string;
}

export function formatMockSmsMessage(rawMessage: string): string {
  const trimmed = rawMessage.trim();
  if (trimmed.startsWith("[MOCK SMS - SIH26043]")) {
    return trimmed;
  }
  return `[MOCK SMS - SIH26043] ${trimmed}`;
}

export async function notificationProcessor(
  job: Job<NotificationJobData>
): Promise<NotificationProcessorResult> {
  const { recipientId, phoneNumber, title, message, type, metadata } = job.data;

  if (!recipientId) {
    throw new Error(`Notification job ${job.id} missing mandatory recipientId`);
  }

  const formattedMessage = formatMockSmsMessage(message);

  const recipient = await prisma.user.findUnique({
    where: { id: recipientId },
    select: { id: true, fullName: true, phoneNumber: true, email: true },
  });

  if (!recipient) {
    logger.warn(
      { jobId: job.id, recipientId },
      "Notification recipient user not found in database; aborting notification"
    );
    throw new Error(`Recipient user with id '${recipientId}' not found in database`);
  }

  const targetPhone = phoneNumber ?? recipient.phoneNumber ?? "+919876543210";

  const notification = await prisma.notificationLog.create({
    data: {
      recipientId: recipient.id,
      title: title || "SIH Notification",
      message: formattedMessage,
      type: type ?? "SMS",
      isRead: false,
      data: {
        status: "DELIVERED_MOCK",
        channel: "SMS",
        phoneNumber: targetPhone,
        deliveredAt: new Date().toISOString(),
        gateway: "MOCK_SMS_GATEWAY_SIH26043",
        jobId: job.id,
        attemptsMade: job.attemptsMade,
        metadata: (metadata ?? {}) as Prisma.InputJsonObject,
      } as Prisma.InputJsonObject,
    },
  });

  logger.info(
    {
      jobId: job.id,
      notificationId: notification.id,
      recipientId: recipient.id,
      phoneNumber: targetPhone,
      status: "DELIVERED_MOCK",
      title: notification.title,
      preview: formattedMessage.slice(0, 90),
    },
    "[MOCK SMS - SIH26043] SMS notification logged successfully"
  );

  return {
    delivered: true,
    status: "DELIVERED_MOCK",
    notificationId: notification.id,
    recipientId: recipient.id,
    phoneNumber: targetPhone,
    timestamp: new Date().toISOString(),
  };
}
