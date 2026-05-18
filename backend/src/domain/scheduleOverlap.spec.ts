import { strict as assert } from "node:assert";
import test from "node:test";
import { blocksBooking, isInstantInsideInterval, overlapsInterval } from "./scheduleOverlap";

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

test("isInstantInsideInterval: antes do inicio nao conta como em curso", () => {
  const start = "2026-05-15T18:30:00-03:00";
  const end = "2026-05-15T19:00:00-03:00";
  const beforeStart = new Date("2026-05-15T18:29:00-03:00").getTime();
  const atStart = new Date("2026-05-15T18:30:00-03:00").getTime();
  assert.equal(isInstantInsideInterval(beforeStart, start, end), false);
  assert.equal(isInstantInsideInterval(atStart, start, end), true);
});

test("overlapsInterval: evento 21:00-21:30 nao bloqueia reserva 21:30-22:00 (horarios adjacentes)", () => {
  const overlaps = overlapsInterval(
    "2026-05-15T21:30:00-03:00",
    "2026-05-15T22:00:00-03:00",
    "2026-05-15T21:00:00-03:00",
    "2026-05-15T21:30:00-03:00",
  );
  assert.equal(overlaps, false);
});

test("blocksBooking: availabilityStatus busy bloqueia mesmo sem conflitos na lista", () => {
  const blocked = blocksBooking("2026-05-15T21:30:00-03:00", "2026-05-15T22:00:00-03:00", {
    availabilityStatus: "busy",
    conflicts: [],
  });
  assert.equal(blocked, true);
});
