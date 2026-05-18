import { strict as assert } from "node:assert";
import test from "node:test";
import {
  CHECKIN_CATEGORY_CHECKED_IN,
  CHECKIN_CATEGORY_REQUIRE,
  mapBookingCheckInFlags,
} from "./checkIn";

test("mapBookingCheckInFlags: detecta tags de check-in", () => {
  const flags = mapBookingCheckInFlags([
    CHECKIN_CATEGORY_REQUIRE,
    CHECKIN_CATEGORY_CHECKED_IN,
  ]);
  assert.equal(flags.requiresCheckIn, true);
  assert.equal(flags.checkedIn, true);
});

test("mapBookingCheckInFlags: sem categorias", () => {
  const flags = mapBookingCheckInFlags(undefined);
  assert.equal(flags.requiresCheckIn, false);
  assert.equal(flags.checkedIn, false);
});
