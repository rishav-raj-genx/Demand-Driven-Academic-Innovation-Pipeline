import { NextResponse } from "next/server";
import { prisma, type Prisma } from "@sih/db";

// ============================================================================
// GET /api/v1/notifications/mock-sms - Live Demo Inspection of Mock SMS Logs
// ============================================================================

export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50)
  );
  const recipientId = searchParams.get("recipientId");
  const search = searchParams.get("search");

  const where: Prisma.NotificationLogWhereInput = {
    OR: [
      { type: "SMS" },
      { message: { contains: "[MOCK SMS - SIH26043]" } },
    ],
  };

  if (recipientId) {
    where.recipientId = recipientId;
  }

  if (search && search.trim() !== "") {
    where.AND = [
      {
        OR: [
          { message: { contains: search, mode: "insensitive" } },
          { title: { contains: search, mode: "insensitive" } },
        ],
      },
    ];
  }

  const logs = await prisma.notificationLog.findMany({
    where,
    include: {
      recipient: {
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          phoneNumber: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const formattedLogs = logs.map((log) => {
    const dataObj = log.data as Record<string, unknown> | null;
    const phoneNumber =
      (typeof dataObj?.phoneNumber === "string" ? dataObj.phoneNumber : null) ??
      log.recipient.phoneNumber ??
      null;

    const status =
      (typeof dataObj?.status === "string" ? dataObj.status : null) ??
      "DELIVERED_MOCK";

    const gateway =
      (typeof dataObj?.gateway === "string" ? dataObj.gateway : null) ??
      "MOCK_SMS_GATEWAY_SIH26043";

    return {
      id: log.id,
      recipientId: log.recipientId,
      recipientName: log.recipient.fullName,
      recipientEmail: log.recipient.email,
      recipientRole: log.recipient.role,
      phoneNumber,
      title: log.title,
      message: log.message,
      status,
      gateway,
      metadata: dataObj?.metadata ?? null,
      createdAt: log.createdAt.toISOString(),
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      count: formattedLogs.length,
      logs: formattedLogs,
    },
  });
}
