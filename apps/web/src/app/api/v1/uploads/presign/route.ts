import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { parseJsonBody } from "@/lib/validation";
import {
  PresignUploadRequestSchema,
  generateObjectKey,
  createPresignedUploadUrl,
  PRESIGNED_UPLOAD_EXPIRY_SECONDS,
} from "@/lib/s3";

export async function POST(req: Request): Promise<NextResponse> {
  const authResult = await requireAuth(req);
  if (!authResult.success) {
    return authResult.response;
  }

  const { user } = authResult;

  const parseResult = await parseJsonBody(req, PresignUploadRequestSchema);
  if (!parseResult.success) {
    return parseResult.response;
  }

  const { fileName, contentType, fileSizeBytes, purpose } = parseResult.data;

  const key = generateObjectKey(purpose, user.id, fileName, contentType);
  const uploadUrl = await createPresignedUploadUrl({
    key,
    contentType,
    fileSizeBytes,
    expiresInSeconds: PRESIGNED_UPLOAD_EXPIRY_SECONDS,
  });

  return NextResponse.json(
    {
      success: true,
      data: {
        uploadUrl,
        key,
        expiresIn: PRESIGNED_UPLOAD_EXPIRY_SECONDS,
        purpose,
        contentType,
        fileSizeBytes,
      },
    },
    { status: 200 }
  );
}
