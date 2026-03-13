import { GraphRoomsGateway } from "../../domain/contracts/GraphRoomsGateway";
import {
  AvailabilityEntity,
  AvailabilityPreview,
  Booking,
  BookRoomInput,
  DirectoryUser,
  Room,
  RoomSchedule,
} from "../../domain/entities/Room";
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
      start: { dateTime: string; timeZone?: string };
      end: { dateTime: string; timeZone?: string };
      status: string;
      subject?: string;
    }>;
  }>;
};

type GraphCalendarEventResponse = {
  value: Array<{
    id: string;
    subject?: string;
    start?: { dateTime?: string; timeZone?: string };
    end?: { dateTime?: string; timeZone?: string };
    organizer?: { emailAddress?: { address?: string; name?: string } };
  }>;
};

type GraphUsersResponse = {
  value: Array<{
    displayName?: string;
    mail?: string;
    userPrincipalName?: string;
  }>;
};

export class MicrosoftGraphRoomsGateway implements GraphRoomsGateway {
  constructor(private readonly graphFactory: GraphClientFactory) {}
  private readonly maxRetries = Number(process.env.GRAPH_RETRIES ?? "2");
  private readonly graphTimeZone = process.env.GRAPH_TIMEZONE ?? "E. South America Standard Time";
  private readonly localTimeZone = process.env.LOCAL_TIMEZONE ?? "America/Sao_Paulo";
  private readonly graphTimeZoneOffset = process.env.GRAPH_TIMEZONE_OFFSET ?? "-03:00";
  private readonly domainsByLocalidade: Record<string, string[]> = {
    wtorre: ["wtorre.com.br", "novoanhangabau.com.br"],
    allianz: ["allianzparque.com.br"],
  };

  private normalizeDomainFromEmail(email: string): string {
    const at = email.lastIndexOf("@");
    if (at < 0 || at === email.length - 1) return "";
    return email.slice(at + 1).trim().toLowerCase();
  }

  private belongsToTenantDomain(email: string, localidade: string): boolean {
    const domains = this.domainsByLocalidade[localidade.trim().toLowerCase()] ?? [];
    if (domains.length === 0) return true;
    const domain = this.normalizeDomainFromEmail(email);
    if (!domain) return false;
    return domains.includes(domain);
  }

  private normalizeEndOfDayBoundary(localDateTime: string): string {
    const match = localDateTime.match(/^(\d{4})-(\d{2})-(\d{2})T23:59:59$/);
    if (!match) return localDateTime;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const next = new Date(Date.UTC(year, month - 1, day));
    next.setUTCDate(next.getUTCDate() + 1);
    const nextDate = next.toISOString().slice(0, 10);
    return `${nextDate}T00:00:00`;
  }

  private normalizeGraphDateTime(dateTime: string, timeZone?: string): string {
    if (/(Z|[+-]\d{2}:\d{2})$/i.test(dateTime)) {
      return dateTime;
    }

    if (timeZone === "UTC") {
      return `${dateTime}Z`;
    }

    if (timeZone === this.graphTimeZone) {
      return `${dateTime}${this.graphTimeZoneOffset}`;
    }

    return dateTime;
  }

