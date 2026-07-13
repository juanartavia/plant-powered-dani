import { isDemoMode, isDev } from "@/clientEnv";
import { generateDummyData } from "@/hooks/dummydata";

export const GoogleLib = {
  get google(): GoogleLib {
    if (isDev || isDemoMode) {
      console.log("Using demo mode");
      const dummyData = generateDummyData();
      console.log("Using dummy data", dummyData);
      return {
        script: {
          run: {
            withSuccessHandler: (cb: (arg0: any) => void) => {
              return {
                withFailureHandler: (_cb: (err: Error) => void) => {
                  return {
                    fetchAvailability: (_type: string) => {
                      cb({ timeslots: dummyData, durationMinutes: 30 });
                    },
                    bookTimeslot: (...args: any) => {
                      console.log("Booked timeslot", args);
                      cb("dummy-token");
                    },
                    findClientByEmail: (_correo: string) => {
                      console.log("Demo mode: no existing client found");
                      cb(null);
                    },
                    upsertClient: (data: unknown) => {
                      console.log("Demo mode: upsertClient", data);
                      cb(undefined);
                    },
                  };
                },
              };
            },
          },
        },
      };
    }

    // @ts-expect-error google is not defined
    if (!window.google) {
      throw new Error("Google API not loaded");
    }

    // @ts-expect-error google is not defined
    return window.google;
  },
};
