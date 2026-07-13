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

  // Pilates es grupal: un slot no debe ocultarse solo porque ya existe un evento de
  // Calendar ahí (eso pasaría con el primer inscrito). La disponibilidad real depende
  // del cupo restante en Cupos_Pilates, no del conflict-check de Calendar.
  const cuposMap: Record<string, number> = {};
  if (type === "pilates") {
    const cuposData = getSheet("Cupos_Pilates").getDataRange().getValues();
    for (let i = 1; i < cuposData.length; i++) {
      const rowFecha = normalizeSheetDateCell(cuposData[i][0], "yyyy-MM-dd");
      const rowHora = normalizeSheetDateCell(cuposData[i][1], "HH:mm");
      cuposMap[`${rowFecha}_${rowHora}`] = Number(cuposData[i][2]) || 0;
    }
  }

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

    if (type === "pilates") {
      const fecha = Utilities.formatDate(start, TIME_ZONE, "yyyy-MM-dd");
      const hora = Utilities.formatDate(start, TIME_ZONE, "HH:mm");
      const inscritos = cuposMap[`${fecha}_${hora}`] || 0;
      if (inscritos >= MAX_PILATES_PARTICIPANTS) continue;
    } else if (events.some((event: { start: Date; end: Date }) => event.start < end && event.end > start)) {
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
    "token", "nombre", "apellido", "correo", "telefono", "cedula", "fecha_nacimiento",
    "tipo_cita", "fecha", "hora", "zona_horaria_cliente", "modalidad", "idioma",
    "meet_link", "estado", "fecha_creacion", "recordatorio_enviado", "show_no_show",
    "cancelaciones_tardias", "requiere_pago",
  ],
  "Pilates": [
    "token", "nombre", "apellido", "correo", "telefono", "cedula", "fecha_nacimiento",
    "fecha_clase", "hora_clase", "zona_horaria_cliente", "idioma",
    "estado", "fecha_inscripcion", "recordatorio_enviado", "show_no_show",
  ],
  "Cupos_Pilates": [
    "fecha_clase", "hora_clase", "inscritos", "max_participantes",
  ],
};

// Schema de la pestaña "Clientes" (US-27) — no forma parte de SHEET_SCHEMAS/initializeSheets
// a propósito: initializeSheets() ya fue ejecutada en testing y NO debe volver a ejecutarse
// (crearía un spreadsheet duplicado, ver CLAUDE.md nota #11). La pestaña Clientes se agrega
// por separado con addClientesSheet() al spreadsheet ya existente.
const CLIENTES_SCHEMA: string[] = [
  "correo", "nombre", "apellido", "telefono", "cedula", "fecha_nacimiento", "idioma",
];

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

    if (sheetName === "Cupos_Pilates") {
      ensureCuposPilatesPlainTextFormat(sheet);
    }
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

// Agrega la pestaña "Clientes" (US-27) al spreadsheet YA existente, usando el
// SPREADSHEET_ID guardado en Script Properties. NO llama ni depende de initializeSheets().
// Es un no-op seguro si la pestaña ya existe (para poder re-ejecutarla sin duplicar).
// Ejecutar manualmente una sola vez desde el editor de Apps Script, igual que initializeSheets().
function addClientesSheet(): void {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID no configurado. Ejecutar initializeSheets() primero.");
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  if (spreadsheet.getSheetByName("Clientes")) {
    Logger.log('La pestaña "Clientes" ya existe. No se hizo ningún cambio.');
    return;
  }

  const sheet = spreadsheet.insertSheet("Clientes");
  const headerRange = sheet.getRange(1, 1, 1, CLIENTES_SCHEMA.length);
  headerRange.setValues([CLIENTES_SCHEMA]);
  headerRange.setFontWeight("bold");
  sheet.setFrozenRows(1);

  Logger.log('Pestaña "Clientes" creada en el spreadsheet existente.');
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

// Máximo de participantes por clase grupal de pilates.
// Confirmado con Dani en reunión del 2 jul 2026 (ver CLAUDE.md sección 4).
const MAX_PILATES_PARTICIPANTS = 5;

// Google Sheets autodetecta el contenido de una celda al escribirla: un string como
// "2026-07-12" o "10:00" puede guardarse internamente como un valor de fecha/hora real
// en vez de texto plano. Si eso pasa, getValues() devuelve un objeto Date en esa celda,
// no el string original — y una comparación de igualdad contra el string esperado
// ("2026-07-12" === Date(...)) nunca es true, aunque representen el mismo momento.
// Esta función normaliza cualquier valor leído de esas columnas (fecha_clase/hora_clase)
// al mismo string canónico que produce Utilities.formatDate, para que las comparaciones
// y los keys de mapa calcen sin importar cómo lo haya tipado Sheets.
function normalizeSheetDateCell(value: unknown, pattern: string): string {
  if (value instanceof Date) {
    return Utilities.formatDate(value, TIME_ZONE, pattern);
  }
  return String(value);
}

interface ClientRecord {
  correo: string;
  nombre: string;
  apellido: string;
  telefono: string;
  cedula: string;
  fecha_nacimiento: string;
  idioma: string;
}

// Busca un cliente por correo (clave única, US-27) en la pestaña "Clientes".
// Retorna null si no existe — el frontend usa esto para decidir si precarga el
// Paso 2 del formulario o lo muestra vacío.
function findClientByEmail(correo: string): ClientRecord | null {
  const sheet = getSheet("Clientes");
  const data = sheet.getDataRange().getValues();
  const target = correo.trim().toLowerCase();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === target) {
      return {
        correo: String(data[i][0]),
        nombre: String(data[i][1]),
        apellido: String(data[i][2]),
        telefono: String(data[i][3]),
        cedula: String(data[i][4]),
        fecha_nacimiento: normalizeSheetDateCell(data[i][5], "yyyy-MM-dd"),
        idioma: String(data[i][6]),
      };
    }
  }
  return null;
}

