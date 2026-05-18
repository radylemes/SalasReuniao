import { strict as assert } from "node:assert";
import test from "node:test";
import { AppError } from "../errors/AppError";
import { CheckInBookingUseCase } from "./CheckInBookingUseCase";
import { GraphRoomsGateway } from "../../domain/contracts/GraphRoomsGateway";
import { KioskSettingsRepository } from "../../domain/contracts/KioskSettingsRepository";
import { Tenant } from "../../domain/entities/Tenant";

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
    bookRoom: async () => ({ eventId: "evt" }),
    listBookings: async () => [],
    getBooking: async () => null,
    markBookingRequiresCheckIn: async () => {},
    checkInBooking: async () => {},
    cancelBooking: async () => {},
    searchDirectoryUsers: async () => [],
    ...overrides,
  };
}

test("CheckInBookingUseCase: check-in com sucesso", async () => {
  let checkedIn = false;
  const gateway = createGatewayMock({
    getBooking: async () => ({
      eventId: "evt-1",
      roomEmail: "sala@empresa.com",
      roomName: "Sala",
      title: "Reuniao",
      start: "2026-03-12T14:00:00Z",
      end: "2026-03-12T15:00:00Z",
      requiresCheckIn: true,
      checkedIn: false,
    }),
    checkInBooking: async () => {
      checkedIn = true;
    },
  });
  const kiosk: KioskSettingsRepository = {
    get: async () => ({ checkInModeEnabled: false }),
    save: async () => {},
    listRoomsWithCheckInEnabled: async () => [],
  };
  const useCase = new CheckInBookingUseCase(gateway, kiosk);

  await useCase.execute(createTenant(), "evt-1");

  assert.equal(checkedIn, true);
});

test("CheckInBookingUseCase: check-in permitido com modo kiosk ativo sem tag previa", async () => {
  let marked = false;
  let checkedIn = false;
  const gateway = createGatewayMock({
    getBooking: async () => ({
      eventId: "evt-1",
      roomEmail: "sala@empresa.com",
      roomName: "Sala",
      title: "Reuniao",
      start: "2026-03-12T14:00:00Z",
      end: "2026-03-12T15:00:00Z",
      requiresCheckIn: false,
      checkedIn: false,
    }),
    markBookingRequiresCheckIn: async () => {
      marked = true;
    },
    checkInBooking: async () => {
      checkedIn = true;
    },
  });
  const kiosk: KioskSettingsRepository = {
    get: async () => ({ checkInModeEnabled: true }),
    save: async () => {},
    listRoomsWithCheckInEnabled: async () => [],
  };
  const useCase = new CheckInBookingUseCase(gateway, kiosk);

  await useCase.execute(createTenant(), "evt-1");

  assert.equal(marked, true);
  assert.equal(checkedIn, true);
});

test("CheckInBookingUseCase: falha quando reserva nao exige check-in", async () => {
  const gateway = createGatewayMock({
    getBooking: async () => ({
      eventId: "evt-1",
      roomEmail: "sala@empresa.com",
      roomName: "Sala",
      title: "Reuniao",
      start: "2026-03-12T14:00:00Z",
      end: "2026-03-12T15:00:00Z",
      requiresCheckIn: false,
    }),
  });
  const kiosk: KioskSettingsRepository = {
    get: async () => ({ checkInModeEnabled: false }),
    save: async () => {},
    listRoomsWithCheckInEnabled: async () => [],
  };
  const useCase = new CheckInBookingUseCase(gateway, kiosk);

  await assert.rejects(
    () => useCase.execute(createTenant(), "evt-1"),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "CHECKIN_NOT_REQUIRED");
      return true;
    },
  );
});

test("CheckInBookingUseCase: falha quando check-in ja realizado", async () => {
  const gateway = createGatewayMock({
    getBooking: async () => ({
      eventId: "evt-1",
      roomEmail: "sala@empresa.com",
      roomName: "Sala",
      title: "Reuniao",
      start: "2026-03-12T14:00:00Z",
      end: "2026-03-12T15:00:00Z",
      requiresCheckIn: true,
      checkedIn: true,
    }),
  });
  const kiosk: KioskSettingsRepository = {
    get: async () => ({ checkInModeEnabled: true }),
    save: async () => {},
    listRoomsWithCheckInEnabled: async () => [],
  };
  const useCase = new CheckInBookingUseCase(gateway, kiosk);

  await assert.rejects(
    () => useCase.execute(createTenant(), "evt-1"),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "ALREADY_CHECKED_IN");
      return true;
    },
  );
});
