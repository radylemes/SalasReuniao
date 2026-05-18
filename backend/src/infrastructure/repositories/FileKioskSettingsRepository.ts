import fs from "node:fs/promises";
import path from "node:path";
import { normalizeCheckInGraceMinutes } from "../../domain/checkIn";
import { KioskSettingsRepository } from "../../domain/contracts/KioskSettingsRepository";
import { RoomKioskSettings, RoomKioskSettingsKey } from "../../domain/entities/KioskSettings";

type StoredFile = Record<string, RoomKioskSettings>;

export class FileKioskSettingsRepository implements KioskSettingsRepository {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath =
      filePath ?? path.join(process.cwd(), "data", "kiosk-settings.json");
  }

  async get(localidade: string, roomEmail: string): Promise<RoomKioskSettings> {
    const data = await this.readFile();
    const key = this.buildKey(localidade, roomEmail);
    const stored = data[key];
    if (!stored) return { checkInModeEnabled: false, checkInGraceMinutes: normalizeCheckInGraceMinutes() };
    return this.normalizeSettings(stored);
  }

  async save(localidade: string, roomEmail: string, settings: RoomKioskSettings): Promise<void> {
    const data = await this.readFile();
    const key = this.buildKey(localidade, roomEmail);
    data[key] = this.normalizeSettings(settings);
    await this.writeFile(data);
  }

  async listRoomsWithCheckInEnabled(): Promise<RoomKioskSettingsKey[]> {
    const data = await this.readFile();
    return Object.entries(data)
      .filter(([, settings]) => settings.checkInModeEnabled)
      .map(([key]) => this.parseKey(key))
      .filter((entry): entry is RoomKioskSettingsKey => entry !== null);
  }

  private normalizeSettings(settings: RoomKioskSettings): RoomKioskSettings {
    return {
      checkInModeEnabled: Boolean(settings.checkInModeEnabled),
      checkInGraceMinutes: normalizeCheckInGraceMinutes(settings.checkInGraceMinutes),
    };
  }

  private buildKey(localidade: string, roomEmail: string): string {
    return `${localidade.trim().toLowerCase()}:${roomEmail.trim().toLowerCase()}`;
  }

  private parseKey(key: string): RoomKioskSettingsKey | null {
    const separator = key.indexOf(":");
    if (separator <= 0) return null;
    const localidade = key.slice(0, separator);
    const roomEmail = key.slice(separator + 1);
    if (!localidade || !roomEmail.includes("@")) return null;
    return { localidade, roomEmail };
  }

  private async readFile(): Promise<StoredFile> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as StoredFile;
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (code === "ENOENT") return {};
      throw error;
    }
  }

  private async writeFile(data: StoredFile): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }
}
