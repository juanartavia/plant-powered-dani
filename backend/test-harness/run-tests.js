"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createMockContext, formatDate } = require("./gas-mock");

const APP_JS = path.join(__dirname, "out", "app.js");
const code = fs.readFileSync(APP_JS, "utf8");

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  OK  ${msg}`);
  } else {
    failed++;
    console.log(`  FAIL  ${msg}`);
  }
}

function freshCtx() {
  const { sandbox, spreadsheet, events } = createMockContext();
  vm.createContext(sandbox);
  new vm.Script(code, { filename: "app.js" }).runInContext(sandbox);
  // vm.createContext no expone los built-ins del NUEVO realm como propiedades leíbles de
  // `sandbox` (p.ej. `sandbox.Date` es undefined pese a que `new Date()` funciona bien DENTRO
  // del código corrido con runInContext) — hay que pedirlo explícitamente evaluando el
  // identificador dentro del contexto. Sin esto, un `new Date(...)` armado en este archivo
  // (el realm de Node normal) nunca pasa `instanceof Date` dentro de app.js (que corre en el
  // realm del vm) — necesario para test32 (simulateSheetsDateCoercion), que necesita construir
  // Date "coercionados" que SÍ sean reconocidos como tales por normalizeSheetDateCell().
  sandbox.Date = vm.runInContext("Date", sandbox);
  return { sandbox, spreadsheet, events };
}

// Mueve manualmente la fecha/hora guardada de una reserva ya creada (simula que el tiempo
// pasó y la cita quedó a "hoursFromNow" horas de distancia) — bookTimeslot no permite crear
// directamente una cita a menos de 48hrs (MIN_BOOKING_HOURS), así que las pruebas de ventana
// de 24hrs (CANCELLATION_HOURS) necesitan este ajuste posterior a la creación.
function moveBookingTo(sandbox, sheetName, row, fechaCol, horaCol, hoursFromNow) {
  const target = new Date(Date.now() + hoursFromNow * 3600000);
  const fecha = formatDate(target, "America/Costa_Rica", "yyyy-MM-dd");
  const hora = formatDate(target, "America/Costa_Rica", "HH:mm");
  const sheet = sandbox.SpreadsheetApp.openById().getSheetByName(sheetName);
  sheet.getRange(row, fechaCol, 1, 1).setValue(fecha);
  sheet.getRange(row, horaCol, 1, 1).setValue(hora);
}

function isoInHours(h) {
  return new Date(Date.now() + h * 3600000).toISOString();
}

// Simula la coerción REAL de Google Sheets sobre las celdas fecha/hora de una cita (bug
// confirmado en producción, 21 jul: una fila measurement con fecha=2026-07-23/hora=10:00
// no disparó su recordatorio de 48hrs pese a estar dentro de la ventana). El mock de este
// harness (gas-mock.js) NUNCA coerciona strings a Date automáticamente como sí hace Google
// Sheets real — es un punto ciego documentado del mock (mismo patrón que insertCheckboxes/
// clearContent antes de la nota #30). Esta función reproduce a mano lo que Sheets real le
// haría a esas dos celdas si appendBookingToSheet las escribiera SIN forzar
// setNumberFormat("@") (el estado ANTES del fix de esta tarjeta): la celda "fecha"
// (yyyy-MM-dd, sin componente de hora) queda anclada a medianoche UTC de ese mismo
// año/mes/día; la celda "hora" (HH:mm, sin componente de fecha) queda anclada a las
// hh:mm UTC del día base que usa Sheets para valores de solo-hora (30 de diciembre de
// 1899) — mismo mecanismo, ya probado en este proyecto, que causó el corrimiento de
// fecha_nacimiento (nota técnica #29).
function simulateSheetsDateCoercion(sandbox, sheetName, row, fechaCol, horaCol, targetInstant) {
  const fechaStr = formatDate(targetInstant, "America/Costa_Rica", "yyyy-MM-dd");
  const horaStr = formatDate(targetInstant, "America/Costa_Rica", "HH:mm");
  const [y, mo, da] = fechaStr.split("-").map(Number);
  const [hh, mi] = horaStr.split(":").map(Number);

  // OJO: hay que construir estos Date con el `Date` DEL CONTEXTO DE LA VM (sandbox.Date), no
  // el `Date` global de este archivo — app.js corre en su propio vm.createContext (ver
  // freshCtx()/gas-mock.js), y `value instanceof Date` dentro de normalizeSheetDateCell se
  // evalúa contra el `Date` de ESE contexto. Un Date construido con el `Date` de este archivo
  // (otro "realm" de Node) nunca pasa `instanceof Date` allá adentro, así que quedaría
  // silenciosamente tratado como "ya es texto plano" (rama String(value)) en vez de simular
  // la coerción real que se quiere probar — un punto ciego del harness en sí (vm por
  // contexto), no relacionado con el bug real de Sheets que este test reproduce.
  const coercedFecha = new sandbox.Date(sandbox.Date.UTC(y, mo - 1, da, 0, 0, 0));
  const coercedHora = new sandbox.Date(sandbox.Date.UTC(1899, 11, 30, hh, mi, 0));

  const sheet = sandbox.SpreadsheetApp.openById().getSheetByName(sheetName);
  sheet.getRange(row, fechaCol, 1, 1).setValue(coercedFecha);
  sheet.getRange(row, horaCol, 1, 1).setValue(coercedHora);
  return { fechaStr, horaStr };
}

function findTokenRow(sheet, token) {
  for (let i = 1; i < sheet.data.length; i++) {
    if (sheet.data[i][0] === token) return i + 1;
  }
  return -1;
}

// ── Test 1: reagendar DENTRO de la ventana de 24hrs → éxito ────────────────────────────
(function test1() {
  console.log("Test 1: reagendar dentro de la ventana (éxito)");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "initial", isoInHours(72), "Ana", "Perez", "ana@test.com", "8888-0000", "cedula", "1-2222-3333",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);
  // La cita ya está a 72hrs (> 24hrs) — no hace falta moverla, se reagenda tal cual.
  const returnedToken = sandbox.rescheduleBooking(token, isoInHours(96), "America/Costa_Rica");
  assert(returnedToken === token, "retorna el mismo token");
  assert(nutSheet.getRange(row, 16, 1, 1).getValue() === "Reagendada", "estado pasa a 'Reagendada'");
  assert(nutSheet.getRange(row, 10, 1, 1).getValue() === formatDate(new Date(isoInHours(96)), "", "yyyy-MM-dd"), "fecha actualizada");
})();

// ── Test 2: reagendar FUERA de la ventana → bloqueado + contador de CLIENTE incrementado ─
(function test2() {
  console.log("Test 2: reagendar fuera de la ventana (bloqueado, incrementa contador de cliente)");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "initial", isoInHours(72), "Beto", "Gomez", "beto@test.com", "8888-0001", "cedula", "1-2222-4444",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);
  moveBookingTo(sandbox, "Nutrición", row, 10, 11, 10); // ahora falta menos de 24hrs

  let threw = null;
  try {
    sandbox.rescheduleBooking(token, isoInHours(96), "America/Costa_Rica");
  } catch (e) {
    threw = e.message;
  }
  assert(threw === "VENTANA_REAGENDAMIENTO_VENCIDA", "lanza VENTANA_REAGENDAMIENTO_VENCIDA");

  const status = sandbox.getClientPaymentStatus("beto@test.com");
  assert(status.cancelaciones_tardias === 1, "contador de cliente sube a 1");
  assert(status.requiere_pago === false, "requiere_pago sigue false con solo 1");
})();

// ── Test 3: cancelar DENTRO de la ventana → éxito, no cuenta como tardía ────────────────
(function test3() {
  console.log("Test 3: cancelar dentro de la ventana (a tiempo)");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "followup", isoInHours(72), "Carla", "Diaz", "carla@test.com", "8888-0002", "cedula", "1-2222-5555",
    "1990-01-01", "es", "presencial", "America/Costa_Rica"
  );
  const result = sandbox.cancelBooking(token);
  assert(result.lateCancellation === false, "no se marca como tardía");

  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);
  assert(nutSheet.getRange(row, 16, 1, 1).getValue() === "Cancelada", "estado pasa a 'Cancelada'");

  const status = sandbox.getClientPaymentStatus("carla@test.com");
  assert(status.cancelaciones_tardias === 0, "contador de cliente permanece en 0");
})();

// ── Test 4: cancelar FUERA de la ventana → tardía, incrementa contador ──────────────────
(function test4() {
  console.log("Test 4: cancelar fuera de la ventana (tardía)");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "measurement", isoInHours(72), "Dario", "Leon", "dario@test.com", "8888-0003", "cedula", "1-2222-6666",
    "1990-01-01", "es", "presencial", "America/Costa_Rica"
  );
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);
  moveBookingTo(sandbox, "Nutrición", row, 10, 11, 5); // faltan 5hrs, < CANCELLATION_HOURS

  const result = sandbox.cancelBooking(token);
  assert(result.lateCancellation === true, "se marca como tardía");
  assert(nutSheet.getRange(row, 16, 1, 1).getValue() === "Cancelada", "estado igual pasa a 'Cancelada' (no se bloquea la cancelación)");

  const status = sandbox.getClientPaymentStatus("dario@test.com");
  assert(status.cancelaciones_tardias === 1, "contador de cliente sube a 1");
})();

// ── Test 5: 2 cancelaciones tardías consecutivas del MISMO cliente en citas DISTINTAS ───
(function test5() {
  console.log("Test 5: 2 cancelaciones tardías consecutivas (tipos distintos) → requiere_pago=true");
  const { sandbox } = freshCtx();
  const correo = "elena@test.com";

  const token1 = sandbox.bookTimeslot(
    "initial", isoInHours(72), "Elena", "Ruiz", correo, "8888-0004", "cedula", "1-2222-7777",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row1 = findTokenRow(nutSheet, token1);
  moveBookingTo(sandbox, "Nutrición", row1, 10, 11, 3);
  const r1 = sandbox.cancelBooking(token1);
  assert(r1.lateCancellation === true, "primera cancelación (initial) es tardía");
  assert(sandbox.getClientPaymentStatus(correo).requiere_pago === false, "requiere_pago sigue false tras 1");

  const token2 = sandbox.bookTimeslot(
    "followup", isoInHours(80), "Elena", "Ruiz", correo, "8888-0004", "cedula", "1-2222-7777",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const row2 = findTokenRow(nutSheet, token2);
  moveBookingTo(sandbox, "Nutrición", row2, 10, 11, 4);
  const r2 = sandbox.cancelBooking(token2);
  assert(r2.lateCancellation === true, "segunda cancelación (followup, tipo distinto) también es tardía");

  const status = sandbox.getClientPaymentStatus(correo);
  assert(status.cancelaciones_tardias === 2, "contador de cliente llega a 2");
  assert(status.requiere_pago === true, "requiere_pago se marca true tras 2 consecutivas de tipos distintos");
})();

// ── Test 6: el historial nunca borra filas (Nutrición + Pilates) ───────────────────────
(function test6() {
  console.log("Test 6: el historial nunca borra filas");
  const { sandbox } = freshCtx();
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const pilSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Pilates");
  const rowsBeforeNut = nutSheet.data.length;
  const rowsBeforePil = pilSheet.data.length;

  const tokenA = sandbox.bookTimeslot(
    "initial", isoInHours(72), "Fabio", "Soto", "fabio@test.com", "8888-0005", "cedula", "1-2222-8888",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const tokenB = sandbox.bookTimeslot(
    "pilates", isoInHours(96), "Gina", "Vega", "gina@test.com", "8888-0006", "cedula", "1-2222-9999",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  assert(nutSheet.data.length === rowsBeforeNut + 1, "Nutrición crece en 1 fila al agendar");
  assert(pilSheet.data.length === rowsBeforePil + 1, "Pilates crece en 1 fila al agendar");

  sandbox.cancelBooking(tokenA);
  sandbox.cancelBooking(tokenB);
  assert(nutSheet.data.length === rowsBeforeNut + 1, "Nutrición NO pierde filas al cancelar");
  assert(pilSheet.data.length === rowsBeforePil + 1, "Pilates NO pierde filas al cancelar");

  const rowA = findTokenRow(nutSheet, tokenA);
  const rowB = findTokenRow(pilSheet, tokenB);
  assert(rowA > 0, "fila de Nutrición sigue existiendo con su token intacto");
  assert(rowB > 0, "fila de Pilates sigue existiendo con su token intacto");
  assert(nutSheet.getRange(rowA, 16, 1, 1).getValue() === "Cancelada", "fila de Nutrición queda marcada 'Cancelada', no borrada");
  assert(pilSheet.getRange(rowB, 13, 1, 1).getValue() === "Cancelada", "fila de Pilates queda marcada 'Cancelada', no borrada");
})();

// ── Test 7: findBookingByToken lanza TOKEN_NO_ENCONTRADO para un token inexistente ──────
(function test7() {
  console.log("Test 7: findBookingByToken con token inexistente");
  const { sandbox } = freshCtx();
  let threw = null;
  try {
    sandbox.findBookingByToken("token-que-no-existe");
  } catch (e) {
    threw = e.message;
  }
  assert(threw === "TOKEN_NO_ENCONTRADO", "lanza TOKEN_NO_ENCONTRADO");
})();

// ── Test 8: reagendar pilates mueve al cliente de un slot grupal a otro respetando cupo ─
(function test8() {
  console.log("Test 8: reagendar pilates (grupal) mueve de slot y respeta cupo");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "pilates", isoInHours(72), "Hugo", "Rojas", "hugo@test.com", "8888-0007", "cedula", "1-2223-0000",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const cuposSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Cupos_Pilates");
  const oldSlotRowBefore = cuposSheet.data.find((r) => r[1] === formatDate(new Date(isoInHours(72)), "", "HH:mm"));
  sandbox.rescheduleBooking(token, isoInHours(120), "America/Costa_Rica");

  const pilSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Pilates");
  const row = findTokenRow(pilSheet, token);
  assert(pilSheet.getRange(row, 13, 1, 1).getValue() === "Reagendada", "estado pasa a 'Reagendada'");
  assert(pilSheet.getRange(row, 9, 1, 1).getValue() === formatDate(new Date(isoInHours(120)), "", "yyyy-MM-dd"), "fecha_clase actualizada al nuevo slot");
})();

// ── Test 9: reagendar una cita VIEJA de nutrición sin event_id (pre-US-06) no bloquea ──
(function test9() {
  console.log("Test 9: reagendar cita sin event_id (pre-migración) actualiza el Sheet igual, sin lanzar error");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "initial", isoInHours(72), "Ivan", "Mora", "ivan@test.com", "8888-0008", "cedula", "1-2223-1111",
    "1990-01-01", "es", "presencial", "America/Costa_Rica"
  );
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);

  // Simula una fila creada ANTES de correr addEventIdColumnToNutricion(): sin event_id.
  nutSheet.getRange(row, 22, 1, 1).setValue("");

  let threw = null;
  let returnedToken = null;
  try {
    returnedToken = sandbox.rescheduleBooking(token, isoInHours(96), "America/Costa_Rica");
  } catch (e) {
    threw = e.message;
  }

  assert(threw === null, "NO lanza ningún error (a diferencia del comportamiento anterior con EVENTO_CALENDAR_NO_ENCONTRADO)");
  assert(returnedToken === token, "retorna el mismo token");
  assert(nutSheet.getRange(row, 16, 1, 1).getValue() === "Reagendada", "estado sí pasa a 'Reagendada' en el Sheet");
  assert(nutSheet.getRange(row, 10, 1, 1).getValue() === formatDate(new Date(isoInHours(96)), "", "yyyy-MM-dd"), "fecha sí se actualiza en el Sheet");
})();

// ── Test 10: una reserva NUEVA de nutrición sí guarda event_id, y reschedule/cancel mueven ─
// ── el evento REAL de Calendar (no caen en el camino de "sin event_id") ─────────────────
(function test10() {
  console.log("Test 10: reserva nueva de nutrición guarda event_id y reschedule/cancel mueven el evento real");
  const { sandbox, events } = freshCtx();

  const token = sandbox.bookTimeslot(
    "initial", isoInHours(72), "Julia", "Vindas", "julia@test.com", "8888-0009", "cedula", "1-2223-2222",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);

  const eventId = nutSheet.getRange(row, 22, 1, 1).getValue();
  assert(!!eventId, "bookTimeslot guarda un event_id no vacío en la columna 21 al crear la cita");

  const calendarId = "primary"; // CALENDARS por defecto cuando no hay Script Property CALENDARS
  const eventKey = `${calendarId}::${eventId}`;
  assert(!!events[eventKey], "el evento realmente existe en el Calendar mock bajo ese event_id");
  const originalStart = events[eventKey].start.dateTime;

  // Reagendar: como SÍ hay event_id, debe tomar el camino de Calendar.Events.patch (mover el
  // evento real), NO el camino de "sin event_id" (que solo deja un log y no toca Calendar).
  const newTimeslot = isoInHours(100);
  sandbox.rescheduleBooking(token, newTimeslot, "America/Costa_Rica");
  assert(events[eventKey].start.dateTime === new Date(newTimeslot).toISOString(), "el evento real de Calendar SÍ se movió al nuevo horario (patch, no el camino de 'sin event_id')");
  assert(events[eventKey].start.dateTime !== originalStart, "la hora de inicio del evento cambió respecto a la original");

  // Cancelar: como SÍ hay event_id, cancelNutricionCalendarEvent debe borrar el evento real.
  sandbox.cancelBooking(token);
  assert(!events[eventKey], "el evento real de Calendar se elimina al cancelar (event_id sí encontrado)");
})();

// Devuelve el string "yyyy-MM-dd" de "hoy" (CR) o de "hoy + offsetDays" (CR).
function crDateStr(offsetDays) {
  return formatDate(new Date(Date.now() + (offsetDays || 0) * 86400000), "America/Costa_Rica", "yyyy-MM-dd");
}

// Fecha de nacimiento de alguien que cumple exactamente `years` años en CR el día
// "hoy + offsetDays" (mes/día de esa fecha, año = ese año - years).
function birthdateTurningAgeOn(years, offsetDays) {
  const [y, m, d] = crDateStr(offsetDays).split("-");
  return `${Number(y) - years}-${m}-${d}`;
}

function clientRecord(overrides) {
  return Object.assign(
    {
      correo: "menor@test.com",
      nombre: "Menor",
      apellido: "Test",
      telefono: "8888-9999",
      tipoId: "cedula",
      numeroId: "1-0000-0000",
      fecha_nacimiento: "1990-01-01",
      idioma: "es",
    },
    overrides
  );
}

// ── Test 11: upsertClient BLOQUEA a quien cumple 15 años MAÑANA (hoy tiene 14) ──────────
(function test11() {
  console.log("Test 11: upsertClient bloquea menor de 15 (cumple mañana) y no escribe nada");
  const { sandbox } = freshCtx();
  const clientesSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Clientes");
  const rowsBefore = clientesSheet.data.length;

  const birthdate = birthdateTurningAgeOn(15, 1); // cumple 15 mañana -> hoy tiene 14
  let threw = null;
  try {
    sandbox.upsertClient(clientRecord({ correo: "manana15@test.com", fecha_nacimiento: birthdate }), "initial");
  } catch (e) {
    threw = e.message;
  }
  assert(threw === "EDAD_MINIMA_NO_CUMPLIDA", "lanza EDAD_MINIMA_NO_CUMPLIDA");
  assert(clientesSheet.data.length === rowsBefore, "NO se agregó ninguna fila a Clientes");
})();

// ── Test 12: upsertClient PERMITE a quien cumple 15 años HOY ────────────────────────────
(function test12() {
  console.log("Test 12: upsertClient permite a quien cumple 15 años exactamente hoy");
  const { sandbox } = freshCtx();
  const clientesSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Clientes");
  const rowsBefore = clientesSheet.data.length;

  const birthdate = birthdateTurningAgeOn(15, 0); // cumple 15 hoy
  let threw = null;
  try {
    sandbox.upsertClient(clientRecord({ correo: "hoy15@test.com", fecha_nacimiento: birthdate }), "initial");
  } catch (e) {
    threw = e.message;
  }
  assert(threw === null, "no lanza ningún error");
  assert(clientesSheet.data.length === rowsBefore + 1, "SÍ se agregó la fila a Clientes");
})();

// ── Test 13: bookTimeslot bloquea la misma edad límite (defensa en profundidad) ─────────
(function test13() {
  console.log("Test 13: bookTimeslot bloquea menor de 15 (defensa en profundidad) sin escribir en Nutrición");
  const { sandbox } = freshCtx();
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const rowsBefore = nutSheet.data.length;

  const birthdate = birthdateTurningAgeOn(15, 1); // cumple 15 mañana -> hoy tiene 14
  let threw = null;
  try {
    sandbox.bookTimeslot(
      "initial", isoInHours(72), "Menor", "DeEdad", "menoredad@test.com", "8888-1234", "cedula", "1-0000-1111",
      birthdate, "es", "virtual", "America/Costa_Rica"
    );
  } catch (e) {
    threw = e.message;
  }
  assert(threw === "EDAD_MINIMA_NO_CUMPLIDA", "lanza EDAD_MINIMA_NO_CUMPLIDA");
  assert(nutSheet.data.length === rowsBefore, "NO se agregó ninguna fila a Nutrición");
})();

// ── Test 13b: mismo bloqueo de edad, pero para type="pilates" — no toca Pilates ni el
// contador de cupos en Cupos_Pilates (rama de negocio completamente distinta a Nutrición,
// ver appendBookingToSheet: pilates incrementa "inscritos" en Cupos_Pilates ANTES de
// escribir en Pilates — ambos deben quedar intactos si assertMinimumAge bloquea antes de
// llegar a appendBookingToSheet).
(function test13b() {
  console.log("Test 13b: bookTimeslot bloquea menor de 15 en pilates, sin escribir en Pilates ni tocar Cupos_Pilates");
  const { sandbox } = freshCtx();
  const pilSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Pilates");
  const cuposSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Cupos_Pilates");
  const pilRowsBefore = pilSheet.data.length;
  const cuposRowsBefore = cuposSheet.data.length;

  const birthdate = birthdateTurningAgeOn(15, 1); // cumple 15 mañana -> hoy tiene 14
  let threw = null;
  try {
    sandbox.bookTimeslot(
      "pilates", isoInHours(72), "Menor", "Pilates", "menoredadpilates@test.com", "8888-1235", "cedula", "1-0000-1112",
      birthdate, "es", "virtual", "America/Costa_Rica"
    );
  } catch (e) {
    threw = e.message;
  }
  assert(threw === "EDAD_MINIMA_NO_CUMPLIDA", "lanza EDAD_MINIMA_NO_CUMPLIDA");
  assert(pilSheet.data.length === pilRowsBefore, "NO se agregó ninguna fila a Pilates");
  assert(cuposSheet.data.length === cuposRowsBefore, "NO se creó ninguna fila nueva en Cupos_Pilates");
})();

// ── Test 14: pilates se puede reservar con 12hrs de anticipación (no 48) ────────────────
(function test14() {
  console.log("Test 14: pilates permite reservar con solo 12hrs de anticipación");
  const { sandbox } = freshCtx();
  let threw = null;
  try {
    sandbox.bookTimeslot(
      "pilates", isoInHours(13), "Kelly", "Soto", "kelly-pilates@test.com", "8888-2222", "cedula", "1-0000-2222",
      "1990-01-01", "es", "virtual", "America/Costa_Rica"
    );
  } catch (e) {
    threw = e.message;
  }
  assert(threw === null, "no lanza VENTANA_MINIMA_NO_CUMPLIDA con 13hrs de anticipación (> PILATES_MIN_BOOKING_HOURS=12)");
})();

// ── Test 15: nutrición SIGUE bloqueada con 12hrs de anticipación (sigue exigiendo 48) ───
(function test15() {
  console.log("Test 15: nutrición sigue exigiendo 48hrs, sin cambios (12hrs no alcanza)");
  const { sandbox } = freshCtx();
  let threw = null;
  try {
    sandbox.bookTimeslot(
      "initial", isoInHours(13), "Kelly", "Soto", "kelly-nutricion@test.com", "8888-3333", "cedula", "1-0000-3333",
      "1990-01-01", "es", "virtual", "America/Costa_Rica"
    );
  } catch (e) {
    threw = e.message;
  }
  assert(threw === "VENTANA_MINIMA_NO_CUMPLIDA", "lanza VENTANA_MINIMA_NO_CUMPLIDA con solo 13hrs de anticipación (nutrición sigue en 48hrs)");
})();

// ── Test 16: bookTimeslot envía correo de confirmación (US-12) ──────────────────────────
(function test16() {
  console.log("Test 16: bookTimeslot envía correo de confirmación al agendar (nutrición)");
  const { sandbox } = freshCtx();
  sandbox.bookTimeslot(
    "initial", isoInHours(72), "Sofia", "Mora", "sofia-correo@test.com", "8888-4444", "cedula", "1-0000-4444",
    "1990-01-01", "es", "presencial", "America/Costa_Rica"
  );
  const sent = sandbox.__sentEmails || [];
  assert(sent.length === 2, "se envían exactamente 2 correos (confirmación al cliente + notificación interna US-13/US-30)");
  assert(sent[0].to === "sofia-correo@test.com", "el correo de confirmación va dirigido al cliente que agendó");
  assert(typeof sent[0].subject === "string" && sent[0].subject.length > 0, "el correo trae un subject no vacío");
  assert(sent[0].options && sent[0].options.htmlBody && sent[0].options.htmlBody.length > 0, "el correo trae htmlBody no vacío");
  assert(sent[1].to.includes("plantpoweredani.testing@gmail.com"), "la notificación interna va a los destinatarios placeholder (Dani/Ali)");
  assert(sent[1].subject.startsWith("Nueva:"), "el subject de la notificación interna usa el verbo 'Nueva' al agendar");
})();

// ── Test 17: bookTimeslot envía correo de confirmación en pilates (idioma EN) ───────────
(function test17() {
  console.log("Test 17: bookTimeslot envía correo de confirmación al agendar (pilates, EN)");
  const { sandbox } = freshCtx();
  sandbox.bookTimeslot(
    "pilates", isoInHours(13), "Kelly", "Soto", "kelly-correo@test.com", "8888-5555", "cedula", "1-0000-5555",
    "1990-01-01", "en", "virtual", "America/Costa_Rica"
  );
  const sent = sandbox.__sentEmails || [];
  assert(sent.length === 2, "se envían exactamente 2 correos (confirmación al cliente + notificación interna US-13/US-30)");
  assert(sent[0].to === "kelly-correo@test.com", "el correo de confirmación va dirigido al cliente que se inscribió");
  assert(sent[1].to.includes("plantpoweredani.testing@gmail.com"), "la notificación interna va a los destinatarios placeholder (Dani/Ali)");
})();

// ── Test 18: un fallo al enviar el correo NO revierte ni bloquea el agendamiento ────────
(function test18() {
  console.log("Test 18: fallo de GmailApp.sendEmail no revierte la reserva ya confirmada en Sheet/Calendar");
  const { sandbox } = freshCtx();
  sandbox.GmailApp.sendEmail = () => { throw new Error("Mock: Gmail caído"); };
  let threw = null;
  let token = null;
  try {
    token = sandbox.bookTimeslot(
      "initial", isoInHours(72), "Luis", "Vargas", "luis-correo-falla@test.com", "8888-6666", "cedula", "1-0000-6666",
      "1990-01-01", "es", "virtual", "America/Costa_Rica"
    );
  } catch (e) {
    threw = e.message;
  }
  assert(threw === null, "bookTimeslot NO relanza el error del envío de correo");
  const sheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(sheet, token);
  assert(row > 0, "la fila de Nutrición SÍ se guardó pese al fallo de correo");
  assert(sheet.data[row - 1][15] === "Agendada", "el estado sigue 'Agendada' (no se revierte por el fallo de correo)");
})();

// ── Test 19: correo al cliente en su propia zona (Costa Rica) → idéntico a antes ────────
(function test19() {
  console.log("Test 19: fecha/hora del correo con clientTimezone=Costa Rica (sin cambio de comportamiento)");
  const { sandbox } = freshCtx();
  const instant = sandbox.parseSheetDateTime("2026-07-20", "13:30");
  const fechaPorDefecto = sandbox.formatFechaDisplay(instant, "es"); // sin 3er arg → TIME_ZONE, igual que antes de este cambio
  const horaPorDefecto = sandbox.formatHoraDisplay(instant); // sin 2do arg → TIME_ZONE
  const fechaClienteCR = sandbox.formatFechaDisplay(instant, "es", "America/Costa_Rica");
  const horaClienteCR = sandbox.formatHoraDisplay(instant, "America/Costa_Rica");
  assert(fechaClienteCR === fechaPorDefecto, "fechaDisplay con clientTimezone=CR es idéntica al default (TIME_ZONE)");
  assert(horaClienteCR === horaPorDefecto, "horaDisplay con clientTimezone=CR es idéntica al default (TIME_ZONE)");
  assert(horaClienteCR === "13:30", "la hora se muestra sin corrimiento para un cliente en Costa Rica");
})();

// ── Test 20: correo al cliente en EEUU, cruzando la medianoche → cambia fecha Y hora ────
(function test20() {
  console.log("Test 20: fecha/hora del correo con clientTimezone=America/New_York, cruzando medianoche");
  const { sandbox } = freshCtx();
  // 23:00 del viernes 24 de julio 2026 en Costa Rica (UTC-6) = 01:00 del sábado 25 de julio
  // en America/New_York (UTC-4 en julio, EDT) — cruce real de día calendario.
  const instant = sandbox.parseSheetDateTime("2026-07-24", "23:00");
  const fechaCR = sandbox.formatFechaDisplay(instant, "en", "America/Costa_Rica");
  const horaCR = sandbox.formatHoraDisplay(instant, "America/Costa_Rica");
  const fechaNY = sandbox.formatFechaDisplay(instant, "en", "America/New_York");
  const horaNY = sandbox.formatHoraDisplay(instant, "America/New_York");
  assert(horaCR === "23:00", "en Costa Rica (zona del negocio) la hora sigue siendo 23:00, sin cambios");
  assert(fechaCR.includes("FRIDAY") && fechaCR.includes("24"), "en Costa Rica la fecha sigue siendo viernes 24 de julio");
  assert(horaNY === "01:00", "para el cliente en America/New_York la hora local correcta es 01:00 (cruzó medianoche)");
  assert(fechaNY.includes("SATURDAY") && fechaNY.includes("25"), "para el cliente en America/New_York la FECHA también avanza a sábado 25 (no solo la hora)");
  assert(fechaNY !== fechaCR, "fechaDisplay del cliente es distinta a la de Costa Rica — el día de la semana sí cambia con el cruce de zona horaria");
})();

// ── Test 21: cancelBooking envía notificación interna (US-13/US-30, tipoAccion=cancelada) ─
(function test21() {
  console.log("Test 21: cancelBooking envía notificación interna con tipoAccion=cancelada");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "initial", isoInHours(72), "Fabricio", "Solano", "fabricio@test.com", "8888-7000", "cedula", "1-3333-0001",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  sandbox.__sentEmails = []; // limpia los correos del agendamiento para aislar los de cancelBooking
  sandbox.cancelBooking(token);
  const sent = sandbox.__sentEmails || [];
  assert(sent.length === 2, "cancelBooking envía 2 correos (notificación interna + correo de cancelación al cliente)");
  const interno = sent.find((e) => e.to.includes("plantpoweredani.testing@gmail.com"));
  const cliente = sent.find((e) => e.to === "fabricio@test.com");
  assert(!!interno, "la notificación interna de cancelación va a los destinatarios placeholder (Dani/Ali)");
  assert(interno.subject.startsWith("Cancelada:"), "el subject de la notificación interna usa el verbo 'Cancelada'");
  assert(!!cliente, "el cliente recibe su propio correo de cancelación");
  assert(cliente.subject.toLowerCase().includes("cancel"), "el subject del correo al cliente menciona la cancelación");
})();

// ── Test 22: rescheduleBooking envía notificación interna (tipoAccion=reagendada) ──────────
(function test22() {
  console.log("Test 22: rescheduleBooking envía notificación interna con tipoAccion=reagendada");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "followup", isoInHours(72), "Gina", "Vega", "gina@test.com", "8888-7001", "cedula", "1-3333-0002",
    "1990-01-01", "es", "presencial", "America/Costa_Rica"
  );
  sandbox.__sentEmails = []; // limpia los correos del agendamiento para aislar los de rescheduleBooking
  sandbox.rescheduleBooking(token, isoInHours(96), "America/Costa_Rica");
  const sent = sandbox.__sentEmails || [];
  assert(sent.length === 2, "rescheduleBooking envía 2 correos (notificación interna + correo de reagendamiento al cliente)");
  const interno = sent.find((e) => e.to.includes("plantpoweredani.testing@gmail.com"));
  const cliente = sent.find((e) => e.to === "gina@test.com");
  assert(!!interno, "la notificación interna de reagendamiento va a los destinatarios placeholder (Dani/Ali)");
  assert(interno.subject.startsWith("Reagendada:"), "el subject de la notificación interna usa el verbo 'Reagendada'");
  assert(!!cliente, "el cliente recibe su propio correo de reagendamiento");
  assert(cliente.subject.toLowerCase().includes("reagendad"), "el subject del correo al cliente menciona el reagendamiento");
})();

// ── Test 23: pilates también dispara notificación interna al agendar/reagendar/cancelar ───
(function test23() {
  console.log("Test 23: notificación interna se dispara igual para pilates (los 3 casos)");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "pilates", isoInHours(200), "Hugo", "Solis", "hugo@test.com", "8888-7002", "cedula", "1-3333-0003",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const sentAgendar = sandbox.__sentEmails || [];
  assert(sentAgendar.length === 2, "agendar pilates envía 2 correos (confirmación al cliente + notificación interna)");

  sandbox.__sentEmails = [];
  sandbox.rescheduleBooking(token, isoInHours(400), "America/Costa_Rica");
  const sentReagendar = sandbox.__sentEmails || [];
  assert(sentReagendar.length === 2, "reagendar pilates envía 2 correos (notificación interna + correo al cliente)");
  assert(sentReagendar.some((e) => e.subject.startsWith("Reagendada:")), "reagendar pilates dispara la notificación interna de reagendamiento");
  assert(sentReagendar.some((e) => e.to === "hugo@test.com"), "reagendar pilates también envía el correo de reagendamiento al cliente");

  sandbox.__sentEmails = [];
  sandbox.cancelBooking(token);
  const sentCancelar = sandbox.__sentEmails || [];
  assert(sentCancelar.length === 2, "cancelar pilates envía 2 correos (notificación interna + correo al cliente)");
  assert(sentCancelar.some((e) => e.subject.startsWith("Cancelada:")), "cancelar pilates dispara la notificación interna de cancelación");
  assert(sentCancelar.some((e) => e.to === "hugo@test.com"), "cancelar pilates también envía el correo de cancelación al cliente");
})();

// ── Test 24: un fallo de GmailApp.sendEmail en la notificación interna no revierte ni ──────
// bloquea cancelBooking/rescheduleBooking (mismo criterio que US-12, test 18) ──────────────
(function test24() {
  console.log("Test 24: fallo al enviar la notificación interna no revierte cancelar/reagendar");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "initial", isoInHours(72), "Irene", "Castro", "irene@test.com", "8888-7003", "cedula", "1-3333-0004",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  sandbox.GmailApp.sendEmail = () => { throw new Error("Mock: Gmail caído"); };

  let threwCancel = null;
  try {
    sandbox.cancelBooking(token);
  } catch (e) {
    threwCancel = e.message;
  }
  assert(threwCancel === null, "cancelBooking NO relanza el error del envío de la notificación interna");
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);
  assert(nutSheet.getRange(row, 16, 1, 1).getValue() === "Cancelada", "la cita sí queda cancelada en el Sheet pese al fallo de correo");
})();

// ── Test 25: la notificación interna de un reagendamiento usa la fecha/hora NUEVA ──────────
(function test25() {
  console.log("Test 25: renderNotificacionInterna con tipoAccion=reagendada usa fecha/hora nuevas (via fechaDisplay/horaDisplay)");
  const { sandbox } = freshCtx();
  const nuevoInstante = sandbox.parseSheetDateTime("2026-08-10", "15:00");
  const { htmlBody } = sandbox.renderNotificacionInterna({
    esPilates: false,
    tipoAccion: "reagendada",
    tipoCita: "initial",
    nombreCompleto: "Test Persona",
    correo: "test@test.com",
    telefono: "8888-0000",
    idiomaDisplay: "Español",
    fecha: "2026-08-10",
    hora: "15:00",
    modalidadDisplay: "VIRTUAL",
    esVirtual: true,
    meetLink: "https://meet.google.com/fake",
    token: "tok-25",
  });
  assert(typeof htmlBody === "string" && htmlBody.length > 0, "renderNotificacionInterna produce htmlBody no vacío");
  assert(sandbox.formatFechaDisplay(nuevoInstante, "es", "America/Costa_Rica").length > 0, "formatFechaDisplay (usado internamente, siempre en TIME_ZONE) funciona sobre la fecha nueva pasada");
})();

// ── Test 26: sendRemindersJob envía el recordatorio dentro de la ventana 47-49hrs ──────────
(function test26() {
  console.log("Test 26: sendRemindersJob envía recordatorio dentro de la ventana 47-49hrs y marca el flag");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "initial", isoInHours(72), "Deby", "Solis", "deby@test.com", "8888-0010", "cedula", "1-2222-6666",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);
  moveBookingTo(sandbox, "Nutrición", row, 10, 11, 48); // dentro de 47-49hrs

  const emailsBefore = (sandbox.__sentEmails || []).length;
  sandbox.sendRemindersJob();
  const emailsAfter = (sandbox.__sentEmails || []).length;

  assert(emailsAfter === emailsBefore + 1, "se envía exactamente 1 correo de recordatorio nuevo");
  assert(nutSheet.getRange(row, 18, 1, 1).getValue() === true, "recordatorio_enviado queda en true");
})();

// ── Test 27: sendRemindersJob NO envía fuera de la ventana 47-49hrs ────────────────────────
(function test27() {
  console.log("Test 27: sendRemindersJob no envía nada fuera de la ventana 47-49hrs");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "followup", isoInHours(72), "Efrain", "Vargas", "efrain@test.com", "8888-0011", "cedula", "1-2222-7777",
    "1990-01-01", "es", "presencial", "America/Costa_Rica"
  );
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);
  moveBookingTo(sandbox, "Nutrición", row, 10, 11, 60); // fuera de la ventana

  const emailsBefore = (sandbox.__sentEmails || []).length;
  sandbox.sendRemindersJob();
  const emailsAfter = (sandbox.__sentEmails || []).length;

  assert(emailsAfter === emailsBefore, "no se envía ningún correo nuevo");
  assert(nutSheet.getRange(row, 18, 1, 1).getValue() !== true, "recordatorio_enviado sigue sin marcarse");
})();

// ── Test 28: sendRemindersJob no duplica el envío si recordatorio_enviado ya es true ───────
(function test28() {
  console.log("Test 28: sendRemindersJob no reenvía si recordatorio_enviado ya está en true");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "measurement", isoInHours(72), "Fabiola", "Rojas", "fabiola@test.com", "8888-0012", "cedula", "1-2222-8888",
    "1990-01-01", "es", "presencial", "America/Costa_Rica"
  );
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);
  moveBookingTo(sandbox, "Nutrición", row, 10, 11, 48);
  nutSheet.getRange(row, 18, 1, 1).setValue(true); // ya se había enviado antes

  const emailsBefore = (sandbox.__sentEmails || []).length;
  sandbox.sendRemindersJob();
  const emailsAfter = (sandbox.__sentEmails || []).length;

  assert(emailsAfter === emailsBefore, "no se envía un segundo correo de recordatorio");
})();

// ── Test 29: sendRemindersJob no envía si la cita está Cancelada ───────────────────────────
(function test29() {
  console.log("Test 29: sendRemindersJob no envía recordatorio a una cita Cancelada");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "initial", isoInHours(72), "Gerardo", "Mora", "gerardo@test.com", "8888-0013", "cedula", "1-2222-9999",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);
  moveBookingTo(sandbox, "Nutrición", row, 10, 11, 48);
  nutSheet.getRange(row, 16, 1, 1).setValue("Cancelada");

  const emailsBefore = (sandbox.__sentEmails || []).length;
  sandbox.sendRemindersJob();
  const emailsAfter = (sandbox.__sentEmails || []).length;

  assert(emailsAfter === emailsBefore, "no se envía ningún correo a una cita cancelada");
  assert(nutSheet.getRange(row, 18, 1, 1).getValue() !== true, "recordatorio_enviado no se marca en una cita cancelada");
})();

// ── Test 30: confirmAttendance con token válido marca asistencia_confirmada ────────────────
(function test30() {
  console.log("Test 30: confirmAttendance marca asistencia_confirmada=true con un token válido");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "initial", isoInHours(72), "Helena", "Castro", "helena@test.com", "8888-0014", "cedula", "1-3333-0000",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);

  sandbox.__sentEmails = []; // limpia los correos del agendamiento para aislar el de US-32
  let threw = null;
  try {
    sandbox.confirmAttendance(token);
  } catch (e) {
    threw = e.message;
  }
  assert(threw === null, "confirmAttendance no lanza error con un token válido");
  assert(nutSheet.getRange(row, 23, 1, 1).getValue() === true, "asistencia_confirmada queda en true");
  const sent = sandbox.__sentEmails || [];
  assert(sent.length === 1, "US-32: confirmAttendance envía exactamente 1 correo (notificación interna de asistencia confirmada)");
  assert(sent[0].to.includes("plantpoweredani.testing@gmail.com"), "el correo de asistencia confirmada va a los destinatarios placeholder (Dani/Ali)");
  assert(sent[0].subject.startsWith("Confirmada:"), "el subject usa el verbo 'Confirmada'");
})();

// ── Test 31: confirmAttendance con una cita ya cancelada lanza CITA_CANCELADA ──────────────
(function test31() {
  console.log("Test 31: confirmAttendance falla en una cita cancelada (CITA_CANCELADA), no marca el flag");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "followup", isoInHours(72), "Ignacio", "Duarte", "ignacio@test.com", "8888-0015", "cedula", "1-3333-1111",
    "1990-01-01", "es", "presencial", "America/Costa_Rica"
  );
  sandbox.cancelBooking(token);
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);

  sandbox.__sentEmails = []; // limpia los correos de cancelBooking para aislar confirmAttendance
  let threw = null;
  try {
    sandbox.confirmAttendance(token);
  } catch (e) {
    threw = e.message;
  }
  assert(threw === "CITA_CANCELADA", "lanza CITA_CANCELADA");
  assert(nutSheet.getRange(row, 23, 1, 1).getValue() !== true, "asistencia_confirmada no se marca en una cita cancelada");
  assert((sandbox.__sentEmails || []).length === 0, "US-32: no se envía ningún correo de asistencia confirmada en una cita cancelada (el error se lanza antes de llegar a ese punto)");
})();

// ── Test 32: reproduce el bug real (21 jul) — fecha/hora coercionadas por Sheets a Date ────
// real, sendRemindersJob DEBE seguir detectando la cita dentro de la ventana 47-49hrs pese a
// la coerción. Antes del fix (normalizeSheetDateCell reformateaba con TIME_ZONE en vez de
// UTC + appendBookingToSheet no protegía las celdas con setNumberFormat("@")), este test
// fallaba: el correo nunca se enviaba porque las horas de anticipación calculadas quedaban
// fuera de la ventana por el corrimiento de zona horaria. NOTA sobre el punto ciego del
// mock: gas-mock.js no coerciona solo NUNCA por su cuenta — simulateSheetsDateCoercion()
// reproduce a mano lo que SÍ le pasaría a estas celdas en Google Sheets real si quedaran sin
// la protección de setNumberFormat("@") agregada en este fix.
(function test32() {
  console.log("Test 32: sendRemindersJob detecta la cita aunque fecha/hora vengan coercionadas a Date (bug real 21 jul)");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "measurement", isoInHours(72), "Julieta", "Mora", "julieta@test.com", "8888-0016", "cedula", "1-3333-2222",
    "1990-01-01", "es", "presencial", "America/Costa_Rica"
  );
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);

  const targetInstant = new Date(Date.now() + 48 * 3600000); // dentro de la ventana 47-49hrs
  simulateSheetsDateCoercion(sandbox, "Nutrición", row, 10, 11, targetInstant);

  // Confirma que la simulación realmente dejó objetos Date en las celdas (no strings) —
  // si esto fallara, el test no estaría probando lo que dice probar.
  const rawFecha = nutSheet.getRange(row, 10, 1, 1).getValue();
  const rawHora = nutSheet.getRange(row, 11, 1, 1).getValue();
  // instanceof contra sandbox.Date, no el Date de este archivo — ver comentario de
  // simulateSheetsDateCoercion sobre el punto ciego de realms distintos entre vm.createContext
  // y el proceso Node que corre run-tests.js.
  assert(rawFecha instanceof sandbox.Date && rawHora instanceof sandbox.Date, "las celdas fecha/hora quedan como objetos Date (coerción simulada)");

  const emailsBefore = (sandbox.__sentEmails || []).length;
  sandbox.sendRemindersJob();
  const emailsAfter = (sandbox.__sentEmails || []).length;

  assert(emailsAfter === emailsBefore + 1, "sendRemindersJob SÍ envía el recordatorio pese a fecha/hora coercionadas a Date");
  assert(nutSheet.getRange(row, 18, 1, 1).getValue() === true, "recordatorio_enviado queda en true pese a la coerción");
})();

// ── Test 33: appendBookingToSheet escribe fecha/hora como string ───────────────────────────
// ⚠️ ESTE TEST NO PRUEBA QUE EL FIX FUNCIONE EN GOOGLE SHEETS REAL. gas-mock.js NUNCA
// coerciona strings a Date por su cuenta (documentado arriba, junto a simulateSheetsDateCoercion,
// y en la nota #30 del CLAUDE.md) — por eso este test pasaba en verde incluso con el primer
// intento de fix (formatear la fila con setNumberFormat("@") ANTES de appendRow()), que se
// confirmó A MANO que NO funcionaba en el Sheet real (21 jul: una fila nueva de Nutrición
// seguía abriendo el selector de calendario al hacer doble clic en la celda "fecha"). Lo único
// que este test verifica es que bookTimeslot no rompe y que el VALOR lógico que se intenta
// guardar es el string correcto — no verifica ni puede verificar si Sheets real lo coerciona
// a Date al escribirlo. La única prueba válida de este fix es manual: agendar una cita NUEVA
// en el Sheet real (Nutrición y Pilates) y confirmar con doble clic en la celda fecha/hora que
// YA NO aparece el selector de calendario emergente.
(function test33() {
  console.log("Test 33: appendBookingToSheet escribe fecha/hora como string (NO prueba el fix real de coerción — ver comentario arriba)");
  const { sandbox } = freshCtx();

  const tokenNutricion = sandbox.bookTimeslot(
    "initial", isoInHours(72), "Karla", "Nunez", "karla@test.com", "8888-0017", "cedula", "1-3333-3333",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const nutRow = findTokenRow(nutSheet, tokenNutricion);
  assert(
    typeof nutSheet.getRange(nutRow, 10, 1, 1).getValue() === "string" && typeof nutSheet.getRange(nutRow, 11, 1, 1).getValue() === "string",
    "fecha/hora de Nutrición se guardan como string en el mock (setNumberFormat aplicado antes de escribir, mismo patrón que fecha_nacimiento/Cupos_Pilates)"
  );

  const tokenPilates = sandbox.bookTimeslot(
    "pilates", isoInHours(20), "Luis", "Ortiz", "luis@test.com", "8888-0018", "cedula", "1-3333-4444",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const pilSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Pilates");
  const pilRow = findTokenRow(pilSheet, tokenPilates);
  assert(
    typeof pilSheet.getRange(pilRow, 9, 1, 1).getValue() === "string" && typeof pilSheet.getRange(pilRow, 10, 1, 1).getValue() === "string",
    "fecha_clase/hora_clase de Pilates se guardan como string en el mock"
  );
})();

// ── Test 34: confirmAttendance con un token inválido no marca nada ni envía correo ─────────
(function test34() {
  console.log("Test 34: confirmAttendance con token inválido (TOKEN_NO_ENCONTRADO) no envía ningún correo");
  const { sandbox } = freshCtx();
  sandbox.__sentEmails = [];

  let threw = null;
  try {
    sandbox.confirmAttendance("token-que-no-existe");
  } catch (e) {
    threw = e.message;
  }
  assert(threw === "TOKEN_NO_ENCONTRADO", "lanza TOKEN_NO_ENCONTRADO");
  assert((sandbox.__sentEmails || []).length === 0, "US-32: no se envía ningún correo con un token inválido");
})();

// ═══════════════════════════════════════════════════════════════════════════════════════════
// US-33 — Alerta interna de cancelación tardía (RF-2.5)
//
// Los destinatarios salen de Script Properties (DANI_EMAIL/INSTRUCTORA_EMAIL/ALI_EMAIL), que
// en gas-mock.js son 3 correos DISTINTOS a propósito — en el entorno de testing real las 3
// apuntan a la misma cuenta, pero con valores distintos acá se puede verificar el ruteo por
// tipo de cita (nutrición → Dani, pilates → instructora, Ali en ambos).
// ═══════════════════════════════════════════════════════════════════════════════════════════

// Localiza la alerta de US-33 entre los correos enviados, por su asunto (el "⚠️ Cancelación
// tardía" es justamente lo que la diferencia de la notificación normal "Cancelada: ...").
function findAlertaTardia(sandbox) {
  return (sandbox.__sentEmails || []).find((e) => e.subject.indexOf("Cancelación tardía") >= 0);
}

// ── Test 35: cancelar <24hrs (nutrición) → marca la columna, alerta a Dani + Ali ───────────
(function test35() {
  console.log("Test 35: cancelación tardía de nutrición marca cancelaciones_tardias y alerta a Dani+Ali");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "initial", isoInHours(72), "Mariela", "Chacon", "mariela@test.com", "8888-0020", "cedula", "1-4444-0000",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);
  moveBookingTo(sandbox, "Nutrición", row, 10, 11, 5); // faltan 5hrs < CANCELLATION_HOURS

  sandbox.__sentEmails = []; // aísla los correos de cancelBooking de los del agendamiento
  const result = sandbox.cancelBooking(token);

  assert(result.lateCancellation === true, "la cancelación se detecta como tardía");
  // Columna 20 = "cancelaciones_tardias" de Nutrición (NUTRICION_CANCELACION_TARDIA_COL),
  // la columna que ya existía y US-33 reutiliza — NO se creó ninguna nueva en esta pestaña.
  assert(nutSheet.getRange(row, 20, 1, 1).getValue() === true, "cancelaciones_tardias (col 20, por cita) queda en TRUE");

  const sent = sandbox.__sentEmails || [];
  assert(sent.length === 3, "se envían 3 correos: notificación interna general + correo al cliente + alerta de cancelación tardía");

  const alerta = findAlertaTardia(sandbox);
  assert(!!alerta, "se envía la alerta de US-33 con asunto de cancelación tardía");
  assert(alerta.subject === "⚠️ Cancelación tardía — Mariela Chacon", "el asunto lleva el ⚠️ y el nombre del cliente (distinto al de una cancelación normal)");
  assert(alerta.to.indexOf("mock-dani@test.com") >= 0, "la alerta de nutrición va a Dani (DANI_EMAIL)");
  assert(alerta.to.indexOf("mock-ali@test.com") >= 0, "la alerta de nutrición también va a Ali (ALI_EMAIL)");
  assert(alerta.to.indexOf("mock-instructora@test.com") < 0, "la alerta de nutrición NO va a la instructora de pilates");

  // La notificación interna general (US-13/US-30) sigue enviándose además de la alerta —
  // conviven, no se reemplazan.
  assert(sent.some((e) => e.subject.indexOf("Cancelada:") === 0), "la notificación interna general de cancelación se sigue enviando aparte");

  // El contador acumulado POR CLIENTE (US-06) sigue siendo una escritura independiente.
  assert(sandbox.getClientPaymentStatus("mariela@test.com").cancelaciones_tardias === 1, "el contador por cliente en 'Clientes' sube a 1 (lógica de US-06 intacta)");
})();

// ── Test 36: cancelar >=24hrs → NO marca la columna ni envía la alerta ─────────────────────
(function test36() {
  console.log("Test 36: cancelación a tiempo (>=24hrs) no marca la columna ni dispara la alerta");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "followup", isoInHours(72), "Norberto", "Salas", "norberto@test.com", "8888-0021", "cedula", "1-4444-1111",
    "1990-01-01", "es", "presencial", "America/Costa_Rica"
  );
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);
  // La cita queda a 72hrs — sin moveBookingTo, muy por fuera de la ventana de 24hrs.

  sandbox.__sentEmails = [];
  const result = sandbox.cancelBooking(token);

  assert(result.lateCancellation === false, "la cancelación NO se detecta como tardía");
  assert(nutSheet.getRange(row, 20, 1, 1).getValue() !== true, "cancelaciones_tardias (col 20) NO se marca en TRUE");
  assert(!findAlertaTardia(sandbox), "NO se envía ninguna alerta de cancelación tardía");
  assert((sandbox.__sentEmails || []).length === 2, "solo se envían los 2 correos de siempre (notificación interna + correo al cliente)");
})();

// ── Test 37: cancelar <24hrs (pilates) → columna de Pilates + alerta a instructora + Ali ───
(function test37() {
  console.log("Test 37: cancelación tardía de pilates marca su columna y alerta a la instructora+Ali (no a Dani)");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "pilates", isoInHours(200), "Olga", "Bermudez", "olga@test.com", "8888-0022", "cedula", "1-4444-2222",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const pilSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Pilates");
  const row = findTokenRow(pilSheet, token);
  moveBookingTo(sandbox, "Pilates", row, 9, 10, 6); // faltan 6hrs < CANCELLATION_HOURS

  sandbox.__sentEmails = [];
  const result = sandbox.cancelBooking(token);

  assert(result.lateCancellation === true, "la cancelación de pilates se detecta como tardía");
  // Columna 17 = PILATES_CANCELACION_TARDIA_COL, agregada en US-33 porque "Pilates" NUNCA
  // tuvo la columna cancelaciones_tardias que sí existía en Nutrición (ver el comentario de
  // la constante en app.ts y addCancelacionTardiaColumnToPilates).
  assert(pilSheet.getRange(row, 17, 1, 1).getValue() === true, "cancelaciones_tardias (col 17 de Pilates, por inscripción) queda en TRUE");

  const alerta = findAlertaTardia(sandbox);
  assert(!!alerta, "se envía la alerta de US-33 también en el flujo de pilates");
  assert(alerta.to.indexOf("mock-instructora@test.com") >= 0, "la alerta de pilates va a la instructora (INSTRUCTORA_EMAIL)");
  assert(alerta.to.indexOf("mock-ali@test.com") >= 0, "la alerta de pilates también va a Ali (ALI_EMAIL)");
  assert(alerta.to.indexOf("mock-dani@test.com") < 0, "la alerta de pilates NO va a Dani");
})();

// ── Test 38: el cuerpo del correo trae los 4 datos requeridos por la tarjeta ───────────────
// Se llama a renderNotificacionCancelacionTardia() directamente (no vía cancelBooking) para
// poder fijar valores conocidos y compararlos contra el HTML real. Esto SOLO es posible
// porque este correo arma su HTML en TypeScript en vez de usar una plantilla: el mock de
// HtmlService.createTemplateFromFile devuelve un HTML fijo que ignora las variables
// inyectadas, así que ninguna aserción de contenido sería posible con una plantilla (mismo
// tipo de punto ciego del mock que documenta la nota #39 del CLAUDE.md).
(function test38() {
  console.log("Test 38: el cuerpo de la alerta incluye nombre, tipo de cita, fecha/hora de la cita y de la cancelación");
  const { sandbox } = freshCtx();

  const canceladaEn = sandbox.parseSheetDateTime("2026-07-27", "08:15");
  const { subject, htmlBody } = sandbox.renderNotificacionCancelacionTardia({
    esPilates: false,
    tipoCita: "initial",
    nombreCompleto: "Paula Rojas",
    correo: "paula@test.com",
    telefono: "8888-0023",
    fecha: "2026-07-28",
    hora: "13:30",
    canceladaEn,
    horasDeAnticipacion: 5.5,
    token: "tok-38",
  });

  const citaInstant = sandbox.parseSheetDateTime("2026-07-28", "13:30");

  // (1) nombre completo del cliente
  assert(htmlBody.indexOf("Paula Rojas") >= 0, "dato 1/4: el cuerpo incluye el nombre completo del cliente");
  // (2) tipo de cita traducido a texto legible (no el código interno "initial")
  assert(htmlBody.indexOf("Consulta inicial") >= 0, 'dato 2/4: el tipo de cita aparece legible ("Consulta inicial", no "initial")');
  // (3) fecha y hora de la cita cancelada, en hora de Costa Rica
  assert(htmlBody.indexOf(sandbox.formatFechaDisplay(citaInstant, "es")) >= 0, "dato 3/4a: el cuerpo incluye la FECHA de la cita cancelada");
  assert(htmlBody.indexOf(sandbox.formatHoraDisplay(citaInstant)) >= 0, "dato 3/4b: el cuerpo incluye la HORA de la cita cancelada");
  // (4) fecha y hora en que se hizo la cancelación
  assert(htmlBody.indexOf(sandbox.formatFechaDisplay(canceladaEn, "es")) >= 0, "dato 4/4a: el cuerpo incluye la FECHA en que se hizo la cancelación");
  assert(htmlBody.indexOf(sandbox.formatHoraDisplay(canceladaEn)) >= 0, "dato 4/4b: el cuerpo incluye la HORA en que se hizo la cancelación");

  // Debe quedar claro que fue TARDÍA, y distinguirse visualmente de una cancelación normal.
  assert(subject.indexOf("⚠️") >= 0 && subject.indexOf("Cancelación tardía") >= 0, "el asunto marca explícitamente que fue una cancelación tardía");
  assert(htmlBody.indexOf("fuera de la ventana de 24 horas") >= 0, "el cuerpo dice explícitamente que fue fuera de la ventana de 24 horas");
  assert(htmlBody.indexOf("5 h 30 min de anticipación") >= 0, "el cuerpo indica con cuánta anticipación real se canceló");
  assert(htmlBody.indexOf("#C0392B") >= 0, "el cuerpo usa el color de alerta rojo, que no se usa en las notificaciones internas normales");
})();

// ── Test 39: una Script Property de destinatarios sin configurar no revierte la cancelación ─
(function test39() {
  console.log("Test 39: falta DANI_EMAIL → se registra el fallo pero la cancelación (y la bandera) se aplican igual");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "measurement", isoInHours(72), "Quirico", "Mena", "quirico@test.com", "8888-0024", "cedula", "1-4444-3333",
    "1990-01-01", "es", "presencial", "America/Costa_Rica"
  );
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);
  moveBookingTo(sandbox, "Nutrición", row, 10, 11, 2);

  // Simula el entorno mal configurado (nunca se corrió setupLateCancellationEmailProperties()).
  sandbox.PropertiesService.getScriptProperties().setProperty("DANI_EMAIL", "");

  sandbox.__sentEmails = [];
  let threw = null;
  let result = null;
  try {
    result = sandbox.cancelBooking(token);
  } catch (e) {
    threw = e.message;
  }

  assert(threw === null, "cancelBooking NO relanza el error de la Script Property faltante");
  assert(result.lateCancellation === true, "la cancelación se sigue reportando como tardía");
  assert(nutSheet.getRange(row, 16, 1, 1).getValue() === "Cancelada", "la cita sí queda 'Cancelada' en el Sheet");
  assert(nutSheet.getRange(row, 20, 1, 1).getValue() === true, "la bandera por cita sí se marca (se escribe antes de intentar el correo)");
  assert(!findAlertaTardia(sandbox), "no se envía la alerta (no hay destinatario válido), pero nada más se rompe");
})();

console.log(`\n${passed} pasaron, ${failed} fallaron`);
process.exit(failed > 0 ? 1 : 0);
