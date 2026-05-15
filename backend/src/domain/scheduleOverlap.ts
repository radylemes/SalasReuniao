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
  if (status === "not_validated_contact" || status === "unknown") {
    return true;
  }
  return hasBookingConflict(requestStart, requestEnd, entity.conflicts ?? []);
}

/**
 * Há sobreposição quando os intervalos partilham tempo.
 * Fim do evento é exclusivo: reserva às 23:00 não conflita com evento que termina às 23:00.
 */
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
