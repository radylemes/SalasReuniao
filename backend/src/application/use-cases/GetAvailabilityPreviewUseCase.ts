import * as fs from "fs";
import * as path from "path";
import { GraphRoomsGateway } from "../../domain/contracts/GraphRoomsGateway";
import { TenantRepository } from "../../domain/contracts/TenantRepository";
import { AvailabilityEntity, RoomSchedule } from "../../domain/entities/Room";
import { Localidade, Tenant } from "../../domain/entities/Tenant";
import { isBusyScheduleStatus, overlapsInterval } from "../../domain/scheduleOverlap";

// Raiz do projeto: sobe de src/application/use-cases -> ../../../ = backend; ../../../../ = raiz (SalasReuniao)
const PREVIEW_DEBUG_LOG = path.resolve(__dirname, "..", "..", "..", "..", "preview-debug.log");

function debugLog(message: string, data?: object): void {
  const line = data ? `${message} ${JSON.stringify(data, null, 2)}` : message;
  const full = `[${new Date().toISOString()}] ${line}\n`;
  try {
    fs.appendFileSync(PREVIEW_DEBUG_LOG, full);
  } catch (err) {
    console.error("[preview] Erro ao gravar log em", PREVIEW_DEBUG_LOG, err);
  }
  console.log("[preview]", message, data ?? "");
}

export class GetAvailabilityPreviewUseCase {
  constructor(
    private readonly graphGateway: GraphRoomsGateway,
    private readonly tenantRepository: TenantRepository,
  ) {}

  private readonly localidadeByDomain: Record<string, Localidade> = {
    "allianzparque.com.br": "Allianz",
    "basecoworking.space": "Allianz",
    "bravolive.com.br": "Allianz",
    "novoanhangabau.com.br": "Allianz",
    "wtentretenimento.com.br": "Allianz",
    "wtorre.com.br": "WTorre",
    "sendcooliving.com.br": "WTorre",
    "waltertorre.com.br": "WTorre",
  };

  /** Log de debug: detalhes do overlap para um item (usar apenas para diagnóstico). */
  private logOverlapCheck(
    requestStart: string,
    requestEnd: string,
    itemStart: string,
    itemEnd: string,
    status: string,
    overlaps: boolean,
  ): void {
    debugLog("item", {
      itemStart,
      itemEnd,
      status,
      overlaps,
    });
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private resolveLocalidadeByEmail(email: string): Localidade | null {
    const domain = this.normalizeEmail(email).split("@")[1];
    if (!domain) return null;
    return this.localidadeByDomain[domain] ?? null;
  }

  private buildEntityFromSchedules(
    email: string,
    expectedIndex: number,
    schedules: RoomSchedule[],
    requestStart: string,
    requestEnd: string,
    logDebug = false,
  ): AvailabilityEntity {
    const normalizedEmail = this.normalizeEmail(email);
    const byEmail = new Map(schedules.map((schedule) => [this.normalizeEmail(schedule.roomEmail), schedule]));
    const schedule = byEmail.get(normalizedEmail) ?? schedules[expectedIndex];
    const items = schedule?.scheduleItems ?? [];
    const nonFree = items.filter((item) => isBusyScheduleStatus(item.status));
    if (logDebug && nonFree.length > 0) {
      debugLog("Sala: " + normalizedEmail);
      debugLog("Request", { requestStart, requestEnd });
      debugLog("Itens do calendário (não free): " + nonFree.length);
    }
    const conflicts = nonFree.filter((item) => {
      const overlaps = overlapsInterval(requestStart, requestEnd, item.start, item.end);
      if (logDebug) {
        this.logOverlapCheck(requestStart, requestEnd, item.start, item.end, item.status, overlaps);
      }
      return overlaps;
    });
    const availabilityStatus: AvailabilityEntity["availabilityStatus"] =
      !schedule ? "unknown" : conflicts.length > 0 ? "busy" : "available";
    if (logDebug) {
      debugLog("Resultado", { conflictsCount: conflicts.length, availabilityStatus });
      debugLog("---");
    }
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
    debugLog("Arquivo de log: " + PREVIEW_DEBUG_LOG);
    debugLog("Prévia solicitada", {
      roomEmail: normalizedRoomEmail,
      start: input.start,
      end: input.end,
    });
    const roomSchedule = await this.graphGateway.getSchedule(tenant, [normalizedRoomEmail], input.start, input.end);
    const room = this.buildEntityFromSchedules(
      normalizedRoomEmail,
      0,
      roomSchedule,
      input.start,
      input.end,
      true,
    );

    const participantsByLocalidade = new Map<Localidade, string[]>();
    const notValidatedContacts = new Set<string>();
    for (const participantEmail of participants) {
      const participantLocalidade = this.resolveLocalidadeByEmail(participantEmail);
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

      const schedules = await this.graphGateway.getSchedule(targetTenant, emails, input.start, input.end);
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
