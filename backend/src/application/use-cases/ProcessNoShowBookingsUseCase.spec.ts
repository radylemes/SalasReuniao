import { strict as assert } from "node:assert";
import test from "node:test";
import { CHECKIN_GRACE_MS } from "../../domain/checkIn";
import { GraphRoomsGateway } from "../../domain/contracts/GraphRoomsGateway";
import { KioskSettingsRepository } from "../../domain/contracts/KioskSettingsRepository";
import { TenantRepository } from "../../domain/contracts/TenantRepository";
import { Tenant } from "../../domain/entities/Tenant";
import { ProcessNoShowBookingsUseCase } from "./ProcessNoShowBookingsUseCase";

function createTenant(): Tenant {
  return {
    localidade: "WTorre",
    tenantId: "tenant-id",
    clientId: "client-id",
    clientSecret: "client-secret",
  };
}

test("ProcessNoShowBookingsUseCase: cancela reserva sem check-in apos 15 minutos", async () => {
  const start = new Date("2026-03-12T14:00:00Z");
  const now = new Date(start.getTime() + CHECKIN_GRACE_MS + 60_000);
  const cancelled: string[] = [];

  const kioskRepo: KioskSettingsRepository = {
    get: async () => ({ checkInModeEnabled: true, checkInGraceMinutes: 15 }),
    save: async () => {},
    listRoomsWithCheckInEnabled: async () => [
      { localidade: "WTorre", roomEmail: "sala@empresa.com" },
    ],
  };

  const tenantRepo: TenantRepository = {
    findByLocalidade: async () => createTenant(),
  };

  const graph: GraphRoomsGateway = {
    listRooms: async () => [],
    getSchedule: async () => [],
    getAvailabilityPreview: async () => ({
      start: "",
      end: "",
      room: { email: "", isAvailable: true, availabilityStatus: "available", conflicts: [] },
      participants: [],
    }),
    bookRoom: async () => ({ eventId: "evt" }),
    listBookings: async () => [
      {
        eventId: "evt-no-show",
        roomEmail: "sala@empresa.com",
        roomName: "Sala",
        title: "Reuniao",
        start: start.toISOString(),
        end: "2026-03-12T15:00:00Z",
        requiresCheckIn: true,
        checkedIn: false,
      },
    ],
    getBooking: async () => null,
    markBookingRequiresCheckIn: async () => {},
    checkInBooking: async () => {},
    cancelBooking: async (_tenant, eventId) => {
      cancelled.push(eventId);
    },
    searchDirectoryUsers: async () => [],
  };

  const useCase = new ProcessNoShowBookingsUseCase(kioskRepo, tenantRepo, graph);
  const count = await useCase.execute(now);

  assert.equal(count, 1);
  assert.deepEqual(cancelled, ["evt-no-show"]);
});

test("ProcessNoShowBookingsUseCase: nao cancela dentro da janela de 15 minutos", async () => {
  const start = new Date("2026-03-12T14:00:00Z");
  const now = new Date(start.getTime() + CHECKIN_GRACE_MS - 60_000);
  const cancelled: string[] = [];

  const kioskRepo: KioskSettingsRepository = {
    get: async () => ({ checkInModeEnabled: true, checkInGraceMinutes: 15 }),
    save: async () => {},
    listRoomsWithCheckInEnabled: async () => [
      { localidade: "WTorre", roomEmail: "sala@empresa.com" },
    ],
  };

  const tenantRepo: TenantRepository = {
    findByLocalidade: async () => createTenant(),
  };

  const graph: GraphRoomsGateway = {
    listRooms: async () => [],
    getSchedule: async () => [],
    getAvailabilityPreview: async () => ({
      start: "",
      end: "",
      room: { email: "", isAvailable: true, availabilityStatus: "available", conflicts: [] },
      participants: [],
    }),
    bookRoom: async () => ({ eventId: "evt" }),
    listBookings: async () => [
      {
        eventId: "evt-pending",
        roomEmail: "sala@empresa.com",
        roomName: "Sala",
        title: "Reuniao",
        start: start.toISOString(),
        end: "2026-03-12T15:00:00Z",
        requiresCheckIn: true,
        checkedIn: false,
      },
    ],
    getBooking: async () => null,
    markBookingRequiresCheckIn: async () => {},
    checkInBooking: async () => {},
    cancelBooking: async (_tenant, eventId) => {
      cancelled.push(eventId);
    },
    searchDirectoryUsers: async () => [],
  };

  const useCase = new ProcessNoShowBookingsUseCase(kioskRepo, tenantRepo, graph);
  const count = await useCase.execute(now);

  assert.equal(count, 0);
  assert.equal(cancelled.length, 0);
});

test("ProcessNoShowBookingsUseCase: ignora reservas sem tag RequireCheckIn", async () => {
  const start = new Date("2026-03-12T14:00:00Z");
  const now = new Date(start.getTime() + CHECKIN_GRACE_MS + 60_000);
  const cancelled: string[] = [];

  const kioskRepo: KioskSettingsRepository = {
    get: async () => ({ checkInModeEnabled: true, checkInGraceMinutes: 15 }),
    save: async () => {},
    listRoomsWithCheckInEnabled: async () => [
      { localidade: "WTorre", roomEmail: "sala@empresa.com" },
    ],
  };

  const tenantRepo: TenantRepository = {
    findByLocalidade: async () => createTenant(),
  };

  const graph: GraphRoomsGateway = {
    listRooms: async () => [],
    getSchedule: async () => [],
    getAvailabilityPreview: async () => ({
      start: "",
      end: "",
      room: { email: "", isAvailable: true, availabilityStatus: "available", conflicts: [] },
      participants: [],
    }),
    bookRoom: async () => ({ eventId: "evt" }),
    listBookings: async () => [
      {
        eventId: "evt-external",
        roomEmail: "sala@empresa.com",
        roomName: "Sala",
        title: "Outlook",
        start: start.toISOString(),
        end: "2026-03-12T15:00:00Z",
        requiresCheckIn: false,
        checkedIn: false,
      },
    ],
    getBooking: async () => null,
    markBookingRequiresCheckIn: async () => {},
    checkInBooking: async () => {},
    cancelBooking: async (_tenant, eventId) => {
      cancelled.push(eventId);
    },
    searchDirectoryUsers: async () => [],
  };

  const useCase = new ProcessNoShowBookingsUseCase(kioskRepo, tenantRepo, graph);
  const count = await useCase.execute(now);

  assert.equal(count, 0);
  assert.equal(cancelled.length, 0);
});
