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

// Calendario donde se crean los eventos de pilates (US-10 — auditoría confirmó que ANTES no
// existía ninguna separación real: bookTimeslot usaba CALENDARS[0] tanto para nutrición como
// para pilates, pese a que CLAUDE.md sección 6/4 dice que la instructora tiene "Calendar y
// correo propios"). Se guarda en su propia Script Property ("PILATES_CALENDAR_ID") en vez de
// reutilizar CALENDARS, porque CALENDARS representa los calendarios de Dani que se consultan
// en el conflict-check de nutrición (fetchAvailability/bookNutricionCalendarEvent) — mezclarlos
// haría que el Freebusy de nutrición empiece a considerar (o el de pilates deje de considerar)
// el calendario equivocado.
//
// Testing: no existe todavía una cuenta/calendario real de instructora en el entorno de
// pruebas, así que se usa un calendario de prueba ("Pilates - Testing") creado dentro de la
// MISMA cuenta de testing por setupPilatesTestCalendar() (ver más abajo, ejecutar una sola vez
// desde el editor de Apps Script, igual que initializeSheets()/addClientesSheet()).
//
// Producción: reemplazar el valor de esta Script Property por el ID real del calendario de la
// instructora (Configuración de Google Calendar de su cuenta → "Integrar calendario" → "ID de
// calendario", algo como *****@group.calendar.google.com o su correo si usa el calendario
// principal de su cuenta). Como ambas cuentas están bajo el mismo dominio de Workspace, para
// que el script (ejecutado como Dani, ver appsscript.json "executeAs": "USER_DEPLOYING") pueda
// crear eventos ahí, la instructora debe compartir su calendario con la cuenta que despliega el
// script con permiso "Realizar cambios y administrar el uso compartido".
function getPilatesCalendarId(): string {
  const id = PropertiesService.getScriptProperties().getProperty("PILATES_CALENDAR_ID");
  if (!id) {
    throw new Error(
      "PILATES_CALENDAR_ID no configurado en Script Properties. En testing, ejecutar " +
      "setupPilatesTestCalendar() una vez desde el editor de Apps Script. En producción, " +
      "guardar ahí manualmente el ID real del calendario de la instructora."
    );
  }
  return id;
}

// Crea un calendario de PRUEBA ("Pilates - Testing") dentro de la cuenta de testing y guarda
// su ID en Script Properties bajo "PILATES_CALENDAR_ID", únicamente para poder separar los
// eventos de pilates de los de nutrición durante Sprint 1-3 sin depender de una cuenta real de
// instructora (que no existe en testing). Idempotente: si la propiedad ya existe, no crea un
// calendario duplicado ni lo sobreescribe.
//
// ⚠️ NO ejecutar esto en producción. Ahí la instructora ya tiene su propia cuenta/calendario de
// Google Workspace real: en su lugar, guardar manualmente el ID de ESE calendario en Script
// Properties ("PILATES_CALENDAR_ID") desde el editor de Apps Script (⚙️ Configuración del
// proyecto → Propiedades del script), y no usar el calendario "Pilates - Testing" creado aquí.
// Ejecutar manualmente UNA SOLA VEZ desde el editor de Apps Script (testing), igual que
// initializeSheets()/addClientesSheet().
function setupPilatesTestCalendar(): void {
  const scriptProperties = PropertiesService.getScriptProperties();
  const existingId = scriptProperties.getProperty("PILATES_CALENDAR_ID");
  if (existingId) {
    Logger.log(`PILATES_CALENDAR_ID ya configurado (${existingId}). No se hizo ningún cambio.`);
    return;
  }

  const calendar = CalendarApp.createCalendar("Pilates - Testing");
  scriptProperties.setProperty("PILATES_CALENDAR_ID", calendar.getId());
  Logger.log(`Calendario "Pilates - Testing" creado. ID: ${calendar.getId()}`);
}

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

// Pilates: único horario habilitado hoy es sábado (6) a las 10:00 AM (hora TIME_ZONE).
// Confirmado en Preguntas_Reunion_02-07-2026 (P16/P21) y minuta 02_07_26 — posibilidad de
// agregar más horarios en el futuro, pero hoy es solo este. No confundir con WORKDAYS/
// WORKHOURS (genéricos, compartidos con nutrición) — esta restricción aplica solo a pilates.
const PILATES_DAY_OF_WEEK = 6; // sábado
const PILATES_START_HOUR = 10;

// Ventana mínima de anticipación para agendar una cita: no se puede reservar un slot
// que empiece en menos de 48 horas desde el momento actual. Confirmada en la reunión
// del 2 jul 2026 (documento de preguntas, P3). Distinta de CANCELLATION_HOURS (24 hrs),
// que aplica a la política de cancelación/reagendamiento — ambas coexisten.
const MIN_BOOKING_HOURS = 48;

// Ventana mínima de anticipación específica de pilates (demo 17 jul, pedido de Dani):
// a diferencia de MIN_BOOKING_HOURS (48hrs, nutrición), pilates se puede reservar con
// solo 12 horas de anticipación. Mismo patrón que PILATES_DAY_OF_WEEK/PILATES_START_HOUR
// arriba — restricción específica de type === "pilates", nunca reemplaza la constante
// global de nutrición. Aplicada en fetchAvailability(), bookTimeslot() y rescheduleBooking()
// (validación del NUEVO horario).
const PILATES_MIN_BOOKING_HOURS = 12;

// Ventana mínima de anticipación para reagendar/cancelar una cita YA existente sin
// penalización: si faltan menos de CANCELLATION_HOURS horas para la cita ACTUAL, la
// acción se bloquea (o se permite con penalización, según el flujo) y cuenta como
// "cancelación tardía" para el tracker por cliente (US-06, ver rondas 4-5 del prompt).
// Distinta de MIN_BOOKING_HOURS, que aplica al NUEVO horario al agendar/reagendar.
const CANCELLATION_HOURS = 24;

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

  // Ventana mínima de anticipación (US-09): un slot que empiece a MIN_BOOKING_HOURS
  // horas exactas desde este momento NO debe quedar disponible; solo slots que
  // empiecen estrictamente después de ese umbral. Se calcula desde la hora real
  // actual (no desde nearestTimeslot, que ya viene redondeada hacia abajo).
  // Pilates usa su propia ventana, más corta (PILATES_MIN_BOOKING_HOURS, ver constante) —
  // nutrición sigue en MIN_BOOKING_HOURS sin cambios.
  const minBookingHours = type === "pilates" ? PILATES_MIN_BOOKING_HOURS : MIN_BOOKING_HOURS;
  const minBookingTime = new Date(
    new Date().getTime() + minBookingHours * 60 * 60 * 1000
  );

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

    if (start.getTime() <= minBookingTime.getTime()) continue;

    const startTZ = new Date(
      Utilities.formatDate(start, TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss")
    );
    if (startTZ.getHours() < WORKHOURS.start) continue;
    if (startTZ.getHours() >= WORKHOURS.end) continue;
    if (WORKDAYS.indexOf(startTZ.getDay()) < 0) continue;

    if (type === "pilates") {
      if (startTZ.getDay() !== PILATES_DAY_OF_WEEK) continue;
      if (startTZ.getHours() !== PILATES_START_HOUR || startTZ.getMinutes() !== 0) continue;

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
    "token", "nombre", "apellido", "correo", "telefono", "tipo_id", "numero_id", "fecha_nacimiento",
    "tipo_cita", "fecha", "hora", "zona_horaria_cliente", "modalidad", "idioma",
    "meet_link", "estado", "fecha_creacion", "recordatorio_enviado", "show_no_show",
    "cancelaciones_tardias", "requiere_pago", "event_id",
  ],
  "Pilates": [
    "token", "nombre", "apellido", "correo", "telefono", "tipo_id", "numero_id", "fecha_nacimiento",
    "fecha_clase", "hora_clase", "zona_horaria_cliente", "idioma",
    "estado", "fecha_inscripcion", "recordatorio_enviado", "show_no_show",
  ],
  // event_id/meet_link agregadas en US-10 (ver addEventIdColumnToCuposPilates) — columnas E y F.
  // No forman parte del spreadsheet creado por initializeSheets() (ya ejecutada, nota 11);
  // se agregan al spreadsheet existente igual que "Clientes" en addClientesSheet().
  "Cupos_Pilates": [
    "fecha_clase", "hora_clase", "inscritos", "max_participantes", "event_id", "meet_link",
  ],
};

// Schema de la pestaña "Clientes" (US-27) — no forma parte de SHEET_SCHEMAS/initializeSheets
// a propósito: initializeSheets() ya fue ejecutada en testing y NO debe volver a ejecutarse
// (crearía un spreadsheet duplicado, ver CLAUDE.md nota #11). La pestaña Clientes se agrega
// por separado con addClientesSheet() al spreadsheet ya existente.
// cancelaciones_tardias/requiere_pago (columnas 8/9) agregadas en US-06: son la fuente de
// verdad de la política de "2 cancelaciones/reagendamientos tardíos consecutivos → requiere
// pago" (CLAUDE.md sección 3), acumulada POR CLIENTE (correo) y no por cita individual —
// a diferencia de las columnas del mismo nombre que ya existían en Nutrición/Pilates, que
// son por-cita y se dejan solo como log informativo (ver notifyLateCancellation/
// incrementClientLateCancellation más abajo).
const CLIENTES_SCHEMA: string[] = [
  "correo", "nombre", "apellido", "telefono", "tipo_id", "numero_id", "fecha_nacimiento", "idioma",
  "cancelaciones_tardias", "requiere_pago",
];

const CLIENTES_CANCELACIONES_COL = 9;
const CLIENTES_REQUIERE_PAGO_COL = 10;

// Columnas (1-based) agregadas al FINAL de "Clientes" en la modificación acordada tras
// US-18 (sin número de US, ver CLAUDE.md sección 3): checkboxes reales que marcan a qué
// servicio(s) pertenece cada cliente. Un cliente puede pertenecer a ambos — se acumulan
// con OR, nunca se reemplazan (ver upsertClient más abajo).
const CLIENTES_NUTRICION_COL = 11;
const CLIENTES_PILATES_COL = 12;

// Columna (1-based) de "fecha_nacimiento" en "Clientes" — Sheets autodetecta el string
// "yyyy-MM-dd" escrito por upsertClient y lo autoconvierte a un objeto Date real (mismo
// fenómeno documentado en la nota técnica #16 para fecha_clase/hora_clase de
// Cupos_Pilates). Se guarda esta posición aparte para poder forzar setNumberFormat("@")
// después de escribir, y para que fixFechaNacimientoFormatInClientes()/
// cleanupCorruptedClientesSheet() la usen sin repetir el número mágico.
const CLIENTES_FECHA_NACIMIENTO_COL = 7;

// Agrega las columnas "cancelaciones_tardias" y "requiere_pago" (US-06) a la pestaña
// "Clientes" YA existente (creada por addClientesSheet en US-27), sin volver a ejecutar
// initializeSheets() ni addClientesSheet() (nota 11 del CLAUDE.md). No-op seguro si ya
// existen. Ejecutar manualmente una sola vez desde el editor de Apps Script.
function addCancelacionesColumnsToClientes(): void {
  const sheet = getSheet("Clientes");
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);

  if (headers.indexOf("cancelaciones_tardias") >= 0 && headers.indexOf("requiere_pago") >= 0) {
    Logger.log('Las columnas "cancelaciones_tardias"/"requiere_pago" ya existen en Clientes. No se hizo ningún cambio.');
    return;
  }

  sheet.getRange(1, CLIENTES_CANCELACIONES_COL).setValue("cancelaciones_tardias").setFontWeight("bold");
  sheet.getRange(1, CLIENTES_REQUIERE_PAGO_COL).setValue("requiere_pago").setFontWeight("bold");
  Logger.log('Columnas "cancelaciones_tardias" y "requiere_pago" agregadas a Clientes.');
}

// Agrega las columnas "cliente_nutricion" y "cliente_pilates" (checkbox real de Sheets) al
// FINAL de la pestaña "Clientes" YA existente — modificación acordada tras US-18, sin número
// de US (CLAUDE.md sección 3). Idempotente por POSICIÓN de columna, nunca por comparación de
// texto de encabezado (nota técnica #28 del CLAUDE.md — no repetir el bug de US-18 con
// encabezados que pueden tener inconsistencias invisibles). No-op seguro si ya existen.
// Filas existentes quedan sin marcar (FALSE) por defecto: no hay forma de inferir
// retroactivamente a qué servicio pertenecían sin cruzar contra Nutrición/Pilates, aceptable
// para datos de testing. Ejecutar manualmente una sola vez desde el editor de Apps Script.
function addServicioColumnsToClientes(): void {
  const sheet = getSheet("Clientes");
  const existingHeader = String(sheet.getRange(1, CLIENTES_NUTRICION_COL).getValue());

  if (existingHeader === "cliente_nutricion") {
    Logger.log('Las columnas "cliente_nutricion"/"cliente_pilates" ya existen en Clientes. No se hizo ningún cambio.');
    return;
  }

  sheet.getRange(1, CLIENTES_NUTRICION_COL).setValue("cliente_nutricion").setFontWeight("bold");
  sheet.getRange(1, CLIENTES_PILATES_COL).setValue("cliente_pilates").setFontWeight("bold");

  // Checkbox real (no texto "TRUE"/"FALSE") — SOLO en las filas con datos reales
  // (sheet.getLastRow(), no sheet.getMaxRows()). Bug real encontrado en testing (ver
  // CLAUDE.md): usar getMaxRows() aquí formateaba ~1000 filas vacías con un FALSE
  // explícito en estas columnas, lo que inflaba el "último dato" de la hoja y rompía
  // appendRow() en upsertClient (las filas nuevas se escribían fuera del área visible).
  // Si getLastRow() es 1 (solo encabezado, sin clientes todavía), no hay nada que
  // formatear aquí — upsertClient aplica el checkbox fila por fila al insertar.
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const numDataRows = lastRow - 1;
    sheet.getRange(2, CLIENTES_NUTRICION_COL, numDataRows, 1).insertCheckboxes();
    sheet.getRange(2, CLIENTES_PILATES_COL, numDataRows, 1).insertCheckboxes();
  }

  Logger.log('Columnas "cliente_nutricion" y "cliente_pilates" (checkbox) agregadas a Clientes.');
}

