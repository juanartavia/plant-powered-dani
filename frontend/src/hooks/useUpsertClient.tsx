import { GoogleLib } from "@/lib/googlelib";
import { ClientRecord } from "@/models/ClientRecord";
import { useCallback, useState } from "react";

export function useUpsertClient() {
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const reset = useCallback(() => {
    setError(null);
    setStatus("idle");
  }, []);
  const upsertClient = useCallback(function (
    data: ClientRecord,
    onSuccess: () => void
  ) {
    try {
      setStatus("pending");
      GoogleLib.google.script.run
        .withSuccessHandler(function () {
          setStatus("success");
          onSuccess();
        })
        .withFailureHandler(function (err: Error) {
          setStatus("error");
          setError(
            new Error("Could not save client data, please try again - " + err)
          );
        })
        .upsertClient(data);
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError(new Error("Could not save client data, please try again - " + err));
    }
  },
  []);
  return [status, error, upsertClient, reset] as const;
}
