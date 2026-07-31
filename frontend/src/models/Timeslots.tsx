import { toZonedTime } from "date-fns-tz";

// Un slot ya convertido a la zona horaria del cliente, junto con la duración real de ESA
// clase específica (US-45) — antes toda clase de pilates asumía 60 min fijos; ahora cada
// instancia puede durar distinto según lo que la instructora marcó en el calendario de
// disponibilidad. Para nutrición, durationMinutes es siempre la duración fija del tipo de
// cita (sin cambios de comportamiento).
export interface ZonedTimeslot {
  date: Date;
  durationMinutes: number;
}

export class Timeslots {
  private cache: Record<string, ZonedTimeslot[]> = {};
  private allZonedCache: ZonedTimeslot[] | null = null;

  constructor(
    public readonly timeslots: Date[],
    public readonly timezone: string,
    // US-45 — duración real por slot, indexada por el mismo ISO string que backend/fetchAvailability
    // devuelve en `timeslots[]` (slotDurations). Vacío para nutrición (no lo necesita, ver
    // defaultDurationMinutes).
    private readonly durationByIso: Record<string, number> = {},
    private readonly defaultDurationMinutes: number = 60
  ) {
    this.timeslots.sort();
  }
  private durationFor(raw: Date): number {
    return this.durationByIso[raw.toISOString()] ?? this.defaultDurationMinutes;
  }
  allZoned(): ZonedTimeslot[] {
    return (this.allZonedCache =
      this.allZonedCache ||
      this.timeslots.map((timeslot) => ({
        date: toZonedTime(new Date(timeslot), this.timezone),
        durationMinutes: this.durationFor(timeslot),
      })));
  }
  slotsForDate(date: Date) {
    return (this.cache[date.toString()] =
      this.cache[date.toString()] ||
      this.allZoned()
        .filter(
          (slot) =>
            date.getDate() === slot.date.getDate() &&
            date.getMonth() === slot.date.getMonth() &&
            date.getFullYear() === slot.date.getFullYear()
        )
        .sort((a, b) => a.date.getTime() - b.date.getTime()));
  }
  hasSlotsForDate(date: Date) {
    return this.slotsForDate(date).length > 0;
  }
}
