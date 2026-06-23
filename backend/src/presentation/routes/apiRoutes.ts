import { Router } from "express";
import { z } from "zod";
import { ListRoomsUseCase } from "../../application/use-cases/ListRoomsUseCase";
import { GetScheduleUseCase } from "../../application/use-cases/GetScheduleUseCase";
import { GetAvailabilityPreviewUseCase } from "../../application/use-cases/GetAvailabilityPreviewUseCase";
import { BookRoomUseCase } from "../../application/use-cases/BookRoomUseCase";
import { ListBookingsUseCase } from "../../application/use-cases/ListBookingsUseCase";
import { CancelBookingUseCase } from "../../application/use-cases/CancelBookingUseCase";
import { CheckInBookingUseCase } from "../../application/use-cases/CheckInBookingUseCase";
import { GetRoomKioskSettingsUseCase } from "../../application/use-cases/GetRoomKioskSettingsUseCase";
import { SaveRoomKioskSettingsUseCase } from "../../application/use-cases/SaveRoomKioskSettingsUseCase";
import { SearchDirectoryUsersUseCase } from "../../application/use-cases/SearchDirectoryUsersUseCase";
import { AppError } from "../../application/errors/AppError";

const isoDateTimeSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Invalid ISO datetime",
});

const scheduleSchema = z.object({
  rooms: z.array(z.string().email()).min(1),
  start: isoDateTimeSchema,
  end: isoDateTimeSchema,
});

const bookingSchema = z
  .object({
    roomEmail: z.string().email(),
    title: z.string().trim().min(1),
    start: isoDateTimeSchema,
    end: isoDateTimeSchema,
    requesterEmail: z.string().email(),
    participants: z.array(z.string().email()).default([]),
    allowRequesterConflict: z.boolean().optional().default(false),
    allowParticipantConflict: z.boolean().optional().default(false),
  })
  .refine((value) => new Date(value.start).getTime() < new Date(value.end).getTime(), {
    message: "Intervalo invalido: inicio deve ser menor que fim.",
    path: ["start"],
  });

const previewAvailabilitySchema = z
  .object({
    roomEmail: z.string().email(),
    participants: z.array(z.string().email()).default([]),
    start: isoDateTimeSchema,
    end: isoDateTimeSchema,
  })
  .refine((value) => new Date(value.start).getTime() < new Date(value.end).getTime(), {
    message: "Intervalo invalido: inicio deve ser menor que fim.",
    path: ["start"],
  });

const listBookingsSchema = z.object({
  start: isoDateTimeSchema.optional(),
  end: isoDateTimeSchema.optional(),
});

const directorySearchSchema = z.object({
  query: z.string().trim().min(2),
});

const kioskSettingsSchema = z.object({
  checkInModeEnabled: z.boolean(),
  checkInGraceMinutes: z.number().int().min(1).max(60).optional(),
});