// FUNCIÓN DE UN SOLO USO — limpieza de datos corrompidos por el bug real documentado en
// CLAUDE.md: la primera versión de addServicioColumnsToClientes() formateó checkboxes en
// ~1000 filas de "Clientes" (sheet.getMaxRows() en vez de getLastRow()), lo que dejó un
// valor FALSE "fantasma" en columnas K/L muy por debajo de los datos reales. Con eso, la
// primera versión de upsertClient() (basada en appendRow()/getLastRow()) escribió clientes
// nuevos posteriores muy por debajo del área visible, en vez de justo después de los datos
// reales — filas "perdidas" tipo test9/test10.
//
// Esta función:
//   1. Escanea TODA la columna A de "Clientes" hasta sheet.getMaxRows() real.
//   2. Encuentra el bloque de datos reales y CONTIGUOS desde la fila 2 (sin ningún hueco
//      de columna A vacía) — todo lo que tenga correo no vacío MÁS ABAJO de ese bloque se
//      considera una fila "perdida".
//   3. Loguea cada fila perdida (número de fila, correo, todos sus valores) ANTES de
//      tocar nada, para que se pueda confirmar visualmente contra el Sheet real.
//   4. Mueve cada fila perdida a la siguiente fila libre contigua tras el bloque de datos
//      reales (incluye copiar los checkboxes de cliente_nutricion/cliente_pilates).
//   5. Borra contenido, formato y validación de datos (los checkboxes fantasma) de TODAS
//      las filas sobrantes por debajo del nuevo último dato real, para que getLastRow()
//      vuelva a reflejar la realidad.
//   6. Loguea un resumen final: cuántas filas se recuperaron y el rango que se borró.
//
// NO se ejecuta automáticamente en ningún flujo — correr manualmente UNA SOLA VEZ desde el
// editor de Apps Script, revisar el log línea por línea, y confirmar visualmente en el
// Sheet real antes de dar la limpieza por completa.
function cleanupCorruptedClientesSheet(): void {
  const sheet = getSheet("Clientes");
  const maxRows = sheet.getMaxRows();
  const lastCol = Math.max(sheet.getLastColumn(), CLIENTES_PILATES_COL);
  const numRowsToScan = Math.max(maxRows - 1, 1);
  const allValues = sheet.getRange(2, 1, numRowsToScan, lastCol).getValues();

  // Paso 1: tamaño del bloque de datos reales y contiguos, empezando en la fila 2.
  let contiguousEnd = 0; // cantidad de filas contiguas con columna A no vacía
  while (
    contiguousEnd < allValues.length &&
    String(allValues[contiguousEnd][0]).trim() !== ""
  ) {
    contiguousEnd++;
  }

  // Paso 2: cualquier fila con correo no vacío MÁS ABAJO del bloque contiguo es "perdida".
  const lostRows: { rowNumber: number; values: unknown[] }[] = [];
  for (let i = contiguousEnd; i < allValues.length; i++) {
    const correo = String(allValues[i][0]).trim();
    if (correo !== "") {
      lostRows.push({ rowNumber: i + 2, values: allValues[i] });
    }
  }

  if (lostRows.length === 0) {
    Logger.log(
      `cleanupCorruptedClientesSheet: no se encontraron filas "perdidas" más allá de la ` +
      `fila ${contiguousEnd + 1} (último dato real contiguo). No se hizo ningún cambio.`
    );
    return;
  }

  Logger.log(`cleanupCorruptedClientesSheet: ${lostRows.length} fila(s) "perdida(s)" encontrada(s):`);
  lostRows.forEach((lost) => {
    Logger.log(`  Fila ${lost.rowNumber}: ${JSON.stringify(lost.values)}`);
  });

  // Paso 3: mover cada fila perdida a la siguiente fila libre contigua tras los datos
  // reales (fila 1-based = contiguousEnd + 2).
  let nextFreeRow = contiguousEnd + 2;
  const movedSummary: string[] = [];
  lostRows.forEach((lost) => {
    // fecha_nacimiento: si la celda original quedó guardada como objeto Date real (bug
    // documentado, nota técnica #16), se reconstruye el string yyyy-MM-dd a partir de los
    // componentes REALES del objeto Date — nunca desde un string ya reinterpretado, que
    // puede estar corrido un día (caso real: test11). A propósito se usa "UTC", NUNCA
    // TIME_ZONE ("America/Costa_Rica"): una fecha de nacimiento no tiene componente de
    // hora real, se guarda como medianoche UTC — formatearla en hora de Costa Rica
    // (UTC-6) corre el día hacia atrás (bug real encontrado en testing: 2023-02-07 se
    // reconstruía como 2023-02-06). TIME_ZONE sigue siendo correcto para fecha/hora de
    // CITAS (sí dependen de dónde está Dani) — este caso es distinto a propósito.
    const fechaNacimientoRaw = lost.values[CLIENTES_FECHA_NACIMIENTO_COL - 1];
    const fechaNacimientoNormalizada =
      fechaNacimientoRaw instanceof Date
        ? Utilities.formatDate(fechaNacimientoRaw, "UTC", "yyyy-MM-dd")
        : fechaNacimientoRaw;
    lost.values[CLIENTES_FECHA_NACIMIENTO_COL - 1] = fechaNacimientoNormalizada;

    // setNumberFormat("@") ANTES de setValues(), no después — mismo criterio que en
    // upsertClient: forzar texto plano después de escribir no revierte el tipo Date que
    // Sheets ya asignó al valor en el momento del write.
    sheet.getRange(nextFreeRow, CLIENTES_FECHA_NACIMIENTO_COL).setNumberFormat("@");
    sheet.getRange(nextFreeRow, 1, 1, lastCol).setValues([lost.values]);
    // insertCheckboxes() antes de reescribir el valor: si la celda destino nunca tuvo
    // formato de checkbox, setValues() por sí solo no lo aplica.
    sheet.getRange(nextFreeRow, CLIENTES_NUTRICION_COL, 1, 2).insertCheckboxes();
    sheet.getRange(nextFreeRow, CLIENTES_NUTRICION_COL, 1, 2).setValues([[
      lost.values[CLIENTES_NUTRICION_COL - 1],
      lost.values[CLIENTES_PILATES_COL - 1],
    ]]);
    movedSummary.push(
      `Fila ${lost.rowNumber} -> Fila ${nextFreeRow} (correo: ${lost.values[0]}, ` +
      `fecha_nacimiento: ${fechaNacimientoNormalizada})`
    );
    nextFreeRow++;
  });

  // Paso 4: borrar contenido + formato + validación de datos (checkboxes fantasma) de todo
  // lo que sobra por debajo del nuevo último dato real — incluye tanto las posiciones
  // originales de las filas perdidas (ya copiadas arriba) como cualquier fila vacía con
  // checkbox residual.
  const newLastDataRow = nextFreeRow - 1;
  const firstExcessRow = newLastDataRow + 1;
  if (firstExcessRow <= maxRows) {
    const excessRange = sheet.getRange(firstExcessRow, 1, maxRows - firstExcessRow + 1, lastCol);
    excessRange.clearContent();
    excessRange.clearFormat();
    excessRange.clearDataValidations();
  }

  Logger.log("cleanupCorruptedClientesSheet: --- Resumen ---");
  Logger.log(`Filas recuperadas (movidas hacia arriba): ${lostRows.length}`);
  movedSummary.forEach((line) => Logger.log(`  ${line}`));
  Logger.log(`Nuevo último dato real: fila ${newLastDataRow}.`);
  Logger.log(`Filas borradas (contenido + formato + checkboxes fantasma): ${firstExcessRow} a ${maxRows}.`);
  Logger.log("Revisar visualmente el Sheet real antes de continuar.");
}

// FUNCIÓN DE UN SOLO USO — bulk-fix de fecha_nacimiento en "Clientes" (acotado a esta
// pestaña a propósito; fecha/fecha_clase de Nutrición/Pilates quedan pendientes aparte,
// fuera de este alcance). Corrige las filas YA existentes que quedaron con la celda de
// fecha_nacimiento guardada como objeto Date real de Sheets (en vez de texto plano) — el
// mismo fenómeno que upsertClient()/cleanupCorruptedClientesSheet() ya previenen para
// escrituras nuevas, pero que no arregla retroactivamente filas escritas antes del fix.
//
// Para cada fila con datos: si la celda de fecha_nacimiento es actualmente un objeto Date,
// reconstruye el string yyyy-MM-dd a partir de los componentes REALES del objeto Date
// (Utilities.formatDate en TIME_ZONE, nunca reinterpretando un string ya mostrado en
// pantalla — mismo criterio que cleanupCorruptedClientesSheet), fuerza
// setNumberFormat("@") ANTES de reescribir el valor, y loguea la fila corregida
// (antes/después). Si la celda ya es texto plano, no la toca — idempotente.
//
// NO se ejecuta automáticamente — correr manualmente UNA SOLA VEZ desde el editor de Apps
// Script y confirmar en el Sheet real que fecha_nacimiento ya no abre el selector de
// calendario al hacer doble clic.
function fixFechaNacimientoFormatInClientes(): void {
  const sheet = getSheet("Clientes");
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log("fixFechaNacimientoFormatInClientes: no hay filas de datos en Clientes. No se hizo ningún cambio.");
    return;
  }

  const numDataRows = lastRow - 1;
  const correoValues = sheet.getRange(2, 1, numDataRows, 1).getValues();
  const fechaNacimientoValues = sheet
    .getRange(2, CLIENTES_FECHA_NACIMIENTO_COL, numDataRows, 1)
    .getValues();

  let fixedCount = 0;
  for (let i = 0; i < numDataRows; i++) {
    const rowNumber = i + 2;
    const correo = String(correoValues[i][0]).trim();
    if (correo === "") continue; // fila vacía dentro del rango — no debería pasar, se ignora

    const rawValue = fechaNacimientoValues[i][0];
    if (!(rawValue instanceof Date)) continue; // ya es texto plano, idempotente

    const before = rawValue.toString();
    // "UTC", NUNCA TIME_ZONE — ver nota en cleanupCorruptedClientesSheet: una fecha de
    // nacimiento se guarda como medianoche UTC y no tiene componente de hora real;
    // formatearla en America/Costa_Rica (UTC-6) corre el día hacia atrás.
    const fixedValue = Utilities.formatDate(rawValue, "UTC", "yyyy-MM-dd");

    const cell = sheet.getRange(rowNumber, CLIENTES_FECHA_NACIMIENTO_COL);
    cell.setNumberFormat("@"); // ANTES de escribir, mismo criterio que en el resto del fix
    cell.setValue(fixedValue);

    Logger.log(
      `fixFechaNacimientoFormatInClientes: fila ${rowNumber} (correo: ${correo}) — ` +
      `antes: "${before}" -> después: "${fixedValue}"`
    );
    fixedCount++;
  }

  Logger.log(`fixFechaNacimientoFormatInClientes: ${fixedCount} fila(s) corregida(s) de ${numDataRows} escaneada(s).`);
}

// Marca en Script Properties para que correctOffByOneDayBirthdates() nunca vuelva a
// sumar un día por accidente si se ejecuta dos veces — ver la función más abajo.
const BIRTHDATE_OFFBYONE_FIX_FLAG = "BIRTHDATE_OFFBYONE_FIX_APPLIED_2026_07_17";

// FUNCIÓN DE UN SOLO USO — repara el daño causado por la primera versión de
// fixFechaNacimientoFormatInClientes() (bug real, mismo día): esa primera versión
// reconstruía fecha_nacimiento con Utilities.formatDate(rawValue, TIME_ZONE, "yyyy-MM-dd")
// en vez de "UTC". Como el objeto Date se guardaba como medianoche UTC, formatearlo en
// America/Costa_Rica (UTC-6) corrió el día hacia atrás en las 11 filas que esa función
// corrigió hoy (ej. test1: 2023-02-07 real -> se guardó como texto "2023-02-06",
// equivocado por exactamente 1 día).
//
// Esta función suma exactamente 1 día (en UTC puro, con Date.UTC — sin pasar por ninguna
// zona horaria de negocio) a CADA celda de fecha_nacimiento en "Clientes" que esté en
// formato texto YYYY-MM-DD. Loguea fila/correo/antes/después de cada corrección.
//
// SEGURA CONTRA DOBLE EJECUCIÓN: guarda una marca en Script Properties
// (BIRTHDATE_OFFBYONE_FIX_FLAG) al terminar. Si se vuelve a correr, se detiene de
// inmediato sin tocar ninguna celda y lo deja bien claro en el log — evita sumar un
// segundo día por accidente si alguien la ejecuta dos veces sin querer.
//
// NO se ejecuta automáticamente — correr manualmente UNA SOLA VEZ desde el editor de Apps
// Script y confirmar visualmente en el Sheet real que las fechas vuelven a coincidir
// EXACTAMENTE con los valores originales conocidos (ej. test1=2023-02-07,
// test4=2026-07-17, test6=2026-07-23).
function correctOffByOneDayBirthdates(): void {
  const scriptProperties = PropertiesService.getScriptProperties();
  if (scriptProperties.getProperty(BIRTHDATE_OFFBYONE_FIX_FLAG) === "true") {
    Logger.log(
      "correctOffByOneDayBirthdates: YA SE EJECUTÓ ANTES (marca guardada en Script " +
      "Properties) — es una función de UN SOLO USO. No se hizo ningún cambio. Si de " +
      "verdad hace falta correrla otra vez, borrar manualmente la Script Property " +
      `"${BIRTHDATE_OFFBYONE_FIX_FLAG}" primero, y SOLO después de confirmar visualmente ` +
      "en el Sheet real que las fechas siguen corridas un día — de lo contrario se sumaría " +
      "un segundo día por error."
    );
    return;
  }

  const sheet = getSheet("Clientes");
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log("correctOffByOneDayBirthdates: no hay filas de datos en Clientes. No se hizo ningún cambio.");
    return;
  }

  const numDataRows = lastRow - 1;
  const correoValues = sheet.getRange(2, 1, numDataRows, 1).getValues();
  const fechaNacimientoValues = sheet
    .getRange(2, CLIENTES_FECHA_NACIMIENTO_COL, numDataRows, 1)
    .getValues();

  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
  let fixedCount = 0;

  for (let i = 0; i < numDataRows; i++) {
    const rowNumber = i + 2;
    const correo = String(correoValues[i][0]).trim();
    if (correo === "") continue;

    const before = String(fechaNacimientoValues[i][0]).trim();
    if (!isoDatePattern.test(before)) {
      Logger.log(
        `correctOffByOneDayBirthdates: fila ${rowNumber} (correo: ${correo}) — valor ` +
        `"${before}" no tiene formato YYYY-MM-DD (¿objeto Date sin convertir todavía?), se ignora.`
      );
      continue;
    }

    const [year, month, day] = before.split("-").map(Number);
    // Suma exactamente 1 día en UTC puro (Date.UTC + 24hrs en ms) — sin pasar por
    // TIME_ZONE ni por ninguna zona horaria de negocio, mismo criterio que la causa raíz.
    const corrected = new Date(Date.UTC(year, month - 1, day) + 24 * 60 * 60 * 1000);
    const after = Utilities.formatDate(corrected, "UTC", "yyyy-MM-dd");

    const cell = sheet.getRange(rowNumber, CLIENTES_FECHA_NACIMIENTO_COL);
    cell.setNumberFormat("@");
    cell.setValue(after);

    Logger.log(
      `correctOffByOneDayBirthdates: fila ${rowNumber} (correo: ${correo}) — ` +
      `antes: "${before}" -> después: "${after}"`
    );
    fixedCount++;
  }

  scriptProperties.setProperty(BIRTHDATE_OFFBYONE_FIX_FLAG, "true");
  Logger.log(
    `correctOffByOneDayBirthdates: ${fixedCount} fila(s) corregida(s) de ${numDataRows} ` +
    `escaneada(s). Marca de un-solo-uso guardada en Script Properties — no se volverá a ` +
    `ejecutar salvo que se borre manualmente la propiedad "${BIRTHDATE_OFFBYONE_FIX_FLAG}".`
  );
}

