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
import {
  CHECKIN_CATEGORY_CHECKED_IN,
  CHECKIN_CATEGORY_REQUIRE,
  mapBookingCheckInFlags,
} from "../../domain/checkIn";
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
    categories?: string[];
    start?: { dateTime?: string; timeZone?: string };
    end?: { dateTime?: string; timeZone?: string };
    organizer?: { emailAddress?: { address?: string; name?: string } };
    location?: { displayName?: string };
    attendees?: Array<{
      type?: string;
      emailAddress?: { address?: string; name?: string };
    }>;
  }>;
};

type GraphCalendarEvent = GraphCalendarEventResponse["value"][number];

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
    const withoutFraction = dateTime.trim().replace(/\.\d+$/, "");
    if (/(Z|[+-]\d{2}:\d{2})$/i.test(withoutFraction)) {
      return withoutFraction;
    }

    if (timeZone === "UTC") {
      return `${withoutFraction}Z`;
    }

    // Horários do Graph vêm na TZ da organização (Brasil) sem sufixo — alinhar com o frontend (-03:00).
    return `${withoutFraction}${this.graphTimeZoneOffset}`;
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
  ): Promise<{
    entries: GraphScheduleResponse["value"];
    graphStart: string;
    availabilityViewIntervalMinutes: number;
  }> {
    const firstScheduleEmail = scheduleEmails[0];
    if (!firstScheduleEmail) {
      return { entries: [], graphStart: "", availabilityViewIntervalMinutes: 30 };
    }

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

    return {
      entries: data.value ?? [],
      graphStart,
      availabilityViewIntervalMinutes: availabilityViewInterval,
    };
  }

  async getSchedule(
    tenant: Tenant,
    roomEmails: string[],
    start: string,
    end: string,
  ): Promise<RoomSchedule[]> {
    if (roomEmails.length === 0) return [];
    const { entries, graphStart, availabilityViewIntervalMinutes } = await this.fetchGraphSchedule(
      tenant,
      roomEmails,
      start,
      end,
    );
    return entries.map((entry) => {
      const scheduleItems = this.mapGraphScheduleItems(entry.scheduleItems);
      const isAvailable = scheduleItems.length === 0;
      const availabilityView = entry.availabilityView;

      return {
        roomEmail: entry.scheduleId,
        ...(availabilityView ? { availabilityView } : {}),
        scheduleItems,
        isAvailable,
        scheduleGraphStart: graphStart,
        availabilityViewIntervalMinutes,
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
    const { entries } = await this.fetchGraphSchedule(tenant, schedules, start, end);
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

    const eventTime = {
      start: { dateTime: graphStart, timeZone: this.graphTimeZone },
      end: { dateTime: graphEnd, timeZone: this.graphTimeZone },
    };

    const checkInCategories = input.requireCheckIn ? [CHECKIN_CATEGORY_REQUIRE] : undefined;
    const roomAttendeeEmails = Array.from(new Set([requesterEmail, ...participantEmails]));
    const roomCalendarPayload = (withAttendees: boolean) => ({
      subject: input.title,
      ...eventTime,
      allowNewTimeProposals: false,
      ...(checkInCategories ? { categories: checkInCategories } : {}),
      ...(withAttendees
        ? {
            attendees: roomAttendeeEmails.map((email) => ({
              emailAddress: { address: email },
              type: "required",
            })),
            responseRequested: false,
          }
        : {}),
    });

    // Sala como recurso no calendário do solicitante → Exchange aplica autoaceite da mailbox da sala.
    const requesterCalendarPayload = {
      subject: input.title,
      ...eventTime,
      location: { displayName: input.roomEmail },
      allowNewTimeProposals: false,
      ...(checkInCategories ? { categories: checkInCategories } : {}),
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
      responseRequested: false,
    };

    const tryCreate = async (mailboxEmail: string, payload: unknown): Promise<{ id?: string }> =>
      createInMailbox(mailboxEmail, payload);

    try {
      const event = await tryCreate(requesterEmail, requesterCalendarPayload);
      if (event?.id) {
        return { eventId: event.id };
      }
    } catch (requesterError: unknown) {
      this.throwIfRoomUnavailable(requesterError);
      const statusCode = (requesterError as { statusCode?: number; status?: number } | null)?.statusCode
        ?? (requesterError as { statusCode?: number; status?: number } | null)?.status;
      if (statusCode !== 400 && statusCode !== 403 && statusCode !== 404) {
        throw requesterError;
      }
    }

    let lastError: unknown;
    for (const attempt of [
      () => tryCreate(input.roomEmail, roomCalendarPayload(true)),
      () => tryCreate(input.roomEmail, roomCalendarPayload(false)),
    ]) {
      try {
        const event = await attempt();
        if (event?.id) {
          return { eventId: event.id };
        }
      } catch (error: unknown) {
        lastError = error;
        this.throwIfRoomUnavailable(error);
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new AppError("BOOKING_FAILED", "Falha ao reservar sala.", 500);
  }

  private throwIfRoomUnavailable(error: unknown): void {
    const graphError = error as {
      statusCode?: number;
      status?: number;
      message?: string;
      body?: { error?: { message?: string; code?: string } };
    } | null;
    const statusCode = graphError?.statusCode ?? graphError?.status;
    const message = (
      graphError?.body?.error?.message ??
      graphError?.message ??
      ""
    ).toLowerCase();

    const roomBusy =
      statusCode === 409 ||
      /not available|indispon[ií]vel|unavailable|scheduling conflict|conflito/.test(message);

    if (roomBusy) {
      throw new AppError(
        "ROOM_CONFLICT",
        "A sala selecionada não está disponível neste horário.",
        409,
      );
    }
  }

  async listBookings(tenant: Tenant, input: { start: string; end: string }): Promise<Booking[]> {
    const client = this.graphFactory.create(tenant);
    const rooms = await this.listRooms(tenant);

    if (rooms.length === 0) {
      return [];
    }

    const graphStart = this.toGraphLocalDateTime(input.start);
    const graphEnd = this.normalizeEndOfDayBoundary(this.toGraphLocalDateTime(input.end));

    const bookingsByRoom = await Promise.all(
      rooms.map(async (room) => {
        const events = (await this.withRetry(() =>
          client
            .api(
              `/users/${encodeURIComponent(room.email)}/calendarView` +
                `?startDateTime=${encodeURIComponent(graphStart)}` +
                `&endDateTime=${encodeURIComponent(graphEnd)}` +
                `&$top=50`,
            )
            .header("Prefer", `outlook.timezone="${this.graphTimeZone}"`)
            .select("id,subject,categories,start,end,organizer")
            .get(),
        )) as GraphCalendarEventResponse;

        return (events.value ?? [])
          .filter((event) => Boolean(event.id && event.start?.dateTime && event.end?.dateTime))
          .map((event) =>
            this.mapEventToBooking(event, room.email, room.name, input.start, input.end),
          );
      }),
    );

    return bookingsByRoom.flat().sort((a, b) => a.start.localeCompare(b.start));
  }

  async getBooking(
    tenant: Tenant,
    eventId: string,
    requesterEmail?: string,
    fallbackRoomEmail?: string,
  ): Promise<Booking | null> {
    const client = this.graphFactory.create(tenant);
    const rooms = await this.listRooms(tenant);
    const mailboxes = [
      ...(requesterEmail?.includes("@") ? [requesterEmail.trim().toLowerCase()] : []),
      ...rooms.map((room) => room.email),
    ];
    const uniqueMailboxes = Array.from(new Set(mailboxes));
    const eventSelect = "id,subject,categories,start,end,organizer,location,attendees";

    for (const mailbox of uniqueMailboxes) {
      try {
        const event = (await this.withRetry(() =>
          client
            .api(`/users/${encodeURIComponent(mailbox)}/events/${encodeURIComponent(eventId)}`)
            .select(eventSelect)
            .get(),
        )) as GraphCalendarEvent;

        if (!event?.id || !event.start?.dateTime || !event.end?.dateTime) {
          continue;
        }

        const room =
          this.resolveRoomForEvent(event, rooms, mailbox) ??
          this.resolveFallbackRoom(rooms, fallbackRoomEmail);
        if (!room) continue;

        return this.mapEventToBooking(
          event,
          room.roomEmail,
          room.roomName,
          event.start.dateTime,
          event.end.dateTime,
        );
      } catch (error: unknown) {
        const statusCode = (error as { statusCode?: number; status?: number } | null)?.statusCode
          ?? (error as { statusCode?: number; status?: number } | null)?.status;
        if (statusCode === 404 || statusCode === 400) {
          continue;
        }
        throw error;
      }
    }

    return null;
  }

  private resolveRoomForEvent(
    event: GraphCalendarEvent,
    rooms: Room[],
    mailboxEmail: string,
  ): { roomEmail: string; roomName: string } | null {
    const roomByMailbox = rooms.find((r) => r.email.toLowerCase() === mailboxEmail.toLowerCase());
    if (roomByMailbox) {
      return { roomEmail: roomByMailbox.email, roomName: roomByMailbox.name };
    }

    const location = event.location?.displayName?.trim();
    if (location) {
      const byEmail = rooms.find((r) => r.email.toLowerCase() === location.toLowerCase());
      if (byEmail) {
        return { roomEmail: byEmail.email, roomName: byEmail.name };
      }
      const byName = rooms.find((r) => r.name.toLowerCase() === location.toLowerCase());
      if (byName) {
        return { roomEmail: byName.email, roomName: byName.name };
      }
      if (location.includes("@")) {
        return { roomEmail: location, roomName: location };
      }
    }

    const resourceAttendee = event.attendees?.find((attendee) => attendee.type === "resource");
    const resourceEmail = resourceAttendee?.emailAddress?.address?.trim();
    if (resourceEmail?.includes("@")) {
      const room = rooms.find((r) => r.email.toLowerCase() === resourceEmail.toLowerCase());
      return { roomEmail: resourceEmail, roomName: room?.name ?? resourceEmail };
    }

    return null;
  }

  private resolveFallbackRoom(
    rooms: Room[],
    fallbackRoomEmail?: string,
  ): { roomEmail: string; roomName: string } | null {
    if (!fallbackRoomEmail?.includes("@")) return null;
    const normalized = fallbackRoomEmail.trim().toLowerCase();
    const room = rooms.find((r) => r.email.toLowerCase() === normalized);
    if (room) {
      return { roomEmail: room.email, roomName: room.name };
    }
    return { roomEmail: fallbackRoomEmail.trim(), roomName: fallbackRoomEmail.trim() };
  }

  async markBookingRequiresCheckIn(tenant: Tenant, eventId: string, requesterEmail?: string): Promise<void> {
    await this.addCategoryToBooking(tenant, eventId, CHECKIN_CATEGORY_REQUIRE, requesterEmail);
  }

  async checkInBooking(tenant: Tenant, eventId: string, requesterEmail?: string): Promise<void> {
    await this.addCategoryToBooking(tenant, eventId, CHECKIN_CATEGORY_CHECKED_IN, requesterEmail);
  }

  async cancelBooking(
    tenant: Tenant,
    eventId: string,
    options?: {
      requesterEmail?: string;
      roomEmail?: string;
      start?: string;
      end?: string;
      title?: string;
    },
  ): Promise<void> {
    const client = this.graphFactory.create(tenant);
    const rooms = await this.listRooms(tenant);
    const booking = await this.getBooking(
      tenant,
      eventId,
      options?.requesterEmail,
      options?.roomEmail,
    );
    const mailboxes = this.buildCancelMailboxes(
      booking,
      options?.requesterEmail,
      options?.roomEmail,
      rooms,
    );

    for (const mailbox of mailboxes) {
      if (await this.tryDeleteEvent(client, mailbox, eventId)) {
        return;
      }
    }

    const start = booking?.start ?? options?.start;
    const end = booking?.end ?? options?.end;
    const title = booking?.title ?? options?.title;

    if (start && end) {
      for (const mailbox of mailboxes) {
        const resolvedId = await this.findEventIdInCalendarView(client, mailbox, start, end, title);
        if (resolvedId && (await this.tryDeleteEvent(client, mailbox, resolvedId))) {
          return;
        }
      }
    }

    throw new AppError("BOOKING_NOT_FOUND", "Reserva nao encontrada para cancelamento.", 404);
  }

  private buildCancelMailboxes(
    booking: Booking | null,
    requesterEmail?: string,
    fallbackRoomEmail?: string,
    rooms: Room[] = [],
  ): string[] {
    const mailboxes: string[] = [];

    if (booking?.organizer?.includes("@")) {
      mailboxes.push(booking.organizer.trim().toLowerCase());
    }
    if (requesterEmail?.includes("@")) {
      mailboxes.push(requesterEmail.trim().toLowerCase());
    }
    if (booking?.roomEmail?.includes("@")) {
      mailboxes.push(booking.roomEmail.trim().toLowerCase());
    }
    if (fallbackRoomEmail?.includes("@")) {
      mailboxes.push(fallbackRoomEmail.trim().toLowerCase());
    }
    for (const room of rooms) {
      mailboxes.push(room.email.trim().toLowerCase());
    }

    return Array.from(new Set(mailboxes));
  }

  private async tryDeleteEvent(
    client: ReturnType<GraphClientFactory["create"]>,
    mailbox: string,
    eventId: string,
  ): Promise<boolean> {
    try {
      await this.withRetry(() =>
        client
          .api(`/users/${encodeURIComponent(mailbox)}/events/${encodeURIComponent(eventId)}`)
          .delete(),
      );
      return true;
    } catch (error: unknown) {
      const statusCode = (error as { statusCode?: number; status?: number } | null)?.statusCode
        ?? (error as { statusCode?: number; status?: number } | null)?.status;
      if (statusCode === 404 || statusCode === 400) {
        return false;
      }
      throw error;
    }
  }

  private async findEventIdInCalendarView(
    client: ReturnType<GraphClientFactory["create"]>,
    mailbox: string,
    start: string,
    end: string,
    title?: string,
  ): Promise<string | null> {
    const targetStartMs = Date.parse(start);
    if (Number.isNaN(targetStartMs)) return null;

    const graphStart = this.toGraphLocalDateTime(start);
    const graphEnd = this.normalizeEndOfDayBoundary(this.toGraphLocalDateTime(end));
    const wantedTitle = title?.trim().toLowerCase();

    try {
      const response = (await this.withRetry(() =>
        client
          .api(
            `/users/${encodeURIComponent(mailbox)}/calendarView` +
              `?startDateTime=${encodeURIComponent(graphStart)}` +
              `&endDateTime=${encodeURIComponent(graphEnd)}` +
              `&$top=50`,
          )
          .header("Prefer", `outlook.timezone="${this.graphTimeZone}"`)
          .select("id,subject,start")
          .get(),
      )) as GraphCalendarEventResponse;

      for (const event of response.value ?? []) {
        if (!event.id || !event.start?.dateTime) continue;

        const eventStart = this.normalizeGraphDateTime(event.start.dateTime, event.start.timeZone);
        const eventStartMs = Date.parse(eventStart);
        if (Number.isNaN(eventStartMs)) continue;
        if (Math.abs(eventStartMs - targetStartMs) > 120_000) continue;

        if (wantedTitle) {
          const subject = event.subject?.trim().toLowerCase() ?? "";
          if (subject && !subject.includes(wantedTitle) && !wantedTitle.includes(subject)) {
            continue;
          }
        }

        return event.id;
      }
    } catch (error: unknown) {
      const statusCode = (error as { statusCode?: number; status?: number } | null)?.statusCode
        ?? (error as { statusCode?: number; status?: number } | null)?.status;
      if (statusCode === 404 || statusCode === 400) {
        return null;
      }
      throw error;
    }

    return null;
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

  private mapEventToBooking(
    event: GraphCalendarEvent,
    roomEmail: string,
    roomName: string,
    fallbackStart: string,
    fallbackEnd: string,
  ): Booking {
    const organizer = event.organizer?.emailAddress?.address ?? event.organizer?.emailAddress?.name;
    const flags = mapBookingCheckInFlags(event.categories);
    return {
      eventId: event.id,
      roomEmail,
      roomName,
      title: event.subject ?? "(Sem titulo)",
      start: event.start?.dateTime
        ? this.normalizeGraphDateTime(event.start.dateTime, event.start.timeZone)
        : fallbackStart,
      end: event.end?.dateTime
        ? this.normalizeGraphDateTime(event.end.dateTime, event.end.timeZone)
        : fallbackEnd,
      ...(organizer ? { organizer } : {}),
      ...flags,
    };
  }

  private async addCategoryToBooking(
    tenant: Tenant,
    eventId: string,
    category: string,
    requesterEmail?: string,
  ): Promise<void> {
    const client = this.graphFactory.create(tenant);
    const rooms = await this.listRooms(tenant);
    const mailboxes = [
      ...(requesterEmail?.includes("@") ? [requesterEmail.trim().toLowerCase()] : []),
      ...rooms.map((room) => room.email),
    ];
    const uniqueMailboxes = Array.from(new Set(mailboxes));

    for (const mailbox of uniqueMailboxes) {
      try {
        const event = (await this.withRetry(() =>
          client
            .api(`/users/${encodeURIComponent(mailbox)}/events/${encodeURIComponent(eventId)}`)
            .select("categories")
            .get(),
        )) as { categories?: string[] };

        const current = event.categories ?? [];
        if (current.includes(category)) {
          return;
        }

        await this.withRetry(() =>
          client
            .api(`/users/${encodeURIComponent(mailbox)}/events/${encodeURIComponent(eventId)}`)
            .patch({ categories: [...current, category] }),
        );
        return;
      } catch (error: unknown) {
        const statusCode = (error as { statusCode?: number; status?: number } | null)?.statusCode
          ?? (error as { statusCode?: number; status?: number } | null)?.status;
        if (statusCode === 404 || statusCode === 400) {
          continue;
        }
        throw error;
      }
    }

    throw new AppError("BOOKING_NOT_FOUND", "Reserva nao encontrada.", 404);
  }
}
