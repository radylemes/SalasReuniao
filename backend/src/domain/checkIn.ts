export const CHECKIN_CATEGORY_REQUIRE = "SalasReuniao.RequireCheckIn";
export const CHECKIN_CATEGORY_CHECKED_IN = "SalasReuniao.CheckedIn";

export const CHECKIN_GRACE_MINUTES = 15;
export const CHECKIN_GRACE_MS = CHECKIN_GRACE_MINUTES * 60 * 1000;
export const CHECKIN_GRACE_MIN = 1;
export const CHECKIN_GRACE_MAX = 60;

export function normalizeCheckInGraceMinutes(value?: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return CHECKIN_GRACE_MINUTES;
  return Math.min(CHECKIN_GRACE_MAX, Math.max(CHECKIN_GRACE_MIN, Math.round(n)));
}

export function checkInGraceMs(minutes?: number): number {
  return normalizeCheckInGraceMinutes(minutes) * 60 * 1000;
}

export function hasCategory(categories: string[] | undefined, category: string): boolean {
  return (categories ?? []).some((c) => c === category);
}

export function bookingRequiresCheckIn(categories: string[] | undefined): boolean {
  return hasCategory(categories, CHECKIN_CATEGORY_REQUIRE);
}

export function bookingIsCheckedIn(categories: string[] | undefined): boolean {
  return hasCategory(categories, CHECKIN_CATEGORY_CHECKED_IN);
}

export function mapBookingCheckInFlags(categories: string[] | undefined): {
  requiresCheckIn: boolean;
  checkedIn: boolean;
} {
  return {
    requiresCheckIn: bookingRequiresCheckIn(categories),
    checkedIn: bookingIsCheckedIn(categories),
  };
}