// Posición (1-based) de la columna "cedula" en cada pestaña, según el schema QUE EL SHEET
// REAL tiene hoy (antes de esta migración) — la misma posición que appendBookingToSheet/
// findClientByEmail/upsertClient ya leen y escriben en producción. A propósito NO se busca
// por el texto del encabezado: se confirmó en testing real que los encabezados de fila 1 de
// Nutrición/Pilates no coinciden exactamente con el string interno "cedula" (probablemente
// reescritos a mano en algún punto — ver CLAUDE.md sección 8, que ya advertía sobre headers
// desactualizados visualmente), lo que hacía fallar un indexOf("cedula") case/accent-sensitive
// silenciosamente en esas dos pestañas aunque "Clientes" (headers escritos 100% por código,
// nunca editados a mano) sí funcionaba.
const CEDULA_COLUMN_BY_SHEET: Record<string, number> = {
  "Nutrición": 6,
  "Pilates": 6,
  "Clientes": 5,
};

// US-18 — reemplaza la columna "cedula" por "tipo_id" + "numero_id" en las 3 pestañas
// (Nutrición, Pilates, Clientes), en la misma posición donde estaba cedula. Solo toca los
// ENCABEZADOS (fila 1) e inserta una columna nueva — el usuario borra manualmente las filas
// de datos existentes antes de correr esto (ver CLAUDE.md, no se escribió lógica de migración
// de datos). Cada pestaña se evalúa de forma independiente (no todo-o-nada): si una ya está
// migrada no se toca, aunque otra todavía la necesite. Ejecutar manualmente una sola vez desde
// el editor de Apps Script, igual que addCancelacionesColumnsToClientes().
function migrateCedulaToTipoNumeroId(): void {
  Object.keys(CEDULA_COLUMN_BY_SHEET).forEach((sheetName) => {
    const sheet = getSheet(sheetName);
    const cedulaCol = CEDULA_COLUMN_BY_SHEET[sheetName];
    const currentHeader = String(sheet.getRange(1, cedulaCol).getValue());

    // Idempotencia por posición, no por texto de "cedula": si la columna en esa posición
    // exacta YA dice "tipo_id" (valor que esta misma función escribe, controlado), esta
    // pestaña ya fue migrada — no volver a insertar una segunda "numero_id" ahí.
    if (currentHeader === "tipo_id") {
      Logger.log(`"${sheetName}": la columna ${cedulaCol} ya es "tipo_id". No se hizo ningún cambio.`);
      return;
    }

    sheet.insertColumnAfter(cedulaCol);
    sheet.getRange(1, cedulaCol).setValue("tipo_id").setFontWeight("bold");
    sheet.getRange(1, cedulaCol + 1).setValue("numero_id").setFontWeight("bold");
    Logger.log(`"${sheetName}": columna ${cedulaCol} (encabezado anterior: "${currentHeader}") renombrada a "tipo_id"; columna "numero_id" insertada después.`);
  });
}

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

// Columna (1-based) donde bookPilatesCalendarEvent guarda el eventId del ÚNICO evento
// de Calendar compartido por todos los inscritos de un mismo slot de pilates (US-10, fix
// de la nota 13 del CLAUDE.md). meet_link comparte el mismo evento, por eso también se
// guarda a nivel de slot y no por inscripción individual.
const CUPOS_PILATES_EVENT_ID_COL = 5;
const CUPOS_PILATES_MEET_LINK_COL = 6;

// Columnas (1-based) de la pestaña "Nutrición" usadas por cancelBooking/rescheduleBooking
// (US-06) para localizar y mover/eliminar el evento de Calendar real de una cita, y para
// escribir el nuevo estado/fecha/hora. Coinciden con SHEET_SCHEMAS["Nutrición"] arriba.
const NUTRICION_FECHA_COL = 10;
const NUTRICION_HORA_COL = 11;
const NUTRICION_ZONA_HORARIA_COL = 12;
const NUTRICION_MEET_LINK_COL = 15;
const NUTRICION_ESTADO_COL = 16;
const NUTRICION_EVENT_ID_COL = 22;

// Columnas (1-based) equivalentes para "Pilates".
const PILATES_FECHA_COL = 9;
const PILATES_HORA_COL = 10;
const PILATES_ZONA_HORARIA_COL = 11;
const PILATES_ESTADO_COL = 13;

// Agrega la columna "event_id" (US-06) a la pestaña "Nutrición" YA existente, sin volver a
// ejecutar initializeSheets() (nota 11). Necesaria para que cancelBooking/rescheduleBooking
// puedan localizar el evento real de Calendar de una cita de nutrición — antes de US-06 solo
// se guardaba meet_link, insuficiente para mover o eliminar el evento (una cita presencial,
// sin Meet, no tenía NINGÚN identificador de Calendar guardado). No-op seguro si ya existe.
// Ejecutar manualmente una sola vez desde el editor de Apps Script, igual que
// addEventIdColumnToCuposPilates()/addCancelacionesColumnsToClientes().
function addEventIdColumnToNutricion(): void {
  const sheet = getSheet("Nutrición");
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);

  if (headers.indexOf("event_id") >= 0) {
    Logger.log('La columna "event_id" ya existe en Nutrición. No se hizo ningún cambio.');
    return;
  }

  sheet.getRange(1, NUTRICION_EVENT_ID_COL).setValue("event_id").setFontWeight("bold");
  Logger.log('Columna "event_id" agregada a Nutrición.');
}

// Agrega las columnas "event_id" y "meet_link" (US-10) a la pestaña "Cupos_Pilates" YA
// existente, sin volver a ejecutar initializeSheets() (nota 11). No-op seguro si ya existen.
// Ejecutar manualmente una sola vez desde el editor de Apps Script, igual que addClientesSheet().
function addEventIdColumnToCuposPilates(): void {
  const sheet = getSheet("Cupos_Pilates");
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);

  if (headers.indexOf("event_id") >= 0 && headers.indexOf("meet_link") >= 0) {
    Logger.log('Las columnas "event_id"/"meet_link" ya existen en Cupos_Pilates. No se hizo ningún cambio.');
    return;
  }

  sheet.getRange(1, CUPOS_PILATES_EVENT_ID_COL).setValue("event_id").setFontWeight("bold");
  sheet.getRange(1, CUPOS_PILATES_MEET_LINK_COL).setValue("meet_link").setFontWeight("bold");

  Logger.log('Columnas "event_id" y "meet_link" agregadas a Cupos_Pilates.');
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

// Valores internos fijos del tipo de identificación (US-18) — nunca el texto traducido que
// ve el cliente en el dropdown (ver STRINGS del frontend); mismo criterio que "idioma"
// ("es"/"en" internamente, no "Español"/"Spanish").
const VALID_TIPO_ID_VALUES = ["cedula", "pasaporte", "licencia", "otro"] as const;
type TipoId = (typeof VALID_TIPO_ID_VALUES)[number];

// Valida que tipoId sea uno de los 4 valores internos fijos. El frontend solo debería enviar
// estos 4 (dropdown cerrado), pero el backend no confía ciegamente en el cliente.
function assertValidTipoId(tipoId: string): void {
  if (VALID_TIPO_ID_VALUES.indexOf(tipoId as TipoId) < 0) {
    throw new Error(`TIPO_ID_INVALIDO: "${tipoId}" no es un tipo de identificación válido.`);
  }
}

// Edad mínima para registrarse/agendar (US-29, pedido de Dani en el demo del 17 jul).
const MIN_AGE_YEARS = 15;

// Calcula la edad en años cumplidos a partir de dos strings "yyyy-MM-dd" — a propósito
// SOLO aritmética de año/mes/día como números, sin construir ningún objeto Date ni pasar
// por ninguna zona horaria (ver nota técnica #29 del CLAUDE.md: mezclar objetos Date con
// zonas horarias de negocio en fechas sin componente de hora real es la causa raíz de los
// corrimientos de ±1 día ya encontrados en este proyecto). Regla de borde exacta: alguien
// que cumple MIN_AGE_YEARS años exactamente HOY ya cumple (mes y día iguales no restan un
// año); alguien que los cumple mañana todavía no (día futuro sí resta un año).
function calculateAge(birthdateStr: string, todayStr: string): number {
  const [birthYear, birthMonth, birthDay] = birthdateStr.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = todayStr.split("-").map(Number);
  let age = todayYear - birthYear;
  if (todayMonth < birthMonth || (todayMonth === birthMonth && todayDay < birthDay)) {
    age--;
  }
  return age;
}

// Barrera real contra menores de MIN_AGE_YEARS años (US-29) — nunca confiar solo en el
// frontend. "Hoy" siempre se calcula en TIME_ZONE (hora del negocio), igual que el resto
// de fechas/horas de citas reales; fecha_nacimiento en sí se compara como texto plano
// yyyy-MM-dd, sin reinterpretarla como objeto Date (ver calculateAge).
function assertMinimumAge(birthdateStr: string): void {
  const todayStr = Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd");
  if (calculateAge(birthdateStr, todayStr) < MIN_AGE_YEARS) {
    throw new Error("EDAD_MINIMA_NO_CUMPLIDA");
  }
}

interface ClientRecord {
  correo: string;
  nombre: string;
  apellido: string;
  telefono: string;
  tipoId: string;
  numeroId: string;
  fecha_nacimiento: string;
  idioma: string;
  // Solo lectura desde findClientByEmail (US-06) — el tracker se escribe exclusivamente vía
  // incrementClientLateCancellation/resetClientLateCancellationCounter, nunca por upsertClient
  // (que solo escribe las 7 primeras columnas, ver nota en upsertClient más abajo).
  cancelaciones_tardias?: number;
  requiere_pago?: boolean;
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
        tipoId: String(data[i][4]),
        numeroId: String(data[i][5]),
        fecha_nacimiento: normalizeSheetDateCell(data[i][6], "yyyy-MM-dd"),
        idioma: String(data[i][7]),
        cancelaciones_tardias: Number(data[i][CLIENTES_CANCELACIONES_COL - 1]) || 0,
        requiere_pago: data[i][CLIENTES_REQUIERE_PAGO_COL - 1] === true,
      };
    }
  }
  return null;
}

// Consultado por Dani (o en el futuro por bookTimeslot, aunque hoy no hay integración de
// pagos — fuera de scope del proyecto, ver CLAUDE.md sección 2) para saber si un cliente
// está marcado con requiere_pago=true por 2+ cancelaciones/reagendamientos tardíos
// consecutivos. La fuente de verdad es SIEMPRE la pestaña "Clientes", no las columnas
// legacy por-cita de Nutrición/Pilates (ver nota en incrementClientLateCancellation).
function getClientPaymentStatus(correo: string): { cancelaciones_tardias: number; requiere_pago: boolean } {
  const client = findClientByEmail(correo);
  if (!client) return { cancelaciones_tardias: 0, requiere_pago: false };
  return {
    cancelaciones_tardias: client.cancelaciones_tardias || 0,
    requiere_pago: client.requiere_pago || false,
  };
}

// Incrementa en +1 el conteo de cancelaciones/reagendamientos tardíos (fuera de la ventana
// de CANCELLATION_HOURS) del cliente identificado por correo, en la pestaña "Clientes" — no
// en Nutrición/Pilates. Al llegar a 2, marca requiere_pago=true (CLAUDE.md sección 3: "tras
// 2 cancelaciones consecutivas... el cliente debe pagar para poder reagendar"). Decisión de
// diseño (US-06): el tracker se acumula POR CLIENTE, no por cita ni por tipo de cita — una
// cancelación tardía de un `initial` y luego de un `followup` de la MISMA persona cuentan
// como 2 consecutivas. Las columnas `cancelaciones_tardias`/`requiere_pago` que ya existían
// en Nutrición/Pilates (a nivel de fila individual) quedan sin usar para la regla de negocio;
// se dejan solo como posible log informativo de qué cita disparó cada incremento — no se
// escriben en esta función a propósito, para no tener dos fuentes de verdad divergentes.
function incrementClientLateCancellation(correo: string): { cancelaciones_tardias: number; requiere_pago: boolean } {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet("Clientes");
    const values = sheet.getDataRange().getValues();
    const target = correo.trim().toLowerCase();

    let rowNumber = -1;
    let current = 0;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).trim().toLowerCase() === target) {
        rowNumber = i + 1;
        current = Number(values[i][CLIENTES_CANCELACIONES_COL - 1]) || 0;
        break;
      }
    }

    const updated = current + 1;
    const requierePago = updated >= 2;

    if (rowNumber > 0) {
      sheet.getRange(rowNumber, CLIENTES_CANCELACIONES_COL).setValue(updated);
      sheet.getRange(rowNumber, CLIENTES_REQUIERE_PAGO_COL).setValue(requierePago);
    } else {
      // Failsafe defensivo: no debería pasar, ya que upsertClient corre antes de llegar al
      // calendario en el flujo de 3 pasos (US-27) y toda cita tiene un correo asociado.
      sheet.appendRow([correo, "", "", "", "", "", "", "", updated, requierePago]);
    }
    SpreadsheetApp.flush();
    return { cancelaciones_tardias: updated, requiere_pago: requierePago };
  } finally {
    lock.releaseLock();
  }
}

// Reinicia a 0 el conteo de tardías consecutivas de un cliente cuando cancela/reagenda
// DENTRO de la ventana de CANCELLATION_HOURS (rompe la racha de "consecutivas"). A propósito
// NO limpia requiere_pago: una vez marcado, la "lista negra interna" (CLAUDE.md sección 3) la
// gestiona Dani manualmente en el Sheet — este sistema no tiene integración de pagos que
// pueda confirmar que ya se pagó y por lo tanto no puede des-marcarlo automáticamente.
function resetClientLateCancellationCounter(correo: string): void {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet("Clientes");
    const values = sheet.getDataRange().getValues();
    const target = correo.trim().toLowerCase();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).trim().toLowerCase() === target) {
        sheet.getRange(i + 1, CLIENTES_CANCELACIONES_COL).setValue(0);
        SpreadsheetApp.flush();
        return;
      }
    }
  } finally {
    lock.releaseLock();
  }
}

// TODO (Sprint 2, RF-2.5): enviar la notificación real por correo a Dani y Ali cuando una
// cancelación o intento de reagendamiento cae fuera de la ventana de CANCELLATION_HOURS.
// Stub a propósito — las plantillas y el envío de correos completos son Sprint 2 (ver
// CLAUDE.md sección 9). Se deja el punto de llamada ya cableado en cancelBooking/
// rescheduleBooking para no tener que volver a tocar esa lógica cuando se implemente.
function notifyLateCancellation(correo: string, token: string, accion: "cancelacion" | "reagendamiento"): void {
  Logger.log(`TODO Sprint 2 (RF-2.5): notificar a Dani/Ali - ${accion} tardío de ${correo} (token ${token})`);
}

