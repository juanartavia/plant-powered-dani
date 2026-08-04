"use strict";
// Mock mínimo del entorno de Google Apps Script para poder correr la lógica pura de
// app.ts en Node vía vm.runInNewContext, sin ningún framework de test (el proyecto no
// tiene uno instalado). Solo implementa lo que las funciones de US-06 realmente usan.

const TZ_OFFSET_HOURS = 6; // Costa Rica = UTC-6 todo el año (sin DST)

function pad(n, len) {
  len = len || 2;
  return String(n).padStart(len, "0");
}

const WEEKDAY_ISO = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

// Extrae los componentes de `date` (un instante real) tal como se ven en la zona horaria
// `tz` — soporta cualquier IANA válido (America/Costa_Rica, UTC, America/New_York, etc.),
// necesario desde que el correo de confirmación (US-12, zona horaria del cliente) empezó a
// formatear el mismo instante en distintas zonas, no solo Costa Rica.
function getZonedParts(date, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const map = {};
  for (const part of dtf.formatToParts(date)) map[part.type] = part.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0; // algunos motores ICU devuelven "24" para medianoche en hour12:false
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: WEEKDAY_ISO[map.weekday], // 1=lunes...7=domingo, mismo criterio que Utilities.formatDate(..., "u")
  };
}

function formatDate(date, tz, pattern) {
  const p = getZonedParts(date, tz || "America/Costa_Rica");
  const y = p.year, mo = pad(p.month), da = pad(p.day), h = pad(p.hour), mi = pad(p.minute), s = pad(p.second);
  if (pattern === "yyyy-MM-dd") return `${y}-${mo}-${da}`;
  if (pattern === "HH:mm") return `${h}:${mi}`;
  if (pattern === "yyyy") return String(y);
  if (pattern === "M") return String(p.month);
  if (pattern === "d") return String(p.day);
  if (pattern === "u") return String(p.weekday);
  if (pattern === "@") return "@"; // no usado como pattern de fecha real
  // Formato UTC básico de Google Calendar (buildAddToCalendarLink, 21 jul) — literales entre
  // comillas simples ('T', 'Z'), igual que soporta Utilities.formatDate real. Blind spot
  // encontrado al probar el link de "Agregar a mi calendario": sin este caso, el mock caía
  // al formato genérico de abajo (con espacio y sin 'Z'), que es válido para logs pero NO es
  // el formato que Google Calendar espera en el parámetro `dates`.
  if (pattern === "yyyyMMdd'T'HHmmss'Z'") return `${y}${mo}${da}T${h}${mi}${s}Z`;
  // Formato UTC "extendido" de Outlook (buildAddCalLinks, US-37) — mismo caso que el básico de
  // arriba (blind spot ya documentado): sin este caso, el mock caía al formato genérico de
  // abajo (con espacio, sin 'T' ni 'Z'), que Outlook.live.com no acepta para startdt/enddt.
  if (pattern === "yyyy-MM-dd'T'HH:mm:ss'Z'") return `${y}-${mo}-${da}T${h}:${mi}:${s}Z`;
  // Formato "local wall-clock" de Yahoo Calendar (buildAddCalLinks, fix bug Yahoo 3 ago) — sin
  // 'Z': a diferencia de Google/Outlook, Yahoo interpreta st/et como hora local literal, así
  // que este pattern se formatea en clientTimezone en vez de Etc/UTC (ver toLocalBasic).
  if (pattern === "yyyyMMdd'T'HHmmss") return `${y}${mo}${da}T${h}${mi}${s}`;
  // yyyy-MM-dd'T'HH:mm:ss / "yyyy-MM-dd HH:mm:ss" / cualquier otro con todos los campos
  return `${y}-${mo}-${da} ${h}:${mi}:${s}`;
}

