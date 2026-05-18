export function isBusyScheduleStatus(status: string): boolean {
  return status.trim().toLowerCase() !== "free";
}

export interface ScheduleConflictItem {
  start: string;
  end: string;
  status: string;
}

/** Há conflito real no intervalo pedido (mesma regra na prévia e na reserva). */
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
  const status = entity.availabilityStatus ?? "available";
  if (status === "busy" || status === "not_validated_contact" || status === "unknown") {
    return true;
  }
  return hasBookingConflict(requestStart, requestEnd, entity.conflicts ?? []);
}

/**
 * Há sobreposição quando os intervalos partilham tempo.
 * Fim do evento é exclusivo: reserva às 23:00 não conflita com evento que termina às 23:00.
 */
const BUSY_AVAILABILITY_VIEW_CHARS = new Set(["1", "2", "3", "4"]);

/** Interpreta availabilityView do Graph (0=livre, 2=ocupado, etc.). */
export function isBusyInAvailabilityView(
  availabilityView: string,
  windowStartIso: string,
  requestStart: string,
  requestEnd: string,
  intervalMinutes: number,
): boolean {
  const windowStartMs = new Date(windowStartIso).getTime();
  const requestStartMs = new Date(requestStart).getTime();
  const requestEndMs = new Date(requestEnd).getTime();
  if (
    !availabilityView ||
    !Number.isFinite(windowStartMs) ||
    !Number.isFinite(requestStartMs) ||
    !Number.isFinite(requestEndMs) ||
    intervalMinutes <= 0
  ) {
    return false;
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  for (let index = 0; index < availabilityView.length; index += 1) {
    if (!BUSY_AVAILABILITY_VIEW_CHARS.has(availabilityView[index] ?? "")) continue;
    const slotStart = windowStartMs + index * intervalMs;
    const slotEnd = slotStart + intervalMs;
    if (slotStart < requestEndMs && slotEnd > requestStartMs) return true;
  }
  return false;
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