// Inserta o actualiza (upsert) la fila de un cliente en "Clientes", identificado por
// correo. Se ejecuta al terminar el Paso 2 del formulario (antes de mostrar el
// calendario), independientemente de si el cliente confirma la cita después.
// Usa LockService para evitar condiciones de carrera si el mismo correo hace dos
// reservas casi simultáneas (mismo criterio que el cupo de pilates en appendBookingToSheet).
// A propósito solo escribe las columnas 1-8 (datos personales) — nunca toca 9/10
// (cancelaciones_tardias/requiere_pago, US-06), que son responsabilidad exclusiva de
// incrementClientLateCancellation/resetClientLateCancellationCounter.
//
// `type` es el tipo de cita que dispara este upsert ("initial"/"followup"/"measurement"
// para nutrición, "pilates" para pilates — mismo criterio que bookTimeslot). Modificación
// acordada tras US-18 (CLAUDE.md sección 3): marca TRUE la columna cliente_nutricion o
// cliente_pilates correspondiente, con lógica de OR acumulativo — la columna que NO
// corresponde al tipo de cita actual NUNCA se toca, para no pisar un TRUE que ya tuviera
// por una cita anterior de otro tipo.
function upsertClient(data: ClientRecord, type: string): void {
  // Barrera de edad mínima (US-29) — PRIMERO, antes de cualquier lectura/escritura del
  // Sheet. Crítico: el flujo real (CalendarPicker.handleClientFormSubmit) llama primero a
  // upsertClient() y DESPUÉS a bookTimeslot(); si esta validación solo viviera en
  // bookTimeslot(), un menor de MIN_AGE_YEARS quedaría guardado en "Clientes" aunque la
  // cita se rechazara después.
  assertMinimumAge(data.fecha_nacimiento);
  assertValidTipoId(data.tipoId);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet("Clientes");

    // Lee SOLO la columna A (correo), fila por fila, hasta el límite físico de la hoja —
    // a propósito NO usa getDataRange()/getLastRow() para decidir dónde insertar (bug real
    // encontrado en testing, ver CLAUDE.md): si otra columna tiene contenido "fantasma" en
    // filas muy por debajo de los datos reales (p. ej. checkboxes formateados de más),
    // getLastRow() queda inflado y appendRow() escribe la fila nueva fuera del área
    // visible. Aquí se busca explícitamente la fila del cliente existente O, si no existe,
    // la primera fila con columna A vacía — ese es el único criterio de "dónde insertar".
    const maxRows = sheet.getMaxRows();
    const correoColumn = sheet.getRange(2, 1, Math.max(maxRows - 1, 1), 1).getValues();
    const target = data.correo.trim().toLowerCase();

    let rowNumber = -1; // fila 1-based en el sheet (-1 = no existe todavía)
    let firstEmptyRow = -1;
    for (let i = 0; i < correoColumn.length; i++) {
      const cellValue = String(correoColumn[i][0]).trim();
      if (cellValue.toLowerCase() === target) {
        rowNumber = i + 2; // +2: fila 1 es encabezado, i es 0-based desde la fila 2
        break;
      }
      if (cellValue === "" && firstEmptyRow === -1) {
        firstEmptyRow = i + 2;
      }
    }

    const row = [
      data.correo,
      data.nombre,
      data.apellido,
      data.telefono,
      data.tipoId,
      data.numeroId,
      data.fecha_nacimiento,
      data.idioma,
    ];

    if (rowNumber > 0) {
      // Formato de texto plano en fecha_nacimiento ANTES de escribir — no después: Sheets
      // autodetecta el string "yyyy-MM-dd" y lo convierte a un objeto Date real EN el
      // momento del setValues(); llamar setNumberFormat("@") después de escribir solo
      // cambiaría el formato de PANTALLA, no el tipo de valor ya guardado (mismo criterio
      // que ensureCuposPilatesPlainTextFormat, que también formatea antes de escribir).
      sheet.getRange(rowNumber, CLIENTES_FECHA_NACIMIENTO_COL).setNumberFormat("@");
      sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    } else {
      // Fallback defensivo (maxRows + 1) solo por si, en teoría, las ~maxRows-1 filas
      // escaneadas estuvieran TODAS ocupadas con un correo — no debería pasar en la
      // práctica, pero evita perder la escritura en ese caso límite.
      rowNumber = firstEmptyRow > 0 ? firstEmptyRow : maxRows + 1;
      sheet.getRange(rowNumber, CLIENTES_FECHA_NACIMIENTO_COL).setNumberFormat("@");
      sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
      // Checkbox real aplicado SOLO a esta fila específica, no a un rango grande — ver
      // el mismo bug documentado arriba en addServicioColumnsToClientes().
      sheet.getRange(rowNumber, CLIENTES_NUTRICION_COL, 1, 2).insertCheckboxes();
    }

    const servicioCol = type === "pilates" ? CLIENTES_PILATES_COL : CLIENTES_NUTRICION_COL;
    sheet.getRange(rowNumber, servicioCol).setValue(true);
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
  tipoId: string;
  numeroId: string;
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
        // event_id/meet_link (columnas E/F) se llenan después, en bookPilatesCalendarEvent,
        // cuando se crea el único evento de Calendar compartido por este slot (US-10).
        cuposSheet.appendRow([fecha, hora, 1, MAX_PILATES_PARTICIPANTS, "", ""]);
      }

      getSheet("Pilates").appendRow([
        token,
        data.nombre,
        data.apellido,
        data.email,
        data.phone,
        data.tipoId,
        data.numeroId,
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
      data.tipoId,
      data.numeroId,
      data.birthdate,
      type,
      fecha,
      hora,
      data.clientTimezone,
      data.modalidad,
      data.language,
      "",    // meet_link (se llena después en bookNutricionCalendarEvent si modalidad='virtual', US-10)
      "Agendada",
      timestamp,
      false, // recordatorio_enviado
      "",    // show_no_show
      0,     // cancelaciones_tardias
      false, // requiere_pago
    ]);
  }

  // Bug real encontrado en testing (deploy v13, US-10): la primera reserva de un slot de
  // pilates que nunca había tenido inscripciones fallaba con "Fila de Cupos_Pilates no
  // encontrada para este slot", aunque la fila SÍ se acababa de crear un par de líneas más
  // arriba. Causa raíz: desde FIX 1 (US-10), bookTimeslot ya no solo ESCRIBE en el Sheet — el
  // paso de Calendar que corre justo después (bookPilatesCalendarEvent/bookNutricionCalendarEvent)
  // vuelve a ABRIR el spreadsheet (getSheet -> SpreadsheetApp.openById) y LEE lo recién escrito
  // (para buscar la fila de Cupos_Pilates, o para localizar el token en Nutrición y guardar el
  // meet_link). Los cambios hechos con appendRow/setValue quedan pendientes de confirmarse
  // ("flush") en el backend de Sheets; sin un flush explícito, una lectura hecha a través de un
  // Spreadsheet recién reabierto en la MISMA ejecución puede no reflejar todavía esa escritura
  // — por eso slots ya existentes (escritos en una ejecución anterior, ya confirmada) nunca
  // fallaban, pero un slot nuevo, escrito y releído dentro de la misma llamada, sí. Antes de
  // US-10 esto no aplicaba: el único paso posterior a escribir el Sheet era devolver el token,
  // sin ninguna relectura. Forzamos el flush aquí, al final de la única función que escribe
  // Nutrición/Pilates/Cupos_Pilates, para que cualquier lectura posterior en la misma ejecución
  // (Calendar) vea el estado ya confirmado.
  SpreadsheetApp.flush();

  return token;
}

// Busca la fila (1-based) cuyo token (columna A) coincide, en cualquier pestaña de citas.
// Devuelve -1 si no se encuentra. Usada por markBookingRowError/updateNutricionMeetLink
// para localizar la fila recién escrita por appendBookingToSheet sin asumir que es la última
// (dos escrituras casi simultáneas podrían intercalarse).
function findRowByToken(sheet: GoogleAppsScript.Spreadsheet.Sheet, token: string): number {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const tokens = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < tokens.length; i++) {
    if (String(tokens[i][0]) === token) return i + 2;
  }
  return -1;
}

// Marca una fila de Nutrición/Pilates como 'Error_Calendar' cuando el Sheet se escribió
// exitosamente (FIX 1, US-10) pero el paso posterior de Calendar falló. Se elige actualizar
// el estado en vez de borrar la fila o el token ya generado: borrar arriesga desincronizar
// índices de otra escritura concurrente y pierde el registro/auditoría de qué pasó; dejar
// la fila como 'Agendada' sin evento real sería peor (una cita "fantasma" sin Calendar).
// Dani/Ali pueden ver 'Error_Calendar' en el Sheet y resolverlo manualmente.
function markBookingRowError(type: string, token: string): void {
  const sheetName = type === "pilates" ? "Pilates" : "Nutrición";
  const estadoCol = type === "pilates" ? 12 : 15;
  const sheet = getSheet(sheetName);
  const row = findRowByToken(sheet, token);
  if (row < 0) return;
  sheet.getRange(row, estadoCol).setValue("Error_Calendar");
}

// Escribe event_id (columna 21, US-06) y, si aplica, meet_link (columna 14) en la fila de
// Nutrición correspondiente al token, una vez que el evento de Calendar ya se creó
// exitosamente. event_id se guarda SIEMPRE (virtual o presencial) — es lo que
// cancelBooking/rescheduleBooking usan para localizar el evento real; antes de US-06 una
// cita presencial no guardaba ningún identificador de Calendar.
function updateNutricionCalendarInfo(token: string, eventId: string, meetLink: string): void {
  const sheet = getSheet("Nutrición");
  const row = findRowByToken(sheet, token);
  if (row < 0) return;
  sheet.getRange(row, NUTRICION_EVENT_ID_COL).setValue(eventId);
  if (meetLink) sheet.getRange(row, NUTRICION_MEET_LINK_COL).setValue(meetLink);
}

// Revierte el incremento de cupo hecho por appendBookingToSheet para un slot de pilates
// cuando el paso de Calendar posterior falla (FIX 1, US-10) — sin este rollback, un cupo
// fallido dejaría el contador de inscritos más alto que la cantidad de personas realmente
// agregadas al evento de Calendar, bloqueando injustamente el último cupo real disponible.
function rollbackPilatesCupo(fecha: string, hora: string): void {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cuposSheet = getSheet("Cupos_Pilates");
    const cuposData = cuposSheet.getDataRange().getValues();
    for (let i = 1; i < cuposData.length; i++) {
      const rowFecha = normalizeSheetDateCell(cuposData[i][0], "yyyy-MM-dd");
      const rowHora = normalizeSheetDateCell(cuposData[i][1], "HH:mm");
      if (rowFecha === fecha && rowHora === hora) {
        const inscritos = Number(cuposData[i][2]) || 0;
        cuposSheet.getRange(i + 1, 3).setValue(Math.max(inscritos - 1, 0));
        break;
      }
    }
  } finally {
    lock.releaseLock();
  }
}

