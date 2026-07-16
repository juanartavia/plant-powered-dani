"use strict";
// Mock mínimo del entorno de Google Apps Script para poder correr la lógica pura de
// app.ts en Node vía vm.runInNewContext, sin ningún framework de test (el proyecto no
// tiene uno instalado). Solo implementa lo que las funciones de US-06 realmente usan.

const TZ_OFFSET_HOURS = 6; // Costa Rica = UTC-6 todo el año (sin DST)

function crLocalFromUtc(date) {
  // Devuelve un Date cuyos campos getUTC* representan la hora local de Costa Rica.
  return new Date(date.getTime() - TZ_OFFSET_HOURS * 3600000);
}

function pad(n, len) {
  len = len || 2;
  return String(n).padStart(len, "0");
}

function formatDate(date, _tz, pattern) {
  const d = crLocalFromUtc(date);
  const y = d.getUTCFullYear();
  const mo = pad(d.getUTCMonth() + 1);
  const da = pad(d.getUTCDate());
  const h = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());
  if (pattern === "yyyy-MM-dd") return `${y}-${mo}-${da}`;
  if (pattern === "HH:mm") return `${h}:${mi}`;
  if (pattern === "@") return "@"; // no usado como pattern de fecha real
  // yyyy-MM-dd'T'HH:mm:ss / "yyyy-MM-dd HH:mm:ss" / cualquier otro con todos los campos
  return `${y}-${mo}-${da} ${h}:${mi}:${s}`;
}

function parseDate(str, _tz, _pattern) {
  // Extrae los dígitos en orden (funciona para "yyyy-MM-dd HH:mm" y variantes similares,
  // que son los únicos patrones que parseSheetDateTime usa en app.ts).
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

function createMockContext() {
  const spreadsheet = new MockSpreadsheet();

  const NUTRICION_HEADERS = [
    "token", "nombre", "apellido", "correo", "telefono", "tipo_id", "numero_id", "fecha_nacimiento",
    "tipo_cita", "fecha", "hora", "zona_horaria_cliente", "modalidad", "idioma",
    "meet_link", "estado", "fecha_creacion", "recordatorio_enviado", "show_no_show",
    "cancelaciones_tardias", "requiere_pago", "event_id",
  ];
  const PILATES_HEADERS = [
    "token", "nombre", "apellido", "correo", "telefono", "tipo_id", "numero_id", "fecha_nacimiento",
    "fecha_clase", "hora_clase", "zona_horaria_cliente", "idioma",
    "estado", "fecha_inscripcion", "recordatorio_enviado", "show_no_show",
  ];
  const CUPOS_HEADERS = ["fecha_clase", "hora_clase", "inscritos", "max_participantes", "event_id", "meet_link"];
  const CLIENTES_HEADERS = ["correo", "nombre", "apellido", "telefono", "tipo_id", "numero_id", "fecha_nacimiento", "idioma", "cancelaciones_tardias", "requiere_pago"];

  spreadsheet.sheets["Nutrición"] = new MockSheet("Nutrición", NUTRICION_HEADERS);
  spreadsheet.sheets["Pilates"] = new MockSheet("Pilates", PILATES_HEADERS);
  spreadsheet.sheets["Cupos_Pilates"] = new MockSheet("Cupos_Pilates", CUPOS_HEADERS);
  spreadsheet.sheets["Clientes"] = new MockSheet("Clientes", CLIENTES_HEADERS);

  const scriptProperties = {
    _props: {
      SPREADSHEET_ID: "mock-spreadsheet-id",
      PILATES_CALENDAR_ID: "mock-pilates-calendar-id",
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
  };

  const sandbox = {
    console,
    Logger: { log: () => {} },
    Utilities: {
      getUuid: () => `uuid-${Math.random().toString(36).slice(2)}`,
      formatDate,
      parseDate,
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
    Calendar: {
      Freebusy: {
        query: () => ({ calendars: { primary: { busy: [] } } }),
      },
      Events: CalendarEvents,
    },
    HtmlService: {
      createHtmlOutputFromFile: () => ({
        setXFrameOptionsMode: function () { return this; },
        addMetaTag: function () { return this; },
        append: function () { return this; },
      }),
      createHtmlOutput: () => ({
        setXFrameOptionsMode: function () { return this; },
        addMetaTag: function () { return this; },
      }),
      XFrameOptionsMode: { ALLOWALL: "ALLOWALL" },
    },
  };

  return { sandbox, spreadsheet, events, CalendarEvents };
}

module.exports = { createMockContext, formatDate, parseDate };
