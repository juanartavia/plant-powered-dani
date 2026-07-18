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
import { useFindClientByEmail } from "@/hooks/useFindClientByEmail";
import { useGoogleTimeslots } from "@/hooks/useGoogleTimeslots";
import { useUpsertClient } from "@/hooks/useUpsertClient";

import { Show, When } from "@/components/WhenShowElse";
import { ClientRecord } from "@/models/ClientRecord";
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

// Pasos del flujo (Sprint 2): calendario (selección tentativa, sin lock) -> correo (busca cliente)
// -> datos del cliente (precargados si existe, resumen fijo del horario, confirma y reserva).
type Step = "calendar" | "email" | "form";

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
    confirmAppointment: "Confirmar cita",
    enterEmailPrompt: "Ingresa tu correo electrónico para continuar",
    selectADate: "Selecciona una fecha",
    dateNotSelected: "Fecha no seleccionada",
    timeNotSelected: "Hora no seleccionada",
    at: "a las",
    loading: "Cargando...",
    thankYou: "¡Gracias!",
    thankYouBody: "Tu cita ha sido agendada exitosamente.",
    previousMonth: "Mes anterior",
    nextMonth: "Mes siguiente",
    errors: {
      ventanaMinima:
        "Este horario ya no cumple con el mínimo de anticipación requerido. Por favor elige otro horario disponible.",
      slotNoDisponible:
        "Este horario acaba de ser reservado por otra persona. Por favor elige otro horario disponible.",
      claseLlena:
        "Esta clase de pilates ya está llena. Por favor elige otro horario disponible.",
      edadMinima:
        "Debes tener al menos 15 años cumplidos para agendar una cita.",
    },
    form: {
      nombre: "Nombre",
      apellido: "Apellido",
      email: "Correo electrónico",
      phone: "Número de teléfono",
      tipoId: "Tipo de identificación",
      numeroId: "Número de identificación",
      tipoIdCedula: "Cédula",
      tipoIdPasaporte: "Pasaporte",
      tipoIdLicencia: "Licencia de conducir",
      tipoIdOtro: "Otro",
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
    confirmAppointment: "Confirm appointment",
    enterEmailPrompt: "Enter your email to continue",
    selectADate: "Select a date",
    dateNotSelected: "Date not selected",
    timeNotSelected: "Time not selected",
    at: "at",
    loading: "Loading...",
    thankYou: "Thank You!",
    thankYouBody: "Your appointment has been booked successfully.",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    errors: {
      ventanaMinima:
        "This time slot no longer meets the minimum booking window required. Please choose another available time.",
      slotNoDisponible:
        "This time slot was just booked by someone else. Please choose another available time.",
      claseLlena:
        "This pilates class is now full. Please choose another available time.",
      edadMinima:
        "You must be at least 15 years old to book an appointment.",
    },
    form: {
      nombre: "First name",
      apellido: "Last name",
      email: "Email",
      phone: "Phone number",
      tipoId: "ID type",
      numeroId: "ID number",
      tipoIdCedula: "ID Card",
      tipoIdPasaporte: "Passport",
      tipoIdLicencia: "Driver's License",
      tipoIdOtro: "Other",
      birthdate: "Date of birth",
      language: "Language",
      modalidad: "Modality",
      selectPlaceholder: "Select...",
      presencial: "In-person",
      virtual: "Virtual",
    },
  },
} as const;

// Códigos de error que bookTimeslot puede lanzar cuando el slot elegido dejó de estar
// disponible entre que el cliente cargó el calendario y confirmó la cita (US-09).
// El mensaje de error que llega del backend (vía google.script.run failure handler)
// incluye este código como substring — se usa para mostrar un mensaje bilingüe claro
// en vez del error crudo, y para saber cuándo hay que refrescar la disponibilidad.
const BOOKING_ERROR_CODES = [
  "VENTANA_MINIMA_NO_CUMPLIDA",
  "SLOT_NO_DISPONIBLE",
  "CLASE_LLENA",
] as const;

function getStaleBookingErrorCode(
  error: Error | null
): (typeof BOOKING_ERROR_CODES)[number] | null {
  if (!error) return null;
  return BOOKING_ERROR_CODES.find((code) => error.message.includes(code)) ?? null;
}

// Códigos de error conocidos (de bookTimeslot Y upsertClient) mapeados a un mensaje
// bilingüe claro, en vez del mensaje crudo que llega envuelto desde el failure handler de
// google.script.run. EDAD_MINIMA_NO_CUMPLIDA (US-29) puede llegar desde cualquiera de los
// dos — upsertClient la lanza primero en el flujo real, bookTimeslot la repite como
// defensa en profundidad.
const KNOWN_ERROR_MESSAGES = {
  VENTANA_MINIMA_NO_CUMPLIDA: "ventanaMinima",
  SLOT_NO_DISPONIBLE: "slotNoDisponible",
  CLASE_LLENA: "claseLlena",
  EDAD_MINIMA_NO_CUMPLIDA: "edadMinima",
} as const;

