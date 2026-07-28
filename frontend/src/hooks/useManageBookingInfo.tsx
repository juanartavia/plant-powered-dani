import { GoogleLib } from "@/lib/googlelib";
import { useCallback, useEffect, useState } from "react";

export interface ManageBookingInfo {
  token: string;
  type: string;
  fecha: string;
  hora: string;
  clientTimezone: string;
  modalidad: string;
  language: string;
  estado: string;
  nombre: string;
  esVirtual: boolean;
  meetLink: string;
}

export function useManageBookingInfo(token: string) {
  const [info, setInfo] = useState<ManageBookingInfo | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");

  const refetch = useCallback(() => {
    if (!token) return;
    try {
      setStatus("pending");
      GoogleLib.google.script.run
        .withSuccessHandler(function (result: ManageBookingInfo) {
          setInfo(result);
          setStatus("success");
        })
        .withFailureHandler(function (err: Error) {
          setStatus("error");
          setError(err);
        })
        .getManageBookingInfo(token);
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError(err as Error);
    }
  }, [token]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return [info, status, error, refetch] as const;
}
