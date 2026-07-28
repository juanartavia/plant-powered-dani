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
                    upsertClient: (data: unknown, type: string) => {
                      console.log("Demo mode: upsertClient", data, type);
                      cb(undefined);
                    },
                    getManageBookingInfo: (token: string) => {
                      console.log("Demo mode: getManageBookingInfo", token);
                      const now = new Date();
                      const future = new Date(now.getTime() + 72 * 60 * 60 * 1000);
                      cb({
                        token,
                        type: "initial",
                        fecha: future.toISOString().slice(0, 10),
                        hora: `${String(future.getHours()).padStart(2, "0")}:00`,
                        clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        modalidad: "virtual",
                        language: "es",
                        estado: "Agendada",
                        nombre: "Dani (demo)",
                        esVirtual: true,
                        meetLink: "https://meet.google.com/demo-link",
                      });
                    },
                    confirmAttendance: (_token: string) => {
                      console.log("Demo mode: confirmAttendance", _token);
                      cb(undefined);
                    },
                    cancelBooking: (_token: string) => {
                      console.log("Demo mode: cancelBooking", _token);
                      cb({ lateCancellation: false });
                    },
                    rescheduleBooking: (...args: any) => {
                      console.log("Demo mode: rescheduleBooking", args);
                      cb("dummy-token");
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