function getErrorMessage(
  error: Error | null,
  t: (typeof STRINGS)[UiLanguage]
): string {
  if (!error) return "";
  const code = (Object.keys(KNOWN_ERROR_MESSAGES) as Array<keyof typeof KNOWN_ERROR_MESSAGES>).find(
    (c) => error.message.includes(c)
  );
  return code ? t.errors[KNOWN_ERROR_MESSAGES[code]] : error.message;
}

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
  const [step, setStep] = useState<Step>("calendar");

  // Paso 1: correo ingresado y resultado de la búsqueda (null = cliente nuevo).
  const [clientEmail, setClientEmail] = useState("");
  const [existingClient, setExistingClient] = useState<ClientRecord | null>(null);

  // Paso 2: datos confirmados del cliente (tras upsert) + modalidad elegida, usados en Paso 3 para reservar.
  const [confirmedClient, setConfirmedClient] = useState<ClientRecord | null>(null);
  const [confirmedModalidad, setConfirmedModalidad] = useState("");

  const [
    googleSlots,
    ,
    slotsStatus,
    timeslotError,
    resetGoogleTimeslot,
    refetchGoogleTimeslots,
  ] = useGoogleTimeslots(appointmentType);
  const [bookingStatus, bookingError, makeBooking, resetBookGoogle] =
    useBookGoogleTimeslot();
  const [findClientStatus, findClientError, findClient, resetFindClient] =
    useFindClientByEmail();
  const [upsertStatus, upsertError, upsertClientData, resetUpsertClient] =
    useUpsertClient();

  const availableSlots = useMemo(
    () => new Timeslots(googleSlots, timezone),
    [googleSlots, timezone]
  );
  const resetSelectedDate = () => setSelectedDate(undefined);
  useEffect(() => {
    if (timezone) resetSelectedDate();
  }, [timezone]);

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

  // Paso 1 (Calendario): selección tentativa, sin lock ni llamada al backend.
  const handleCalendarContinue = () => {
    if (!selectedDate || !selectedTimeSlot) return;
    setStep("email");
  };

  const handleEmailSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const correo = formData.get("correo")?.toString().trim() || "";
    if (!correo) return;
    setClientEmail(correo);
    findClient(correo, (client) => {
      setExistingClient(client);
      if (client && (client.idioma === "es" || client.idioma === "en")) {
        setUiLanguage(client.idioma);
      }
      setStep("form");
    });
  };

  // Paso 3 (Datos): confirma el horario elegido en el Paso 1 (fijo, no editable aquí).
  // upsert de "Clientes" seguido de bookTimeslot — el lock/conflict-check real (48hrs +
  // colisión) corre recién aquí, dentro de bookTimeslot, igual que en el flujo viejo.
  const handleClientFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedTimeSlot) return;
    const formData = new FormData(e.currentTarget);
    const record: ClientRecord = {
      correo: clientEmail,
      nombre:           formData.get("nombre")?.toString()           || "",
      apellido:         formData.get("apellido")?.toString()         || "",
      telefono:         formData.get("phone")?.toString()            || "",
      tipoId:           (formData.get("tipoId")?.toString()          || "") as ClientRecord["tipoId"],
      numeroId:         formData.get("numeroId")?.toString()         || "",
      fecha_nacimiento: formData.get("birthdate")?.toString()        || "",
      // Idioma viene SOLO del selector global (Paso 1, uiLanguage) — el <select> duplicado
      // que vivía dentro de ContactForm (Paso 3) se eliminó a pedido de Dani (demo 17 jul).
      idioma:           uiLanguage,
    };
    const modalidad = formData.get("modalidad")?.toString() || "";
    // Se guardan de inmediato (no solo tras el éxito) para que, si bookTimeslot falla
    // por slot ocupado, los datos ya escritos por el cliente no se pierdan al regresar
    // al Paso 1 (ver handleBookingErrorDismiss).
    setConfirmedClient(record);
    setConfirmedModalidad(modalidad);
    upsertClientData(record, appointmentType, () => {
      makeBooking({
        type: appointmentType,
        timeslot: selectedTimeSlot,
        nombre: record.nombre,
        apellido: record.apellido,
        email: record.correo,
        phone: record.telefono,
        birthdate: record.fecha_nacimiento,
        tipoId: record.tipoId,
        numeroId: record.numeroId,
        language: record.idioma,
        modalidad,
        clientTimezone: timezone,
      });
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

  const handleBookingErrorDismiss = () => {
    const isStaleSlot = getStaleBookingErrorCode(bookingError) !== null;
    resetBookGoogle();
    if (isStaleSlot) {
      // El slot elegido en el Paso 1 dejó de estar disponible entre que se seleccionó y
      // se confirmó en el Paso 3. Se regresa al Paso 1 con disponibilidad recargada; el
      // correo (clientEmail) y los datos ya ingresados (confirmedClient/confirmedModalidad,
      // usados como defaultValues) se preservan a propósito — no se limpian aquí.
      setSelectedTimeSlot(undefined);
      refetchGoogleTimeslots();
      setStep("calendar");
    }
  };

  const handleBackToCalendar = () => {
    setStep("calendar");
  };

  const handleBackToEmail = () => {
    setStep("email");
    resetUpsertClient();
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
        description={getErrorMessage(bookingError, t)}
        confirm={handleBookingErrorDismiss}
      />
      <OkDialog
        open={findClientStatus === "error"}
        description={findClientError?.message ?? "Unknown error 3"}
        confirm={resetFindClient}
      />
      <OkDialog
        open={upsertStatus === "error"}
        description={getErrorMessage(upsertError, t)}
        confirm={resetUpsertClient}
      />

      <Card className="sm:w-[600px] mx-auto min-h-[400px] space-y-4 relative">
        <When condition={slotsStatus === "pending" || findClientStatus === "pending" || upsertStatus === "pending"}>
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
        {step === "calendar" && (
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
        )}
        {step === "email" && (
          <CardHeader className="max-w-full">
            <CardTitle>{title}</CardTitle>
          </CardHeader>
        )}
        {(step === "calendar" || step === "form") && (
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
        )}

        <CardContent className="p-6 pt-0 sm:pt-2 pb-0">
          {step === "calendar" && (
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
          )}
          {step === "email" && (
            <EmailStep
              handleSubmit={handleEmailSubmit}
              uiLanguage={uiLanguage}
              defaultEmail={clientEmail}
            />
          )}
          {step === "form" && (
            <ContactForm
              handleSubmit={handleClientFormSubmit}
              type={appointmentType}
              uiLanguage={uiLanguage}
              clientEmail={clientEmail}
              defaultValues={confirmedClient ?? existingClient}
              defaultModalidad={confirmedModalidad}
            />
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          {step === "calendar" && (
            <Button
              onClick={handleCalendarContinue}
              disabled={!selectedDate || !selectedTimeSlot}
              className="w-full"
            >
              {t.continue}
            </Button>
          )}
          {step === "email" && (
            <>
              <Button variant="outline" onClick={handleBackToCalendar}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t.back}
              </Button>
              <Button type="submit" form="email-form">
                {t.continue}
              </Button>
            </>
          )}
          {step === "form" && (
            <>
              <Button variant="outline" onClick={handleBackToEmail}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t.back}
              </Button>
              <Button
                type="submit"
                form="client-form"
                disabled={upsertStatus === "pending" || bookingStatus === "pending"}
              >
                {upsertStatus === "pending" || bookingStatus === "pending" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {t.confirmAppointment}
              </Button>
            </>
          )}
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
      <option value="es">🇨🇷 ES</option>
      <option value="en">🇺🇸 EN</option>
    </select>
  );
}

function EmailStep({
  handleSubmit,
  uiLanguage,
  defaultEmail,
}: {
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  uiLanguage: UiLanguage;
  defaultEmail: string;
}) {
  const t = STRINGS[uiLanguage];
  return (
    <form
      id="email-form"
      onSubmit={handleSubmit}
      className="text-left space-y-4 min-h-[300px] flex flex-col justify-center"
    >
      <p className="text-muted-foreground">{t.enterEmailPrompt}</p>
      <div className="space-y-2">
        <Label htmlFor="correo">{t.form.email}</Label>
        <Input
          id="correo"
          name="correo"
          type="email"
          required
          autoFocus
          defaultValue={defaultEmail}
        />
      </div>
    </form>
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

// Edad mínima para agendar (US-29, pedido de Dani en el demo del 17 jul) — misma regla
// que MIN_AGE_YEARS en el backend (backend/src/app.ts), duplicada aquí a propósito porque
// el frontend no puede importar el backend de Apps Script. La barrera REAL vive en el
// backend (upsertClient/bookTimeslot) — esto es solo UX para no dejar que el cliente
// llegue a enviar el formulario con una fecha inválida.
const MIN_AGE_YEARS = 15;
const CR_TIME_ZONE = "America/Costa_Rica";

// Fecha máxima seleccionable en el input de fecha de nacimiento: "hoy menos MIN_AGE_YEARS
// años", calculada en zona horaria de Costa Rica. SOLO aritmética de año/mes/día como
// strings/números — sin restar años sobre un objeto Date (mismo criterio que calculateAge
// en el backend, ver nota técnica #29 del CLAUDE.md sobre corrimientos de fecha).
function getMaxBirthdate(): string {
  const todayCR = formatInTimeZone(new Date(), CR_TIME_ZONE, "yyyy-MM-dd");
  const [year, month, day] = todayCR.split("-");
  return `${Number(year) - MIN_AGE_YEARS}-${month}-${day}`;
}

// Misma aritmética pura que calculateAge en el backend — sin objetos Date, para evitar
// exactamente el tipo de corrimiento de ±1 día ya encontrado en este proyecto (nota #29).
function calculateAgeYears(birthdateStr: string, todayStr: string): number {
  const [birthYear, birthMonth, birthDay] = birthdateStr.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = todayStr.split("-").map(Number);
  let age = todayYear - birthYear;
  if (todayMonth < birthMonth || (todayMonth === birthMonth && todayDay < birthDay)) {
    age--;
  }
  return age;
}

function ContactForm({
  handleSubmit,
  type,
  uiLanguage,
  clientEmail,
  defaultValues,
  defaultModalidad,
}: {
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  type: string;
  uiLanguage: UiLanguage;
  clientEmail: string;
  defaultValues: ClientRecord | null;
  defaultModalidad: string;
}) {
  // measurement → siempre presencial; pilates → siempre virtual.
  // Para initial y followup el cliente elige.
  const showModalidad = type === "initial" || type === "followup";
  const autoModalidad =
    type === "measurement" ? "presencial" : type === "pilates" ? "virtual" : "";
  const t = STRINGS[uiLanguage].form;
  const tErrors = STRINGS[uiLanguage].errors;
  const maxBirthdate = useMemo(() => getMaxBirthdate(), []);
  const [ageError, setAgeError] = useState<string | null>(null);

  const validateBirthdate = (value: string) => {
    if (!value) {
      setAgeError(null);
      return true;
    }
    const todayCR = formatInTimeZone(new Date(), CR_TIME_ZONE, "yyyy-MM-dd");
    if (calculateAgeYears(value, todayCR) < MIN_AGE_YEARS) {
      setAgeError(tErrors.edadMinima);
      return false;
    }
    setAgeError(null);
    return true;
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const birthdateValue =
      new FormData(e.currentTarget).get("birthdate")?.toString() || "";
    if (!validateBirthdate(birthdateValue)) {
      e.preventDefault();
      return;
    }
    handleSubmit(e);
  };

  return (
    <form
      id="client-form"
      onSubmit={onSubmit}
      className="text-left space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="correo-display">{t.email}</Label>
        <Input id="correo-display" value={clientEmail} readOnly disabled />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nombre">{t.nombre}</Label>
        <Input
          id="nombre"
          name="nombre"
          required
          defaultValue={defaultValues?.nombre ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="apellido">{t.apellido}</Label>
        <Input
          id="apellido"
          name="apellido"
          required
          defaultValue={defaultValues?.apellido ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">{t.phone}</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          required
          defaultValue={defaultValues?.telefono ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tipoId">{t.tipoId}</Label>
        <select
          id="tipoId"
          name="tipoId"
          required
          defaultValue={defaultValues?.tipoId ?? ""}
          className={selectClassName}
        >
          <option value="" disabled>
            {t.selectPlaceholder}
          </option>
          <option value="cedula">{t.tipoIdCedula}</option>
          <option value="pasaporte">{t.tipoIdPasaporte}</option>
          <option value="licencia">{t.tipoIdLicencia}</option>
          <option value="otro">{t.tipoIdOtro}</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="numeroId">{t.numeroId}</Label>
        <Input
          id="numeroId"
          name="numeroId"
          required
          defaultValue={defaultValues?.numeroId ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="birthdate">{t.birthdate}</Label>
        <Input
          id="birthdate"
          name="birthdate"
          type="date"
          required
          max={maxBirthdate}
          defaultValue={defaultValues?.fecha_nacimiento ?? ""}
          onBlur={(e) => validateBirthdate(e.target.value)}
          onChange={(e) => validateBirthdate(e.target.value)}
          aria-invalid={ageError ? true : undefined}
        />
        {ageError && (
          <p className="text-sm text-destructive">{ageError}</p>
        )}
      </div>
      {showModalidad ? (
        <div className="space-y-2">
          <Label htmlFor="modalidad">{t.modalidad}</Label>
          <select
            id="modalidad"
            name="modalidad"
            required
            defaultValue={defaultModalidad}
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
