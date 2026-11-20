import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import {
  parseAndValidateKey,
  canUserAccessKey,
  createPresignedViewUrl,
  PRESIGNED_VIEW_EXPIRY_SECONDS,
} from "@/lib/s3";

export async function GET(req: Request): Promise<NextResponse> {
  const authResult = await requireAuth(req);
  if (!authResult.success) {
    return authResult.response;
  }

  const { user } = authResult;

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");

  if (!key || key.trim() === "") {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "MISSING_KEY",
          message: "Query parameter 'key' is required",
        },
      },
      { status: 400 }
    );
  }

  const validation = parseAndValidateKey(key);
  if (!validation.valid) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_KEY_PREFIX",
          message: validation.reason,
        },
      },
      { status: 400 }
    );
  }

  const hasAccess = canUserAccessKey(user, validation);
  if (!hasAccess) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "User does not have permission to view this resource",
        },
      },
      { status: 403 }
    );
  }

  const viewUrl = await createPresignedViewUrl({
    key,
    expiresInSeconds: PRESIGNED_VIEW_EXPIRY_SECONDS,
  });

  return NextResponse.json(
    {
      success: true,
      data: {
        viewUrl,
        key,
        expiresIn: PRESIGNED_VIEW_EXPIRY_SECONDS,
      },
    },
    { status: 200 }
  );
}