// Crea un evento de Calendar vía el servicio avanzado (Calendar.Events.insert), en vez de
// CalendarApp, porque generar un link de Google Meet automático requiere conferenceData +
// conferenceDataVersion=1, que CalendarApp.createEvent no expone. wantsMeet=false crea el
// evento normal sin Meet (citas presenciales). Devuelve el eventId (usable directamente con
// Calendar.Events.get/patch — no es el iCalUID que usa CalendarApp.getEventById) y el link
// de Meet si se generó.
function createCalendarEventWithMeet(
  calendarId: string,
  summary: string,
  startTime: Date,
  endTime: Date,
  description: string,
  guestEmail: string,
  wantsMeet: boolean
): { eventId: string; meetLink: string } {
  const eventResource: GoogleAppsScript.Calendar.Schema.Event = {
    summary,
    description,
    start: { dateTime: startTime.toISOString(), timeZone: TIME_ZONE },
    end: { dateTime: endTime.toISOString(), timeZone: TIME_ZONE },
    attendees: [{ email: guestEmail }],
    status: "confirmed",
  };

  if (wantsMeet) {
    eventResource.conferenceData = {
      createRequest: {
        requestId: Utilities.getUuid(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  // sendUpdates: 'none' — decisión del 18 jul: el cliente NO debe recibir la invitación
  // nativa de Google Calendar (expone cédula/fecha de nacimiento de la descripción del
  // evento sin ningún diseño). El único correo que debe recibir el cliente al agendar es
  // el de confirmación propio (US-12). Para volver a activar la invitación nativa de
  // Google en el futuro, basta con cambiar este valor a 'all'.
  const created = Calendar.Events!.insert(eventResource, calendarId, {
    sendUpdates: "none",
    conferenceDataVersion: wantsMeet ? 1 : 0,
  });

  const meetLink = wantsMeet
    ? ((created.conferenceData && created.conferenceData.entryPoints) || [])
        .filter((ep) => ep.entryPointType === "video")
        .map((ep) => ep.uri || "")[0] || ""
    : "";

  return { eventId: created.id || "", meetLink };
}

// Crea el evento de Calendar para una cita de nutrición (initial/followup/measurement) y,
// si modalidad='virtual', genera Meet y guarda el link en la fila de Nutrición ya escrita
// por appendBookingToSheet. Se llama DESPUÉS de que el Sheet ya quedó escrito (FIX 1, US-10).
function bookNutricionCalendarEvent(
  type: string,
  token: string,
  startTime: Date,
  endTime: Date,
  nombre: string,
  apellido: string,
  email: string,
  phone: string,
  tipoId: string,
  numeroId: string,
  birthdate: string,
  language: string,
  modalidad: string
): { meetLink: string } {
  const calendarId = CALENDARS[0];
  const wantsMeet = modalidad === "virtual";
  const description = `Name: ${nombre} ${apellido}\nEmail: ${email}\nPhone: ${phone}\nID: ${tipoId} ${numeroId}\nDate of birth: ${birthdate}\nLanguage: ${language}\nAppointment type: ${type}\nModality: ${modalidad}`;

  // Lock de script (US-09): el conflict-check de Freebusy y la creación del evento deben
  // ser atómicos entre sí. Sin este lock, dos clientes confirmando el mismo slot casi al
  // mismo tiempo podrían pasar ambos el chequeo de Freebusy antes de que cualquiera de los
  // dos cree su evento, resultando en doble reserva.
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
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
      throw new Error("SLOT_NO_DISPONIBLE");
    }

    const { eventId, meetLink } = createCalendarEventWithMeet(
      calendarId,
      `Appointment with ${nombre} ${apellido}`,
      startTime,
      endTime,
      description,
      email,
      wantsMeet
    );

    updateNutricionCalendarInfo(token, eventId, wantsMeet ? meetLink : "");
    // Devuelve el meetLink al llamador (bookTimeslot) para el correo de confirmación
    // (US-12) — evita releer el Sheet solo para recuperar un valor que ya tenemos en mano.
    return { meetLink: wantsMeet ? meetLink : "" };
  } catch (e) {
    const error = e as Error;
    // SLOT_NO_DISPONIBLE debe llegar al frontend con su propio código, sin quedar
    // envuelto como error genérico de creación de Calendar.
    if (error.message === "SLOT_NO_DISPONIBLE") throw error;
    throw new Error(`Failed to create event: ${error.message}`);
  } finally {
    lock.releaseLock();
  }
}

// Crea o reutiliza el evento de Calendar compartido por todos los inscritos de un slot de
// pilates (FIX 2, US-10 — corrige la nota 13 del CLAUDE.md, donde antes cada inscripción
// creaba un evento duplicado). Primer inscrito del slot (event_id vacío en Cupos_Pilates):
// crea el evento con Meet (pilates siempre es virtual) y guarda eventId+meetLink en la fila
// de Cupos_Pilates. Siguientes inscritos: leen el eventId ya guardado y se agregan como
// invitado con Events.patch (equivalente a addGuest en el servicio avanzado). Usa el mismo
// LockService que protege el contador de cupos, para que dos inscripciones casi simultáneas
// al mismo slot vacío no terminen creando 2 eventos.
function bookPilatesCalendarEvent(
  startTime: Date,
  endTime: Date,
  nombre: string,
  apellido: string,
  email: string,
  phone: string,
  tipoId: string,
  numeroId: string,
  birthdate: string,
  language: string
): { meetLink: string } {
  // Calendario dedicado de la instructora (US-10, ver getPilatesCalendarId más arriba) — antes
  // este helper usaba CALENDARS[0], que es el/los calendario(s) de Dani; la auditoría confirmó
  // que esa separación nunca existió realmente pese a estar descrita en CLAUDE.md.
  const calendarId = getPilatesCalendarId();
  const fecha = Utilities.formatDate(startTime, TIME_ZONE, "yyyy-MM-dd");
  const hora = Utilities.formatDate(startTime, TIME_ZONE, "HH:mm");
  const description = `Name: ${nombre} ${apellido}\nEmail: ${email}\nPhone: ${phone}\nID: ${tipoId} ${numeroId}\nDate of birth: ${birthdate}\nLanguage: ${language}\nAppointment type: pilates\nModality: virtual`;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cuposSheet = getSheet("Cupos_Pilates");
    // Defensa adicional (nota 16): re-aplicar el formato de texto plano antes de leer, por si
    // la fila recién creada por appendBookingToSheet cayó fuera del rango cubierto la última
    // vez que se formateó (p. ej. si el sheet creció más allá de su tamaño anterior).
    ensureCuposPilatesPlainTextFormat(cuposSheet);
    const cuposData = cuposSheet.getDataRange().getValues();

    let rowNumber = -1;
    let eventId = "";
    let existingMeetLink = "";
    for (let i = 1; i < cuposData.length; i++) {
      const rowFecha = normalizeSheetDateCell(cuposData[i][0], "yyyy-MM-dd");
      const rowHora = normalizeSheetDateCell(cuposData[i][1], "HH:mm");
      if (rowFecha === fecha && rowHora === hora) {
        rowNumber = i + 1;
        eventId = String(cuposData[i][CUPOS_PILATES_EVENT_ID_COL - 1] || "");
        existingMeetLink = String(cuposData[i][CUPOS_PILATES_MEET_LINK_COL - 1] || "");
        break;
      }
    }

    if (rowNumber < 0) {
      // No debería pasar: appendBookingToSheet ya crea/actualiza esta fila antes de llegar
      // aquí. Failsafe defensivo por si el spreadsheet fue editado manualmente entre medio.
      throw new Error("Fila de Cupos_Pilates no encontrada para este slot.");
    }

    if (eventId) {
      const existingEvent = Calendar.Events!.get(calendarId, eventId);
      const attendees = (existingEvent.attendees || []).concat([{ email }]);
      // sendUpdates: 'none' — decisión del 18 jul: el cliente NO debe recibir la invitación
      // nativa de Google Calendar (expone cédula/fecha de nacimiento de la descripción del
      // evento sin ningún diseño). El único correo que debe recibir el cliente al agendar es
      // el de confirmación propio (US-12). Para volver a activar la invitación nativa de
      // Google en el futuro, basta con cambiar este valor a 'all'.
      Calendar.Events!.patch({ attendees }, calendarId, eventId, { sendUpdates: "none" });
      // Devuelve el meetLink ya existente (el evento compartido no cambia de link al sumar
      // un invitado más) para el correo de confirmación (US-12).
      return { meetLink: existingMeetLink };
    } else {
      const created = createCalendarEventWithMeet(
        calendarId,
        "Clase de Pilates",
        startTime,
        endTime,
        description,
        email,
        true // pilates siempre es virtual
      );
      cuposSheet.getRange(rowNumber, CUPOS_PILATES_EVENT_ID_COL).setValue(created.eventId);
      cuposSheet.getRange(rowNumber, CUPOS_PILATES_MEET_LINK_COL).setValue(created.meetLink);
      // Flush inmediato (mismo motivo que en appendBookingToSheet): sin esto, el event_id
      // recién guardado aquí queda pendiente de confirmarse. La SIGUIENTE inscripción a este
      // mismo slot vuelve a abrir Cupos_Pilates desde appendBookingToSheet, no vería este
      // event_id (por seguir sin confirmar) y, al escribir su propio incremento de "inscritos"
      // y hacer SU flush, sobreescribiría la fila entera sin el event_id — perdiéndolo para
      // siempre y causando que cada inscripción cree su propio evento de Calendar duplicado
      // (justo el bug que este fix busca evitar).
      SpreadsheetApp.flush();
      return { meetLink: created.meetLink };
    }
  } catch (e) {
    const error = e as Error;
    throw new Error(`Failed to create event: ${error.message}`);
  } finally {
    lock.releaseLock();
  }
}

function bookTimeslot(
  type: string,
  timeslot: string,
  nombre: string,
  apellido: string,
  email: string,
  phone: string,
  tipoId: string,
  numeroId: string,
  birthdate: string,
  language: string,
  modalidad: string,
  clientTimezone: string
): string {
  // Defensa en profundidad (US-29): upsertClient() ya valida la edad antes de llegar
  // aquí en el flujo real, pero bookTimeslot() nunca debe confiar solo en eso.
  assertMinimumAge(birthdate);
  assertValidTipoId(tipoId);
  // La duración del evento depende del tipo de cita, igual que en fetchAvailability.
  const duration = getDurationForType(type);
  const startTime = new Date(timeslot);
  if (isNaN(startTime.getTime())) {
    throw new Error("Invalid start time");
  }
  const endTime = new Date(startTime.getTime());
  endTime.setUTCMinutes(startTime.getUTCMinutes() + duration);

  // Re-chequeo de la ventana mínima justo antes de reservar (US-09): el filtro en
  // fetchAvailability evita que el cliente VEA el slot, pero si dejó la pestaña abierta
  // y confirma después de que el slot cruzó el umbral, hay que rechazarlo aquí también —
  // el cliente no puede confiar solo en el estado cargado en el navegador. Pilates usa su
  // propia ventana más corta (PILATES_MIN_BOOKING_HOURS), igual que en fetchAvailability.
  const minBookingHours = type === "pilates" ? PILATES_MIN_BOOKING_HOURS : MIN_BOOKING_HOURS;
  const minBookingTime = new Date(
    new Date().getTime() + minBookingHours * 60 * 60 * 1000
  );
  if (startTime.getTime() <= minBookingTime.getTime()) {
    throw new Error("VENTANA_MINIMA_NO_CUMPLIDA");
  }

  // FIX 1 (US-10): Sheet primero, Calendar después. Si appendBookingToSheet falla (p. ej.
  // 'CLASE_LLENA'), no se crea ningún evento de Calendar — cumple la nota 4 del CLAUDE.md
  // ("función atómica: si falla Sheets, no crear evento en Calendar"). Antes era al revés
  // (Calendar primero), lo cual contradecía esa regla y el checklist de esta US.
  const token = appendBookingToSheet(type, {
    timeslot,
    nombre,
    apellido,
    email,
    phone,
    tipoId,
    numeroId,
    birthdate,
    language,
    modalidad,
    clientTimezone,
  });

  let meetLinkForEmail = "";
  try {
    if (type === "pilates") {
      meetLinkForEmail = bookPilatesCalendarEvent(startTime, endTime, nombre, apellido, email, phone, tipoId, numeroId, birthdate, language).meetLink;
    } else {
      meetLinkForEmail = bookNutricionCalendarEvent(type, token, startTime, endTime, nombre, apellido, email, phone, tipoId, numeroId, birthdate, language, modalidad).meetLink;
    }
  } catch (e) {
    // El Sheet ya quedó escrito exitosamente (token=token) pero el paso de Calendar falló
    // después. Decisión (US-10): no borrar la fila ni el token — solo marcar el estado como
    // 'Error_Calendar' (ver markBookingRowError) y, para pilates, revertir el cupo que ya se
    // había incrementado, para que el contador de inscritos siga reflejando cuántas personas
    // quedaron realmente confirmadas en el evento de Calendar. El error real se relanza para
    // que el cliente sepa que la reserva no se completó.
    markBookingRowError(type, token);
    if (type === "pilates") {
      const fecha = Utilities.formatDate(startTime, TIME_ZONE, "yyyy-MM-dd");
      const hora = Utilities.formatDate(startTime, TIME_ZONE, "HH:mm");
      rollbackPilatesCupo(fecha, hora);
    }
    // Mismo motivo que en appendBookingToSheet/bookPilatesCalendarEvent: confirmar de
    // inmediato el estado 'Error_Calendar' y el rollback de cupo, en vez de dejarlos como
    // cambios pendientes hasta que termine la ejecución.
    SpreadsheetApp.flush();
    throw e;
  }

  // US-12 — Correo de confirmación inmediato. Extiende la atomicidad de la nota 4 del
  // CLAUDE.md (Sheet→Calendar) un paso más: en este punto Sheet y Calendar YA se guardaron
  // con éxito, así que el agendamiento en sí NUNCA debe revertirse ni fallar por un problema
  // de envío de correo (cuota de Gmail, error transitorio, etc.) — try/catch propio, sin
  // relanzar, solo con un log para revisión manual (no hay columna dedicada en el Sheet para
  // esto todavía; agregar una es trabajo de schema fuera del alcance de esta tarjeta).
  const fechaCita = Utilities.formatDate(startTime, TIME_ZONE, "yyyy-MM-dd");
  const horaCita = Utilities.formatDate(startTime, TIME_ZONE, "HH:mm");
  const esVirtualCita = type === "pilates" ? true : modalidad === "virtual";

  try {
    const idioma: "es" | "en" = language === "en" ? "en" : "es";
    const linkReagendar = `${ScriptApp.getService().getUrl()}?token=${token}`;
    const { subject, htmlBody } = renderConfirmationEmail({
      tipoCita: type as "initial" | "followup" | "measurement" | "pilates",
      idioma,
      nombre,
      fecha: fechaCita,
      hora: horaCita,
      esVirtual: esVirtualCita,
      meetLink: meetLinkForEmail,
      linkReagendar,
      clientTimezone,
    });
    GmailApp.sendEmail(email, subject, "", { htmlBody });
  } catch (e) {
    Logger.log(`bookTimeslot: fallo al enviar correo de confirmación a ${email} (token ${token}): ${(e as Error).message}`);
  }

  // US-13/US-30 — Notificación interna a Dani/Ali. Igual que el correo de confirmación de
  // arriba: su propio manejo de error vive dentro de sendNotificacionInterna, así que un
  // fallo aquí nunca revierte ni bloquea el agendamiento ya confirmado.
  sendNotificacionInterna({
    esPilates: type === "pilates",
    tipoAccion: "agendada",
    tipoCita: type as "initial" | "followup" | "measurement" | "pilates",
    nombreCompleto: `${nombre} ${apellido}`,
    correo: email,
    telefono: phone,
    idiomaDisplay: language === "en" ? "English" : "Español",
    fecha: fechaCita,
    hora: horaCita,
    modalidadDisplay: type === "pilates" ? undefined : MODALIDAD_DISPLAY.es[modalidad === "virtual" ? "virtual" : "presencial"],
    esVirtual: esVirtualCita,
    meetLink: meetLinkForEmail,
    token,
  });

  return token;
}

// ═══════════════════════════════════════════════════════════════════════════════════
// US-06 — Reagendamiento y cancelación de citas, identificadas por token (nunca por correo)
// ═══════════════════════════════════════════════════════════════════════════════════

interface BookingLookup {
  sheetName: "Nutrición" | "Pilates";
  row: number; // fila 1-based en la pestaña
  token: string;
  nombre: string;
  apellido: string;
  correo: string;
  telefono: string;
  tipoId: string;
  numeroId: string;
  birthdate: string;
  type: string; // "initial"/"followup"/"measurement" para Nutrición, "pilates" para Pilates
  fecha: string; // yyyy-MM-dd, hora del negocio (TIME_ZONE)
  hora: string; // HH:mm, hora del negocio (TIME_ZONE)
  clientTimezone: string;
  modalidad: string; // "" para pilates (siempre virtual)
  language: string;
  estado: string;
}

// Busca una cita/inscripción por su token único (columna 1) en "Nutrición" y luego en
// "Pilates". El token es la clave de reagendamiento/cancelación de cara al cliente — nunca
// se busca por correo, porque un mismo correo puede tener múltiples citas y el link que el
// cliente recibe siempre trae un token específico (CLAUDE.md sección 2, "link único por cita
// para reagendar o cancelar"). Lanza Error("TOKEN_NO_ENCONTRADO") si no aparece en ninguna.
function findBookingByToken(token: string): BookingLookup {
  const sheetNames: Array<"Nutrición" | "Pilates"> = ["Nutrición", "Pilates"];

  for (const sheetName of sheetNames) {
    const sheet = getSheet(sheetName);
    const row = findRowByToken(sheet, token);
    if (row < 0) continue;

    const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];

    if (sheetName === "Nutrición") {
      return {
        sheetName, row, token,
        nombre: String(values[1]),
        apellido: String(values[2]),
        correo: String(values[3]),
        telefono: String(values[4]),
        tipoId: String(values[5]),
        numeroId: String(values[6]),
        birthdate: normalizeSheetDateCell(values[7], "yyyy-MM-dd"),
        type: String(values[8]),
        fecha: normalizeSheetDateCell(values[9], "yyyy-MM-dd"),
        hora: normalizeSheetDateCell(values[10], "HH:mm"),
        clientTimezone: String(values[11]),
        modalidad: String(values[12]),
        language: String(values[13]),
        estado: String(values[15]),
      };
    }

    return {
      sheetName, row, token,
      nombre: String(values[1]),
      apellido: String(values[2]),
      correo: String(values[3]),
      telefono: String(values[4]),
      tipoId: String(values[5]),
      numeroId: String(values[6]),
      birthdate: normalizeSheetDateCell(values[7], "yyyy-MM-dd"),
      type: "pilates",
      fecha: normalizeSheetDateCell(values[8], "yyyy-MM-dd"),
      hora: normalizeSheetDateCell(values[9], "HH:mm"),
      clientTimezone: String(values[10]),
      modalidad: "",
      language: String(values[11]),
      estado: String(values[12]),
    };
  }

  throw new Error("TOKEN_NO_ENCONTRADO");
}

// Reconstruye, en hora del negocio (TIME_ZONE), el instante exacto de una cita a partir de
// las columnas fecha/hora del Sheet (ya normalizadas a string por normalizeSheetDateCell —
// ver nota 16 del CLAUDE.md sobre coerción de tipos en Sheets).
function parseSheetDateTime(fecha: string, hora: string): Date {
  return Utilities.parseDate(`${fecha} ${hora}`, TIME_ZONE, "yyyy-MM-dd HH:mm");
}

// Elimina el evento de Calendar de una cita de Nutrición ya cancelada. event_id se guarda
// SIEMPRE desde US-06 (ver updateNutricionCalendarInfo), tanto para citas virtuales como
// presenciales. Filas creadas ANTES de US-06 (antes de correr addEventIdColumnToNutricion())
// no tendrán event_id — en ese caso se deja un log claro para revisión manual en vez de
// fallar la cancelación completa (el estado en el Sheet sí debe quedar 'Cancelada').
function cancelNutricionCalendarEvent(token: string): void {
  const sheet = getSheet("Nutrición");
  const row = findRowByToken(sheet, token);
  if (row < 0) return;

  const eventId = String(sheet.getRange(row, NUTRICION_EVENT_ID_COL).getValue() || "");
  if (!eventId) {
    Logger.log(`cancelNutricionCalendarEvent: fila ${row} de Nutrición sin event_id (cita creada antes de US-06) — revisar y eliminar el evento de Calendar manualmente.`);
    return;
  }

  try {
    Calendar.Events!.remove(CALENDARS[0], eventId, { sendUpdates: "all" });
  } catch (e) {
    Logger.log(`cancelNutricionCalendarEvent: error eliminando evento ${eventId}: ${(e as Error).message}`);
  }
}

