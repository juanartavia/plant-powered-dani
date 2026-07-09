import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OkDialog } from "@/components/ui/ok-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBookGoogleTimeslot } from "@/hooks/useBookGoogleTimeslot";
import { useGoogleTimeslots } from "@/hooks/useGoogleTimeslots";

import { ModeToggle } from "@/components/mode-toggle";
import { Else, Show, When } from "@/components/WhenShowElse";
import { Timeslots } from "@/models/Timeslots";
import { addMonths, format } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Send,
} from "lucide-react";
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useTimezoneDropdown } from "./timezone-dropdown";

declare global {
  interface Window {
    APPOINTMENT_TYPE?: string;
  }
}

export type UiLanguage = "es" | "en";

// Todas las cadenas visibles de la interfaz, por idioma. Fuente única de verdad para el switch ES/EN.
const STRINGS = {
  es: {
    appointmentTitles: {
      initial:     "Consulta Inicial (60 min)",
      followup:    "Cita de Seguimiento (45 min)",
      measurement: "Solo Medición (15 min)",
      pilates:     "Clase de Pilates (60 min)",
    } as Record<string, string>,
    defaultTitle: "Sistema de Citas",
    yourTimezone: "Tu zona horaria",
    yourLanguage: "Idioma",
    continue: "Continuar",
    back: "Atrás",
    send: "Enviar",
    selectADate: "Selecciona una fecha",
    dateNotSelected: "Fecha no seleccionada",
    timeNotSelected: "Hora no seleccionada",
    at: "a las",
    loading: "Cargando...",
    thankYou: "¡Gracias!",
    thankYouBody: "Tu cita ha sido agendada exitosamente.",
    previousMonth: "Mes anterior",
    nextMonth: "Mes siguiente",
    form: {
      name: "Nombre y apellido",
      email: "Correo electrónico",
      phone: "Número de teléfono",
      cedula: "Cédula",
      birthdate: "Fecha de nacimiento",
      language: "Idioma",
      modalidad: "Modalidad",
      selectPlaceholder: "Seleccionar...",
      presencial: "Presencial",
      virtual: "Virtual",
    },
  },
  en: {
    appointmentTitles: {
      initial:     "Initial Consultation (60 min)",
      followup:    "Follow-up Appointment (45 min)",
      measurement: "Measurement Only (15 min)",
      pilates:     "Pilates Class (60 min)",
    } as Record<string, string>,
    defaultTitle: "Appointment Scheduler",
    yourTimezone: "Your Timezone",
    yourLanguage: "Language",
    continue: "Continue",
    back: "Back",
    send: "Send",
    selectADate: "Select a date",
    dateNotSelected: "Date not selected",
    timeNotSelected: "Time not selected",
    at: "at",
    loading: "Loading...",
    thankYou: "Thank You!",
    thankYouBody: "Your appointment has been booked successfully.",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    form: {
      name: "Full name",
      email: "Email",
      phone: "Phone number",
      cedula: "ID number",
      birthdate: "Date of birth",
      language: "Language",
      modalidad: "Modality",
      selectPlaceholder: "Select...",
      presencial: "In-person",
      virtual: "Virtual",
    },
  },
} as const;

