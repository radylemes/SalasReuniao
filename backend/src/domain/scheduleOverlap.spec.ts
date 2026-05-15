import { strict as assert } from "node:assert";
import test from "node:test";
import { overlapsInterval } from "./scheduleOverlap";

test("overlapsInterval: evento 22:30-23:30 bloqueia reserva 23:00-23:30 (intervalo real do Exchange)", () => {
  const overlaps = overlapsInterval(
    "2026-05-15T23:00:00-03:00",
    "2026-05-15T23:30:00-03:00",
    "2026-05-15T22:30:00-03:00",
    "2026-05-15T23:30:00-03:00",
  );
  assert.equal(overlaps, true);
});

test("overlapsInterval: evento 22:30-23:00 nao bloqueia reserva 23:00-23:30", () => {
  const overlaps = overlapsInterval(
    "2026-05-15T23:00:00-03:00",
    "2026-05-15T23:30:00-03:00",
    "2026-05-15T22:30:00-03:00",
    "2026-05-15T23:00:00-03:00",
  );
  assert.equal(overlaps, false);
});

test("overlapsInterval: evento 23:00-23:30 bloqueia reserva no mesmo horario", () => {
  const overlaps = overlapsInterval(
    "2026-05-15T23:00:00-03:00",
    "2026-05-15T23:30:00-03:00",
    "2026-05-15T23:00:00-03:00",
    "2026-05-15T23:30:00-03:00",
  );
  assert.equal(overlaps, true);
});
