import { GoogleLib } from "@/lib/googlelib";
import { useCallback, useEffect, useState } from "react";

export function useGoogleTimeslots(type: string) {
  const [availableGoogleSlots, setAvailableGoogleSlots] = useState<Date[]>([]);
  const [durationMinutes, setDurationMinutes] = useState(30);
  // US-45 — duración real por slot de pilates (ISO string -> minutos), undefined/vacío para
  // nutrición (duración uniforme por tipo, no lo necesita — ver `durationMinutes` arriba).
  const [slotDurations, setSlotDurations] = useState<Record<string, number>>({});
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  // Se incrementa para forzar un refetch de disponibilidad sin depender de un cambio
  // de `type` — usado cuando el backend rechaza una reserva (slot tomado, clase llena,
  // ventana de 48hrs vencida) y hay que traer los slots actualizados.
  const [refreshIndex, setRefreshIndex] = useState(0);
  const refetch = useCallback(() => {
    setRefreshIndex((i) => i + 1);
  }, []);
  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  useEffect(() => {
    try {
      setStatus("pending");
      GoogleLib.google.script.run
        .withSuccessHandler(function ({
          timeslots,
          durationMinutes,
          slotDurations,
        }: {
          timeslots: string[];
          durationMinutes: number;
          slotDurations?: Record<string, number>;
        }) {
          setAvailableGoogleSlots(
            timeslots.map((timeslot) => new Date(timeslot))
          );
          setDurationMinutes(durationMinutes);
          setSlotDurations(slotDurations ?? {});
          setStatus("success");
        })
        .withFailureHandler(function (err: Error) {
          setStatus("error");
          setError(err);
        })
        .fetchAvailability(type);
    } catch (error) {
      console.error(error);
      setStatus("error");
      setError(error as Error);
    }
  }, [type, refreshIndex]);

  return [availableGoogleSlots, durationMinutes, slotDurations, status, error, reset, refetch] as const;
}