// Saca a un cliente de un slot grupal de pilates ya reservado: decrementa "inscritos" en
// Cupos_Pilates y, según cuántos queden, o bien remueve solo a ese invitado del evento
// compartido (addGuest/patch, quedan otros inscritos) o elimina el evento por completo y
// limpia event_id/meet_link (era el único inscrito). Usada tanto por cancelBooking (pilates)
// como por rescheduleBooking (pilates, para salir del slot viejo). Mismo LockService que
// protege el contador de cupos en el resto del sistema (US-05/US-10), para que una salida y
// una entrada casi simultáneas al mismo slot no corrompan el conteo.
function leavePilatesSlot(fecha: string, hora: string, email: string): void {
  const calendarId = getPilatesCalendarId();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cuposSheet = getSheet("Cupos_Pilates");
    ensureCuposPilatesPlainTextFormat(cuposSheet);
    const cuposData = cuposSheet.getDataRange().getValues();

    let rowNumber = -1;
    let inscritos = 0;
    let eventId = "";
    for (let i = 1; i < cuposData.length; i++) {
      const rowFecha = normalizeSheetDateCell(cuposData[i][0], "yyyy-MM-dd");
      const rowHora = normalizeSheetDateCell(cuposData[i][1], "HH:mm");
      if (rowFecha === fecha && rowHora === hora) {
        rowNumber = i + 1;
        inscritos = Number(cuposData[i][2]) || 0;
        eventId = String(cuposData[i][CUPOS_PILATES_EVENT_ID_COL - 1] || "");
        break;
      }
    }

    if (rowNumber < 0) {
      Logger.log(`leavePilatesSlot: fila de Cupos_Pilates no encontrada para ${fecha} ${hora} — nada que revertir.`);
      return;
    }

    const nuevoInscritos = Math.max(inscritos - 1, 0);
    cuposSheet.getRange(rowNumber, 3).setValue(nuevoInscritos);

    if (eventId) {
      if (nuevoInscritos <= 0) {
        try {
          Calendar.Events!.remove(calendarId, eventId, { sendUpdates: "all" });
        } catch (e) {
          Logger.log(`leavePilatesSlot: error eliminando evento ${eventId}: ${(e as Error).message}`);
        }
        cuposSheet.getRange(rowNumber, CUPOS_PILATES_EVENT_ID_COL).setValue("");
        cuposSheet.getRange(rowNumber, CUPOS_PILATES_MEET_LINK_COL).setValue("");
      } else {
        try {
          const existingEvent = Calendar.Events!.get(calendarId, eventId);
          const attendees = (existingEvent.attendees || []).filter(
            (a) => (a.email || "").trim().toLowerCase() !== email.trim().toLowerCase()
          );
          // sendUpdates: 'none' — decisión del 18 jul: el cliente NO debe recibir la invitación
      // nativa de Google Calendar (expone cédula/fecha de nacimiento de la descripción del
      // evento sin ningún diseño). El único correo que debe recibir el cliente al agendar es
      // el de confirmación propio (US-12). Para volver a activar la invitación nativa de
      // Google en el futuro, basta con cambiar este valor a 'all'.
      Calendar.Events!.patch({ attendees }, calendarId, eventId, { sendUpdates: "none" });
        } catch (e) {
          Logger.log(`leavePilatesSlot: error removiendo invitado del evento ${eventId}: ${(e as Error).message}`);
        }
      }
    }

    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

// Inscribe a un cliente en un slot grupal de pilates, respetando el cupo (lanza
// Error("CLASE_LLENA") si ya está lleno) y reutilizando el mismo patrón de "crear evento
// compartido en la primera inscripción, unirse con addGuest/patch en las siguientes" que
// bookPilatesCalendarEvent/appendBookingToSheet (US-10). Usada por rescheduleBooking para
// mover un cliente de pilates a un slot NUEVO — el flujo de agendamiento inicial (bookTimeslot)
// sigue usando su propia implementación sin tocar, para no arriesgar el comportamiento ya
// validado en testing real de US-10.
function joinPilatesSlot(
  fecha: string,
  hora: string,
  nombre: string,
  apellido: string,
  email: string,
  phone: string,
  tipoId: string,
  numeroId: string,
  birthdate: string,
  language: string
): void {
  const calendarId = getPilatesCalendarId();
  const description = `Name: ${nombre} ${apellido}\nEmail: ${email}\nPhone: ${phone}\nID: ${tipoId} ${numeroId}\nDate of birth: ${birthdate}\nLanguage: ${language}\nAppointment type: pilates\nModality: virtual`;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cuposSheet = getSheet("Cupos_Pilates");
    ensureCuposPilatesPlainTextFormat(cuposSheet);
    const cuposData = cuposSheet.getDataRange().getValues();

    let rowNumber = -1;
    let inscritos = 0;
    let maxParticipantes = MAX_PILATES_PARTICIPANTS;
    let eventId = "";
    for (let i = 1; i < cuposData.length; i++) {
      const rowFecha = normalizeSheetDateCell(cuposData[i][0], "yyyy-MM-dd");
      const rowHora = normalizeSheetDateCell(cuposData[i][1], "HH:mm");
      if (rowFecha === fecha && rowHora === hora) {
        rowNumber = i + 1;
        inscritos = Number(cuposData[i][2]) || 0;
        maxParticipantes = Number(cuposData[i][3]) || MAX_PILATES_PARTICIPANTS;
        eventId = String(cuposData[i][CUPOS_PILATES_EVENT_ID_COL - 1] || "");
        break;
      }
    }

    if (inscritos >= maxParticipantes) {
      throw new Error("CLASE_LLENA");
    }

    const startTime = parseSheetDateTime(fecha, hora);
    const endTime = new Date(startTime.getTime() + getDurationForType("pilates") * 60000);

    if (rowNumber > 0) {
      cuposSheet.getRange(rowNumber, 3).setValue(inscritos + 1);
    } else {
      rowNumber = cuposSheet.getLastRow() + 1;
      cuposSheet.appendRow([fecha, hora, 1, MAX_PILATES_PARTICIPANTS, "", ""]);
    }
    SpreadsheetApp.flush();

    if (eventId) {
      const existingEvent = Calendar.Events!.get(calendarId, eventId);
      const attendees = (existingEvent.attendees || []).concat([{ email }]);
      // sendUpdates: 'none' — decisión del 18 jul: el cliente NO debe recibir la invitación
      // nativa de Google Calendar (expone cédula/fecha de nacimiento de la descripción del
      // evento sin ningún diseño). El único correo que debe recibir el cliente al agendar es
      // el de confirmación propio (US-12). Para volver a activar la invitación nativa de
      // Google en el futuro, basta con cambiar este valor a 'all'.
      Calendar.Events!.patch({ attendees }, calendarId, eventId, { sendUpdates: "none" });
    } else {
      const created = createCalendarEventWithMeet(
        calendarId,
        "Clase de Pilates",
        startTime,
        endTime,
        description,
        email,
        true // pilates siempre es virtual
      );
      cuposSheet.getRange(rowNumber, CUPOS_PILATES_EVENT_ID_COL).setValue(created.eventId);
      cuposSheet.getRange(rowNumber, CUPOS_PILATES_MEET_LINK_COL).setValue(created.meetLink);
      SpreadsheetApp.flush();
    }
  } catch (e) {
    const error = e as Error;
    if (error.message === "CLASE_LLENA") throw error;
    throw new Error(`Failed to join pilates slot: ${error.message}`);
  } finally {
    lock.releaseLock();
  }
}

// Cancela una cita/inscripción existente, identificada por token. Nunca borra la fila del
// Sheet (mismo criterio que Error_Calendar en US-10, ver nota 4 del CLAUDE.md) — solo marca
// estado='Cancelada'. Si faltan menos de CANCELLATION_HOURS horas para la cita, la cancelación
// SÍ se permite (a diferencia de un reagendamiento tardío, que se bloquea — ver
// rescheduleBooking) pero se registra como tardía: incrementa el contador de cancelaciones
// tardías del CLIENTE (por correo, no por cita) en la pestaña "Clientes" y dispara el stub de
// notificación a Dani/Ali. Devuelve si la cancelación fue tardía, para que el frontend pueda
// mostrar el mensaje correspondiente.
function cancelBooking(token: string): { lateCancellation: boolean } {
  const booking = findBookingByToken(token);
  if (booking.estado === "Cancelada") {
    throw new Error("CITA_YA_CANCELADA");
  }

  const startTime = parseSheetDateTime(booking.fecha, booking.hora);
  const hoursUntilStart = (startTime.getTime() - new Date().getTime()) / (60 * 60 * 1000);
  const lateCancellation = hoursUntilStart < CANCELLATION_HOURS;

  const sheet = getSheet(booking.sheetName);
  const estadoCol = booking.sheetName === "Pilates" ? PILATES_ESTADO_COL : NUTRICION_ESTADO_COL;
  sheet.getRange(booking.row, estadoCol).setValue("Cancelada");
  SpreadsheetApp.flush();

  if (booking.sheetName === "Pilates") {
    leavePilatesSlot(booking.fecha, booking.hora, booking.correo);
  } else {
    cancelNutricionCalendarEvent(booking.token);
  }

  if (lateCancellation) {
    incrementClientLateCancellation(booking.correo);
    notifyLateCancellation(booking.correo, token, "cancelacion");
  } else {
    resetClientLateCancellationCounter(booking.correo);
  }

  // US-13/US-30 — Notificación interna general de "cita cancelada". Siempre se envía, sin
  // importar si fue tardía o no: notifyLateCancellation (arriba) es un aviso ADICIONAL y
  // específico de tardanza (hoy sigue siendo un stub sin envío real, ver su propio
  // comentario), no un reemplazo de esta notificación general — cuando notifyLateCancellation
  // se implemente de verdad, Dani/Ali recibirían ambos correos para una cancelación tardía,
  // cada uno con su propósito (uno informa la cancelación en sí, el otro alerta del patrón de
  // tardanza para el flag de requiere_pago).
  sendNotificacionInterna({
    esPilates: booking.sheetName === "Pilates",
    tipoAccion: "cancelada",
    tipoCita: booking.type as "initial" | "followup" | "measurement" | "pilates",
    nombreCompleto: `${booking.nombre} ${booking.apellido}`,
    correo: booking.correo,
    telefono: booking.telefono,
    idiomaDisplay: booking.language === "en" ? "English" : "Español",
    fecha: booking.fecha,
    hora: booking.hora,
    modalidadDisplay: booking.sheetName === "Pilates" ? undefined : MODALIDAD_DISPLAY.es[booking.modalidad === "virtual" ? "virtual" : "presencial"],
    esVirtual: booking.sheetName === "Pilates" ? true : booking.modalidad === "virtual",
    token,
  });

  return { lateCancellation };
}

// Reagenda una cita/inscripción existente, identificada por token, a un nuevo horario.
// A diferencia de cancelBooking, un reagendamiento fuera de la ventana de CANCELLATION_HOURS
// se BLOQUEA por completo (Error("VENTANA_REAGENDAMIENTO_VENCIDA")) en vez de permitirse con
// penalización — así lo especifica el checklist de US-06 — pero de todas formas cuenta para
// el tracker de tardías del cliente (CLAUDE.md sección 3 no distingue "cancelación" de
// "reagendamiento" al hablar de "2 cancelaciones consecutivas fuera de la ventana").
// Si se permite, aplica sobre el NUEVO horario la misma validación que bookTimeslot: ventana
// mínima de MIN_BOOKING_HOURS y conflict-check/lock (Freebusy para nutrición, cupo para
// pilates). Devuelve el mismo token (la cita sigue siendo la misma, solo cambia de horario).
function rescheduleBooking(token: string, newTimeslot: string, clientTimezone: string): string {
  const booking = findBookingByToken(token);
  if (booking.estado === "Cancelada") {
    throw new Error("CITA_CANCELADA");
  }

  const currentStart = parseSheetDateTime(booking.fecha, booking.hora);
  const hoursUntilCurrent = (currentStart.getTime() - new Date().getTime()) / (60 * 60 * 1000);
  if (hoursUntilCurrent < CANCELLATION_HOURS) {
    incrementClientLateCancellation(booking.correo);
    notifyLateCancellation(booking.correo, token, "reagendamiento");
    throw new Error("VENTANA_REAGENDAMIENTO_VENCIDA");
  }

  const newStart = new Date(newTimeslot);
  if (isNaN(newStart.getTime())) {
    throw new Error("Invalid start time");
  }

  // Mismo re-chequeo de ventana mínima que bookTimeslot (US-09) — aplica al horario NUEVO.
  // Pilates usa PILATES_MIN_BOOKING_HOURS, igual que en fetchAvailability/bookTimeslot.
  const minBookingHours = booking.type === "pilates" ? PILATES_MIN_BOOKING_HOURS : MIN_BOOKING_HOURS;
  const minBookingTime = new Date(new Date().getTime() + minBookingHours * 60 * 60 * 1000);
  if (newStart.getTime() <= minBookingTime.getTime()) {
    throw new Error("VENTANA_MINIMA_NO_CUMPLIDA");
  }

  const duration = getDurationForType(booking.type);
  const newEnd = new Date(newStart.getTime() + duration * 60000);
  const newFecha = Utilities.formatDate(newStart, TIME_ZONE, "yyyy-MM-dd");
  const newHora = Utilities.formatDate(newStart, TIME_ZONE, "HH:mm");

  if (booking.sheetName === "Pilates") {
    // Entra al slot nuevo ANTES de salir del viejo: si el nuevo slot está lleno
    // (CLASE_LLENA), la excepción se propaga y el cliente conserva su cupo original en
    // vez de quedarse sin ninguna clase.
    joinPilatesSlot(
      newFecha, newHora,
      booking.nombre, booking.apellido, booking.correo, booking.telefono, booking.tipoId, booking.numeroId, booking.birthdate, booking.language
    );
    leavePilatesSlot(booking.fecha, booking.hora, booking.correo);

    const sheet = getSheet("Pilates");
    sheet.getRange(booking.row, PILATES_FECHA_COL).setValue(newFecha);
    sheet.getRange(booking.row, PILATES_HORA_COL).setValue(newHora);
    sheet.getRange(booking.row, PILATES_ZONA_HORARIA_COL).setValue(clientTimezone);
    sheet.getRange(booking.row, PILATES_ESTADO_COL).setValue("Reagendada");
    SpreadsheetApp.flush();
  } else {
    // Mismo patrón de LockService que bookNutricionCalendarEvent (US-09): conflict-check y
    // creación/movimiento del evento deben ser atómicos frente a otra reserva casi simultánea
    // del mismo slot.
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const possibleEvents = Calendar.Freebusy!.query({
        timeMin: newStart.toISOString(),
        timeMax: newEnd.toISOString(),
        items: CALENDARS.map((id: string) => ({ id })),
      });
      const hasConflict = CALENDARS.some(
        (calId: string) => (possibleEvents as any).calendars[calId].busy.length > 0
      );
      if (hasConflict) throw new Error("SLOT_NO_DISPONIBLE");

      const sheet = getSheet("Nutrición");
      const eventId = String(sheet.getRange(booking.row, NUTRICION_EVENT_ID_COL).getValue() || "");
      if (eventId) {
        // sendUpdates: 'none' — decisión del 18 jul: el cliente NO debe recibir la invitación
        // nativa de Google Calendar (expone cédula/fecha de nacimiento de la descripción del
        // evento sin ningún diseño). El único correo que debe recibir el cliente al agendar es
        // el de confirmación propio (US-12). Para volver a activar la invitación nativa de
        // Google en el futuro, basta con cambiar este valor a 'all'.
        Calendar.Events!.patch(
          {
            start: { dateTime: newStart.toISOString(), timeZone: TIME_ZONE },
            end: { dateTime: newEnd.toISOString(), timeZone: TIME_ZONE },
          },
          CALENDARS[0],
          eventId,
          { sendUpdates: "none" }
        );
      } else {
        // Cita creada antes de US-06 (antes de correr addEventIdColumnToNutricion()): no hay
        // ningún identificador de Calendar guardado, así que no hay evento que mover. Mismo
        // criterio que cancelNutricionCalendarEvent: no bloquear la operación de negocio por
        // esto — el Sheet sí se actualiza (fecha/hora/estado='Reagendada') y se deja un log
        // claro para que Dani/Ali muevan el evento manualmente en el Calendar real.
        Logger.log(`rescheduleBooking: fila ${booking.row} de Nutrición sin event_id (cita creada antes de US-06) — el Sheet se actualizó pero el evento de Calendar debe moverse manualmente.`);
      }

      sheet.getRange(booking.row, NUTRICION_FECHA_COL).setValue(newFecha);
      sheet.getRange(booking.row, NUTRICION_HORA_COL).setValue(newHora);
      sheet.getRange(booking.row, NUTRICION_ZONA_HORARIA_COL).setValue(clientTimezone);
      sheet.getRange(booking.row, NUTRICION_ESTADO_COL).setValue("Reagendada");
      SpreadsheetApp.flush();
    } catch (e) {
      const error = e as Error;
      if (error.message === "SLOT_NO_DISPONIBLE") throw error;
      throw new Error(`Failed to reschedule event: ${error.message}`);
    } finally {
      lock.releaseLock();
    }
  }

  resetClientLateCancellationCounter(booking.correo);

  // US-13/US-30 — Notificación interna de "cita reagendada", con la fecha/hora NUEVA (no la
  // anterior). meetLink se relee del Sheet/Cupos_Pilates después de la actualización de
  // arriba: el evento real no cambia de link al moverse de horario (Calendar.Events.patch
  // conserva el mismo meet_link), solo cambia su fecha/hora.
  const meetLinkForNotif = booking.sheetName === "Pilates"
    ? findPilatesMeetLink(newFecha, newHora)
    : String(getSheet("Nutrición").getRange(booking.row, NUTRICION_MEET_LINK_COL).getValue() || "");
  sendNotificacionInterna({
    esPilates: booking.sheetName === "Pilates",
    tipoAccion: "reagendada",
    tipoCita: booking.type as "initial" | "followup" | "measurement" | "pilates",
    nombreCompleto: `${booking.nombre} ${booking.apellido}`,
    correo: booking.correo,
    telefono: booking.telefono,
    idiomaDisplay: booking.language === "en" ? "English" : "Español",
    fecha: newFecha,
    hora: newHora,
    modalidadDisplay: booking.sheetName === "Pilates" ? undefined : MODALIDAD_DISPLAY.es[booking.modalidad === "virtual" ? "virtual" : "presencial"],
    esVirtual: booking.sheetName === "Pilates" ? true : booking.modalidad === "virtual",
    meetLink: meetLinkForNotif,
    token,
  });

  return token;
}

