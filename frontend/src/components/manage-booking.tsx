import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { CalendarTimeslotPicker, UiLanguage } from "@/components/calendar-picker";
import { useTimezoneDropdown } from "@/components/timezone-dropdown";
import { useCancelBooking } from "@/hooks/useCancelBooking";
import { useConfirmAttendance } from "@/hooks/useConfirmAttendance";
import {
  ManageBookingInfo,
  useManageBookingInfo,
} from "@/hooks/useManageBookingInfo";
import { useRescheduleBooking } from "@/hooks/useRescheduleBooking";
import { useGoogleTimeslots } from "@/hooks/useGoogleTimeslots";
import { Timeslots } from "@/models/Timeslots";
import { addMonths, format } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { ArrowLeft, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

// Hora del negocio (mismo criterio que CR_TIME_ZONE en calendar-picker.tsx) — fecha/hora que
// devuelve getManageBookingInfo() ya vienen en esta zona (TIME_ZONE del backend), nunca en la
// del cliente. Duplicado a propósito: el frontend no puede importar el backend de Apps Script.
const CR_TIME_ZONE = "America/Costa_Rica";

type ManageAccion = "" | "confirmar" | "reagendar" | "cancelar";

const APPOINTMENT_TITLES: Record<string, Record<string, string>> = {
  es: {
    initial: "Consulta Inicial",
    followup: "Cita de Seguimiento",
    measurement: "Solo Medición",
    pilates: "Clase de Pilates",
  },
  en: {
    initial: "Initial Consultation",
    followup: "Follow-up Appointment",
    measurement: "Measurement Only",
    pilates: "Pilates Class",
  },
};

const STRINGS = {
  es: {
    loading: "Cargando tu cita...",
    yourAppointment: "Tu cita",
    modalityVirtual: "Virtual",
    modalityInPerson: "Presencial",
    meetLink: "Enlace de Google Meet",
    back: "Atrás",
    menuTitle: "¿Qué deseas hacer?",
    rescheduleButton: "Reagendar",
    cancelButton: "Cancelar cita",
    confirmTitle: "Confirmar tu asistencia",
    confirmBody: "Por favor confirma que asistirás a tu cita.",
    confirmButton: "Confirmar mi asistencia",
    confirmSuccessTitle: "¡Gracias!",
    confirmSuccessBody: "Tu asistencia fue confirmada.",
    rescheduleTitle: "Elige un nuevo horario",
    rescheduleContinue: "Elegir nuevo horario",
    rescheduleConfirm: "Confirmar nuevo horario",
    rescheduleSuccessTitle: "¡Listo!",
    rescheduleSuccessBody: "Tu cita fue reagendada exitosamente para:",
    cancelDialogTitle: "¿Cancelar esta cita?",
    cancelDialogBody: "Esta acción no se puede deshacer.",
    cancelDialogConfirm: "Sí, cancelar",
    cancelDialogDismiss: "No, mantener mi cita",
    cancelSuccessTitle: "Cita cancelada",
    cancelSuccessBody: "Tu cita fue cancelada.",
    yourTimezone: "Tu zona horaria",
    selectADate: "Selecciona una fecha",
    dateNotSelected: "Fecha no seleccionada",
    timeNotSelected: "Hora no seleccionada",
    at: "a las",
    previousMonth: "Mes anterior",
    nextMonth: "Mes siguiente",
    genericErrorTitle: "Este enlace ya no es válido",
    errors: {
      TOKEN_NO_ENCONTRADO: "No encontramos ninguna cita asociada a este enlace.",
      CITA_YA_CANCELADA: "Esta cita ya fue cancelada anteriormente.",
      CITA_CANCELADA: "Esta cita ya fue cancelada, por lo que no se puede modificar.",
      VENTANA_REAGENDAMIENTO_VENCIDA:
        "Ya no es posible reagendar esta cita porque faltan menos de 24 horas. Si necesitas hacer un cambio, por favor contáctanos directamente.",
      VENTANA_MINIMA_NO_CUMPLIDA:
        "Ese horario ya no cumple con el mínimo de anticipación requerido. Por favor elige otro horario disponible.",
      SLOT_NO_DISPONIBLE:
        "Ese horario acaba de ser reservado por otra persona. Por favor elige otro horario disponible.",
      CLASE_LLENA:
        "Esa clase de pilates ya está llena. Por favor elige otro horario disponible.",
      ASISTENCIA_SOLO_NUTRICION: "Esta opción solo aplica para citas de nutrición.",
      default: "Ocurrió un error inesperado. Por favor intenta de nuevo o contáctanos directamente.",
    },
  },
  en: {
    loading: "Loading your appointment...",
    yourAppointment: "Your appointment",
    modalityVirtual: "Virtual",
    modalityInPerson: "In person",
    meetLink: "Google Meet link",
    back: "Back",
    menuTitle: "What would you like to do?",
    rescheduleButton: "Reschedule",
    cancelButton: "Cancel appointment",
    confirmTitle: "Confirm your attendance",
    confirmBody: "Please confirm that you will attend your appointment.",
    confirmButton: "Confirm my attendance",
    confirmSuccessTitle: "Thank you!",
    confirmSuccessBody: "Your attendance has been confirmed.",
    rescheduleTitle: "Choose a new time",
    rescheduleContinue: "Choose new time",
    rescheduleConfirm: "Confirm new time",
    rescheduleSuccessTitle: "All set!",
    rescheduleSuccessBody: "Your appointment was successfully rescheduled to:",
    cancelDialogTitle: "Cancel this appointment?",
    cancelDialogBody: "This action cannot be undone.",
    cancelDialogConfirm: "Yes, cancel",
    cancelDialogDismiss: "No, keep my appointment",
    cancelSuccessTitle: "Appointment cancelled",
    cancelSuccessBody: "Your appointment has been cancelled.",
    yourTimezone: "Your timezone",
    selectADate: "Select a date",
    dateNotSelected: "Date not selected",
    timeNotSelected: "Time not selected",
    at: "at",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    genericErrorTitle: "This link is no longer valid",
    errors: {
      TOKEN_NO_ENCONTRADO: "We couldn't find any appointment associated with this link.",
      CITA_YA_CANCELADA: "This appointment was already cancelled.",
      CITA_CANCELADA: "This appointment was already cancelled, so it can't be modified.",
      VENTANA_REAGENDAMIENTO_VENCIDA:
        "This appointment can no longer be rescheduled because less than 24 hours remain. If you need to make a change, please contact us directly.",
      VENTANA_MINIMA_NO_CUMPLIDA:
        "That time slot no longer meets the minimum booking window required. Please choose another available time.",
      SLOT_NO_DISPONIBLE:
        "That time slot was just booked by someone else. Please choose another available time.",
      CLASE_LLENA:
        "That pilates class is now full. Please choose another available time.",
      ASISTENCIA_SOLO_NUTRICION: "This option only applies to nutrition appointments.",
      default: "Something went wrong. Please try again or contact us directly.",
    },
  },
} as const;

const KNOWN_ERROR_CODES = [
  "TOKEN_NO_ENCONTRADO",
  "CITA_YA_CANCELADA",
  "CITA_CANCELADA",
  "VENTANA_REAGENDAMIENTO_VENCIDA",
  "VENTANA_MINIMA_NO_CUMPLIDA",
  "SLOT_NO_DISPONIBLE",
  "CLASE_LLENA",
  "ASISTENCIA_SOLO_NUTRICION",
] as const;

function getManageErrorMessage(
  error: Error | null,
  lang: UiLanguage
): string {
  const t = STRINGS[lang];
  if (!error) return t.errors.default;
  const code = KNOWN_ERROR_CODES.find((c) => error.message.includes(c));
  return code ? t.errors[code] : t.errors.default;
}

// Instante real de la cita a partir de fecha/hora en hora de negocio (CR), listo para
// mostrarse en la zona horaria del cliente con formatInTimeZone.
function appointmentInstant(fecha: string, hora: string): Date {
  return fromZonedTime(`${fecha}T${hora}:00`, CR_TIME_ZONE);
}

function AppointmentSummary({
  info,
  lang,
}: {
  info: ManageBookingInfo;
  lang: UiLanguage;
}) {
  const t = STRINGS[lang];
  const instant = appointmentInstant(info.fecha, info.hora);
  const dateFnsLocale = lang === "es" ? { locale: esLocale } : undefined;
  const title = APPOINTMENT_TITLES[lang][info.type] ?? info.type;

  return (
    <div className="rounded-md border p-4 space-y-1 text-left">
      <div className="font-semibold">{title}</div>
      <div>
        {formatInTimeZone(
          instant,
          info.clientTimezone || CR_TIME_ZONE,
          "MMMM d, yyyy",
          dateFnsLocale
        )}{" "}
        — {formatInTimeZone(instant, info.clientTimezone || CR_TIME_ZONE, "h:mm a")}
      </div>
      <div className="text-sm text-muted-foreground">
        {info.esVirtual ? t.modalityVirtual : t.modalityInPerson}
      </div>
      {info.esVirtual && info.meetLink && (
        <div className="text-sm">
          <a
            href={info.meetLink}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            {t.meetLink}
          </a>
        </div>
      )}
    </div>
  );
}

function ErrorScreen({
  message,
  lang,
}: {
  message: string;
  lang: UiLanguage;
}) {
  const t = STRINGS[lang];
  return (
    <Card className="sm:w-[500px] p-6 mx-auto min-h-[300px] flex flex-col justify-center items-center text-center space-y-4">
      <XCircle className="h-12 w-12 text-destructive" />
      <h1 className="text-xl font-semibold">{t.genericErrorTitle}</h1>
      <p className="text-muted-foreground">{message}</p>
    </Card>
  );
}

function ConfirmScreen({
  info,
  lang,
}: {
  info: ManageBookingInfo;
  lang: UiLanguage;
}) {
  const t = STRINGS[lang];
  const [status, error, confirm] = useConfirmAttendance();

  if (status === "success") {
    return (
      <Card className="sm:w-[500px] p-6 mx-auto min-h-[300px] flex flex-col justify-center items-center text-center space-y-4">
        <CheckCircle2 className="h-12 w-12 text-primary" />
        <h1 className="text-xl font-semibold">{t.confirmSuccessTitle}</h1>
        <p className="text-muted-foreground">{t.confirmSuccessBody}</p>
      </Card>
    );
  }

  if (status === "error") {
    return <ErrorScreen message={getManageErrorMessage(error, lang)} lang={lang} />;
  }

  return (
    <Card className="sm:w-[500px] mx-auto min-h-[300px]">
      <CardHeader>
        <CardTitle>{t.confirmTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">{t.confirmBody}</p>
        <AppointmentSummary info={info} lang={lang} />
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          disabled={status === "pending"}
          onClick={() => confirm(info.token)}
        >
          {status === "pending" && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          {t.confirmButton}
        </Button>
      </CardFooter>
    </Card>
  );
}

function CancelScreen({
  info,
  lang,
}: {
  info: ManageBookingInfo;
  lang: UiLanguage;
}) {
  const t = STRINGS[lang];
  const [status, error, cancel] = useCancelBooking();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (status === "success") {
    return (
      <Card className="sm:w-[500px] p-6 mx-auto min-h-[300px] flex flex-col justify-center items-center text-center space-y-4">
        <CheckCircle2 className="h-12 w-12 text-primary" />
        <h1 className="text-xl font-semibold">{t.cancelSuccessTitle}</h1>
        <p className="text-muted-foreground">{t.cancelSuccessBody}</p>
      </Card>
    );
  }

  if (status === "error") {
    return <ErrorScreen message={getManageErrorMessage(error, lang)} lang={lang} />;
  }

  return (
    <Card className="sm:w-[500px] mx-auto min-h-[300px]">
      <CardHeader>
        <CardTitle>{t.cancelButton}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AppointmentSummary info={info} lang={lang} />
      </CardContent>
      <CardFooter>
        <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full" disabled={status === "pending"}>
              {status === "pending" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t.cancelButton}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t.cancelDialogTitle}</AlertDialogTitle>
              <AlertDialogDescription>{t.cancelDialogBody}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.cancelDialogDismiss}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  cancel(info.token, () => {});
                }}
              >
                {t.cancelDialogConfirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}

function RescheduleScreen({
  info,
  lang,
}: {
  info: ManageBookingInfo;
  lang: UiLanguage;
}) {
  const t = STRINGS[lang];
  const dateFnsLocale = lang === "es" ? { locale: esLocale } : undefined;
  const [step, setStep] = useState<"summary" | "calendar">("summary");
  const [TimezoneDropdown, timezone] = useTimezoneDropdown();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<Date | undefined>(undefined);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [googleSlots, , slotsStatus] = useGoogleTimeslots(info.type);
  const [rescheduleStatus, rescheduleError, reschedule] = useRescheduleBooking();

  const availableSlots = useMemo(
    () => new Timeslots(googleSlots, timezone),
    [googleSlots, timezone]
  );

  const isDayDisabled = (date: Date) => !availableSlots.hasSlotsForDate(date);

  if (rescheduleStatus === "success" && selectedTimeSlot) {
    return (
      <Card className="sm:w-[500px] p-6 mx-auto min-h-[300px] flex flex-col justify-center items-center text-center space-y-4">
        <CheckCircle2 className="h-12 w-12 text-primary" />
        <h1 className="text-xl font-semibold">{t.rescheduleSuccessTitle}</h1>
        <p className="text-muted-foreground">{t.rescheduleSuccessBody}</p>
        <div className="font-bold font-mono">
          {formatInTimeZone(
            selectedTimeSlot,
            timezone,
            "MMMM d, yyyy h:mm a",
            dateFnsLocale
          )}
        </div>
      </Card>
    );
  }

  if (rescheduleStatus === "error") {
    return <ErrorScreen message={getManageErrorMessage(rescheduleError, lang)} lang={lang} />;
  }

  if (step === "summary") {
    return (
      <Card className="sm:w-[500px] mx-auto min-h-[300px]">
        <CardHeader>
          <CardTitle>{t.rescheduleButton}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AppointmentSummary info={info} lang={lang} />
        </CardContent>
        <CardFooter>
          <Button className="w-full" onClick={() => setStep("calendar")}>
            {t.rescheduleContinue}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="sm:w-[600px] mx-auto min-h-[400px] space-y-4 relative">
      {(slotsStatus === "pending" || rescheduleStatus === "pending") && (
        <div className="bg-primary absolute rounded-xl z-50 opacity-70 inset-0">
          <div className="flex justify-center items-center h-full flex-col stroke-primary-foreground">
            <Loader2 size={60} className="animate-spin" stroke="current" />
          </div>
        </div>
      )}
      <CardHeader className="max-w-full">
        <div className="flex justify-between items-center flex-col sm:flex-row gap-4 relative">
          <CardTitle>{t.rescheduleTitle}</CardTitle>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">{t.yourTimezone}</Label>
            <TimezoneDropdown />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 pt-0 sm:pt-2 pb-0">
        <CalendarTimeslotPicker
          handlePreviousMonth={() => setCurrentMonth((m) => addMonths(m, -1))}
          currentMonth={currentMonth}
          handleNextMonth={() => setCurrentMonth((m) => addMonths(m, 1))}
          selectedDate={selectedDate}
          handleDateSelect={(date) => {
            if (date) {
              setSelectedDate(date);
              setCurrentMonth(new Date(date.getFullYear(), date.getMonth()));
            }
            setSelectedTimeSlot(undefined);
          }}
          setCurrentMonth={setCurrentMonth}
          isDayDisabled={isDayDisabled}
          availableSlots={availableSlots}
          selectedTimeSlot={selectedTimeSlot}
          handleTimeSlotSelect={setSelectedTimeSlot}
          uiLanguage={lang}
        />
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={() => setStep("summary")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t.back}
        </Button>
        <Button
          disabled={!selectedTimeSlot || rescheduleStatus === "pending"}
          onClick={() => {
            if (selectedTimeSlot) reschedule(info.token, selectedTimeSlot, timezone);
          }}
        >
          {t.rescheduleConfirm}
        </Button>
      </CardFooter>
    </Card>
  );
}

function MenuScreen({
  info,
  lang,
  onSelect,
}: {
  info: ManageBookingInfo;
  lang: UiLanguage;
  onSelect: (accion: ManageAccion) => void;
}) {
  const t = STRINGS[lang];
  return (
    <Card className="sm:w-[500px] mx-auto min-h-[300px]">
      <CardHeader>
        <CardTitle>{t.menuTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AppointmentSummary info={info} lang={lang} />
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        <Button className="w-full" onClick={() => onSelect("reagendar")}>
          {t.rescheduleButton}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => onSelect("cancelar")}
        >
          {t.cancelButton}
        </Button>
      </CardFooter>
    </Card>
  );
}

export function ManageBooking({
  token,
  initialAccion,
}: {
  token: string;
  initialAccion: string;
}) {
  const [info, status, error] = useManageBookingInfo(token);
  const [accion, setAccion] = useState<ManageAccion>(
    initialAccion === "confirmar" ||
      initialAccion === "reagendar" ||
      initialAccion === "cancelar"
      ? initialAccion
      : ""
  );

  // Antes de que getManageBookingInfo() responda, no sabemos el idioma del cliente — se usa
  // español como default, igual que la página de error bilingüe de doGet() para un ?type=
  // inválido.
  const lang: UiLanguage = info?.language === "en" ? "en" : "es";

  if (status === "pending" || status === "idle") {
    return (
      <Card className="sm:w-[500px] p-6 mx-auto min-h-[300px] flex flex-col justify-center items-center text-center space-y-4">
        <Loader2 className="h-10 w-10 animate-spin" />
        <p className="text-muted-foreground">{STRINGS.es.loading}</p>
      </Card>
    );
  }

  if (status === "error" || !info) {
    return <ErrorScreen message={getManageErrorMessage(error, "es")} lang="es" />;
  }

  if (info.estado === "Cancelada") {
    return (
      <ErrorScreen
        message={STRINGS[lang].errors.CITA_CANCELADA}
        lang={lang}
      />
    );
  }

  if (accion === "confirmar") {
    return <ConfirmScreen info={info} lang={lang} />;
  }
  if (accion === "reagendar") {
    return <RescheduleScreen info={info} lang={lang} />;
  }
  if (accion === "cancelar") {
    return <CancelScreen info={info} lang={lang} />;
  }
  return <MenuScreen info={info} lang={lang} onSelect={setAccion} />;
}