function parseDate(str, tz, _pattern) {
  // Extrae los dígitos en orden (funciona para "yyyy-MM-dd HH:mm" y variantes similares,
  // que son los únicos patrones que parseSheetDateTime usa en app.ts). Solo se llama con
  // TIME_ZONE (America/Costa_Rica, offset fijo UTC-6 sin DST) en todo el proyecto real — el
  // parseo genérico de otra zona no hace falta hoy, pero se deja el parámetro documentado
  // para no ocultar la limitación si algún día se usa con otra zona.
  const nums = (str.match(/\d+/g) || []).map(Number);
  const [y, mo, da, h = 0, mi = 0, s = 0] = nums;
  const utcMs = Date.UTC(y, mo - 1, da, h, mi, s) + TZ_OFFSET_HOURS * 3600000;
  return new Date(utcMs);
}

class MockRange {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows;
    this.numCols = numCols;
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const rowArr = [];
      for (let c = 0; c < this.numCols; c++) {
        rowArr.push(this.sheet._get(this.row + r, this.col + c));
      }
      out.push(rowArr);
    }
    return out;
  }
  setValues(values) {
    for (let r = 0; r < values.length; r++) {
      for (let c = 0; c < values[r].length; c++) {
        this.sheet._set(this.row + r, this.col + c, values[r][c]);
      }
    }
    return this;
  }
  getValue() {
    return this.sheet._get(this.row, this.col);
  }
  setValue(v) {
    this.sheet._set(this.row, this.col, v);
    return this;
  }
  setFontWeight() {
    return this;
  }
  setNumberFormat() {
    return this;
  }
  insertCheckboxes() {
    return this;
  }
  clearContent() {
    return this;
  }
  clearFormat() {
    return this;
  }
  clearDataValidations() {
    return this;
  }
}

class MockSheet {
  constructor(name, headers) {
    this.name = name;
    this.data = [headers.slice()];
  }
  _ensureRow(row) {
    while (this.data.length < row) this.data.push([]);
  }
  _get(row, col) {
    this._ensureRow(row);
    const rowArr = this.data[row - 1];
    return rowArr[col - 1] === undefined ? "" : rowArr[col - 1];
  }
  _set(row, col, value) {
    this._ensureRow(row);
    const rowArr = this.data[row - 1];
    while (rowArr.length < col) rowArr.push("");
    rowArr[col - 1] = value;
  }
  getRange(row, col, numRows, numCols) {
    return new MockRange(this, row, col, numRows || 1, numCols || 1);
  }
  getDataRange() {
    const lastCol = Math.max(...this.data.map((r) => r.length), 1);
    return new MockRange(this, 1, 1, this.data.length, lastCol);
  }
  appendRow(values) {
    this.data.push(values.slice());
  }
  getLastRow() {
    return this.data.length;
  }
  getLastColumn() {
    return Math.max(...this.data.map((r) => r.length), 1);
  }
  getMaxRows() {
    return this.data.length;
  }
  setFrozenRows() {}
  getName() {
    return this.name;
  }
}

class MockSpreadsheet {
  constructor() {
    this.sheets = {};
  }
  getSheetByName(name) {
    return this.sheets[name] || null;
  }
  insertSheet(name) {
    const s = new MockSheet(name, []);
    this.sheets[name] = s;
    return s;
  }
  getSheets() {
    return Object.values(this.sheets);
  }
  deleteSheet() {}
  getId() {
    return "mock-spreadsheet-id";
  }
  getUrl() {
    return "https://mock";
  }
}

