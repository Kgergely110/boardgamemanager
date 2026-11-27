import { Response } from "express";
import { z } from "zod";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "UNPROCESSABLE_ENTITY"
  | "INTERNAL_SERVER_ERROR"
  | "REQUEST_ERROR";

const errorCodeByStatus: Record<number, ApiErrorCode> = {
  400: "VALIDATION_ERROR",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  422: "UNPROCESSABLE_ENTITY",
  500: "INTERNAL_SERVER_ERROR",
};

export function sendApiError(
  res: Response,
  status: number,
  message: string,
  code: ApiErrorCode = errorCodeByStatus[status] ?? "REQUEST_ERROR",
  fields: Record<string, unknown> = {},
): void {
  res.status(status).json({ error: message, code, ...fields });
}

export function sendValidationError(
  res: Response,
  error: z.ZodError,
  message = "Invalid request",
): void {
  sendApiError(res, 400, message, "VALIDATION_ERROR", {
    details: z.flattenError(error).fieldErrors,
  });
}
