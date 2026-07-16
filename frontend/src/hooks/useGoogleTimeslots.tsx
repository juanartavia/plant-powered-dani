import { GoogleLib } from "@/lib/googlelib";
import { useCallback, useEffect, useState } from "react";

export function useGoogleTimeslots(type: string) {
  const [availableGoogleSlots, setAvailableGoogleSlots] = useState<Date[]>([]);
  const [durationMinutes, setDurationMinutes] = useState(30);
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
        }: {
          timeslots: string[];
          durationMinutes: number;
        }) {
          setAvailableGoogleSlots(
            timeslots.map((timeslot) => new Date(timeslot))
          );
          setDurationMinutes(durationMinutes);
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

  return [availableGoogleSlots, durationMinutes, status, error, reset, refetch] as const;
}