// Clase CSS reutilizable para selectores nativos que coincide con el estilo de Input de Shadcn.
const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function CalendarPicker() {
  const appointmentType = window.APPOINTMENT_TYPE ?? "";
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>("es");
  const t = STRINGS[uiLanguage];
  const title = t.appointmentTitles[appointmentType] ?? t.defaultTitle;
  const dateFnsLocale = uiLanguage === "es" ? { locale: esLocale } : undefined;

  const [TimezoneDropdown, timezone] = useTimezoneDropdown();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<Date | undefined>(
    undefined
  );
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [showForm, setShowForm] = useState(false);
  const [
    googleSlots,
    ,
    slotsStatus,
    timeslotError,
    resetGoogleTimeslot,
  ] = useGoogleTimeslots(appointmentType);
  const [bookingStatus, bookingError, makeBooking, resetBookGoogle] =
    useBookGoogleTimeslot();
  const availableSlots = useMemo(
    () => new Timeslots(googleSlots, timezone),
    [googleSlots, timezone]
  );
  const resetSelectedDate = () => setSelectedDate(undefined);
  useEffect(() => {
    if (timezone) resetSelectedDate();
  }, [timezone]);
  useEffect(() => {
    if (!selectedDate) {
      const firstTimeslot = [...availableSlots.timeslots].sort().reverse()[0];
      if (!firstTimeslot) return;
      setCurrentMonth(firstTimeslot);
    }
  }, [timezone, availableSlots, selectedDate]);

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setCurrentMonth(new Date(date.getFullYear(), date.getMonth()));
    }
    setSelectedTimeSlot(undefined);
  };

  const handleTimeSlotSelect = (timeSlot: Date) => {
    setSelectedTimeSlot(timeSlot);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    if (!selectedTimeSlot) throw new Error("No timeslot selected");
    makeBooking({
      type: appointmentType,
      timeslot: selectedTimeSlot,
      name:      formData.get("name")?.toString()      || "",
      email:     formData.get("email")?.toString()     || "",
      phone:     formData.get("phone")?.toString()     || "",
      birthdate: formData.get("birthdate")?.toString() || "",
      cedula:    formData.get("cedula")?.toString()    || "",
      language:  formData.get("language")?.toString()  || "",
      modalidad: formData.get("modalidad")?.toString() || "",
    });
  };

  const handlePreviousMonth = () => {
    setCurrentMonth((prevMonth) => addMonths(prevMonth, -1));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prevMonth) => addMonths(prevMonth, 1));
  };
  const isDayDisabled = (date: Date) => {
    return !availableSlots.hasSlotsForDate(date);
  };

  const handleBack = () => {
    setShowForm(false);
    setSelectedTimeSlot(undefined);
  };

  if (selectedTimeSlot && bookingStatus === "success") {
    return (
      <Card className="sm:w-[600px] p-4 mx-auto min-h-[400px] flex flex-col justify-center space-y-4">
        <h1>{t.thankYou}</h1>
        <h2>{t.thankYouBody}</h2>
        <div className="font-bold font-mono">
          {formatInTimeZone(
            selectedTimeSlot!,
            timezone,
            "MMMM d, yyyy h:mm a",
            dateFnsLocale
          )}
        </div>
      </Card>
    );
  }
  return (
    <>
      <OkDialog
        open={slotsStatus === "error"}
        description={timeslotError?.message ?? "Unknown Error 1"}
        confirm={resetGoogleTimeslot}
      />
      <OkDialog
        open={bookingStatus === "error"}
        description={bookingError?.message ?? "Unknown error 2"}
        confirm={resetBookGoogle}
      />

      <Card className="sm:w-[600px] mx-auto min-h-[400px] space-y-4 relative">
        <When condition={slotsStatus === "pending"}>
          <Show>
            <div className="bg-primary absolute rounded-xl z-50 opacity-70 inset-0">
              <div className="flex justify-center items-center h-full flex-col stroke-primary-foreground">
                <Loader2 size={60} className="animate-spin" stroke="current" />
                <p className="text-lg font-semibold text-primary-foreground">
                  {t.loading}
                </p>
              </div>
            </div>
          </Show>
        </When>
        <div className="relative max-h-0">
          <ModeToggle className="md:hidden absolute right-1 top-1" />
          <ModeToggle className="absolute -right-10 -top-10 md:block hidden" />
        </div>
        <When condition={!showForm}>
          <Show>
            <CardHeader className="max-w-full">
              <div className="flex justify-between items-center flex-col sm:flex-row gap-4 relative">
                <CardTitle className="max-w-64">
                  <div className="overflow-hidden">
                    <div className="whitespace-nowrap overflow-ellipsis overflow-hidden">
                      {title}
                    </div>
                  </div>
                </CardTitle>

                <div className="flex items-center gap-4 flex-wrap justify-end">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground">
                      {t.yourLanguage}
                    </Label>
                    <LanguageDropdown value={uiLanguage} onChange={setUiLanguage} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground">
                      {t.yourTimezone}
                    </Label>
                    <TimezoneDropdown />
                  </div>
                </div>
              </div>
            </CardHeader>
          </Show>
          <Else>
            <h2 className="text-xl font-semibold mb-4 pt-6 px-6">
              {title} —{" "}
              {selectedDate
                ? format(selectedDate, "MMMM d, yyyy", dateFnsLocale)
                : t.dateNotSelected}{" "}
              {t.at}{" "}
              {selectedTimeSlot
                ? selectedTimeSlot.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : t.timeNotSelected}
            </h2>
          </Else>
        </When>

        <CardContent className="p-6 pt-0 sm:pt-2 pb-0">
          <When condition={!showForm}>
            <Show>
              <CalendarTimeslotPicker
                handlePreviousMonth={handlePreviousMonth}
                currentMonth={currentMonth}
                handleNextMonth={handleNextMonth}
                selectedDate={selectedDate}
                handleDateSelect={handleDateSelect}
                setCurrentMonth={setCurrentMonth}
                isDayDisabled={isDayDisabled}
                availableSlots={availableSlots}
                selectedTimeSlot={selectedTimeSlot}
                handleTimeSlotSelect={handleTimeSlotSelect}
                uiLanguage={uiLanguage}
              />
            </Show>
            <Else>
              <ContactForm
                handleSubmit={handleSubmit}
                type={appointmentType}
                uiLanguage={uiLanguage}
                onLanguageChange={setUiLanguage}
              />
            </Else>
          </When>
        </CardContent>
        <CardFooter className="flex justify-between">
          <When condition={showForm}>
            <Show>
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t.back}
              </Button>
              <Button
                type="submit"
                form="appointment-form"
                disabled={bookingStatus === "pending"}
              >
                {bookingStatus === "pending" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {t.send}
              </Button>
            </Show>
            <Else>
              <Button
                className="w-full"
                onClick={() => setShowForm(true)}
                disabled={!selectedDate || !selectedTimeSlot}
              >
                {t.continue}
              </Button>
            </Else>
          </When>
        </CardFooter>
      </Card>
    </>
  );
}

