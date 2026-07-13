import { GoogleLib } from "@/lib/googlelib";
import { useCallback, useState } from "react";

export function useBookGoogleTimeslot() {
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const reset = useCallback(() => {
    setError(null);
    setStatus("idle");
  }, []);
  const makeBooking = useCallback(function ({
    type,
    timeslot,
    nombre,
    apellido,
    email,
    phone,
    birthdate,
    cedula,
    language,
    modalidad,
    clientTimezone,
  }: {
    type: string;
    timeslot: Date;
    nombre: string;
    apellido: string;
    email: string;
    phone: string;
    birthdate: string;
    cedula: string;
    language: string;
    modalidad: string;
    clientTimezone: string;
  }) {
    try {
      setStatus("pending");
      GoogleLib.google.script.run
        .withSuccessHandler(function () {
          setStatus("success");
        })
        .withFailureHandler(function (err: Error) {
          setStatus("error");
          setError(
            new Error("Could not book timeslot, please try again - " + err)
          );
        })
        .bookTimeslot(
          type,
          timeslot.toISOString(),
          nombre,
          apellido,
          email,
          phone,
          cedula,
          birthdate,
          language,
          modalidad,
          clientTimezone
        );
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError(new Error("Could not book timeslot, please try again - " + err));
    }
  }, []);
  return [status, error, makeBooking, reset] as const;
}