// Soporte MÍNIMO de expansión de recurrencia para el mock de Calendar.Events.list (US-43,
// caso real esperado: la instructora crea la clase regular como evento "se repite cada
// semana" en vez de un evento nuevo a mano cada semana). Solo entiende
// "RRULE:FREQ=WEEKLY" (+ INTERVAL/COUNT/UNTIL opcionales) — NO es un parser RFC 5545
// completo (sin BYDAY, sin FREQ=DAILY/MONTHLY, sin EXDATE, etc.). Cualquier patrón de
// recurrencia más complejo que este sigue siendo un punto ciego del mock: la expansión real
// la hace el API de Calendar (Calendar.Events.list con singleEvents:true, ya seteado en
// getPilatesAvailabilityEvents), y solo se puede confirmar de verdad contra Calendar real.
function parseWeeklyRecurrence(recurrence) {
  if (!recurrence || !recurrence.length) return null;
  const rule = recurrence.find((r) => /^RRULE:/.test(r));
  if (!rule) return null;

  const parts = {};
  rule.replace("RRULE:", "").split(";").forEach((kv) => {
    const [k, v] = kv.split("=");
    parts[k] = v;
  });
  if (parts.FREQ !== "WEEKLY") return null; // solo semanal, ver comentario arriba

  return {
    interval: Number(parts.INTERVAL) || 1,
    count: parts.COUNT ? Number(parts.COUNT) : null,
    until: parts.UNTIL
      ? new Date(`${parts.UNTIL.slice(0, 4)}-${parts.UNTIL.slice(4, 6)}-${parts.UNTIL.slice(6, 8)}T23:59:59Z`)
      : null,
  };
}