function LanguageDropdown({
  value,
  onChange,
}: {
  value: UiLanguage;
  onChange: (value: UiLanguage) => void;
}) {
  return (
    <select
      aria-label="Language / Idioma"
      value={value}
      onChange={(e) => onChange(e.target.value as UiLanguage)}
      className={selectClassName + " w-[90px]"}
    >
      <option value="es">ES</option>
      <option value="en">EN</option>
    </select>
  );
}

function CalendarTimeslotPicker({
  handlePreviousMonth,
  currentMonth,
  handleNextMonth,
  selectedDate,
  handleDateSelect,
  setCurrentMonth,
  isDayDisabled,
  availableSlots,
  selectedTimeSlot,
  handleTimeSlotSelect,
  uiLanguage,
}: {
  handlePreviousMonth: () => void;
  currentMonth: Date;
  handleNextMonth: () => void;
  selectedDate: Date | undefined;
  handleDateSelect: (date: Date | undefined) => void;
  setCurrentMonth: (date: Date) => void;
  isDayDisabled: (date: Date) => boolean;
  availableSlots: Timeslots;
  selectedTimeSlot: Date | undefined;
  handleTimeSlotSelect: (timeSlot: Date) => void;
  uiLanguage: UiLanguage;
}) {
  const t = STRINGS[uiLanguage];
  const dateFnsLocale = uiLanguage === "es" ? { locale: esLocale } : undefined;
  return (
    <div className="flex flex-col sm:flex-row gap-6 min-h-[350px]">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-4">
          <Button variant="outline" size="icon" onClick={handlePreviousMonth}>
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">{t.previousMonth}</span>
          </Button>
          <h2 className="text-lg font-semibold">
            {format(currentMonth, "MMMM yyyy", dateFnsLocale)}
          </h2>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">{t.nextMonth}</span>
          </Button>
        </div>
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleDateSelect}
          month={currentMonth}
          onMonthChange={setCurrentMonth}
          className="rounded-md border shadow"
          disabled={isDayDisabled}
        />
      </div>
      <div className="flex-1 w-full lg:w-64">
        <h3 className="text-lg font-semibold mb-4 h-[36px] flex flex-col justify-center">
          {selectedDate
            ? format(selectedDate, "MMMM d, yyyy", dateFnsLocale)
            : t.selectADate}
        </h3>
        {selectedDate && (
          <ScrollArea className="h-44 sm:h-64">
            <div
              className="grid grid-cols-2 gap-4 pr-4"
              key={"" + selectedDate?.getTime()}
            >
              {availableSlots.slotsForDate(selectedDate).map((timeslot, i) => (
                <Button
                  key={"" + selectedDate?.getTime() + timeslot + i}
                  variant={
                    selectedTimeSlot === timeslot ? "default" : "outline"
                  }
                  onClick={() => handleTimeSlotSelect(timeslot)}
                  className="w-full"
                >
                  {timeslot.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Button>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

function ContactForm({
  handleSubmit,
  type,
  uiLanguage,
  onLanguageChange,
}: {
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  type: string;
  uiLanguage: UiLanguage;
  onLanguageChange: (value: UiLanguage) => void;
}) {
  // measurement → siempre presencial; pilates → siempre virtual.
  // Para initial y followup el cliente elige.
  const showModalidad = type === "initial" || type === "followup";
  const autoModalidad =
    type === "measurement" ? "presencial" : type === "pilates" ? "virtual" : "";
  const t = STRINGS[uiLanguage].form;

  return (
    <form
      id="appointment-form"
      onSubmit={handleSubmit}
      className="text-left space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="name">{t.name}</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">{t.email}</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">{t.phone}</Label>
        <Input id="phone" name="phone" type="tel" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cedula">{t.cedula}</Label>
        <Input id="cedula" name="cedula" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="birthdate">{t.birthdate}</Label>
        <Input id="birthdate" name="birthdate" type="date" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="language">{t.language}</Label>
        <select
          id="language"
          name="language"
          required
          value={uiLanguage}
          onChange={(e) => onLanguageChange(e.target.value as UiLanguage)}
          className={selectClassName}
        >
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      </div>
      {showModalidad ? (
        <div className="space-y-2">
          <Label htmlFor="modalidad">{t.modalidad}</Label>
          <select
            id="modalidad"
            name="modalidad"
            required
            defaultValue=""
            className={selectClassName}
          >
            <option value="" disabled>
              {t.selectPlaceholder}
            </option>
            <option value="presencial">{t.presencial}</option>
            <option value="virtual">{t.virtual}</option>
          </select>
        </div>
      ) : (
        <input type="hidden" name="modalidad" value={autoModalidad} />
      )}
    </form>
  );
}
