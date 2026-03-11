import { GraphRoomsGateway } from "../../domain/contracts/GraphRoomsGateway";
import { BookRoomInput, Room, RoomSchedule } from "../../domain/entities/Room";
import { Tenant } from "../../domain/entities/Tenant";
import { AppError } from "../../application/errors/AppError";
import { GraphClientFactory } from "./GraphClientFactory";

type GraphRoomResponse = {
  value: Array<{
    displayName: string;
    emailAddress: string;
    capacity?: number;
  }>;
};

type GraphScheduleResponse = {
  value: Array<{
    scheduleId: string;
    availabilityView?: string;
    scheduleItems: Array<{
      start: { dateTime: string };
      end: { dateTime: string };
      status: string;
      subject?: string;
    }>;
  }>;
};

export class MicrosoftGraphRoomsGateway implements GraphRoomsGateway {
  constructor(private readonly graphFactory: GraphClientFactory) {}
  private readonly maxRetries = Number(process.env.GRAPH_RETRIES ?? "2");

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }

  async listRooms(tenant: Tenant): Promise<Room[]> {
    const client = this.graphFactory.create(tenant);
    const data = (await this.withRetry(() =>
      client.api("/places/microsoft.graph.room").top(100).get(),
    )) as GraphRoomResponse;

    return (data.value ?? []).map((room) => ({
      name: room.displayName,
      email: room.emailAddress,
      capacity: room.capacity ?? null,
    }));
  }

  async getSchedule(
    tenant: Tenant,
    roomEmails: string[],
    start: string,
    end: string,
  ): Promise<RoomSchedule[]> {
    if (roomEmails.length === 0) return [];
    const firstRoomEmail = roomEmails[0];
    if (!firstRoomEmail) return [];
    const client = this.graphFactory.create(tenant);
    const payload = {
      schedules: roomEmails,
      startTime: { dateTime: start, timeZone: "UTC" },
      endTime: { dateTime: end, timeZone: "UTC" },
      availabilityViewInterval: 30,
    };

    const data = (await this.withRetry(() =>
      client
        .api(`/users/${encodeURIComponent(firstRoomEmail)}/calendar/getSchedule`)
        .post(payload),
    )) as GraphScheduleResponse;

    const entries = data.value ?? [];
    return entries.map((entry) => {
      const scheduleItems = entry.scheduleItems ?? [];
      const isAvailable = scheduleItems.length === 0;
      const availabilityView = entry.availabilityView;

      return {
        roomEmail: entry.scheduleId,
        ...(availabilityView ? { availabilityView } : {}),
        scheduleItems: scheduleItems.map((item) => ({
          start: item.start.dateTime,
          end: item.end.dateTime,
          ...(item.subject ? { subject: item.subject } : {}),
          status: item.status,
        })),
        isAvailable,
      };
    });
  }

  async bookRoom(tenant: Tenant, input: BookRoomInput): Promise<{ eventId: string }> {
    const client = this.graphFactory.create(tenant);

    const event = await this.withRetry(() =>
      client.api(`/users/${encodeURIComponent(input.roomEmail)}/events`).post({
        subject: input.title,
        start: {
          dateTime: input.start,
          timeZone: "UTC",
        },
        end: {
          dateTime: input.end,
          timeZone: "UTC",
        },
      }),
    );

    if (!event?.id) {
      throw new AppError("BOOKING_FAILED", "Falha ao reservar sala.", 500);
    }

    return { eventId: event.id };
  }
}