// ============================================================================
// US-11 — Renderizado del correo de confirmación (ES/EN, nutrición y pilates)
// US-12 conecta renderConfirmationEmail() a bookTimeslot() para el envío automático real
// (ver el bloque try/catch al final de bookTimeslot, más arriba en este archivo).
// ============================================================================

// Dirección física del consultorio (sección 1 del CLAUDE.md) — constante, no cambia
// por cita. Si el consultorio cambia algún día, solo hay que actualizar estas 3.
const CONSULTORIO_DIRECCION =
  "Santa Ana Town Center<br>Work Space Republic – Segundo piso<br>Consultorio #33";
const CONSULTORIO_MAPS_LINK = "https://maps.google.com/?q=Santa+Ana+Town+Center+Work+Space+Republic";
const CONSULTORIO_WAZE_LINK = "https://waze.com/ul?q=Santa%20Ana%20Town%20Center%20Work%20Space%20Republic";

// Títulos de confirmación por tipo de cita e idioma (solo aplica a nutrición — pilates
// tiene el título fijo, horneado en su propia plantilla HTML, ver comentario del archivo).
// "initial" ES/"nutricion" ES/EN ya estaban confirmados desde el comentario de Trello del
// 13 jul; el resto es borrador pendiente de aprobación de Gabriela (ver reporte final).
const TITULOS_CONFIRMACION: Record<string, Record<string, string>> = {
  es: {
    initial: "¡Tu cita inicial está confirmada!", // confirmado (comentario Trello, 13 jul)
    followup: "¡Tu cita de seguimiento está confirmada!", // BORRADOR — pendiente aprobación Gabi
    measurement: "¡Tu cita de medición está confirmada!", // BORRADOR — pendiente aprobación Gabi
  },
  en: {
    initial: "Your initial appointment is confirmed!", // BORRADOR — pendiente aprobación Gabi
    followup: "Your follow-up appointment is confirmed!", // BORRADOR — pendiente aprobación Gabi
    measurement: "Your measurement appointment is confirmed!", // BORRADOR — pendiente aprobación Gabi
  },
};

const MODALIDAD_DISPLAY: Record<string, Record<string, string>> = {
  es: { virtual: "VIRTUAL", presencial: "PRESENCIAL" },
  en: { virtual: "VIRTUAL", presencial: "IN PERSON" },
};

// Subject lines del correo de confirmación. Nutrición ES/EN ya confirmados; pilates es
// BORRADOR — sigue el mismo patrón que el título fijo ya aprobado dentro de la propia
// plantilla de pilates ("¡Tu clase de pilates está confirmada!"), sin nombrar a la
// instructora porque su nombre no es una variable disponible en este flujo.
const SUBJECTS_CONFIRMACION: Record<string, Record<string, string>> = {
  nutricion: {
    es: "Tu cita de nutrición con Dani está confirmada", // confirmado
    en: "Your nutrition appointment with Dani is confirmed", // confirmado
  },
  pilates: {
    es: "Tu clase de pilates está confirmada", // BORRADOR — pendiente aprobación Gabi
    en: "Your pilates class is confirmed", // BORRADOR — pendiente aprobación Gabi
  },
};

const TEMPLATE_FILE_BY_TIPO_IDIOMA: Record<string, Record<string, string>> = {
  nutricion: {
    es: "correo_confirmacion_nutricion_es",
    en: "correo_confirmacion_nutricion_en",
  },
  pilates: {
    es: "correo_confirmacion_pilates_es",
    en: "correo_confirmacion_pilates_en",
  },
};

