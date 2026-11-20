import { describe, it, expect, beforeAll } from "vitest";
import { POST as presignHandler } from "./presign/route";
import { GET as viewHandler } from "./view/route";
import { prisma } from "@sih/db";
import { signAccessToken } from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { MAX_FILE_SIZE_BYTES } from "@/lib/s3";

describe("S3 / MinIO Presigned Upload & View Service Integration Suite", () => {
  // 1x1 valid sample PNG buffer (67 bytes)
  const SAMPLE_PNG_BUFFER = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG magic header
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);

  let studentUserId = "";
  let studentEmail = "";
  let studentToken = "";

  let adminUserId = "";
  let adminEmail = "";
  let adminToken = "";

  let industryUserId = "";
  let industryEmail = "";
  let industryToken = "";

  beforeAll(async () => {
    // Retrieve seeded demo users from PostgreSQL
    const student = await prisma.user.findFirstOrThrow({
      where: { role: "STUDENT" },
    });
    studentUserId = student.id;
    studentEmail = student.email;
    studentToken = await signAccessToken({
      sub: student.id,
      email: student.email,
      role: student.role,
      institutionId: student.institutionId,
      verificationStatus: student.verificationStatus,
    });

    const admin = await prisma.user.findFirstOrThrow({
      where: { role: "SUPER_ADMIN" },
    });
    adminUserId = admin.id;
    adminEmail = admin.email;
    adminToken = await signAccessToken({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      institutionId: admin.institutionId,
      verificationStatus: admin.verificationStatus,
    });

    const industry = await prisma.user.findFirstOrThrow({
      where: { role: "INDUSTRY_PARTNER" },
    });
    industryUserId = industry.id;
    industryEmail = industry.email;
    industryToken = await signAccessToken({
      sub: industry.id,
      email: industry.email,
      role: industry.role,
      industryPartnerId: industry.industryPartnerId,
      verificationStatus: industry.verificationStatus,
    });
  });

  // ==========================================================================
  // A. Validation & Security Gates on POST /api/v1/uploads/presign
  // ==========================================================================

  it("1. should reject unauthenticated requests to POST /api/v1/uploads/presign with 401", async () => {
    const req = new Request("http://localhost:3000/api/v1/uploads/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "test.png",
        contentType: "image/png",
        fileSizeBytes: 1024,
        purpose: "challenge_media",
      }),
    });

    const res = await presignHandler(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("2. should reject disallowed MIME type (application/x-sh) with HTTP 400", async () => {
    const req = new Request("http://localhost:3000/api/v1/uploads/presign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        fileName: "malicious_script.sh",
        contentType: "application/x-sh",
        fileSizeBytes: 2048,
        purpose: "challenge_media",
      }),
    });

    const res = await presignHandler(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.contentType).toBeDefined();
    expect(body.error.details.contentType[0]).toContain("Invalid contentType");
  });

  it("3. should reject oversized files (> 10 MB limit) with HTTP 400", async () => {
    const oversizedBytes = MAX_FILE_SIZE_BYTES + 1; // 10 MB + 1 byte
    const req = new Request("http://localhost:3000/api/v1/uploads/presign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        fileName: "giant_dataset.pdf",
        contentType: "application/pdf",
        fileSizeBytes: oversizedBytes,
        purpose: "milestone_artifact",
      }),
    });

    const res = await presignHandler(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.fileSizeBytes).toBeDefined();
    expect(body.error.details.fileSizeBytes[0]).toContain("exceeds maximum allowed limit of 10 MB");
  });

  it("4. should reject non-positive or negative file sizes with HTTP 400", async () => {
    const req = new Request("http://localhost:3000/api/v1/uploads/presign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        fileName: "empty.png",
        contentType: "image/png",
        fileSizeBytes: 0,
        purpose: "challenge_media",
      }),
    });

    const res = await presignHandler(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.fileSizeBytes).toBeDefined();
  });

  it("5. should reject invalid purpose with HTTP 400", async () => {
    const req = new Request("http://localhost:3000/api/v1/uploads/presign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        fileName: "photo.jpg",
        contentType: "image/jpeg",
        fileSizeBytes: 4096,
        purpose: "arbitrary_unauthorized_folder",
      }),
    });

    const res = await presignHandler(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.purpose).toBeDefined();
  });

  // ==========================================================================
  // B. End-to-End Real S3 / MinIO Upload and Retrieval Flow
  // ==========================================================================

  let uploadedKey = "";

  it("6. should generate valid presigned PUT URL and sanitized key for legitimate upload", async () => {
    const req = new Request("http://localhost:3000/api/v1/uploads/presign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        fileName: "Water Filter Prototype Field Test.PNG",
        contentType: "image/png",
        fileSizeBytes: SAMPLE_PNG_BUFFER.length,
        purpose: "challenge_media",
      }),
    });

    const res = await presignHandler(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.uploadUrl).toBeDefined();
    expect(body.data.uploadUrl).toContain("http");
    expect(body.data.uploadUrl).toContain("sih26043-media");
    expect(body.data.expiresIn).toBe(300); // 5-minute expiry
    expect(body.data.contentType).toBe("image/png");

    // Key format: ${purpose}/${userId}/${uuid}.${ext}
    uploadedKey = body.data.key;
    expect(uploadedKey).toMatch(
      new RegExp(`^challenge_media\\/${studentUserId}\\/[a-f0-9-]+\\.png$`)
    );
  });

  it("7. should perform a real HTTP PUT upload of sample PNG buffer to MinIO", async () => {
    // Generate fresh presigned upload URL
    const presignReq = new Request("http://localhost:3000/api/v1/uploads/presign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        fileName: "sample_upload.png",
        contentType: "image/png",
        fileSizeBytes: SAMPLE_PNG_BUFFER.length,
        purpose: "challenge_media",
      }),
    });

    const presignRes = await presignHandler(presignReq);
    expect(presignRes.status).toBe(200);
    const presignBody = await presignRes.json();
    const { uploadUrl, key } = presignBody.data;
    uploadedKey = key;

    // Real HTTP PUT directly to MinIO S3 endpoint
    const uploadHttpRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "image/png",
      },
      body: SAMPLE_PNG_BUFFER,
    });

    expect(uploadHttpRes.status).toBe(200);
  });

  // ==========================================================================
  // C. Verification & Authorization on GET /api/v1/uploads/view
  // ==========================================================================

  it("8. should reject unauthenticated requests to GET /api/v1/uploads/view with 401", async () => {
    const req = new Request(
      `http://localhost:3000/api/v1/uploads/view?key=${encodeURIComponent(uploadedKey)}`,
      { method: "GET" }
    );

    const res = await viewHandler(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("9. should reject missing key query param with HTTP 400", async () => {
    const req = new Request("http://localhost:3000/api/v1/uploads/view", {
      method: "GET",
      headers: { Authorization: `Bearer ${studentToken}` },
    });

    const res = await viewHandler(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("MISSING_KEY");
  });

  it("10. should reject invalid key prefix and path traversal attempts with HTTP 400", async () => {
    const maliciousKeys = [
      "../../etc/passwd",
      "../sih26043-media/secret.key",
      "/challenge_media/user/file.png",
      "unauthorized_bucket/user/file.png",
      "challenge_media/only-two-parts",
    ];

    for (const badKey of maliciousKeys) {
      const req = new Request(
        `http://localhost:3000/api/v1/uploads/view?key=${encodeURIComponent(badKey)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${studentToken}` },
        }
      );

      const res = await viewHandler(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("INVALID_KEY_PREFIX");
    }
  });

  it("11. should reject unauthorized access to private CSR receipts (HTTP 403 FORBIDDEN)", async () => {
    // Generate CSR receipt key owned by industry user
    const csrReceiptKey = `csr_receipt/${industryUserId}/receipt_audit_2026.pdf`;

    // Student attempts to view another user's CSR financial receipt
    const req = new Request(
      `http://localhost:3000/api/v1/uploads/view?key=${encodeURIComponent(csrReceiptKey)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${studentToken}` },
      }
    );

    const res = await viewHandler(req);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("12. should issue 15-minute presigned GET URL and retrieve identical uploaded PNG bytes from MinIO", async () => {
    // Authorized retrieval by student (uploader)
    const req = new Request(
      `http://localhost:3000/api/v1/uploads/view?key=${encodeURIComponent(uploadedKey)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${studentToken}` },
      }
    );

    const res = await viewHandler(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.viewUrl).toBeDefined();
    expect(body.data.viewUrl).toContain("http");
    expect(body.data.viewUrl).toContain("sih26043-media");
    expect(body.data.key).toBe(uploadedKey);
    expect(body.data.expiresIn).toBe(900); // 15-minute expiry

    // Real HTTP GET to MinIO using presigned viewUrl
    const downloadRes = await fetch(body.data.viewUrl);
    expect(downloadRes.status).toBe(200);

    const downloadedBytes = Buffer.from(await downloadRes.arrayBuffer());
    expect(downloadedBytes.equals(SAMPLE_PNG_BUFFER)).toBe(true);
  });

  it("13. should allow SUPER_ADMIN to generate view URL for any object key", async () => {
    const csrReceiptKey = `csr_receipt/${industryUserId}/receipt_audit_2026.pdf`;

    const req = new Request(
      `http://localhost:3000/api/v1/uploads/view?key=${encodeURIComponent(csrReceiptKey)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    const res = await viewHandler(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.viewUrl).toBeDefined();
    expect(body.data.key).toBe(csrReceiptKey);
    expect(body.data.expiresIn).toBe(900);
  });
});
