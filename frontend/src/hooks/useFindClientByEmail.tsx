import { GoogleLib } from "@/lib/googlelib";
import { ClientRecord } from "@/models/ClientRecord";
import { useCallback, useState } from "react";

export function useFindClientByEmail() {
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const reset = useCallback(() => {
    setError(null);
    setStatus("idle");
  }, []);
  const findClient = useCallback(function (
    correo: string,
    onResult: (client: ClientRecord | null) => void
  ) {
    try {
      setStatus("pending");
      GoogleLib.google.script.run
        .withSuccessHandler(function (client: ClientRecord | null) {
          setStatus("success");
          onResult(client);
        })
        .withFailureHandler(function (err: Error) {
          setStatus("error");
          setError(
            new Error("Could not look up client, please try again - " + err)
          );
        })
        .findClientByEmail(correo);
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError(new Error("Could not look up client, please try again - " + err));
    }
  },
  []);
  return [status, error, findClient, reset] as const;
}
