import { Router } from "express";
import { z } from "zod";
import { ListRoomsUseCase } from "../../application/use-cases/ListRoomsUseCase";
import { GetScheduleUseCase } from "../../application/use-cases/GetScheduleUseCase";
import { BookRoomUseCase } from "../../application/use-cases/BookRoomUseCase";
import { AppError } from "../../application/errors/AppError";

const scheduleSchema = z.object({
  rooms: z.array(z.string().email()).min(1),
  start: z.string().datetime(),
  end: z.string().datetime(),
});

const bookingSchema = z
  .object({
    roomEmail: z.string().email(),
    title: z.string().min(3),
    start: z.string().datetime(),
    end: z.string().datetime(),
  })
  .refine((value) => value.start < value.end, {
    message: "Intervalo invalido: inicio deve ser menor que fim.",
    path: ["start"],
  });

export function buildApiRoutes(
  listRoomsUseCase: ListRoomsUseCase,
  getScheduleUseCase: GetScheduleUseCase,
  bookRoomUseCase: BookRoomUseCase,
) {
  const router = Router();

  router.get("/rooms", async (req, res) => {
    if (!req.tenant) throw new AppError("TENANT_REQUIRED", "Tenant nao resolvido.", 400);
    const rooms = await listRoomsUseCase.execute(req.tenant);
    res.json({ localidade: req.localidade, rooms });
  });

  router.post("/schedule", async (req, res) => {
    if (!req.tenant) throw new AppError("TENANT_REQUIRED", "Tenant nao resolvido.", 400);
    const payload = scheduleSchema.parse(req.body);
    if (payload.start >= payload.end) {
      throw new AppError("INVALID_RANGE", "Intervalo invalido: inicio deve ser menor que fim.", 400);
    }

    const schedule = await getScheduleUseCase.execute(
      req.tenant,
      payload.rooms,
      payload.start,
      payload.end,
    );
    res.json({ localidade: req.localidade, schedule });
  });

  router.post("/book", async (req, res) => {
    if (!req.tenant) throw new AppError("TENANT_REQUIRED", "Tenant nao resolvido.", 400);
    const payload = bookingSchema.parse(req.body);
    const result = await bookRoomUseCase.execute(req.tenant, payload);
    res.status(201).json({ localidade: req.localidade, ...result });
  });

  return router;
}