// Inserta o actualiza (upsert) la fila de un cliente en "Clientes", identificado por
// correo. Se ejecuta al terminar el Paso 2 del formulario (antes de mostrar el
// calendario), independientemente de si el cliente confirma la cita después.
// Usa LockService para evitar condiciones de carrera si el mismo correo hace dos
// reservas casi simultáneas (mismo criterio que el cupo de pilates en appendBookingToSheet).
function upsertClient(data: ClientRecord): void {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet("Clientes");
    const values = sheet.getDataRange().getValues();
    const target = data.correo.trim().toLowerCase();

    let rowNumber = -1; // fila 1-based en el sheet (-1 = no existe todavía)
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).trim().toLowerCase() === target) {
        rowNumber = i + 1;
        break;
      }
    }

    const row = [
      data.correo,
      data.nombre,
      data.apellido,
      data.telefono,
      data.cedula,
      data.fecha_nacimiento,
      data.idioma,
    ];

    if (rowNumber > 0) {
      sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
  } finally {
    lock.releaseLock();
  }
}

// Segunda barrera contra la autodetección de Sheets: fuerza formato de texto plano
// en las columnas fecha_clase/hora_clase (A y B) de Cupos_Pilates ANTES de escribir,
// para que el string nunca se convierta a un valor de fecha/hora real en primer lugar.
// Se llama en cada escritura (no solo en initializeSheets) porque el spreadsheet de
// testing ya existe y esas columnas no se reformatean solas — ver CLAUDE.md nota #11
// (initializeSheets no se debe volver a ejecutar).
function ensureCuposPilatesPlainTextFormat(sheet: GoogleAppsScript.Spreadsheet.Sheet): void {
  const numRows = Math.max(sheet.getMaxRows() - 1, 1);
  sheet.getRange(2, 1, numRows, 2).setNumberFormat("@");
}

interface BookingData {
  timeslot: string; // ISO string del inicio de la cita, en UTC
  nombre: string;
  apellido: string;
  email: string;
  phone: string;
  cedula: string;
  birthdate: string;
  language: string;
  modalidad: string;
  clientTimezone: string; // zona horaria del cliente detectada en el frontend (US-08)
}

