const CALENDARS: string[] = (() => {
  const calendarsProp = PropertiesService.getScriptProperties().getProperty('CALENDARS');
  try {
    if (!calendarsProp) return ["primary"];
    const parsed = JSON.parse(calendarsProp);
    return Array.isArray(parsed) ? parsed : ["primary"];
  } catch (e) {
    Logger.log(`Error parsing CALENDARS property: ${e}`);
    return ["primary"];
  }
})();

// Zona horaria base del negocio. Todos los eventos se crean en hora de Costa Rica.
// Los clientes ven los horarios en su propia zona horaria (manejado en el frontend).
const TIME_ZONE = "America/Costa_Rica";

// Días de la semana habilitados como ventana de búsqueda (0=dom, 1=lun, ..., 6=sáb).
// Se incluye sábado porque pilates es solo sábados. La disponibilidad real la controla
// el Google Calendar de Dani/instructora — estos días son solo el rango de búsqueda.
const WORKDAYS = [1, 2, 3, 4, 5, 6];

// Ventana horaria de búsqueda de slots. Amplia a propósito: el Calendar real de Dani
// filtra los horarios bloqueados. start/end en horas locales (TIME_ZONE).
const WORKHOURS = {
  start: 7,
  end: 20,
};

// Máximo de días hacia adelante que el portal muestra disponibilidad (8 semanas = 56 días).
// Confirmado con Dani en reunión del 2 jul 2026.
const DAYS_IN_ADVANCE = 56;

// Duraciones en minutos por tipo de cita, según parámetro ?type= en la URL.
// Confirmadas con Dani en reunión del 2 jul 2026.
// "measurement" actualizado de 30 a 15 min el 7 jul 2026 (ver registro de cambios en CLAUDE.md).
const APPOINTMENT_DURATIONS: Record<string, number> = {
  initial:     60, // Consulta inicial de nutrición
  followup:    45, // Cita de seguimiento de nutrición
  measurement: 15, // Solo medición (presencial, sin opción virtual)
  pilates:     60, // Clase grupal de pilates (sábados, máx 5 personas)
};

// Retorna la duración en minutos para un tipo de cita válido.
// Lanza error si el tipo no existe en APPOINTMENT_DURATIONS.
function getDurationForType(type: string): number {
  const duration = APPOINTMENT_DURATIONS[type];
  if (!duration) {
    throw new Error(`Tipo de cita no válido: "${type}"`);
  }
  return duration;
}

