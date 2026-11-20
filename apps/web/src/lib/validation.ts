import { NextResponse } from "next/server";
import { z } from "zod";

export interface ValidationSuccess<T> {
  success: true;
  data: T;
}

export interface ValidationErrorResponse {
  success: false;
  response: NextResponse;
}

export type ParseJsonResult<T> = ValidationSuccess<T> | ValidationErrorResponse;

export async function parseJsonBody<T>(
  req: Request,
  schema: z.ZodSchema<T>
): Promise<ParseJsonResult<T>> {
  // Layer 1: Body presence and valid JSON string syntax
  let rawJson: unknown;
  try {
    const text = await req.text();
    if (!text || text.trim() === "") {
      return {
        success: false,
        response: NextResponse.json(
          {
            success: false,
            error: {
              code: "INVALID_JSON",
              message: "Malformed JSON payload: request body is empty",
            },
          },
          { status: 400 }
        ),
      };
    }
    rawJson = JSON.parse(text);
  } catch {
    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_JSON",
            message: "Malformed JSON payload",
          },
        },
        { status: 400 }
      ),
    };
  }

  // Layer 2: Schema validation via Zod
  const parsed = schema.safeParse(rawJson);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const fieldPath = issue.path.join(".") || "_root";
      if (!fieldErrors[fieldPath]) {
        fieldErrors[fieldPath] = [];
      }
      fieldErrors[fieldPath].push(issue.message);
    }

    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Validation failed",
            details: fieldErrors,
          },
        },
        { status: 400 }
      ),
    };
  }

  // Layer 3: Strongly typed payload return
  return {
    success: true,
    data: parsed.data,
  };
}
