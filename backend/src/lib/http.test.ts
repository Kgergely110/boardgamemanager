import assert from "node:assert/strict";
import test from "node:test";
import { Response } from "express";
import { z } from "zod";
import { sendApiError, sendValidationError } from "./http.js";

function responseRecorder() {
  let statusCode = 200;
  let body: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  } as unknown as Response;

  return {
    response,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
}

test("sends a stable JSON error envelope for status-based errors", () => {
  const recorder = responseRecorder();

  sendApiError(recorder.response, 404, "Game not found");

  assert.equal(recorder.statusCode, 404);
  assert.deepEqual(recorder.body, {
    error: "Game not found",
    code: "NOT_FOUND",
  });
});

test("preserves field validation details in the shared error envelope", () => {
  const recorder = responseRecorder();
  const parsed = z.object({ name: z.string().min(1) }).safeParse({ name: "" });
  assert.equal(parsed.success, false);
  if (parsed.success) return;

  sendValidationError(recorder.response, parsed.error, "Invalid shelf");

  assert.equal(recorder.statusCode, 400);
  assert.deepEqual(recorder.body, {
    error: "Invalid shelf",
    code: "VALIDATION_ERROR",
    details: z.flattenError(parsed.error).fieldErrors,
  });
});
