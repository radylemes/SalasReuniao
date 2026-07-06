import { GraphRoomsGateway } from "../../domain/contracts/GraphRoomsGateway";
import { TenantRepository } from "../../domain/contracts/TenantRepository";
import { UiConfigRepository } from "../../domain/contracts/UiConfigRepository";
import { AvailabilityEntity, RoomSchedule } from "../../domain/entities/Room";
import { Localidade, Tenant } from "../../domain/entities/Tenant";
import { resolveApiLocalidade } from "../../domain/uiConfigResolver";
import { isBusyInAvailabilityView, isBusyScheduleStatus, overlapsInterval } from "../../domain/scheduleOverlap";
import { Booking, ScheduleItem } from "../../domain/entities/Room";

export class GetAvailabilityPreviewUseCase {
  constructor(
    private readonly graphGateway: GraphRoomsGateway,
    private readonly tenantRepository: TenantRepository,
    private readonly uiConfigRepository: UiConfigRepository,
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /** Inclui eventos que terminam no início do pedido (getSchedule pode omitir com janela estreita). */
  private padScheduleWindowStart(iso: string, minutes = 180): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    date.setMinutes(date.getMinutes() - minutes);
    return date.toISOString();
  }

  private mergeBusyItems(scheduleItems: ScheduleItem[], bookings: Booking[]): ScheduleItem[] {
    const merged = new Map<string, ScheduleItem>();
    for (const item of scheduleItems) {
      if (!isBusyScheduleStatus(item.status)) continue;
      const key = `${item.start}|${item.end}`;
      merged.set(key, item);
    }
    for (const booking of bookings) {
      const key = `${booking.start}|${booking.end}`;
      merged.set(key, {
        start: booking.start,
        end: booking.end,
        status: "busy",
        subject: booking.title,
      });
    }
    return Array.from(merged.values());
  }

  private resolveLocalidadeByEmail(email: string, domainToApiLocalidade: Record<string, Localidade>): Localidade | null {
    return resolveApiLocalidade(email, { tabs: [], domainToApiLocalidade, roomTabOverrides: {}, roomOrderByTab: {} });
  }

  private buildEntityFromSchedules(
    email: string,
    expectedIndex: number,
    schedules: RoomSchedule[],
    requestStart: string,
    requestEnd: string,
    roomBookings: Booking[] = [],
  ): AvailabilityEntity {
    const normalizedEmail = this.normalizeEmail(email);
    const byEmail = new Map(schedules.map((schedule) => [this.normalizeEmail(schedule.roomEmail), schedule]));
    const schedule = byEmail.get(normalizedEmail) ?? schedules[expectedIndex];
    const items = schedule?.scheduleItems ?? [];
    const nonFree = this.mergeBusyItems(items, roomBookings);
    const conflicts = nonFree.filter((item) =>
      overlapsInterval(requestStart, requestEnd, item.start, item.end),
    );

    const graphWindowStart =
      schedule?.scheduleGraphStart && schedule.availabilityViewIntervalMinutes
        ? `${schedule.scheduleGraphStart}${process.env.GRAPH_TIMEZONE_OFFSET ?? "-03:00"}`
        : null;
    const busyInAvailabilityView =
      graphWindowStart &&
      schedule?.availabilityView &&
      schedule.availabilityViewIntervalMinutes &&
      isBusyInAvailabilityView(
        schedule.availabilityView,
        graphWindowStart,
        requestStart,
        requestEnd,
        schedule.availabilityViewIntervalMinutes,
      );

    const availabilityStatus: AvailabilityEntity["availabilityStatus"] =
      !schedule ? "unknown" : conflicts.length > 0 || busyInAvailabilityView ? "busy" : "available";
    return {
      email: normalizedEmail,
      isAvailable: availabilityStatus === "available",
      availabilityStatus,
      conflicts,
    };
  }

  async execute(
    tenant: Tenant,
    input: { roomEmail: string; participants: string[]; start: string; end: string },
  ) {
    const normalizedRoomEmail = this.normalizeEmail(input.roomEmail);
    const participants = Array.from(new Set(input.participants.map((email) => this.normalizeEmail(email))));
    const uiConfig = await this.uiConfigRepository.get();
    const scheduleWindowStart = this.padScheduleWindowStart(input.start);
    const [roomSchedule, roomBookings] = await Promise.all([
      this.graphGateway.getSchedule(tenant, [normalizedRoomEmail], scheduleWindowStart, input.end),
      this.graphGateway.listBookings(tenant, { start: scheduleWindowStart, end: input.end }),
    ]);
    const room = this.buildEntityFromSchedules(
      normalizedRoomEmail,
      0,
      roomSchedule,
      input.start,
      input.end,
      roomBookings.filter((booking) => this.normalizeEmail(booking.roomEmail) === normalizedRoomEmail),
    );

    const participantsByLocalidade = new Map<Localidade, string[]>();
    const notValidatedContacts = new Set<string>();
    for (const participantEmail of participants) {
      const participantLocalidade = this.resolveLocalidadeByEmail(
        participantEmail,
        uiConfig.domainToApiLocalidade,
      );
      if (!participantLocalidade) {
        notValidatedContacts.add(participantEmail);
        continue;
      }
      const current = participantsByLocalidade.get(participantLocalidade) ?? [];
      current.push(participantEmail);
      participantsByLocalidade.set(participantLocalidade, current);
    }

    const participantEntitiesByEmail = new Map<string, AvailabilityEntity>();
    for (const localidadeParticipants of notValidatedContacts) {
      participantEntitiesByEmail.set(localidadeParticipants, {
        email: localidadeParticipants,
        isAvailable: false,
        availabilityStatus: "not_validated_contact",
        conflicts: [],
      });
    }

    for (const [localidade, emails] of participantsByLocalidade.entries()) {
      const targetTenant =
        tenant.localidade.trim().toLowerCase() === localidade.trim().toLowerCase()
          ? tenant
          : await this.tenantRepository.findByLocalidade(localidade);

      if (!targetTenant) {
        for (const email of emails) {
          participantEntitiesByEmail.set(email, {
            email,
            isAvailable: false,
            availabilityStatus: "unknown",
            conflicts: [],
          });
        }
        continue;
      }

      const schedules = await this.graphGateway.getSchedule(
        targetTenant,
        emails,
        scheduleWindowStart,
        input.end,
      );
      emails.forEach((email, index) => {
        participantEntitiesByEmail.set(
          email,
          this.buildEntityFromSchedules(email, index, schedules, input.start, input.end),
        );
      });
    }

    return {
      start: input.start,
      end: input.end,
      room,
      participants: participants.map(
        (email) =>
          participantEntitiesByEmail.get(email) ?? {
            email,
            isAvailable: false,
            availabilityStatus: "unknown",
            conflicts: [],
          },
      ),
    };
  }
}
