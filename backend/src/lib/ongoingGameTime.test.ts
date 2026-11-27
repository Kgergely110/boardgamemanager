import assert from "node:assert/strict";
import test from "node:test";
import { getElapsedSeconds } from "./ongoingGameTime.js";

const start = new Date("2026-01-01T10:00:00.000Z");

test("counts active time and subtracts completed pauses", () => {
  assert.equal(getElapsedSeconds({
    startedAt: start,
    pausedAt: null,
    pausedDurationSeconds: 180,
  }, new Date("2026-01-01T10:45:00.000Z")), 42 * 60);
});

test("freezes elapsed time at the start of an active pause", () => {
  assert.equal(getElapsedSeconds({
    startedAt: start,
    pausedAt: new Date("2026-01-01T10:04:00.000Z"),
    pausedDurationSeconds: 0,
  }, new Date("2026-01-01T10:45:00.000Z")), 4 * 60);
});

test("never returns a negative elapsed time", () => {
  assert.equal(getElapsedSeconds({
    startedAt: start,
    pausedAt: null,
    pausedDurationSeconds: 60,
  }, new Date("2026-01-01T10:00:30.000Z")), 0);
});
