import { GoogleLib } from "@/lib/googlelib";
import { useCallback, useState } from "react";

export function useConfirmAttendance() {
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const reset = useCallback(() => {
    setError(null);
    setStatus("idle");
  }, []);
  const confirm = useCallback(function (token: string) {
    try {
      setStatus("pending");
      GoogleLib.google.script.run
        .withSuccessHandler(function () {
          setStatus("success");
        })
        .withFailureHandler(function (err: Error) {
          setStatus("error");
          setError(err);
        })
        .confirmAttendance(token);
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError(err as Error);
    }
  }, []);
  return [status, error, confirm, reset] as const;
}