  private toGraphLocalDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new AppError("INVALID_DATETIME", "Data/hora invalida para o Microsoft Graph.", 400);
    }

    const formatter = new Intl.DateTimeFormat("sv-SE", {
      timeZone: this.localTimeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = formatter.formatToParts(date);
    const byType = new Map(parts.map((part) => [part.type, part.value]));
    const year = byType.get("year");
    const month = byType.get("month");
    const day = byType.get("day");
    const hour = byType.get("hour");
    const minute = byType.get("minute");
    const second = byType.get("second");

    if (!year || !month || !day || !hour || !minute || !second) {
      throw new AppError("INVALID_DATETIME", "Falha ao formatar data/hora local.", 500);
    }

    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  }

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

  private mapGraphScheduleItems(
    items: GraphScheduleResponse["value"][number]["scheduleItems"] | undefined,
  ): RoomSchedule["scheduleItems"] {
    const scheduleItems = items ?? [];
    return scheduleItems.map((item) => ({
      start: this.normalizeGraphDateTime(item.start.dateTime, item.start.timeZone),
      end: this.normalizeGraphDateTime(item.end.dateTime, item.end.timeZone),
      ...(item.subject ? { subject: item.subject } : {}),
      status: item.status,
    }));
  }

  private async fetchGraphSchedule(
    tenant: Tenant,
    scheduleEmails: string[],
    start: string,
    end: string,
  ): Promise<GraphScheduleResponse["value"]> {
    const firstScheduleEmail = scheduleEmails[0];
    if (!firstScheduleEmail) return [];

    const client = this.graphFactory.create(tenant);
    const graphStart = this.toGraphLocalDateTime(start);
    const graphEnd = this.normalizeEndOfDayBoundary(this.toGraphLocalDateTime(end));
    const windowMinutes = Math.max(1, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60000));
    const availabilityViewInterval = Math.min(1440, Math.max(5, Math.min(30, windowMinutes - 1)));
    const payload = {
      schedules: scheduleEmails,
      startTime: { dateTime: graphStart, timeZone: this.graphTimeZone },
      endTime: { dateTime: graphEnd, timeZone: this.graphTimeZone },
      availabilityViewInterval,
    };

    const data = (await this.withRetry(() =>
      client
        .api(`/users/${encodeURIComponent(firstScheduleEmail)}/calendar/getSchedule`)
        .post(payload),
    )) as GraphScheduleResponse;

    return data.value ?? [];
  }

  async getSchedule(
    tenant: Tenant,
    roomEmails: string[],
    start: string,
    end: string,
  ): Promise<RoomSchedule[]> {
    if (roomEmails.length === 0) return [];
    const entries = await this.fetchGraphSchedule(tenant, roomEmails, start, end);
    return entries.map((entry) => {
      const scheduleItems = this.mapGraphScheduleItems(entry.scheduleItems);
      const isAvailable = scheduleItems.length === 0;
      const availabilityView = entry.availabilityView;

      return {
        roomEmail: entry.scheduleId,
        ...(availabilityView ? { availabilityView } : {}),
        scheduleItems,
        isAvailable,
      };
    });
  }

  async getAvailabilityPreview(
    tenant: Tenant,
    roomEmail: string,
    participantEmails: string[],
    start: string,
    end: string,
  ): Promise<AvailabilityPreview> {
    const normalizedRoomEmail = roomEmail.trim().toLowerCase();
    const uniqueParticipants = Array.from(
      new Set(
        participantEmails
          .map((email) => email.trim().toLowerCase())
          .filter((email) => Boolean(email) && email !== normalizedRoomEmail),
      ),
    );

    const schedules = [normalizedRoomEmail, ...uniqueParticipants];
    const entries = await this.fetchGraphSchedule(tenant, schedules, start, end);
    const entryByEmail = new Map(entries.map((entry) => [entry.scheduleId.toLowerCase(), entry]));

    const resolveEntry = (email: string, scheduleIndex: number) => {
      const exact = entryByEmail.get(email);
      if (exact) return exact;
      // Em alguns tenants o scheduleId volta com alias/domínio canônico diferente.
      return entries[scheduleIndex];
    };

    const toAvailabilityEntity = (email: string, scheduleIndex: number): AvailabilityEntity => {
      const entry = resolveEntry(email, scheduleIndex);
      const conflicts = this.mapGraphScheduleItems(entry?.scheduleItems);
      const hasConflicts = conflicts.length > 0;
      const isCrossTenant = !this.belongsToTenantDomain(email, tenant.localidade);
      const availabilityStatus: AvailabilityEntity["availabilityStatus"] = hasConflicts
        ? "busy"
        : isCrossTenant
          ? "unknown"
          : "available";
      return {
        email,
        isAvailable: availabilityStatus === "available",
        availabilityStatus,
        conflicts,
      };
    };

    return {
      start,
      end,
      room: toAvailabilityEntity(normalizedRoomEmail, 0),
      participants: uniqueParticipants.map((email, index) => toAvailabilityEntity(email, index + 1)),
    };
  }

  async bookRoom(tenant: Tenant, input: BookRoomInput): Promise<{ eventId: string }> {
    const client = this.graphFactory.create(tenant);
    const roomEmailLower = input.roomEmail.toLowerCase();
    const requesterEmail = input.requesterEmail.trim().toLowerCase();
    const participantEmails = Array.from(
      new Set(
        input.participants
          .map((email) => email.trim().toLowerCase())
          .filter((email) => email && email !== roomEmailLower && email !== requesterEmail),
      ),
    );
    const graphStart = this.toGraphLocalDateTime(input.start);
    const graphEnd = this.normalizeEndOfDayBoundary(this.toGraphLocalDateTime(input.end));

    const createInMailbox = (mailboxEmail: string, payload: unknown) =>
      this.withRetry(() =>
        client.api(`/users/${encodeURIComponent(mailboxEmail)}/events`).post(payload),
      );

    // Opção 3: cria reunião no calendário do solicitante e convida a sala.
    // Se o usuário não puder ser usado como organizer (permissão/tenant), cai para o modo legado.
    let event: any;
    try {
      event = await createInMailbox(requesterEmail, {
        subject: input.title,
        start: {
          dateTime: graphStart,
          timeZone: this.graphTimeZone,
        },
        end: {
          dateTime: graphEnd,
          timeZone: this.graphTimeZone,
        },
        location: { displayName: input.roomEmail },
        attendees: [
          {
            emailAddress: { address: input.roomEmail },
            type: "resource",
          },
          ...participantEmails.map((email) => ({
            emailAddress: { address: email },
            type: "required",
          })),
        ],
        responseRequested: true,
      });
    } catch (organizerError: unknown) {
      const organizerStatusCode = (organizerError as { statusCode?: number; status?: number } | null)?.statusCode
        ?? (organizerError as { statusCode?: number; status?: number } | null)?.status;

      if (organizerStatusCode !== 400 && organizerStatusCode !== 403 && organizerStatusCode !== 404) {
        throw organizerError;
      }

      const legacyAttendeeEmails = Array.from(new Set([requesterEmail, ...participantEmails]));
      const legacyPayload = (withAttendees: boolean) => ({
        subject: input.title,
        start: {
          dateTime: graphStart,
          timeZone: this.graphTimeZone,
        },
        end: {
          dateTime: graphEnd,
          timeZone: this.graphTimeZone,
        },
        ...(withAttendees
          ? {
              attendees: legacyAttendeeEmails.map((email) => ({
                emailAddress: { address: email },
                type: "required",
              })),
              responseRequested: true,
            }
          : {}),
      });

      try {
        event = await createInMailbox(input.roomEmail, legacyPayload(true));
      } catch (legacyError: unknown) {
        const legacyStatusCode = (legacyError as { statusCode?: number; status?: number } | null)?.statusCode
          ?? (legacyError as { statusCode?: number; status?: number } | null)?.status;
        if (legacyStatusCode === 400) {
          event = await createInMailbox(input.roomEmail, legacyPayload(false));
        } else {
          throw legacyError;
        }
      }
    }

    if (!event?.id) {
      throw new AppError("BOOKING_FAILED", "Falha ao reservar sala.", 500);
    }

    return { eventId: event.id };
  }

  async listBookings(tenant: Tenant, input: { start: string; end: string }): Promise<Booking[]> {
    const client = this.graphFactory.create(tenant);
    const rooms = await this.listRooms(tenant);

    if (rooms.length === 0) {
      return [];
    }

    const bookingsByRoom = await Promise.all(
      rooms.map(async (room) => {
        const events = (await this.withRetry(() =>
          client
            .api(
              `/users/${encodeURIComponent(room.email)}/calendarView` +
                `?startDateTime=${encodeURIComponent(input.start)}` +
                `&endDateTime=${encodeURIComponent(input.end)}` +
                `&$top=50`,
            )
            .header("Prefer", `outlook.timezone="${this.graphTimeZone}"`)
            .select("id,subject,start,end,organizer")
            .get(),
        )) as GraphCalendarEventResponse;

        return (events.value ?? [])
          .filter((event) => Boolean(event.id && event.start?.dateTime && event.end?.dateTime))
          .map((event) => {
            const organizer = event.organizer?.emailAddress?.name ?? event.organizer?.emailAddress?.address;
            return {
              eventId: event.id,
              roomEmail: room.email,
              roomName: room.name,
              title: event.subject ?? "(Sem titulo)",
              start: event.start?.dateTime
                ? this.normalizeGraphDateTime(event.start.dateTime, event.start.timeZone)
                : input.start,
              end: event.end?.dateTime
                ? this.normalizeGraphDateTime(event.end.dateTime, event.end.timeZone)
                : input.end,
              ...(organizer ? { organizer } : {}),
            };
          });
      }),
    );

    return bookingsByRoom.flat().sort((a, b) => a.start.localeCompare(b.start));
  }

  async cancelBooking(tenant: Tenant, eventId: string): Promise<void> {
    const client = this.graphFactory.create(tenant);
    const rooms = await this.listRooms(tenant);

    for (const room of rooms) {
      try {
        await this.withRetry(() =>
          client.api(`/users/${encodeURIComponent(room.email)}/events/${encodeURIComponent(eventId)}`).delete(),
        );
        return;
      } catch (error: unknown) {
        const statusCode = (error as { statusCode?: number; status?: number } | null)?.statusCode
          ?? (error as { statusCode?: number; status?: number } | null)?.status;
        if (statusCode === 404 || statusCode === 400) {
          continue;
        }
      }
    }

    throw new AppError("BOOKING_NOT_FOUND", "Reserva nao encontrada para cancelamento.", 404);
  }

  async searchDirectoryUsers(tenant: Tenant, query: string): Promise<DirectoryUser[]> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) return [];

    const escapedQuery = normalizedQuery.replace(/'/g, "''");
    const client = this.graphFactory.create(tenant);

    const data = (await this.withRetry(() =>
      client
        .api("/users")
        .select("displayName,mail,userPrincipalName")
        .filter(
          `startswith(displayName,'${escapedQuery}') or ` +
            `startswith(mail,'${escapedQuery}') or ` +
            `startswith(userPrincipalName,'${escapedQuery}')`,
        )
        .top(10)
        .get(),
    )) as GraphUsersResponse;

    const users = (data.value ?? [])
      .map((user) => {
        const email = user.mail ?? user.userPrincipalName;
        if (!email) return null;
        return {
          name: user.displayName?.trim() || email,
          email: email.trim().toLowerCase(),
        };
      })
      .filter((user): user is DirectoryUser => Boolean(user));

    const uniqueByEmail = new Map<string, DirectoryUser>();
    for (const user of users) {
      if (!uniqueByEmail.has(user.email)) {
        uniqueByEmail.set(user.email, user);
      }
    }

    return Array.from(uniqueByEmail.values());
  }
}