// Escribe una nueva fila de cita/inscripción en la pestaña correspondiente
// (Nutrición o Pilates) con las columnas exactas del schema (CLAUDE.md sección 8).
// Genera el token (UUID v4), fija estado='Agendada' y timestamp de creación.
// Para pilates, controla el cupo de forma atómica (LockService) antes de escribir,
// y lanza Error('CLASE_LLENA') si ya no hay cupo disponible.
// Devuelve el token generado.
function appendBookingToSheet(type: string, data: BookingData): string {
  const token = Utilities.getUuid();
  const start = new Date(data.timeslot);

  // fecha/hora se guardan en zona horaria del negocio (Costa Rica), igual que los
  // eventos de Calendar, para que Dani/instructora vean todo consistente en el Sheet.
  // La hora local del cliente queda registrada aparte en zona_horaria_cliente.
  const fecha = Utilities.formatDate(start, TIME_ZONE, "yyyy-MM-dd");
  const hora = Utilities.formatDate(start, TIME_ZONE, "HH:mm");
  const timestamp = Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd HH:mm:ss");

  if (type === "pilates") {
    // Lock de script: sin esto, dos inscripciones simultáneas podrían leer el mismo
    // conteo de "inscritos" y ambas pasar la validación de cupo, superando el máximo.
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const cuposSheet = getSheet("Cupos_Pilates");
      ensureCuposPilatesPlainTextFormat(cuposSheet);
      const cuposData = cuposSheet.getDataRange().getValues();

      let rowNumber = -1; // fila 1-based en el sheet (0 = no existe todavía)
      let inscritos = 0;
      let maxParticipantes = MAX_PILATES_PARTICIPANTS;

      for (let i = 1; i < cuposData.length; i++) {
        const rowFecha = normalizeSheetDateCell(cuposData[i][0], "yyyy-MM-dd");
        const rowHora = normalizeSheetDateCell(cuposData[i][1], "HH:mm");
        if (rowFecha === fecha && rowHora === hora) {
          rowNumber = i + 1;
          inscritos = Number(cuposData[i][2]) || 0;
          maxParticipantes = Number(cuposData[i][3]) || MAX_PILATES_PARTICIPANTS;
          break;
        }
      }

      if (inscritos >= maxParticipantes) {
        throw new Error("CLASE_LLENA");
      }

      if (rowNumber > 0) {
        cuposSheet.getRange(rowNumber, 3).setValue(inscritos + 1);
      } else {
        cuposSheet.appendRow([fecha, hora, 1, MAX_PILATES_PARTICIPANTS]);
      }

      getSheet("Pilates").appendRow([
        token,
        data.nombre,
        data.apellido,
        data.email,
        data.phone,
        data.cedula,
        data.birthdate,
        fecha,
        hora,
        data.clientTimezone,
        data.language,
        "Agendada",
        timestamp,
        false, // recordatorio_enviado
        "",    // show_no_show
      ]);
    } finally {
      lock.releaseLock();
    }
  } else {
    getSheet("Nutrición").appendRow([
      token,
      data.nombre,
      data.apellido,
      data.email,
      data.phone,
      data.cedula,
      data.birthdate,
      type,
      fecha,
      hora,
      data.clientTimezone,
      data.modalidad,
      data.language,
      "",    // meet_link (se genera en US-10, fuera de scope de US-05)
      "Agendada",
      timestamp,
      false, // recordatorio_enviado
      "",    // show_no_show
      0,     // cancelaciones_tardias
      false, // requiere_pago
    ]);
  }

  return token;
}

function bookTimeslot(
  type: string,
  timeslot: string,
  nombre: string,
  apellido: string,
  email: string,
  phone: string,
  cedula: string,
  birthdate: string,
  language: string,
  modalidad: string,
  clientTimezone: string
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
    // Pilates es una clase grupal: varios clientes comparten el mismo slot a propósito,
    // así que el conflict-check de Freebusy (pensado para citas 1-a-1) no aplica aquí.
    // Para pilates, la única fuente de verdad de disponibilidad es el cupo en
    // Cupos_Pilates, validado con lock dentro de appendBookingToSheet.
    if (type !== "pilates") {
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
    }

    CalendarApp.getCalendarById(calendarId).createEvent(
      `Appointment with ${nombre} ${apellido}`,
      startTime,
      endTime,
      {
        description: `Phone: ${phone}\nID: ${cedula}\nDate of birth: ${birthdate}\nLanguage: ${language}\nModality: ${modalidad}`,
        guests: email,
        sendInvites: true,
        status: "confirmed",
      }
    );
  } catch (e) {
    const error = e as Error;
    throw new Error(`Failed to create event: ${error.message}`);
  }

  // Escritura en Sheet separada del try/catch de Calendar de arriba, para que errores
  // propios de esta etapa (p. ej. CLASE_LLENA) no queden envueltos como error de Calendar.
  return appendBookingToSheet(type, {
    timeslot,
    nombre,
    apellido,
    email,
    phone,
    cedula,
    birthdate,
    language,
    modalidad,
    clientTimezone,
  });
}