function createMockContext() {
  const spreadsheet = new MockSpreadsheet();

  const NUTRICION_HEADERS = [
    "token", "nombre", "apellido", "correo", "telefono", "tipo_id", "numero_id", "fecha_nacimiento",
    "tipo_cita", "fecha", "hora", "zona_horaria_cliente", "modalidad", "idioma",
    "meet_link", "estado", "fecha_creacion", "recordatorio_enviado", "show_no_show",
    "cancelaciones_tardias", "requiere_pago", "event_id", "asistencia_confirmada",
    // "contador_reagendamientos" (col 24) agregada en US-42 — refleja el estado del Sheet
    // real DESPUÉS de correr addContadorReagendamientosColumnToNutricion() (migración manual,
    // ver app.ts). Contador POR CITA, nunca existió antes en ninguna de las dos pestañas.
    "contador_reagendamientos",
  ];
  // "cancelaciones_tardias" (col 17) agregada en US-33 — refleja el estado del Sheet real
  // DESPUÉS de correr addCancelacionTardiaColumnToPilates() (migración manual, ver app.ts).
  // A diferencia de Nutrición, esta columna no existía antes en Pilates.
  const PILATES_HEADERS = [
    "token", "nombre", "apellido", "correo", "telefono", "tipo_id", "numero_id", "fecha_nacimiento",
    "fecha_clase", "hora_clase", "zona_horaria_cliente", "idioma",
    "estado", "fecha_inscripcion", "recordatorio_enviado", "show_no_show",
    "cancelaciones_tardias",
    // "contador_reagendamientos" (col 18) agregada en US-42 — ver comentario equivalente
    // arriba en NUTRICION_HEADERS. Mismo caso: ninguna de las dos pestañas la tenía antes.
    "contador_reagendamientos",
  ];
  // "duracion_minutos" (col 8) agregada en US-45 — refleja el estado del Sheet real DESPUÉS
  // de correr addDuracionMinutosColumnToCuposPilates() (migración manual, ver app.ts), mismo
  // criterio que "disponibilidad_event_id" (col 7, US-43) arriba.
  const CUPOS_HEADERS = ["fecha_clase", "hora_clase", "inscritos", "max_participantes", "event_id", "meet_link", "disponibilidad_event_id", "duracion_minutos"];
  const CLIENTES_HEADERS = ["correo", "nombre", "apellido", "telefono", "tipo_id", "numero_id", "fecha_nacimiento", "idioma", "cancelaciones_tardias", "requiere_pago"];

  spreadsheet.sheets["Nutrición"] = new MockSheet("Nutrición", NUTRICION_HEADERS);
  spreadsheet.sheets["Pilates"] = new MockSheet("Pilates", PILATES_HEADERS);
  spreadsheet.sheets["Cupos_Pilates"] = new MockSheet("Cupos_Pilates", CUPOS_HEADERS);
  spreadsheet.sheets["Clientes"] = new MockSheet("Clientes", CLIENTES_HEADERS);

  const scriptProperties = {
    _props: {
      SPREADSHEET_ID: "mock-spreadsheet-id",
      PILATES_CALENDAR_ID: "mock-pilates-calendar-id",
      // US-43: calendario de disponibilidad, DISTINTO de PILATES_CALENDAR_ID (ver comentario
      // de getPilatesAvailabilityCalendarId en app.ts) — los tests siembran clases ahí
      // llamando sandbox.Calendar.Events.insert(resource, "mock-pilates-availability-calendar-id").
      PILATES_AVAILABILITY_CALENDAR_ID: "mock-pilates-availability-calendar-id",
      // US-44: calendario de bloques de disponibilidad de NUTRICIÓN, mismo patrón que
      // PILATES_AVAILABILITY_CALENDAR_ID pero para el flujo de Dani/Ali — los tests siembran
      // bloques ahí llamando sandbox.Calendar.Events.insert(resource, "mock-nutricion-availability-calendar-id").
      // DISTINTO tanto de PILATES_AVAILABILITY_CALENDAR_ID como de la Script Property
      // "CALENDARS" (calendario(s) OPERATIVO(s) de nutrición, ver getNutricionAvailabilityCalendarId en app.ts).
      NUTRICION_AVAILABILITY_CALENDAR_ID: "mock-nutricion-availability-calendar-id",
      // US-33: destinatarios de la alerta de cancelación tardía. A propósito son 3 valores
      // DISTINTOS entre sí, a diferencia del entorno de testing real (donde las 3 propiedades
      // apuntan a plantpoweredani.testing@gmail.com por no haber cuentas separadas): así los
      // tests pueden verificar que nutrición le llega a Dani y NO a la instructora, y
      // viceversa — algo imposible de comprobar si las 3 fueran el mismo correo.
      DANI_EMAIL: "mock-dani@test.com",
      INSTRUCTORA_EMAIL: "mock-instructora@test.com",
      ALI_EMAIL: "mock-ali@test.com",
      // Remitente ("Enviar como") de los correos AL CLIENTE de pilates — conceptualmente
      // DISTINTA de INSTRUCTORA_EMAIL (esa es solo destinatario de notificaciones internas, ver
      // getLateCancellationRecipients). Valor propio (no reutiliza mock-instructora@test.com)
      // para que los tests puedan distinguir con certeza cuál de las dos properties está
      // leyendo cada código, en vez de que ambas coincidan por casualidad y oculten un error de
      // getter equivocado.
      PILATES_SENDER_EMAIL: "mock-instructora-sender@test.com",
    },
    getProperty(key) {
      return this._props[key] || null;
    },
    setProperty(key, value) {
      this._props[key] = value;
    },
  };

  let eventCounter = 0;
  const events = {}; // calendarId::eventId -> event

  const CalendarEvents = {
    insert(resource, calendarId, options) {
      eventCounter++;
      const id = `event-${eventCounter}`;
      const event = Object.assign({ id, attendees: resource.attendees || [] }, resource);
      if (resource.conferenceData) {
        event.conferenceData = {
          entryPoints: [{ entryPointType: "video", uri: `https://meet.google.com/mock-${id}` }],
        };
      }
      events[`${calendarId}::${id}`] = event;
      return event;
    },
    get(calendarId, eventId) {
      const ev = events[`${calendarId}::${eventId}`];
      if (!ev) throw new Error(`Mock: evento ${eventId} no encontrado en ${calendarId}`);
      return ev;
    },
    patch(resource, calendarId, eventId) {
      const key = `${calendarId}::${eventId}`;
      const ev = events[key];
      if (!ev) throw new Error(`Mock: evento ${eventId} no encontrado en ${calendarId}`);
      Object.assign(ev, resource);
      return ev;
    },
    remove(calendarId, eventId) {
      const key = `${calendarId}::${eventId}`;
      if (!events[key]) throw new Error(`Mock: evento ${eventId} no encontrado en ${calendarId}`);
      delete events[key];
    },
    // US-43: getPilatesAvailabilityEvents() lee el calendario de disponibilidad con
    // Calendar.Events.list(calendarId, { singleEvents: true, ... }) — los tests siembran
    // eventos ahí con el mismo .insert() de arriba (calendarId =
    // PILATES_AVAILABILITY_CALENDAR_ID), así este mock no necesita ningún mecanismo de
    // siembra separado. Filtra por calendarId y por timeMin/timeMax (solo eventos con
    // start.dateTime, igual que el código real).
    //
    // Si el evento guardado tiene "recurrence" (ver parseWeeklyRecurrence arriba), se expande
    // en instancias individuales AQUÍ, en list-time — igual que hace Calendar real cuando se
    // pide singleEvents:true (la expansión nunca ocurre al hacer insert()). Cada instancia
    // recibe su propio id sintético (mismo esquema que usa Calendar real:
    // "<masterId>_<inicioBasicoISO>") y su propio start/end — el resto de la clase real
    // getPilatesAvailabilityEvents() no distingue una instancia expandida de un evento suelto.
    list(calendarId, options) {
      const timeMin = options && options.timeMin ? new Date(options.timeMin) : null;
      const timeMax = options && options.timeMax ? new Date(options.timeMax) : null;
      const prefix = `${calendarId}::`;
      const inWindow = (d) => (!timeMin || d >= timeMin) && (!timeMax || d <= timeMax);

      const items = [];
      Object.keys(events)
        .filter((key) => key.indexOf(prefix) === 0)
        .forEach((key) => {
          const ev = events[key];
          if (!ev.start || !ev.start.dateTime || !ev.end || !ev.end.dateTime) return;

          const recurrence = parseWeeklyRecurrence(ev.recurrence);
          if (!recurrence) {
            if (inWindow(new Date(ev.start.dateTime))) items.push(ev);
            return;
          }

          const masterStart = new Date(ev.start.dateTime);
          const durationMs = new Date(ev.end.dateTime).getTime() - masterStart.getTime();
          const stepMs = recurrence.interval * 7 * 24 * 3600000;
          for (let n = 0, guard = 0; guard < 520; n++, guard++) {
            if (recurrence.count !== null && n >= recurrence.count) break;
            const instanceStart = new Date(masterStart.getTime() + n * stepMs);
            if (recurrence.until && instanceStart > recurrence.until) break;
            if (timeMax && instanceStart > timeMax) break; // cota real (ver getPilatesAvailabilityEvents): siempre trae timeMax
            if (inWindow(instanceStart)) {
              const instanceEnd = new Date(instanceStart.getTime() + durationMs);
              const instanceId = `${ev.id}_${instanceStart.toISOString().replace(/[-:]/g, "").replace(/\.\d\d\dZ$/, "Z")}`;
              items.push(Object.assign({}, ev, {
                id: instanceId,
                recurrence: undefined,
                start: { dateTime: instanceStart.toISOString() },
                end: { dateTime: instanceEnd.toISOString() },
              }));
            }
          }
        });

      items.sort((a, b) => new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime());
      return { items };
    },
  };

  const sandbox = {
    console,
    Logger: { log: () => {} },
    Utilities: {
      getUuid: () => `uuid-${Math.random().toString(36).slice(2)}`,
      formatDate,
      parseDate,
      // Mock de US-37: alcanza con guardar data/contentType/name tal cual — buildBookingIcsContent
      // ya arma el texto real del .ics en JS puro (no depende de ningún API de Apps Script), así
      // que este mock solo necesita representar el "objeto Blob" para que
      // GmailApp.sendEmail({attachments: [...]}) tenga algo que registrar.
      //
      // setContentType() es mutable y devuelve el propio blob (mismo patrón que la clase Blob
      // real) — agregado tras el bug real de US-37: Apps Script real rechaza un contentType
      // con parámetros extra (';') en el constructor de newBlob, así que el código real ahora
      // crea el blob con un tipo limpio y lo enriquece después vía setContentType(). El mock
      // NO reproduce ese rechazo (sigue siendo un blind spot documentado, igual que
      // insertCheckboxes/createTemplateFromFile) — solo necesita soportar la llamada para que
      // los tests puedan verificar el content-type FINAL tras el segundo paso.
      newBlob: (data, contentType, name) => {
        const blob = {
          _contentType: contentType,
          getDataAsString: () => data,
          getContentType: () => blob._contentType,
          getName: () => name,
          // getBytes() agregado para el diagnóstico pre-send de US-37 (attachments[0].getBytes().length)
          // — no necesita ser un array real de bytes UTF-8 exacto para los tests, solo tener
          // .length correcto.
          getBytes: () => new Array(Buffer.byteLength(data, "utf8")),
          setContentType: (newContentType) => {
            blob._contentType = newContentType;
            return blob;
          },
        };
        return blob;
      },
      // Mock de US-37 (diagnóstico post-envío): no hay tiempo real que esperar en el harness.
      sleep: () => {},
      // Mock de US-37 (imágenes embebidas vía inlineImages): base64Decode() real de Apps
      // Script devuelve un array de bytes — Buffer.from(...) alcanza para los tests, que solo
      // necesitan pasar por Utilities.newBlob() sin tronar.
      base64Decode: (str) => Buffer.from(str, "base64"),
    },
    PropertiesService: {
      getScriptProperties: () => scriptProperties,
    },
    SpreadsheetApp: {
      openById: () => spreadsheet,
      create: () => spreadsheet,
      flush: () => {},
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {},
        releaseLock: () => {},
      }),
    },
    CalendarApp: {
      createCalendar: () => ({ getId: () => "mock-created-calendar-id" }),
    },
    // Mock de US-37 (PRUEBA-B, diagnóstico): createFile()+getAs() alcanza con devolver un
    // blob-like consistente con el resto del mock (mismos métodos que Utilities.newBlob) —
    // setTrashed() es un no-op, no hace falta rastrear estado de papelera para los tests.
    DriveApp: {
      createFile: (name, content, mimeType) => ({
        getAs: (asMimeType) => {
          const blob = {
            _contentType: asMimeType || mimeType,
            getDataAsString: () => content,
            getContentType: () => blob._contentType,
            getName: () => name,
            getBytes: () => new Array(Buffer.byteLength(content, "utf8")),
            setContentType: (newContentType) => {
              blob._contentType = newContentType;
              return blob;
            },
          };
          return blob;
        },
        setTrashed: () => {},
      }),
    },
    Calendar: {
      Freebusy: {
        query: () => ({ calendars: { primary: { busy: [] } } }),
      },
      Events: CalendarEvents,
    },
    HtmlService: {
      // getContent() agregado para US-37: buildInlineImagesForTemplate() reutiliza
      // createHtmlOutputFromFile() para leer los archivos asset_*.html (que contienen SOLO un
      // string base64, sin HTML real — mismo truco que las plantillas de correo). El mock
      // devuelve un base64 válido fijo ("bW9jay1pbWFnZS1kYXRh" = "mock-image-data") sin
      // importar el nombre de archivo — no necesita representar cada asset real por separado,
      // solo que Utilities.base64Decode() tenga algo válido para decodificar.
      createHtmlOutputFromFile: () => ({
        setXFrameOptionsMode: function () { return this; },
        addMetaTag: function () { return this; },
        append: function () { return this; },
        getContent: () => "bW9jay1pbWFnZS1kYXRh",
      }),
      createHtmlOutput: () => ({
        setXFrameOptionsMode: function () { return this; },
        addMetaTag: function () { return this; },
      }),
      // Mock de US-12: bookTimeslot llama a renderConfirmationEmail(), que usa
      // createTemplateFromFile() para las 4 plantillas de correo (US-11). El harness no lee
      // los .html reales de backend/templates/ — solo necesita aceptar cualquier propiedad
      // asignada (template.xxx = ...) y devolver contenido no vacío en evaluate().getContent().
      createTemplateFromFile: (filename) => {
        const template = { __filename: filename };
        template.evaluate = () => ({ getContent: () => `<html-mock file="${filename}"></html-mock>` });
        return template;
      },
      XFrameOptionsMode: { ALLOWALL: "ALLOWALL" },
    },
    // Mock de US-12: la URL real de deploy no existe en testing local — basta con una URL
    // fija para que linkReagendar se construya sin lanzar error.
    // Mock de US-14: getProjectTriggers()/newTrigger() para installRemindersTrigger — no
    // testeado línea por línea en el harness (se ejecuta manualmente en el editor real), pero
    // se deja el mock mínimo para que no truene si algún test llega a invocarla.
    // deleteTrigger()/everyMinutes() agregados en US-45 para installPilatesAvailabilitySyncTrigger
    // (que ahora borra el/los trigger(s) viejo(s) antes de instalar el de 5 minutos, ver Test 79)
    // — cada trigger creado guarda su período (_period) para que los tests puedan verificar
    // CUÁL frecuencia quedó instalada, no solo que "algún" trigger existe.
    ScriptApp: {
      getService: () => ({ getUrl: () => "https://mock-script-url.example/exec" }),
      getProjectTriggers: () => sandbox.__triggers || [],
      deleteTrigger: (trigger) => {
        sandbox.__triggers = (sandbox.__triggers || []).filter((t) => t !== trigger);
      },
      newTrigger: (handlerFunction) => ({
        timeBased: () => ({
          everyHours: (n) => ({
            create: () => {
              sandbox.__triggers = sandbox.__triggers || [];
              const trigger = { getHandlerFunction: () => handlerFunction, _period: `everyHours(${n})` };
              sandbox.__triggers.push(trigger);
              return trigger;
            },
          }),
          everyMinutes: (n) => ({
            create: () => {
              sandbox.__triggers = sandbox.__triggers || [];
              const trigger = { getHandlerFunction: () => handlerFunction, _period: `everyMinutes(${n})` };
              sandbox.__triggers.push(trigger);
              return trigger;
            },
          }),
        }),
      }),
    },
    // Mock de US-12: registra los correos "enviados" en sandbox.__sentEmails para que los
    // tests puedan verificar que bookTimeslot intentó mandar el correo de confirmación, sin
    // depender de una cuenta de Gmail real.
    GmailApp: {
      sendEmail: (to, subject, body, options) => {
        sandbox.__sentEmails = sandbox.__sentEmails || [];
        sandbox.__sentEmails.push({ to, subject, body, options });
      },
    },
    // Mock de US-37: serveIcsDownload (doGet ?action=ics) usa ContentService en vez de
    // HtmlService porque necesita controlar el Content-Type de la respuesta (text/calendar,
    // vía MimeType.ICAL) — HtmlService siempre sirve text/html. Los valores del enum solo
    // necesitan ser distintos entre sí; los tests verifican vía getMimeType()/getContent().
    ContentService: {
      MimeType: { ICAL: "ICAL", TEXT: "TEXT" },
      createTextOutput: (content) => {
        let mimeType = "TEXT";
        const output = {
          setMimeType: (mt) => {
            mimeType = mt;
            return output;
          },
          getMimeType: () => mimeType,
          getContent: () => content,
        };
        return output;
      },
    },
  };

  return { sandbox, spreadsheet, events, CalendarEvents };
}

module.exports = { createMockContext, formatDate, parseDate };
