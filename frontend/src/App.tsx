import { isDemoMode } from "@/clientEnv";
import { CalendarPicker } from "@/components/calendar-picker";
import { ManageBooking } from "@/components/manage-booking";
import { ThemeProvider } from "@/components/theme-provider";
import { DemoBanner } from "@/DemoBanner";
import "./App.css";
import "./index.css";

declare global {
  interface Window {
    BOOKING_TOKEN?: string;
    BOOKING_ACCION?: string;
  }
}

function App() {
  const bookingToken = window.BOOKING_TOKEN ?? "";

  return (
    <ThemeProvider defaultTheme="light">
      <DemoBanner show={isDemoMode} />
      {bookingToken ? (
        <ManageBooking
          token={bookingToken}
          initialAccion={window.BOOKING_ACCION ?? ""}
        />
      ) : (
        <CalendarPicker />
      )}
    </ThemeProvider>
  );
}

export default App;
