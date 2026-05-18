export function isBusyScheduleStatus(status: string): boolean {
  return status.trim().toLowerCase() !== 'free';
}

export interface ScheduleConflictItem {
  start: string;
  end: string;
  status: string;
}

export function hasBookingConflict(
  requestStart: string,
  requestEnd: string,
  items: ScheduleConflictItem[],
): boolean {
  return items.some(
    (item) => isBusyScheduleStatus(item.status) && overlapsInterval(requestStart, requestEnd, item.start, item.end),
  );
}

export function blocksBooking(
  requestStart: string,
  requestEnd: string,
  entity: { availabilityStatus?: string; conflicts?: ScheduleConflictItem[] },
): boolean {
  const status = entity.availabilityStatus ?? 'available';
  if (status === 'busy' || status === 'not_validated_contact' || status === 'unknown') {
    return true;
  }
  return hasBookingConflict(requestStart, requestEnd, entity.conflicts ?? []);
}

/** O instante está dentro do intervalo [início, fim) — fim exclusivo. */
export function isInstantInsideInterval(instantMs: number, startIso: string, endIso: string): boolean {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(instantMs) || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return false;
  }
  return instantMs >= startMs && instantMs < endMs;
}

export function overlapsInterval(
  requestStart: string,
  requestEnd: string,
  itemStart: string,
  itemEnd: string,
): boolean {
  const startMs = new Date(requestStart).getTime();
  const endMs = new Date(requestEnd).getTime();
  const itemStartMs = new Date(itemStart).getTime();
  const itemEndMs = new Date(itemEnd).getTime();
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    !Number.isFinite(itemStartMs) ||
    !Number.isFinite(itemEndMs) ||
    startMs >= endMs
  ) {
    return false;
  }
  return startMs < itemEndMs && endMs > itemStartMs;
}