function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.HTML.HtmlOutput {
  // El parámetro ?type= en la URL determina el tipo de cita, su duración,
  // el calendario destino, la plantilla de correo y la lógica de disponibilidad.
  const type = e?.parameter?.type ?? "";

  // Si el tipo está ausente o no es uno de los valores válidos, mostrar página de error bilingüe.
  if (!type || !APPOINTMENT_DURATIONS[type]) {
    const errorHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Enlace no válido</title>
  <style>
    body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 420px; text-align: center; }
    h1 { color: #c53030; margin-bottom: 0.5rem; font-size: 1.4rem; }
    p { color: #555; line-height: 1.5; }
    hr { border: none; border-top: 1px solid #eee; margin: 1.2rem 0; }
    em { color: #777; font-size: 0.95rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Enlace no válido</h1>
    <p>Este enlace de agendamiento no es válido o está incompleto.</p>
    <p>Por favor contacta a Plant Powered by Dani para recibir el enlace correcto.</p>
    <hr>
    <p><em>Invalid scheduling link. Please contact Plant Powered by Dani for the correct link.</em></p>
  </div>
</body>
</html>`;
    return HtmlService.createHtmlOutput(errorHtml)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag("viewport", "width=device-width, initial-scale=1");
  }

  // Inyectar el tipo de cita como variable global en el HTML para que el frontend
  // lo lea y lo pase a fetchAvailability(type) y bookTimeslot(type, ...).
  const typeScript = `<script>window.APPOINTMENT_TYPE = "${type}";</script>`;

  return HtmlService.createHtmlOutputFromFile("index")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .append(typeScript);
}

function fetchAvailability(type: string): {
  timeslots: string[];
  durationMinutes: number;
} {
  // La duración del slot se determina dinámicamente según el tipo de cita,
  // en lugar de usar una constante global fija.
  const duration = getDurationForType(type);
  const durationMs = duration * 60000;

  const nearestTimeslot = new Date(
    Math.floor(new Date().getTime() / durationMs) * durationMs
  );
  const now = nearestTimeslot;
  const end = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + DAYS_IN_ADVANCE
    )
  );

  const response = Calendar.Freebusy!.query({
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    items: CALENDARS.map((id: string) => ({ id })),
  });

  const events = CALENDARS.map((calendarId: string) => {
    const busyTimes = (response as any).calendars[calendarId].busy;
    Logger.log(`Busy times for ${calendarId}: ${JSON.stringify(busyTimes)}`);
    return busyTimes.map(({ start, end }: { start: string; end: string }) => ({
      start: new Date(start),
      end: new Date(end),
    }));
  }).reduce((acc, curr) => acc.concat(curr), []);

  const timeslots = [];
  for (
    let t = nearestTimeslot.getTime();
    t + durationMs <= end.getTime();
    t += durationMs
  ) {
    const start = new Date(t);
    const end = new Date(t + durationMs);
    const startTZ = new Date(
      Utilities.formatDate(start, TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss")
    );
    if (startTZ.getHours() < WORKHOURS.start) continue;
    if (startTZ.getHours() >= WORKHOURS.end) continue;
    if (WORKDAYS.indexOf(startTZ.getDay()) < 0) continue;
    if (events.some((event: { start: Date; end: Date }) => event.start < end && event.end > start)) {
      continue;
    }
    timeslots.push(start.toISOString());
  }
  return { timeslots, durationMinutes: duration };
}

// Nombre del archivo de Google Sheets usado como base de datos durante Sprint 1-3 (testing).
// Actualizar a nombre de producción antes del paso a producción en Sprint 3.
const SPREADSHEET_NAME = "PlantPoweredDani - Base de Datos (Testing)";

// Definición de columnas por pestaña, en el orden exacto confirmado en CLAUDE.md (sección 8).
const SHEET_SCHEMAS: Record<string, string[]> = {
  "Nutrición": [
    "token", "nombre_apellido", "correo", "telefono", "cedula", "fecha_nacimiento",
    "tipo_cita", "fecha", "hora", "zona_horaria_cliente", "modalidad", "idioma",
    "meet_link", "estado", "fecha_creacion", "recordatorio_enviado", "show_no_show",
    "cancelaciones_tardias", "requiere_pago",
  ],
  "Pilates": [
    "token", "nombre_apellido", "correo", "telefono", "cedula", "fecha_nacimiento",
    "fecha_clase", "hora_clase", "zona_horaria_cliente", "idioma",
    "estado", "fecha_inscripcion", "recordatorio_enviado", "show_no_show",
  ],
  "Cupos_Pilates": [
    "fecha_clase", "hora_clase", "inscritos", "max_participantes",
  ],
};

// Crea (o reutiliza) el spreadsheet de base de datos con las 3 pestañas requeridas:
// Nutrición, Pilates y Cupos_Pilates. Guarda el ID en Script Properties bajo
// "SPREADSHEET_ID" para que getSheet() pueda encontrarlo en llamadas futuras.
// Ejecutar manualmente una sola vez desde el editor de Apps Script (US-04).
function initializeSheets(): void {
  const scriptProperties = PropertiesService.getScriptProperties();
  const existingId = scriptProperties.getProperty("SPREADSHEET_ID");

  if (existingId) {
    try {
      const existing = SpreadsheetApp.openById(existingId);
      Logger.log(`Spreadsheet ya existe. ID: ${existingId}`);
      Logger.log(`URL: ${existing.getUrl()}`);
      return;
    } catch (e) {
      Logger.log(`SPREADSHEET_ID guardado (${existingId}) no se pudo abrir, se creará uno nuevo: ${e}`);
    }
  }

  const spreadsheet = SpreadsheetApp.create(SPREADSHEET_NAME);

  Object.keys(SHEET_SCHEMAS).forEach((sheetName) => {
    const headers = SHEET_SCHEMAS[sheetName];
    const sheet = spreadsheet.insertSheet(sheetName);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setFontWeight("bold");
    sheet.setFrozenRows(1);
  });

  // Eliminar la pestaña por defecto ("Sheet1" / "Hoja 1") que Apps Script crea automáticamente.
  const defaultSheet = spreadsheet.getSheets()[0];
  if (Object.keys(SHEET_SCHEMAS).indexOf(defaultSheet.getName()) < 0) {
    spreadsheet.deleteSheet(defaultSheet);
  }

  scriptProperties.setProperty("SPREADSHEET_ID", spreadsheet.getId());

  Logger.log(`Spreadsheet creado. ID: ${spreadsheet.getId()}`);
  Logger.log(`URL: ${spreadsheet.getUrl()}`);
}

// Retorna la pestaña (Sheet) correspondiente al nombre dado, a partir del spreadsheet
// guardado en Script Properties ("SPREADSHEET_ID"). Usado por US-05 para escribir citas.
function getSheet(sheetName: string): GoogleAppsScript.Spreadsheet.Sheet {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID no configurado. Ejecutar initializeSheets() primero.");
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`Pestaña "${sheetName}" no encontrada en el spreadsheet.`);
  }

  return sheet;
}

function bookTimeslot(
  type: string,
  timeslot: string,
  name: string,
  email: string,
  phone: string,
  cedula: string,
  birthdate: string,
  language: string,
  modalidad: string
): string {
  // La duración del evento depende del tipo de cita, igual que en fetchAvailability.
  const duration = getDurationForType(type);
  const calendarId = CALENDARS[0];
  const startTime = new Date(timeslot);
  if (isNaN(startTime.getTime())) {
    throw new Error("Invalid start time");
  }
  const endTime = new Date(startTime.getTime());
  endTime.setUTCMinutes(startTime.getUTCMinutes() + duration);

  try {
    const possibleEvents = Calendar.Freebusy!.query({
      timeMin: startTime.toISOString(),
      timeMax: endTime.toISOString(),
      items: CALENDARS.map((id: string) => ({ id })),
    });

    const hasConflict = CALENDARS.some((calId: string) =>
      (possibleEvents as any).calendars[calId].busy.length > 0
    );

    if (hasConflict) {
      throw new Error("Timeslot not available");
    }

    CalendarApp.getCalendarById(calendarId).createEvent(
      `Appointment with ${name}`,
      startTime,
      endTime,
      {
        description: `Phone: ${phone}\nID: ${cedula}\nDate of birth: ${birthdate}\nLanguage: ${language}\nModality: ${modalidad}`,
        guests: email,
        sendInvites: true,
        status: "confirmed",
      }
    );
    return `Timeslot booked successfully`;
  } catch (e) {
    const error = e as Error;
    throw new Error(`Failed to create event: ${error.message}`);
  }
}