export function buildApiRoutes(
  listRoomsUseCase: ListRoomsUseCase,
  getScheduleUseCase: GetScheduleUseCase,
  getAvailabilityPreviewUseCase: GetAvailabilityPreviewUseCase,
  bookRoomUseCase: BookRoomUseCase,
  listBookingsUseCase: ListBookingsUseCase,
  cancelBookingUseCase: CancelBookingUseCase,
  checkInBookingUseCase: CheckInBookingUseCase,
  getRoomKioskSettingsUseCase: GetRoomKioskSettingsUseCase,
  saveRoomKioskSettingsUseCase: SaveRoomKioskSettingsUseCase,
  searchDirectoryUsersUseCase: SearchDirectoryUsersUseCase,
) {
  const router = Router();

  router.get("/rooms", async (req, res) => {
    if (!req.tenant) throw new AppError("TENANT_REQUIRED", "Tenant nao resolvido.", 400);
    const rooms = await listRoomsUseCase.execute(req.tenant);
    res.json({ localidade: req.localidade, rooms });
  });

  router.get("/rooms/:roomEmail/kiosk-settings", async (req, res) => {
    if (!req.tenant) throw new AppError("TENANT_REQUIRED", "Tenant nao resolvido.", 400);
    const roomEmail = decodeURIComponent(req.params.roomEmail ?? "").trim();
    if (!roomEmail.includes("@")) {
      throw new AppError("INVALID_ROOM_EMAIL", "E-mail da sala invalido.", 400);
    }
    const settings = await getRoomKioskSettingsUseCase.execute(req.localidade ?? "", roomEmail);
    res.json({ localidade: req.localidade, roomEmail, ...settings });
  });

  router.put("/rooms/:roomEmail/kiosk-settings", async (req, res) => {
    if (!req.tenant) throw new AppError("TENANT_REQUIRED", "Tenant nao resolvido.", 400);
    const roomEmail = decodeURIComponent(req.params.roomEmail ?? "").trim();
    if (!roomEmail.includes("@")) {
      throw new AppError("INVALID_ROOM_EMAIL", "E-mail da sala invalido.", 400);
    }
    const payload = kioskSettingsSchema.parse(req.body);
    await saveRoomKioskSettingsUseCase.execute(req.localidade ?? "", roomEmail, {
      checkInModeEnabled: payload.checkInModeEnabled,
      ...(payload.checkInGraceMinutes !== undefined && {
        checkInGraceMinutes: payload.checkInGraceMinutes,
      }),
    });
    res.json({ localidade: req.localidade, roomEmail, ...payload });
  });

  router.post("/schedule", async (req, res) => {
    if (!req.tenant) throw new AppError("TENANT_REQUIRED", "Tenant nao resolvido.", 400);
    const payload = scheduleSchema.parse(req.body);
    const start = payload.start;
    const end = payload.end;

    if (new Date(start).getTime() >= new Date(end).getTime()) {
      throw new AppError("INVALID_RANGE", "Intervalo invalido: inicio deve ser menor que fim.", 400);
    }

    const schedule = await getScheduleUseCase.execute(
      req.tenant,
      payload.rooms,
      start,
      end,
    );
    res.json({ localidade: req.localidade, schedule });
  });

  router.post("/book", async (req, res) => {
    if (!req.tenant) throw new AppError("TENANT_REQUIRED", "Tenant nao resolvido.", 400);
    const payload = bookingSchema.parse(req.body);
    const result = await bookRoomUseCase.execute(req.tenant, payload);
    res.status(201).json({ localidade: req.localidade, ...result });
  });

  router.post("/availability/preview", async (req, res) => {
    if (!req.tenant) throw new AppError("TENANT_REQUIRED", "Tenant nao resolvido.", 400);
    const payload = previewAvailabilitySchema.parse(req.body);
    const preview = await getAvailabilityPreviewUseCase.execute(req.tenant, payload);
    res.json({ localidade: req.localidade, preview });
  });

  router.get("/bookings", async (req, res) => {
    if (!req.tenant) throw new AppError("TENANT_REQUIRED", "Tenant nao resolvido.", 400);
    const query = listBookingsSchema.parse(req.query);
    const now = new Date();
    const start = query.start ?? now.toISOString();
    const end =
      query.end ??
      new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30).toISOString();

    if (new Date(start).getTime() >= new Date(end).getTime()) {
      throw new AppError("INVALID_RANGE", "Intervalo invalido: inicio deve ser menor que fim.", 400);
    }

    const bookings = await listBookingsUseCase.execute(req.tenant, { start, end });
    res.json({ localidade: req.localidade, bookings });
  });

  router.get("/directory/users", async (req, res) => {
    if (!req.tenant) throw new AppError("TENANT_REQUIRED", "Tenant nao resolvido.", 400);
    const query = directorySearchSchema.parse(req.query);
    const users = await searchDirectoryUsersUseCase.execute(req.tenant, query.query);
    res.json({ localidade: req.localidade, users });
  });

  router.post("/bookings/:eventId/check-in", async (req, res) => {
    if (!req.tenant) throw new AppError("TENANT_REQUIRED", "Tenant nao resolvido.", 400);
    const eventId = req.params.eventId;

    if (!eventId) {
      throw new AppError("EVENT_ID_REQUIRED", "Informe o identificador da reserva.", 400);
    }

    const organizer =
      typeof req.query.organizer === "string" && req.query.organizer.includes("@")
        ? req.query.organizer.trim()
        : undefined;
    const roomEmail =
      typeof req.query.roomEmail === "string" && req.query.roomEmail.includes("@")
        ? req.query.roomEmail.trim()
        : undefined;

    await checkInBookingUseCase.execute(req.tenant, eventId, {
      ...(organizer !== undefined && { requesterEmail: organizer }),
      ...(roomEmail !== undefined && { roomEmail }),
    });
    res.status(204).send();
  });

  router.delete("/bookings/:eventId", async (req, res) => {
    if (!req.tenant) throw new AppError("TENANT_REQUIRED", "Tenant nao resolvido.", 400);
    const eventId = req.params.eventId;

    if (!eventId) {
      throw new AppError("EVENT_ID_REQUIRED", "Informe o identificador da reserva.", 400);
    }

    const organizer =
      typeof req.query.organizer === "string" && req.query.organizer.includes("@")
        ? req.query.organizer.trim()
        : undefined;
    const roomEmail =
      typeof req.query.roomEmail === "string" && req.query.roomEmail.includes("@")
        ? req.query.roomEmail.trim()
        : undefined;
    const start = typeof req.query.start === "string" ? req.query.start.trim() : undefined;
    const end = typeof req.query.end === "string" ? req.query.end.trim() : undefined;
    const title = typeof req.query.title === "string" ? req.query.title.trim() : undefined;

    await cancelBookingUseCase.execute(req.tenant, eventId, {
      ...(organizer !== undefined && { requesterEmail: organizer }),
      ...(roomEmail !== undefined && { roomEmail }),
      ...(start !== undefined && { start }),
      ...(end !== undefined && { end }),
      ...(title !== undefined && { title }),
    });
    res.status(204).send();
  });

  return router;
}
