import { isDemoMode } from "@/clientEnv";
import { CalendarPicker } from "@/components/calendar-picker";
import { ThemeProvider } from "@/components/theme-provider";
import { DemoBanner } from "@/DemoBanner";
import "./App.css";
import "./index.css";

function App() {
  return (
    <ThemeProvider defaultTheme="light">
      <DemoBanner show={isDemoMode} />
      <CalendarPicker />
    </ThemeProvider>
  );
}

export default App;