const DIAS_SEMANA_ES = ["", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO", "DOMINGO"];
const MESES_ES = ["", "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const DIAS_SEMANA_EN = ["", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const MESES_EN = ["", "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

// El correo de confirmación debe mostrarle al CLIENTE la fecha/hora en SU zona horaria
// (clientTimezone), no en TIME_ZONE — a diferencia del evento de Calendar (fuente de verdad
// para Dani/Ali/instructora), que sigue siempre en TIME_ZONE sin cambios. Por eso estas dos
// funciones reciben el INSTANTE real (Date, ya parseado desde fecha+hora del Sheet con
// parseSheetDateTime, que sí entiende que esos strings están en TIME_ZONE — nunca
// reconstruido a mano con `new Date(...)`, que asumiría la zona del servidor y produciría un
// corrimiento incorrecto, mismo tipo de bug que la nota técnica #29 pero en la dirección
// contraria) más la zona en la que hay que MOSTRARLO, en vez de recibir el string ya fijado
// a TIME_ZONE. `zona` por defecto es TIME_ZONE para no cambiar el comportamiento de
// testSendConfirmationEmails() (US-11), que no pasa clientTimezone.
// Los nombres de día/mes se arman a mano a partir de números (patrones "u"/"d"/"M" de
// Utilities.formatDate, que son numéricos y no dependen del locale del proyecto de Script),
// en vez de usar los nombres de mes/día que da formatDate, que SÍ dependen del locale del
// proyecto (un solo locale de Script no puede servir ES y EN a la vez de forma confiable).
function formatFechaDisplay(instant: Date, idioma: "es" | "en", zona: string = TIME_ZONE): string {
  const diaSemana = Number(Utilities.formatDate(instant, zona, "u")); // 1=lunes...7=domingo
  const dia = Utilities.formatDate(instant, zona, "d");
  const mes = Number(Utilities.formatDate(instant, zona, "M")); // 1-12
  const anio = Utilities.formatDate(instant, zona, "yyyy");

  if (idioma === "en") {
    return `${DIAS_SEMANA_EN[diaSemana]}, ${MESES_EN[mes]} ${dia}, ${anio}`;
  }
  return `${DIAS_SEMANA_ES[diaSemana]} ${dia} DE ${MESES_ES[mes]} DEL ${anio}`;
}

function formatHoraDisplay(instant: Date, zona: string = TIME_ZONE): string {
  return Utilities.formatDate(instant, zona, "HH:mm");
}

// ⚠️ REGRESIÓN CONOCIDA (2 veces: US-11 inicial y 21 jul): cuando Gabriela entrega una
// versión NUEVA de una plantilla y se reemplaza el archivo completo, cualquier variable que
// deba imprimirse SIN escapar HTML (como "direccion", que trae <br>) puede volver a quedar
// como <?= var ?> (escapado) en vez de <?!= var ?> (sin escapar) si Gabriela no replica ese
// detalle técnico en el HTML nuevo — no es su responsabilidad saberlo, es de quien integra
// el archivo. SIEMPRE verificar esto al reemplazar cualquier plantilla que incluya
// "direccion" (o cualquier otra variable con HTML intencional) antes de dar el reemplazo por
// terminado.
function renderConfirmationEmail(params: {
  tipoCita: "initial" | "followup" | "measurement" | "pilates";
  idioma: "es" | "en";
  // Solo el PRIMER NOMBRE del cliente (columna "nombre" del Sheet, ya separada de
  // "apellido" desde antes de US-11) — confirmado con Gabriela (21 jul): los 4 correos de
  // confirmación deben saludar solo por el primer nombre, nunca el apellido.
  nombre: string;
  fecha: string; // yyyy-MM-dd, hora del negocio (TIME_ZONE) — instante real de la cita
  hora: string; // HH:mm, hora del negocio (TIME_ZONE) — instante real de la cita
  esVirtual: boolean; // pilates siempre true; solo importa para nutrición
  meetLink?: string;
  linkReagendar: string;
  // Zona horaria en la que se le MUESTRA fecha/hora al cliente en el correo — no afecta el
  // instante real de la cita (fecha/hora siguen siendo TIME_ZONE, la fuente de verdad del
  // Sheet/Calendar), solo cómo se formatea para lectura. Default TIME_ZONE para no romper
  // testSendConfirmationEmails() (US-11), que no la pasa.
  clientTimezone?: string;
}): { subject: string; htmlBody: string } {
  const isPilates = params.tipoCita === "pilates";
  const servicio = isPilates ? "pilates" : "nutricion";
  const templateFile = TEMPLATE_FILE_BY_TIPO_IDIOMA[servicio][params.idioma];
  const template = HtmlService.createTemplateFromFile(templateFile);

  // fecha/hora vienen en TIME_ZONE (así se guardan en el Sheet) — parseSheetDateTime ya sabe
  // interpretarlas como tal (Utilities.parseDate con TIME_ZONE explícito, nunca `new Date()`
  // a mano) para reconstruir el instante real, y desde ahí formatFechaDisplay/formatHoraDisplay
  // lo muestran en la zona del CLIENTE.
  const apptInstant = parseSheetDateTime(params.fecha, params.hora);
  const displayZone = params.clientTimezone || TIME_ZONE;
  // La plantilla de pilates ES todavía tiene la variable nombrada "nombre_apellido" en el
  // HTML (pilates EN y ambas de nutrición ya se renombraron a "nombre"), pero Gabriela
  // confirmó (21 jul) que la intención es la misma en las 4: mostrar SOLO el primer nombre.
  // Se inyecta el mismo valor bajo los dos nombres de variable, sin importar cuál use cada
  // archivo — pendiente que Gabriela renombre "nombre_apellido" a "nombre" en ese archivo
  // sin urgencia, porque no cambia el comportamiento.
  template.nombre = params.nombre;
  template.nombre_apellido = params.nombre;
  template.fechaDisplay = formatFechaDisplay(apptInstant, params.idioma, displayZone);
  template.horaDisplay = formatHoraDisplay(apptInstant, displayZone);
  template.linkReagendar = params.linkReagendar;
  template.meetLink = params.meetLink || "";
  // EXPERIMENTAL (21 jul) — ver comentario completo en buildAddToCalendarLink().
  template.linkAgregarCalendario = buildAddToCalendarLink({
    tipoCita: params.tipoCita,
    idioma: params.idioma,
    primerNombre: params.nombre,
    apptInstant,
    esVirtual: params.esVirtual,
    meetLink: params.meetLink,
  });

  if (!isPilates) {
    template.tituloConfirmacion = TITULOS_CONFIRMACION[params.idioma][params.tipoCita];
    template.modalidadDisplay = MODALIDAD_DISPLAY[params.idioma][params.esVirtual ? "virtual" : "presencial"];
    template.esVirtual = params.esVirtual;
    template.direccion = CONSULTORIO_DIRECCION;
    template.mapsLink = CONSULTORIO_MAPS_LINK;
    template.wazeLink = CONSULTORIO_WAZE_LINK;
  }

  const subject = isPilates
    ? SUBJECTS_CONFIRMACION.pilates[params.idioma]
    : SUBJECTS_CONFIRMACION.nutricion[params.idioma];

  return { subject, htmlBody: template.evaluate().getContent() };
}

// EXPERIMENTAL — agregado el 21 jul, NO es parte del diseño original de Gabriela. Es una
// decisión tomada directamente con el usuario; el equipo de comunicación todavía no la ha
// visto ni aprobado. Si no se aprueba, esta función y el bloque de botón correspondiente en
// las 4 plantillas HTML se pueden remover sin afectar el resto del correo.
//
// Arma un link "render" de Google Calendar para que el CLIENTE agregue el evento a SU propio
// calendario personal con un clic — separado por completo de la invitación nativa de
// Calendar.Events.insert()/.patch(), que sigue apagada (sendUpdates:'none', ver historial de
// deploy v25 en el CLAUDE.md). `details`/`location` NUNCA deben incluir cédula, fecha de
// nacimiento, teléfono ni correo del cliente — ese fue justo el dato sensible que motivó
// apagar la invitación nativa; solo lleva el primer nombre y el tipo de cita.
function buildAddToCalendarLink(params: {
  tipoCita: "initial" | "followup" | "measurement" | "pilates";
  idioma: "es" | "en";
  primerNombre: string;
  apptInstant: Date;
  esVirtual: boolean;
  meetLink?: string;
}): string {
  const isPilates = params.tipoCita === "pilates";
  const durationMinutes = getDurationForType(params.tipoCita);
  const endInstant = new Date(params.apptInstant.getTime() + durationMinutes * 60000);
  // Formato "render" de Google Calendar exige UTC básico yyyyMMdd'T'HHmmss'Z', sin importar
  // la zona en la que se le muestra la fecha/hora al cliente en el resto del correo.
  const toUtcStamp = (instant: Date) => Utilities.formatDate(instant, "Etc/UTC", "yyyyMMdd'T'HHmmss'Z'");
  const dates = `${toUtcStamp(params.apptInstant)}/${toUtcStamp(endInstant)}`;

  const text = isPilates
    ? (params.idioma === "en" ? "Pilates class — Plant Powered by Dani" : "Clase de pilates — Plant Powered by Dani")
    : (params.idioma === "en" ? "Nutrition appointment — Plant Powered by Dani" : "Cita de nutrición — Plant Powered by Dani");

  let details = params.idioma === "en"
    ? `Appointment for ${params.primerNombre} with Plant Powered by Dani.`
    : `Cita de ${params.primerNombre} con Plant Powered by Dani.`;
  if (params.esVirtual && params.meetLink) {
    details += params.idioma === "en" ? ` Join: ${params.meetLink}` : ` Unirse: ${params.meetLink}`;
  }

  // Ubicación en texto plano, SIN el <br> de CONSULTORIO_DIRECCION (ese <br> es solo para el
  // bloque HTML del correo) — Google Calendar la muestra como una sola línea de todas formas.
  const location = !isPilates && !params.esVirtual
    ? "Santa Ana Town Center, Work Space Republic, Segundo piso, Consultorio #33"
    : "";

  const queryParams = [
    "action=TEMPLATE",
    `text=${encodeURIComponent(text)}`,
    `dates=${dates}`,
    `details=${encodeURIComponent(details)}`,
    `location=${encodeURIComponent(location)}`,
    "ctz=America/Costa_Rica",
  ];
  return `https://calendar.google.com/calendar/render?${queryParams.join("&")}`;
}

// Función de testing manual (US-11, checklist ítems 1/2/5) — genera las 4 combinaciones
// (nutrición ES/EN x virtual/presencial, pilates ES/EN) y las envía por GmailApp a la
// cuenta de testing para inspección visual real. Correr manualmente desde el editor de
// Apps Script; no forma parte de ningún flujo automático (eso es US-12).
function testSendConfirmationEmails(): void {
  const destinatario = Session.getActiveUser().getEmail();
  const linkReagendarFake = "https://script.google.com/macros/s/FAKE_DEPLOYMENT_ID/exec?token=test-token-1234";

  const casos: Array<Parameters<typeof renderConfirmationEmail>[0]> = [
    {
      tipoCita: "initial",
      idioma: "es",
      nombre: "María",
      fecha: "2026-07-20",
      hora: "13:30",
      esVirtual: false,
      linkReagendar: linkReagendarFake,
    },
    {
      tipoCita: "followup",
      idioma: "en",
      nombre: "Jane",
      fecha: "2026-07-21",
      hora: "09:00",
      esVirtual: true,
      meetLink: "https://meet.google.com/fake-link-test",
      linkReagendar: linkReagendarFake,
    },
    {
      tipoCita: "pilates",
      idioma: "es",
      nombre: "Ana",
      fecha: "2026-07-25",
      hora: "10:00",
      esVirtual: true,
      meetLink: "https://meet.google.com/fake-link-pilates",
      linkReagendar: linkReagendarFake,
    },
    {
      tipoCita: "pilates",
      idioma: "en",
      nombre: "John",
      fecha: "2026-07-25",
      hora: "10:00",
      esVirtual: true,
      meetLink: "https://meet.google.com/fake-link-pilates-en",
      linkReagendar: linkReagendarFake,
    },
  ];

  casos.forEach((caso) => {
    const { subject, htmlBody } = renderConfirmationEmail(caso);
    GmailApp.sendEmail(destinatario, `[TEST US-11] ${subject}`, "", { htmlBody });
    Logger.log(`Enviado: ${caso.tipoCita}/${caso.idioma}/esVirtual=${caso.esVirtual}`);
  });
}

// ============================================================================
// US-13 / US-30 — Notificación interna a Dani/Ali: agendar, reagendar, cancelar
// Un solo template (notificacion_interna_nueva_cita.html, entregado por Gabriela para el
// caso "agendada") sirve para los 3 casos gracias a la extensión experimental de
// `tipoAccion` agregada directamente en el HTML (ver comentario dentro del archivo).
// ============================================================================

// TODO: reemplazar por los correos reales de Dani y Ali antes de producción (Sprint 3).
const NOTIFICACION_INTERNA_DESTINATARIOS = [
  "plantpoweredani.testing@gmail.com", // Dani (placeholder)
  "plantpoweredani.testing@gmail.com", // Ali / secretaria (placeholder)
];

// Solo nutrición necesita distinguir el tipo de cita en el correo interno (el título de
// pilates ya lo dice). Un solo idioma (español) — a diferencia de renderConfirmationEmail,
// este correo es interno y Dani/Ali son hispanohablantes, así que no hace falta la variable
// `idioma` que sí tienen los correos de cliente.
const TIPO_CITA_LABEL_INTERNO: Record<string, string> = {
  initial: "Inicial",
  followup: "Seguimiento",
  measurement: "Solo medición",
};

// BORRADOR — pendiente aprobación Gabi/Dani, mismo criterio que SUBJECTS_CONFIRMACION.
function buildNotificacionInternaSubject(
  esPilates: boolean,
  tipoAccion: "agendada" | "reagendada" | "cancelada",
  nombreCompleto: string
): string {
  const sustantivo = esPilates ? "pilates" : "nutrición";
  const verbo: Record<string, string> = { agendada: "Nueva", reagendada: "Reagendada", cancelada: "Cancelada" };
  return `${verbo[tipoAccion]}: cita de ${sustantivo} — ${nombreCompleto}`;
}

// URL directa al spreadsheet de registro (variable `sheetLink` del template) — construida a
// partir del mismo SPREADSHEET_ID que usa getSheet(), no una constante separada que se
// pudiera desincronizar si algún día cambia el spreadsheet de producción.
function getSpreadsheetUrl(): string {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID no configurado. Ejecutar initializeSheets() primero.");
  }
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

// Busca el meet_link de un slot de pilates en Cupos_Pilates por fecha/hora — usado por la
// notificación interna al reagendar, donde el evento ya existía y solo cambió de horario
// (joinPilatesSlot no devuelve el link directamente en ese flujo).
function findPilatesMeetLink(fecha: string, hora: string): string {
  const cuposSheet = getSheet("Cupos_Pilates");
  const cuposData = cuposSheet.getDataRange().getValues();
  for (let i = 1; i < cuposData.length; i++) {
    const rowFecha = normalizeSheetDateCell(cuposData[i][0], "yyyy-MM-dd");
    const rowHora = normalizeSheetDateCell(cuposData[i][1], "HH:mm");
    if (rowFecha === fecha && rowHora === hora) {
      return String(cuposData[i][CUPOS_PILATES_MEET_LINK_COL - 1] || "");
    }
  }
  return "";
}

function renderNotificacionInterna(params: {
  esPilates: boolean;
  tipoAccion: "agendada" | "reagendada" | "cancelada";
  tipoCita: "initial" | "followup" | "measurement" | "pilates";
  nombreCompleto: string;
  correo: string;
  telefono: string;
  idiomaDisplay: string;
  fecha: string; // yyyy-MM-dd, TIME_ZONE — instante real de la cita (NUEVA si reagendada)
  hora: string; // HH:mm, TIME_ZONE
  modalidadDisplay?: string; // solo nutrición
  esVirtual?: boolean; // solo nutrición; pilates siempre true
  meetLink?: string;
  token: string;
}): { subject: string; htmlBody: string } {
  const template = HtmlService.createTemplateFromFile("notificacion_interna_nueva_cita");
  // Este correo es interno (Dani/Ali) — SIEMPRE TIME_ZONE, nunca clientTimezone (nota #29 del
  // CLAUDE.md), a diferencia del correo de confirmación del cliente (renderConfirmationEmail),
  // que sí usa la zona del cliente para mostrarle su propia hora local.
  const apptInstant = parseSheetDateTime(params.fecha, params.hora);

  template.esPilates = params.esPilates;
  template.tipoAccion = params.tipoAccion;
  template.nombreCompleto = params.nombreCompleto;
  template.correo = params.correo;
  template.telefono = params.telefono;
  template.idiomaDisplay = params.idiomaDisplay;
  template.tipoCitaLabel = params.esPilates ? "" : (TIPO_CITA_LABEL_INTERNO[params.tipoCita] || "");
  template.fechaDisplay = formatFechaDisplay(apptInstant, "es", TIME_ZONE);
  template.horaDisplay = formatHoraDisplay(apptInstant, TIME_ZONE);
  template.modalidadDisplay = params.modalidadDisplay || "";
  template.esVirtual = !!params.esVirtual;
  template.meetLink = params.meetLink || "";
  template.token = params.token;
  template.direccion = CONSULTORIO_DIRECCION;
  template.mapsLink = CONSULTORIO_MAPS_LINK;
  template.wazeLink = CONSULTORIO_WAZE_LINK;
  template.sheetLink = getSpreadsheetUrl();

  const subject = buildNotificacionInternaSubject(params.esPilates, params.tipoAccion, params.nombreCompleto);
  return { subject, htmlBody: template.evaluate().getContent() };
}

// Envía la notificación interna a Dani/Ali. El try/catch vive AQUÍ (no en cada uno de los 3
// puntos de llamada en bookTimeslot/rescheduleBooking/cancelBooking) para no triplicar el
// mismo manejo de error — un fallo de este correo nunca debe revertir ni bloquear la acción
// real de agendar/reagendar/cancelar, mismo criterio que el correo de confirmación al
// cliente (US-12). Los destinatarios se unen en un solo `to` separado por comas en vez de
// un GmailApp.sendEmail por destinatario, para no duplicar el envío mientras ambos
// placeholders sigan apuntando al mismo correo de testing.
function sendNotificacionInterna(params: Parameters<typeof renderNotificacionInterna>[0]): void {
  try {
    const { subject, htmlBody } = renderNotificacionInterna(params);
    GmailApp.sendEmail(NOTIFICACION_INTERNA_DESTINATARIOS.join(","), subject, "", { htmlBody });
  } catch (e) {
    Logger.log(`sendNotificacionInterna: fallo al enviar notificación interna (token ${params.token}, tipoAccion ${params.tipoAccion}): ${(e as Error).message}`);
  }
}

// Función de testing manual (US-13/US-30) — genera las 6 combinaciones (nutrición/pilates x
// agendada/reagendada/cancelada) y las envía por GmailApp a la cuenta de testing para
// inspección visual real del badge/título por tipoAccion. Correr manualmente desde el editor
// de Apps Script; no forma parte de ningún flujo automático (eso ya está cableado en
// bookTimeslot/rescheduleBooking/cancelBooking).
function testSendNotificacionInterna(): void {
  const destinatario = Session.getActiveUser().getEmail();

  const casos: Array<Parameters<typeof renderNotificacionInterna>[0]> = [
    {
      esPilates: false,
      tipoAccion: "agendada",
      tipoCita: "initial",
      nombreCompleto: "María Fernández",
      correo: "maria@example.com",
      telefono: "8888-8888",
      idiomaDisplay: "Español",
      fecha: "2026-07-25",
      hora: "13:30",
      modalidadDisplay: MODALIDAD_DISPLAY.es.virtual,
      esVirtual: true,
      meetLink: "https://meet.google.com/fake-link-test",
      token: "test-token-1234",
    },
    {
      esPilates: false,
      tipoAccion: "reagendada",
      tipoCita: "followup",
      nombreCompleto: "Jane Doe",
      correo: "jane@example.com",
      telefono: "8777-7777",
      idiomaDisplay: "English",
      fecha: "2026-07-26",
      hora: "09:00",
      modalidadDisplay: MODALIDAD_DISPLAY.es.presencial,
      esVirtual: false,
      token: "test-token-5678",
    },
    {
      esPilates: false,
      tipoAccion: "cancelada",
      tipoCita: "measurement",
      nombreCompleto: "Carlos Ramírez",
      correo: "carlos@example.com",
      telefono: "8666-6666",
      idiomaDisplay: "Español",
      fecha: "2026-07-27",
      hora: "11:00",
      modalidadDisplay: MODALIDAD_DISPLAY.es.presencial,
      esVirtual: false,
      token: "test-token-9012",
    },
    {
      esPilates: true,
      tipoAccion: "agendada",
      tipoCita: "pilates",
      nombreCompleto: "Ana López",
      correo: "ana@example.com",
      telefono: "8555-5555",
      idiomaDisplay: "Español",
      fecha: "2026-07-25",
      hora: "10:00",
      esVirtual: true,
      meetLink: "https://meet.google.com/fake-link-pilates",
      token: "test-token-3456",
    },
    {
      esPilates: true,
      tipoAccion: "reagendada",
      tipoCita: "pilates",
      nombreCompleto: "John Smith",
      correo: "john@example.com",
      telefono: "8444-4444",
      idiomaDisplay: "English",
      fecha: "2026-08-01",
      hora: "10:00",
      esVirtual: true,
      meetLink: "https://meet.google.com/fake-link-pilates-2",
      token: "test-token-7890",
    },
    {
      esPilates: true,
      tipoAccion: "cancelada",
      tipoCita: "pilates",
      nombreCompleto: "Laura Jiménez",
      correo: "laura@example.com",
      telefono: "8333-3333",
      idiomaDisplay: "Español",
      fecha: "2026-07-25",
      hora: "10:00",
      esVirtual: true,
      token: "test-token-1122",
    },
  ];

  casos.forEach((caso) => {
    const { subject, htmlBody } = renderNotificacionInterna(caso);
    GmailApp.sendEmail(destinatario, `[TEST US-13/US-30] ${subject}`, "", { htmlBody });
    Logger.log(`Enviado: esPilates=${caso.esPilates}/tipoAccion=${caso.tipoAccion}/tipo=${caso.tipoCita}`);
  });
}

// ============================================================================
// TEMPORAL — solo para pruebas manuales de US-13/US-30 (reagendar/cancelar) desde el editor
// de Apps Script, mientras no exista la página visual de reagendar/cancelar (RF-2.6).
// Borrar estas dos funciones una vez que la prueba real esté hecha — mismo patrón ya usado
// para las pruebas manuales de US-06 (nota técnica #23 del CLAUDE.md).
// ============================================================================

function testReagendarManual(): void {
  const token = "PEGA_AQUI_EL_TOKEN"; // copiar de la columna "token" del Sheet (Nutrición o Pilates)
  // Ajustar a un horario válido: al menos MIN_BOOKING_HOURS (nutrición) o
  // PILATES_MIN_BOOKING_HOURS (pilates) en el futuro respecto a HOY, y la cita ACTUAL debe
  // tener al menos CANCELLATION_HOURS (24hrs) de anticipación al momento de correr esto —
  // si no, rescheduleBooking lanza VENTANA_REAGENDAMIENTO_VENCIDA.
  const nuevoHorario = "2026-07-28T14:00:00-06:00";
  const resultado = rescheduleBooking(token, nuevoHorario, "America/Costa_Rica");
  Logger.log(resultado);
}

function testCancelarManual(): void {
  const token = "PEGA_AQUI_EL_TOKEN"; // copiar de la columna "token" del Sheet (Nutrición o Pilates)
  const resultado = cancelBooking(token);
  Logger.log(resultado);
}
