import { strict as assert } from "node:assert";
import test from "node:test";
import { AppError } from "../errors/AppError";
import { BookRoomUseCase } from "./BookRoomUseCase";
import { GraphRoomsGateway } from "../../domain/contracts/GraphRoomsGateway";
import { Tenant } from "../../domain/entities/Tenant";
import { GetAvailabilityPreviewUseCase } from "./GetAvailabilityPreviewUseCase";

function createTenant(): Tenant {
  return {
    localidade: "WTorre",
    tenantId: "tenant-id",
    clientId: "client-id",
    clientSecret: "client-secret",
  };
}

function createGatewayMock(overrides?: Partial<GraphRoomsGateway>): GraphRoomsGateway {
  return {
    listRooms: async () => [],
    getSchedule: async () => [],
    getAvailabilityPreview: async () => ({
      start: "",
      end: "",
      room: { email: "", isAvailable: true, availabilityStatus: "available", conflicts: [] },
      participants: [],
    }),
    bookRoom: async () => ({ eventId: "evt-123" }),
    listBookings: async () => [],
    cancelBooking: async () => {},
    searchDirectoryUsers: async () => [],
    ...overrides,
  };
}

function createPreviewMock(
  execute: GetAvailabilityPreviewUseCase["execute"],
): GetAvailabilityPreviewUseCase {
  return { execute } as GetAvailabilityPreviewUseCase;
}

const input = {
  roomEmail: "sala@empresa.com",
  title: "Reuniao",
  start: "2026-03-12T14:00:00Z",
  end: "2026-03-12T15:00:00Z",
  requesterEmail: "solicitante@empresa.com",
  participants: ["ana@empresa.com"],
};

test("BookRoomUseCase: reserva com sucesso quando sala/participantes livres", async () => {
  let booked = false;
  const gateway = createGatewayMock({
    bookRoom: async () => {
      booked = true;
      return { eventId: "evt-ok" };
    },
  });
  const preview = createPreviewMock(async (_tenant, payload) => ({
    start: payload.start,
    end: payload.end,
    room: {
      email: payload.roomEmail,
      isAvailable: true,
      availabilityStatus: "available",
      conflicts: [],
    },
    participants: payload.participants.map((email) => ({
      email,
      isAvailable: true,
      availabilityStatus: "available",
      conflicts: [],
    })),
  }));
  const useCase = new BookRoomUseCase(gateway, preview);

  const result = await useCase.execute(createTenant(), input);

  assert.equal(result.eventId, "evt-ok");
  assert.equal(booked, true);
});

test("BookRoomUseCase: falha quando sala esta ocupada", async () => {
  const gateway = createGatewayMock();
  const preview = createPreviewMock(async (_tenant, payload) => ({
    start: payload.start,
    end: payload.end,
    room: {
      email: payload.roomEmail,
      isAvailable: false,
      availabilityStatus: "busy",
      conflicts: [{ start: payload.start, end: payload.end, status: "busy" }],
    },
    participants: [],
  }));
  const useCase = new BookRoomUseCase(gateway, preview);

  await assert.rejects(
    () => useCase.execute(createTenant(), input),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "ROOM_CONFLICT");
      return true;
    },
  );
});

test("BookRoomUseCase: falha quando participante esta ocupado", async () => {
  const gateway = createGatewayMock();
  const preview = createPreviewMock(async (_tenant, payload) => ({
    start: payload.start,
    end: payload.end,
    room: {
      email: payload.roomEmail,
      isAvailable: true,
      availabilityStatus: "available",
      conflicts: [],
    },
    participants: payload.participants.map((email) => ({
      email,
      isAvailable: false,
      availabilityStatus: "busy",
      conflicts: [{ start: payload.start, end: payload.end, status: "busy", subject: "Conflito" }],
    })),
  }));
  const useCase = new BookRoomUseCase(gateway, preview);

  await assert.rejects(
    () => useCase.execute(createTenant(), input),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "PARTICIPANT_CONFLICT");
      assert.match(error.message, /agenda/i);
      return true;
    },
  );
});
