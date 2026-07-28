import { GoogleLib } from "@/lib/googlelib";
import { useCallback, useState } from "react";

export function useCancelBooking() {
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const reset = useCallback(() => {
    setError(null);
    setStatus("idle");
  }, []);
  const cancel = useCallback(function (
    token: string,
    onResult: (result: { lateCancellation: boolean }) => void
  ) {
    try {
      setStatus("pending");
      GoogleLib.google.script.run
        .withSuccessHandler(function (result: { lateCancellation: boolean }) {
          setStatus("success");
          onResult(result);
        })
        .withFailureHandler(function (err: Error) {
          setStatus("error");
          setError(err);
        })
        .cancelBooking(token);
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError(err as Error);
    }
  },
  []);
  return [status, error, cancel, reset] as const;
}
