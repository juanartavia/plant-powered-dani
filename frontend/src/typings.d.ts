/// <reference types="vite/client" />

declare module "*.css";

interface ImportMetaEnv {
  readonly VITE_BUILD_MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface GoogleScriptRunEndpoints {
  fetchAvailability: (type: string) => void;
  bookTimeslot: (...args: any[]) => void;
  findClientByEmail: (correo: string) => void;
  upsertClient: (data: unknown, type: string) => void;
}

interface GoogleLib {
  script: {
    run: {
      withSuccessHandler: (
        cb: (arg0: any) => void
      ) => {
        withFailureHandler: (_cb: (err: Error) => void) => GoogleScriptRunEndpoints;
      };
    };
  };
}
