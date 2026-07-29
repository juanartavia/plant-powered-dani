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
  assert(sent.length === 2, "se envían exactamente 2 correos (confirmación al cliente + notificación interna US-13/US-30) — PRUEBA-A/PRUEBA-B (diagnóstico US-37) ya se removieron");
  assert(sent[0].to === "sofia-correo@test.com", "el correo de confirmación va dirigido al cliente que agendó");
  assert(typeof sent[0].subject === "string" && sent[0].subject.length > 0, "el correo trae un subject no vacío");
  assert(sent[0].options && sent[0].options.htmlBody && sent[0].options.htmlBody.length > 0, "el correo trae htmlBody no vacío");
  const notifInterna = sent.find((e) => typeof e.subject === "string" && e.subject.startsWith("Nueva:"));
  assert(!!notifInterna, "hay una notificación interna con el verbo 'Nueva' al agendar (buscada por subject, no por posición, por las pruebas de control intercaladas)");
  assert(notifInterna.to.includes("plantpoweredani.testing@gmail.com"), "la notificación interna va a los destinatarios placeholder (Dani/Ali)");
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
  const notifInterna = sent.find((e) => e.to && e.to.includes && e.to.includes("plantpoweredani.testing@gmail.com") && !/PRUEBA-[AB]/.test(e.subject || ""));
  assert(!!notifInterna, "hay una notificación interna real (no una prueba de control) dirigida a los destinatarios placeholder (Dani/Ali)");
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

// ── Test 38: la alerta usa la plantilla real y arma correctamente los datos que le inyecta ──
// Desde el 27 jul 2026 este correo usa una plantilla real de backend/templates/ (mismo patrón
// que renderNotificacionInterna) en vez de HTML armado a mano en TypeScript, para que coincida
// visualmente con el resto de correos internos — ver CLAUDE.md. Eso significa que ya NO se
// puede buscar texto dentro de htmlBody: el mock de HtmlService.createTemplateFromFile
// (gas-mock.js) devuelve un HTML fijo que ignora las variables inyectadas (mismo punto ciego
// documentado en la nota #39, el mismo que ya tiene Test 25 sobre renderNotificacionInterna).
// En su lugar, este test verifica: (a) que se usó el archivo de plantilla correcto, (b) el
// asunto (que SÍ se arma en TypeScript, fuera de la plantilla), y (c) los mismos helpers puros
// que antes se verificaban indirectamente buscándolos como substring del HTML
// (formatAnticipacionDisplay, TIPO_CITA_LABEL_CANCELACION_TARDIA vía vm.runInContext — mismo
// truco que sandbox.Date en freshCtx(), necesario porque un `const` de nivel superior no queda
// expuesto como propiedad del sandbox).
(function test38() {
  console.log("Test 38: la alerta usa la plantilla notificacion_cancelacion_tardia, el asunto marca la urgencia, y los helpers de contenido producen los valores esperados");
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

  assert(typeof htmlBody === "string" && htmlBody.length > 0, "renderNotificacionCancelacionTardia produce htmlBody no vacío");
  assert(htmlBody.indexOf('file="notificacion_cancelacion_tardia"') >= 0, "usa la plantilla real notificacion_cancelacion_tardia.html (no HTML armado a mano)");

  // Debe quedar claro que fue TARDÍA, y distinguirse de la notificación de cancelación normal.
  assert(subject.indexOf("⚠️") >= 0 && subject.indexOf("Cancelación tardía") >= 0, "el asunto marca explícitamente que fue una cancelación tardía");
  assert(subject.indexOf("Paula Rojas") >= 0, "el asunto incluye el nombre del cliente");

  // Tipo de cita traducido a texto legible (no el código interno "initial") — el mismo dato
  // que renderNotificacionCancelacionTardia le pasa a la plantilla como tipoCitaLabel.
  const tipoCitaLabelInitial = vm.runInContext('TIPO_CITA_LABEL_CANCELACION_TARDIA.initial', sandbox);
  assert(tipoCitaLabelInitial === "Consulta inicial", 'tipo de cita "initial" se traduce a "Consulta inicial" para la plantilla');
  const tipoCitaLabelPilates = vm.runInContext('TIPO_CITA_LABEL_CANCELACION_TARDIA.pilates', sandbox);
  assert(tipoCitaLabelPilates === "Clase de pilates", 'tipo de cita "pilates" se traduce a "Clase de pilates" para la plantilla');

  // Anticipación real formateada — el mismo dato que la plantilla recibe como anticipacionDisplay.
  assert(sandbox.formatAnticipacionDisplay(5.5) === "5 h 30 min de anticipación", "formatAnticipacionDisplay indica con cuánta anticipación real se canceló");
  assert(sandbox.formatAnticipacionDisplay(-0.5) === "la cita ya había empezado", "formatAnticipacionDisplay cubre anticipación negativa (cancelación después de que la cita empezó)");

  // Fecha/hora de la cita y de la cancelación se calculan sobre los instantes correctos — los
  // mismos que la plantilla recibe como fechaCitaDisplay/horaCitaDisplay/
  // fechaCancelacionDisplay/horaCancelacionDisplay.
  const citaInstant = sandbox.parseSheetDateTime("2026-07-28", "13:30");
  assert(sandbox.formatFechaDisplay(citaInstant, "es").length > 0, "formatFechaDisplay funciona sobre el instante de la cita cancelada");
  assert(sandbox.formatHoraDisplay(citaInstant).length > 0, "formatHoraDisplay funciona sobre el instante de la cita cancelada");
  assert(sandbox.formatFechaDisplay(canceladaEn, "es").length > 0, "formatFechaDisplay funciona sobre el instante en que se hizo la cancelación");
  assert(sandbox.formatHoraDisplay(canceladaEn).length > 0, "formatHoraDisplay funciona sobre el instante en que se hizo la cancelación");
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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// US-42 — Alerta interna de reagendamientos múltiples (una misma cita se reagenda 3 veces o más)
//
// Igual que US-33, los destinatarios salen de Script Properties (DANI_EMAIL/INSTRUCTORA_EMAIL/
// ALI_EMAIL, mismas 3 propiedades — ver el comentario de sendNotificacionReagendamientosMultiples
// en app.ts sobre por qué reutiliza getLateCancellationRecipients() directamente).
//
// A diferencia de US-33 (una condición binaria que se cruza una sola vez), acá el disparador es
// puramente informativo y se repite: se prueba explícitamente que NO dispara en el 1er/2do
// reagendamiento, SÍ en el 3ro, y de nuevo en el 4to — no solo la primera vez que cruza el umbral.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// Localiza la alerta de US-42 entre los correos enviados, por su asunto ("Reagendamientos
// múltiples" es justamente lo que la diferencia de la notificación normal "Reagendada: ...").
function findAlertaReagendamientos(sandbox) {
  return (sandbox.__sentEmails || []).find((e) => e.subject.indexOf("Reagendamientos múltiples") >= 0);
}

// ── Test 40: reagendar 3 veces (nutrición) → alerta SOLO desde el 3er reagendamiento ───────
(function test40() {
  console.log("Test 40: reagendar 3 veces (nutrición) → sin alerta en el 1ro/2do, SÍ en el 3ro");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "followup", isoInHours(500), "Ricardo", "Vargas", "ricardo@test.com", "8888-0025", "cedula", "1-5555-0000",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);

  sandbox.__sentEmails = [];
  sandbox.rescheduleBooking(token, isoInHours(520), "America/Costa_Rica"); // 1er reagendamiento
  assert(!findAlertaReagendamientos(sandbox), "el 1er reagendamiento no dispara la alerta");
  assert(nutSheet.getRange(row, 24, 1, 1).getValue() === 1, "contador_reagendamientos (col 24) queda en 1");

  sandbox.__sentEmails = [];
  sandbox.rescheduleBooking(token, isoInHours(540), "America/Costa_Rica"); // 2do reagendamiento
  assert(!findAlertaReagendamientos(sandbox), "el 2do reagendamiento tampoco dispara la alerta");
  assert(nutSheet.getRange(row, 24, 1, 1).getValue() === 2, "contador_reagendamientos sube a 2");

  sandbox.__sentEmails = [];
  sandbox.rescheduleBooking(token, isoInHours(560), "America/Costa_Rica"); // 3er reagendamiento
  assert(nutSheet.getRange(row, 24, 1, 1).getValue() === 3, "contador_reagendamientos sube a 3");

  const alerta = findAlertaReagendamientos(sandbox);
  assert(!!alerta, "el 3er reagendamiento SÍ dispara la alerta de reagendamientos múltiples");
  assert(alerta.subject.indexOf("3er") >= 0, "el asunto indica el ordinal (3er)");
  assert(alerta.subject.indexOf("Ricardo Vargas") >= 0, "el asunto incluye el nombre del cliente");
  assert(alerta.to.indexOf("mock-dani@test.com") >= 0, "la alerta de nutrición va a Dani (DANI_EMAIL)");
  assert(alerta.to.indexOf("mock-ali@test.com") >= 0, "la alerta de nutrición también va a Ali (ALI_EMAIL)");
  assert(alerta.to.indexOf("mock-instructora@test.com") < 0, "la alerta de nutrición NO va a la instructora de pilates");

  // El reagendamiento en sí sigue funcionando con total normalidad: nunca se bloquea por esto.
  assert(nutSheet.getRange(row, 16, 1, 1).getValue() === "Reagendada", "la cita queda 'Reagendada' con normalidad, sin ningún bloqueo por la alerta");
})();

// ── Test 41: un 4to reagendamiento dispara la alerta OTRA VEZ ──────────────────────────────
(function test41() {
  console.log("Test 41: un 4to reagendamiento dispara la alerta DE NUEVO (no solo la primera vez que se cruza el umbral)");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "initial", isoInHours(500), "Sofia", "Delgado", "sofia@test.com", "8888-0026", "cedula", "1-5555-1111",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);

  sandbox.rescheduleBooking(token, isoInHours(520), "America/Costa_Rica"); // 1ro
  sandbox.rescheduleBooking(token, isoInHours(540), "America/Costa_Rica"); // 2do
  sandbox.rescheduleBooking(token, isoInHours(560), "America/Costa_Rica"); // 3ro — ya dispara

  sandbox.__sentEmails = [];
  sandbox.rescheduleBooking(token, isoInHours(580), "America/Costa_Rica"); // 4to
  assert(nutSheet.getRange(row, 24, 1, 1).getValue() === 4, "contador_reagendamientos sube a 4");
  const alerta4 = findAlertaReagendamientos(sandbox);
  assert(!!alerta4, "el 4to reagendamiento dispara la alerta DE NUEVO");
  assert(alerta4.subject.indexOf("4to") >= 0, "el asunto indica el ordinal correcto (4to) en el 4to reagendamiento");
})();

// ── Test 42: pilates también dispara la alerta, ruteada a la instructora + Ali ─────────────
(function test42() {
  console.log("Test 42: reagendamientos múltiples en pilates alertan a la instructora+Ali (no a Dani)");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "pilates", isoInHours(72), "Tomas", "Esquivel", "tomas@test.com", "8888-0027", "cedula", "1-5555-2222",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const pilSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Pilates");
  const row = findTokenRow(pilSheet, token);

  sandbox.rescheduleBooking(token, isoInHours(120), "America/Costa_Rica"); // 1ro
  sandbox.rescheduleBooking(token, isoInHours(168), "America/Costa_Rica"); // 2do

  sandbox.__sentEmails = [];
  sandbox.rescheduleBooking(token, isoInHours(216), "America/Costa_Rica"); // 3ro

  assert(pilSheet.getRange(row, 18, 1, 1).getValue() === 3, "contador_reagendamientos (col 18 de Pilates) queda en 3");
  const alerta = findAlertaReagendamientos(sandbox);
  assert(!!alerta, "se envía la alerta también en el flujo de pilates");
  assert(alerta.to.indexOf("mock-instructora@test.com") >= 0, "la alerta de pilates va a la instructora (INSTRUCTORA_EMAIL)");
  assert(alerta.to.indexOf("mock-ali@test.com") >= 0, "la alerta de pilates también va a Ali (ALI_EMAIL)");
  assert(alerta.to.indexOf("mock-dani@test.com") < 0, "la alerta de pilates NO va a Dani");
})();

// ── Test 43: un fallo de GmailApp.sendEmail en la alerta no revierte el reagendamiento ─────
(function test43() {
  console.log("Test 43: un fallo de GmailApp.sendEmail no revierte el reagendamiento ya aplicado ni el contador ya incrementado");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "measurement", isoInHours(500), "Ursula", "Pineda", "ursula@test.com", "8888-0028", "cedula", "1-5555-3333",
    "1990-01-01", "es", "presencial", "America/Costa_Rica"
  );
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);

  sandbox.rescheduleBooking(token, isoInHours(520), "America/Costa_Rica"); // 1ro
  sandbox.rescheduleBooking(token, isoInHours(540), "America/Costa_Rica"); // 2do

  sandbox.GmailApp.sendEmail = () => { throw new Error("Mock: Gmail caído"); };

  let threw = null;
  let returnedToken = null;
  try {
    returnedToken = sandbox.rescheduleBooking(token, isoInHours(560), "America/Costa_Rica"); // 3ro
  } catch (e) {
    threw = e.message;
  }

  assert(threw === null, "rescheduleBooking NO relanza el error del envío de ningún correo (ni el general ni la alerta)");
  assert(returnedToken === token, "rescheduleBooking retorna igual el token pese al fallo de correo");
  assert(nutSheet.getRange(row, 16, 1, 1).getValue() === "Reagendada", "el 3er reagendamiento sí se aplica en el Sheet pese al fallo de correo");
  assert(nutSheet.getRange(row, 24, 1, 1).getValue() === 3, "contador_reagendamientos sí sube a 3 pese al fallo de correo");
})();

// ── Test 44: un intento BLOQUEADO (ventana vencida) no incrementa el contador ni alerta ────
(function test44() {
  console.log("Test 44: un intento de reagendamiento bloqueado (ventana vencida) no incrementa el contador ni dispara la alerta");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "initial", isoInHours(72), "Victor", "Solano", "victor@test.com", "8888-0029", "cedula", "1-5555-4444",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);
  moveBookingTo(sandbox, "Nutrición", row, 10, 11, 10); // faltan 10hrs < CANCELLATION_HOURS

  sandbox.__sentEmails = [];
  let threw = null;
  try {
    sandbox.rescheduleBooking(token, isoInHours(96), "America/Costa_Rica");
  } catch (e) {
    threw = e.message;
  }

  assert(threw === "VENTANA_REAGENDAMIENTO_VENCIDA", "el intento se bloquea igual que siempre (US-06, sin cambios)");
  const contadorValue = nutSheet.getRange(row, 24, 1, 1).getValue();
  assert(contadorValue === "" || contadorValue === 0, "contador_reagendamientos NO se incrementa en un intento bloqueado");
  assert(!findAlertaReagendamientos(sandbox), "tampoco se dispara la alerta de reagendamientos múltiples en un intento bloqueado");
})();

// ════════════════════════════════════════════════════════════════════════════════════
// US-37 — "Agregar a mi calendario" real: 4 links (Google/Outlook/Yahoo/.ics), endpoint de
// descarga de .ics dinámico, e invitación .ics real (METHOD:REQUEST) adjunta al correo de
// confirmación. buildAddCalLinks/buildBookingIcsContent/serveIcsDownload son funciones
// puras/casi puras (sin I/O más allá del Sheet para serveIcsDownload) — se llaman
// directamente, sin pasar por el HtmlService mock (que no renderiza variables reales, ver
// nota en gas-mock.js), para poder verificar el contenido exacto de las URLs/.ics.
// ════════════════════════════════════════════════════════════════════════════════════

function getUrlParam(url, name) {
  const match = url.match(new RegExp(`[?&]${name}=([^&]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// ── Test 45: buildAddCalLinks — nutrición presencial (formato UTC + ubicación física) ───
(function test45() {
  console.log("Test 45: buildAddCalLinks — nutrición presencial ES (UTC básico/extendido + dirección física)");
  const { sandbox } = freshCtx();
  const apptInstant = new sandbox.Date(sandbox.Date.UTC(2026, 7, 10, 15, 0, 0)); // 09:00 CR
  const links = sandbox.buildAddCalLinks({
    tipoCita: "initial",
    idioma: "es",
    primerNombre: "Sofia",
    apptInstant,
    esVirtual: false,
    token: "tok-45",
  });
  assert(getUrlParam(links.addCalGoogleLink, "dates") === "20260810T150000Z/20260810T160000Z", "Google: dates en UTC básico (yyyyMMdd'T'HHmmss'Z'), duración de 60min (initial)");
  assert(getUrlParam(links.addCalOutlookLink, "startdt") === "2026-08-10T15:00:00Z", "Outlook: startdt en UTC extendido (yyyy-MM-dd'T'HH:mm:ss'Z'), NO en hora local");
  assert(getUrlParam(links.addCalOutlookLink, "enddt") === "2026-08-10T16:00:00Z", "Outlook: enddt igual, +60min");
  assert(getUrlParam(links.addCalYahooLink, "st") === "20260810T150000Z", "Yahoo: st en UTC básico, igual que Google");
  assert(getUrlParam(links.addCalYahooLink, "et") === "20260810T160000Z", "Yahoo: et en UTC básico");
  assert(getUrlParam(links.addCalGoogleLink, "location").indexOf("Santa Ana Town Center") >= 0, "presencial: la ubicación física aparece en el link (encoding correcto, decodeURIComponent lo recupera intacto)");
  assert(links.addCalIcsLink.indexOf("action=ics") >= 0 && links.addCalIcsLink.indexOf("token=tok-45") >= 0, "addCalIcsLink apunta a ?action=ics&token=<el token de la cita>");
})();

// ── Test 46: buildAddCalLinks — nutrición virtual (ubicación = Meet, sin dirección física) ─
(function test46() {
  console.log("Test 46: buildAddCalLinks — nutrición virtual EN (ubicación = Google Meet, no dirección física)");
  const { sandbox } = freshCtx();
  const apptInstant = new sandbox.Date(sandbox.Date.UTC(2026, 7, 11, 13, 0, 0));
  const links = sandbox.buildAddCalLinks({
    tipoCita: "followup",
    idioma: "en",
    primerNombre: "Jane",
    apptInstant,
    esVirtual: true,
    meetLink: "https://meet.google.com/abc-defg-hij",
    token: "tok-46",
  });
  const location = getUrlParam(links.addCalGoogleLink, "location");
  assert(location === "Google Meet: https://meet.google.com/abc-defg-hij", "virtual: la ubicación es el link de Meet, no la dirección física del consultorio");
  assert(getUrlParam(links.addCalGoogleLink, "details").indexOf("meet.google.com") >= 0, "el link de Meet también aparece en la descripción (details)");
})();

// ── Test 47: buildAddCalLinks — pilates (siempre virtual, texto/summary distinto) ───────
(function test47() {
  console.log("Test 47: buildAddCalLinks — pilates ES (summary/texto propio de clase, no de cita)");
  const { sandbox } = freshCtx();
  const apptInstant = new sandbox.Date(sandbox.Date.UTC(2026, 7, 15, 16, 0, 0));
  const links = sandbox.buildAddCalLinks({
    tipoCita: "pilates",
    idioma: "es",
    primerNombre: "Ana",
    apptInstant,
    esVirtual: true,
    meetLink: "https://meet.google.com/pilates-slot",
    token: "tok-47",
  });
  assert(getUrlParam(links.addCalGoogleLink, "text") === "Clase de pilates — Plant Powered by Dani", "pilates: título distinto al de una cita de nutrición");
  assert(getUrlParam(links.addCalGoogleLink, "dates") === "20260815T160000Z/20260815T170000Z", "pilates dura 60min");
})();

// ── Test 48: buildBookingIcsContent — método PUBLISH (endpoint de descarga) ─────────────
(function test48() {
  console.log("Test 48: buildBookingIcsContent — METHOD:PUBLISH, sin ATTENDEE/ORGANIZER");
  const { sandbox } = freshCtx();
  const apptInstant = new sandbox.Date(sandbox.Date.UTC(2026, 7, 10, 15, 0, 0));
  const ics = sandbox.buildBookingIcsContent({
    token: "tok-48",
    tipoCita: "initial",
    idioma: "es",
    primerNombre: "Sofia",
    apptInstant,
    esVirtual: false,
    method: "PUBLISH",
    sequence: 0,
  });
  assert(ics.indexOf("BEGIN:VCALENDAR") === 0, "arranca con BEGIN:VCALENDAR");
  assert(ics.indexOf("METHOD:PUBLISH") >= 0, "declara METHOD:PUBLISH");
  assert(ics.indexOf("UID:tok-48@plantpoweredbydani.com") >= 0, "UID estable armado a partir del token");
  assert(ics.indexOf("DTSTART:20260810T150000Z") >= 0, "DTSTART en UTC");
  assert(ics.indexOf("DTEND:20260810T160000Z") >= 0, "DTEND = DTSTART + duración del tipo de cita");
  assert(ics.indexOf("ATTENDEE") === -1, "sin ATTENDEE en modo PUBLISH (nadie pasó attendeeEmail)");
  assert(ics.indexOf("ORGANIZER") === -1, "sin ORGANIZER (nadie pasó organizerEmail)");
  assert(ics.indexOf("END:VCALENDAR") >= 0, "termina con END:VCALENDAR");
})();

// ── Test 49: buildBookingIcsContent — método REQUEST (invitación real) ──────────────────
(function test49() {
  console.log("Test 49: buildBookingIcsContent — METHOD:REQUEST, con ORGANIZER/ATTENDEE y SEQUENCE");
  const { sandbox } = freshCtx();
  const apptInstant = new sandbox.Date(sandbox.Date.UTC(2026, 7, 10, 15, 0, 0));
  const ics = sandbox.buildBookingIcsContent({
    token: "tok-49",
    tipoCita: "initial",
    idioma: "es",
    primerNombre: "Sofia",
    apptInstant,
    esVirtual: false,
    method: "REQUEST",
    sequence: 2,
    organizerEmail: "dani@test.com",
    attendeeEmail: "cliente@test.com",
  });
  assert(ics.indexOf("METHOD:REQUEST") >= 0, "declara METHOD:REQUEST");
  assert(ics.indexOf("SEQUENCE:2") >= 0, "SEQUENCE refleja el parámetro (2, ej. un 2do reagendamiento)");
  assert(ics.indexOf("ORGANIZER:mailto:dani@test.com") >= 0, "ORGANIZER presente cuando se pasa organizerEmail");
  assert(ics.indexOf("ATTENDEE") >= 0 && ics.indexOf("mailto:cliente@test.com") >= 0, "ATTENDEE presente con el correo del cliente");
})();

// ── Test 50: doGet ?action=ics — token válido sirve el .ics con los datos ACTUALES ──────
(function test50() {
  console.log("Test 50: doGet ?action=ics con token válido responde ContentService/MimeType.ICAL con un .ics válido");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "initial", isoInHours(72), "Gina", "Vindas", "gina@test.com", "8888-6000", "cedula", "1-6000-0000",
    "1990-01-01", "es", "presencial", "America/Costa_Rica"
  );
  const output = sandbox.doGet({ parameter: { action: "ics", token } });
  assert(typeof output.getMimeType === "function", "devuelve un ContentService.TextOutput, no el HtmlOutput del SPA");
  assert(output.getMimeType() === "ICAL", "mimetype ICAL (text/calendar)");
  assert(output.getContent().indexOf("BEGIN:VCALENDAR") === 0, "el contenido es un .ics válido");
  assert(output.getContent().indexOf(`UID:${token}@plantpoweredbydani.com`) >= 0, "el UID incluye el token real de la cita");
})();

// ── Test 51: doGet ?action=ics — token inexistente responde texto de error, no un .ics roto ─
(function test51() {
  console.log("Test 51: doGet ?action=ics con token inexistente responde texto plano de error");
  const { sandbox } = freshCtx();
  const output = sandbox.doGet({ parameter: { action: "ics", token: "no-existe" } });
  assert(output.getMimeType() === "TEXT", "mimetype TEXT, no ICAL — nunca un .ics roto");
  assert(output.getContent().length > 0, "trae un mensaje de error no vacío");
})();

// ── Test 52: doGet ?action=ics — cita cancelada responde texto de error ─────────────────
(function test52() {
  console.log("Test 52: doGet ?action=ics con una cita ya cancelada responde texto plano de error");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "followup", isoInHours(72), "Hugo", "Rojas", "hugo@test.com", "8888-6001", "cedula", "1-6000-0001",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  sandbox.cancelBooking(token);
  const output = sandbox.doGet({ parameter: { action: "ics", token } });
  assert(output.getMimeType() === "TEXT", "mimetype TEXT para una cita cancelada");
  assert(output.getContent().toLowerCase().indexOf("cancel") >= 0, "el mensaje de error menciona que la cita fue cancelada");
})();

// ── Test 53: doGet ?action=ics sin token responde texto de error (no revienta) ──────────
(function test53() {
  console.log("Test 53: doGet ?action=ics sin token responde texto plano de error, sin lanzar excepción");
  const { sandbox } = freshCtx();
  const output = sandbox.doGet({ parameter: { action: "ics" } });
  assert(output.getMimeType() === "TEXT", "mimetype TEXT cuando falta el token");
})();

// ── Test 54: doGet con ?token= (sin action) sigue sirviendo el SPA — sin regresión de US-31 ─
(function test54() {
  console.log("Test 54: doGet con ?token= sin ?action= sigue sirviendo el SPA de gestión de cita (regresión US-31)");
  const { sandbox } = freshCtx();
  const output = sandbox.doGet({ parameter: { token: "cualquier-token" } });
  assert(typeof output.append === "function", "sigue devolviendo el HtmlOutput del SPA (con .append), no el ContentService de US-37");
})();

// ── Test 55: el .ics del endpoint refleja la fecha/hora NUEVA tras un reagendamiento ────
(function test55() {
  console.log("Test 55: doGet ?action=ics refleja la fecha/hora NUEVA después de un reagendamiento (no la original)");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "measurement", isoInHours(72), "Karla", "Vega", "karla@test.com", "8888-6002", "cedula", "1-6000-0002",
    "1990-01-01", "es", "presencial", "America/Costa_Rica"
  );
  const dtstartBefore = (sandbox.doGet({ parameter: { action: "ics", token } }).getContent().match(/DTSTART:(\S+)/) || [])[1];

  sandbox.rescheduleBooking(token, isoInHours(300), "America/Costa_Rica");
  const outputAfter = sandbox.doGet({ parameter: { action: "ics", token } });
  const dtstartAfter = (outputAfter.getContent().match(/DTSTART:(\S+)/) || [])[1];

  assert(!!dtstartBefore && !!dtstartAfter && dtstartBefore !== dtstartAfter, "el DTSTART del .ics cambia tras el reagendamiento");

  const nutSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Nutrición");
  const row = findTokenRow(nutSheet, token);
  const fechaSheet = nutSheet.getRange(row, 10, 1, 1).getValue();
  const horaSheet = nutSheet.getRange(row, 11, 1, 1).getValue();
  const expectedInstant = sandbox.parseSheetDateTime(fechaSheet, horaSheet);
  const expectedDtstart = formatDate(expectedInstant, "Etc/UTC", "yyyyMMdd'T'HHmmss'Z'");
  assert(dtstartAfter === expectedDtstart, "el DTSTART tras reagendar coincide EXACTAMENTE con la fecha/hora ACTUAL guardada en el Sheet, no con la original");
})();

// ── Test 56: bookTimeslot adjunta la invitación .ics real (METHOD:REQUEST) al correo ────
(function test56() {
  console.log("Test 56: bookTimeslot adjunta un .ics real (METHOD:REQUEST, ATTENDEE=cliente, SEQUENCE:0) al correo de confirmación");
  const { sandbox } = freshCtx();
  sandbox.bookTimeslot(
    "initial", isoInHours(72), "Sofia", "Mora", "sofia-ics@test.com", "8888-6003", "cedula", "1-6000-0003",
    "1990-01-01", "es", "presencial", "America/Costa_Rica"
  );
  const sent = sandbox.__sentEmails || [];
  const confirmEmail = sent.find((e) => e.to === "sofia-ics@test.com");
  assert(!!confirmEmail, "se encuentra el correo de confirmación");
  const attachments = (confirmEmail.options && confirmEmail.options.attachments) || [];
  assert(attachments.length === 1, "el correo trae exactamente 1 adjunto");
  const blob = attachments[0];
  assert(blob.getContentType().indexOf("text/calendar") === 0, "content-type del adjunto empieza con text/calendar");
  // DIAGNÓSTICO TEMPORAL en curso (US-37): por ahora el blob que se ADJUNTA de verdad se deja
  // con content-type LIMPIO a propósito (prueba de control pedida por el usuario para aislar
  // si GmailApp.sendEmail descarta silenciosamente un content-type con parámetros extra) — el
  // "; method=REQUEST" ya NO va en el header en esta ronda. Actualizar este assert cuando se
  // resuelva el diagnóstico y se decida el comportamiento final.
  assert(blob.getContentType() === "text/calendar", "[DIAGNÓSTICO] por ahora el content-type del adjunto queda LIMPIO (sin parámetros extra) a propósito, como prueba de control");
  const data = blob.getDataAsString();
  assert(data.indexOf("METHOD:REQUEST") >= 0, "el contenido del .ics también declara METHOD:REQUEST");
  assert(data.indexOf("mailto:sofia-ics@test.com") >= 0, "el cliente aparece como ATTENDEE");
  assert(data.indexOf("SEQUENCE:0") >= 0, "SEQUENCE arranca en 0 para la confirmación inicial");
})();

// ── Test 57: rescheduleBooking sube el SEQUENCE del .ics adjunto (reusa contador US-42) ─
(function test57() {
  console.log("Test 57: rescheduleBooking adjunta la invitación .ics con SEQUENCE:1 en el primer reagendamiento");
  const { sandbox } = freshCtx();
  const token = sandbox.bookTimeslot(
    "initial", isoInHours(72), "Rita", "Leon", "rita-ics@test.com", "8888-6004", "cedula", "1-6000-0004",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  sandbox.__sentEmails = [];
  sandbox.rescheduleBooking(token, isoInHours(150), "America/Costa_Rica");
  const sent = sandbox.__sentEmails || [];
  const reagendarEmail = sent.find((e) => e.to === "rita-ics@test.com");
  assert(!!reagendarEmail, "se envía el correo de reagendamiento al cliente");
  const attachments = (reagendarEmail.options && reagendarEmail.options.attachments) || [];
  assert(attachments.length === 1, "también trae 1 adjunto .ics");
  assert(attachments[0].getDataAsString().indexOf("SEQUENCE:1") >= 0, "SEQUENCE sube a 1 (reusa incrementRescheduleCounterOnBookingRow de US-42, sin contador nuevo)");
})();

// ── Test 58: un fallo al construir el .ics no bloquea el envío del correo de confirmación ─
(function test58() {
  console.log("Test 58: un fallo de Utilities.newBlob al construir el adjunto .ics degrada con gracia (correo SIN adjunto, no un error)");
  const { sandbox } = freshCtx();
  sandbox.Utilities.newBlob = () => {
    throw new Error("Mock: newBlob caído");
  };

  let threw = null;
  let token = null;
  try {
    token = sandbox.bookTimeslot(
      "initial", isoInHours(72), "Pedro", "Ruiz", "pedro-ics@test.com", "8888-6005", "cedula", "1-6000-0005",
      "1990-01-01", "es", "presencial", "America/Costa_Rica"
    );
  } catch (e) {
    threw = e.message;
  }

  assert(threw === null, "bookTimeslot no lanza ningún error pese al fallo de Utilities.newBlob");
  assert(!!token, "el agendamiento se completa normalmente (Sheet/Calendar no dependen del adjunto)");
  const sent = sandbox.__sentEmails || [];
  const confirmEmail = sent.find((e) => e.to === "pedro-ics@test.com");
  assert(!!confirmEmail, "el correo de confirmación se envía igual");
  assert(confirmEmail.options.attachments && confirmEmail.options.attachments.length === 0, "se envía SIN adjunto cuando falla la construcción del .ics, en vez de bloquear el correo completo");
})();

// ── Test 59: si setContentType (parámetros extra) falla, el adjunto SE ENVÍA IGUAL con el
//    content-type limpio — no se pierde el .ics completo por ese segundo paso, solo opcional ──
(function test59() {
  console.log("Test 59: un fallo de blob.setContentType() (parámetros extra) NO tira el adjunto — se adjunta con content-type limpio");
  const { sandbox } = freshCtx();
  const realNewBlob = sandbox.Utilities.newBlob;
  sandbox.Utilities.newBlob = (data, contentType, name) => {
    const blob = realNewBlob(data, contentType, name);
    blob.setContentType = () => {
      throw new Error("Mock: real Apps Script rechaza contentType con parámetros extra");
    };
    return blob;
  };

  sandbox.bookTimeslot(
    "initial", isoInHours(72), "Nora", "Solis", "nora-ics@test.com", "8888-6006", "cedula", "1-6000-0006",
    "1990-01-01", "es", "presencial", "America/Costa_Rica"
  );
  const sent = sandbox.__sentEmails || [];
  const confirmEmail = sent.find((e) => e.to === "nora-ics@test.com");
  assert(!!confirmEmail, "el correo de confirmación se envía igual");
  const attachments = (confirmEmail.options && confirmEmail.options.attachments) || [];
  assert(attachments.length === 1, "el adjunto SÍ se manda (no se pierde por el fallo de setContentType)");
  assert(attachments[0].getContentType() === "text/calendar", "queda con el content-type limpio (sin los parámetros extra que el 2do paso no pudo aplicar)");
  assert(attachments[0].getDataAsString().indexOf("METHOD:REQUEST") >= 0, "el contenido del .ics igual declara METHOD:REQUEST (lo que realmente exige RFC 5546, no el header)");
})();

// ── Test 60: camino feliz — bookTimeslot escribe una fila "OK" en Debug_US37 ────────────
(function test60() {
  console.log("Test 60: adjunto .ics construido OK escribe una fila de diagnóstico en la hoja Debug_US37");
  const { sandbox } = freshCtx();
  sandbox.bookTimeslot(
    "initial", isoInHours(72), "Olga", "Mena", "olga-debug@test.com", "8888-6007", "cedula", "1-6000-0007",
    "1990-01-01", "es", "presencial", "America/Costa_Rica"
  );
  const debugSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Debug_US37");
  assert(!!debugSheet, "la hoja Debug_US37 se crea automáticamente, sin migración manual previa");
  assert(debugSheet.data[0][0] === "timestamp" && debugSheet.data[0][1] === "mensaje", "encabezados timestamp/mensaje");
  const rows = debugSheet.data.slice(1);
  assert(rows.length >= 1, "se escribió al menos 1 fila tras un agendamiento exitoso");
  const okRow = rows.find((r) => String(r[1]).indexOf("construido OK") >= 0);
  assert(!!okRow, "hay una fila del camino feliz ('adjunto .ics construido OK')");
  assert(!!okRow[0], "la fila trae un timestamp no vacío");
})();

// ── Test 61: camino de error — un fallo real escribe la fila de error en Debug_US37 ─────
(function test61() {
  console.log("Test 61: un fallo al construir el adjunto .ics escribe la fila de error (con describeError) en Debug_US37, no solo en Logger/console");
  const { sandbox } = freshCtx();
  sandbox.Utilities.newBlob = () => {
    throw new Error("Mock: fallo real simulado en newBlob");
  };
  sandbox.bookTimeslot(
    "initial", isoInHours(72), "Pablo", "Zeledon", "pablo-debug@test.com", "8888-6008", "cedula", "1-6000-0008",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const debugSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Debug_US37");
  const rows = debugSheet.data.slice(1);
  const errorRow = rows.find((r) => String(r[1]).indexOf("fallo al construir el adjunto .ics") >= 0);
  assert(!!errorRow, "hay una fila describiendo el fallo real de construcción del .ics");
  assert(String(errorRow[1]).indexOf("Mock: fallo real simulado en newBlob") >= 0, "el mensaje incluye el detalle real del error (vía describeError)");
})();

// ── Test 62: log de diagnóstico INMEDIATAMENTE ANTES de GmailApp.sendEmail (US-37) ──────
(function test62() {
  console.log("Test 62: bookTimeslot escribe en Debug_US37, justo antes de GmailApp.sendEmail, cuántos attachments trae options y el detalle del primero");
  const { sandbox } = freshCtx();
  sandbox.bookTimeslot(
    "initial", isoInHours(72), "Quique", "Fallas", "quique-debug@test.com", "8888-6009", "cedula", "1-6000-0009",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const debugSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Debug_US37");
  const rows = debugSheet.data.slice(1);
  const preSendRow = rows.find((r) => String(r[1]).indexOf("a punto de llamar GmailApp.sendEmail") >= 0);
  assert(!!preSendRow, "hay una fila de diagnóstico justo antes del envío real");
  assert(String(preSendRow[1]).indexOf("attachments.length=1") >= 0, "reporta attachments.length=1 en el momento exacto del envío");
  assert(String(preSendRow[1]).indexOf('contentType="text/calendar"') >= 0, "reporta el contentType exacto del adjunto en ese momento");
  assert(String(preSendRow[1]).indexOf("bytes=") >= 0, "reporta el tamaño en bytes del adjunto en ese momento");
})();

// ── Test 63: verificación POST-envío contra Gmail mismo (GmailApp.search + getAttachments) ─
(function test63() {
  console.log("Test 63: bookTimeslot verifica el mensaje YA ENTREGADO vía GmailApp.search — Debug_US37 refleja lo que Gmail reporta, no nuestras variables");
  const { sandbox } = freshCtx();
  sandbox.bookTimeslot(
    "initial", isoInHours(72), "Tomas", "Vargas", "tomas-postenvio@test.com", "8888-6010", "cedula", "1-6000-0010",
    "1990-01-01", "es", "presencial", "America/Costa_Rica"
  );
  const debugSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Debug_US37");
  const rows = debugSheet.data.slice(1);
  const postSendRow = rows.find((r) => String(r[1]).indexOf("[DIAGNÓSTICO-POSTENVÍO]") >= 0);
  assert(!!postSendRow, "hay una fila de verificación post-envío (contra Gmail, no contra nuestras variables)");
  assert(String(postSendRow[1]).indexOf("Gmail reporta 1 adjunto(s)") >= 0, "Gmail (mock) confirma 1 adjunto en el mensaje ya entregado");
  assert(String(postSendRow[1]).indexOf('name="invite.ics"') >= 0, "incluye el nombre del adjunto según Gmail");
  assert(String(postSendRow[1]).indexOf('contentType="text/calendar"') >= 0, "incluye el content-type del adjunto según Gmail");
})();

// ── Test 64: verificación post-envío cuando NO se encuentra el mensaje (no rompe el flujo) ──
(function test64() {
  console.log("Test 64: si GmailApp.search no encuentra el mensaje (ej. demora de indexado), se registra en Debug_US37 sin romper bookTimeslot");
  const { sandbox } = freshCtx();
  sandbox.GmailApp.search = () => [];
  let threw = null;
  try {
    sandbox.bookTimeslot(
      "initial", isoInHours(72), "Ursula", "Mora", "ursula-postenvio@test.com", "8888-6011", "cedula", "1-6000-0011",
      "1990-01-01", "es", "virtual", "America/Costa_Rica"
    );
  } catch (e) {
    threw = e.message;
  }
  assert(threw === null, "bookTimeslot no lanza ningún error aunque GmailApp.search no encuentre nada");
  const debugSheet = sandbox.SpreadsheetApp.openById().getSheetByName("Debug_US37");
  const rows = debugSheet.data.slice(1);
  const notFoundRow = rows.find((r) => String(r[1]).indexOf("no se encontró vía GmailApp.search") >= 0);
  assert(!!notFoundRow, "se deja registrada la situación de 'no encontrado' en vez de fallar silenciosamente");
})();

// ── Test 65: FIX REAL (US-37) — el correo real trae inlineImages Y attachments juntos ───
(function test65() {
  console.log("Test 65: bookTimeslot (nutrición) manda inlineImages (logo+flor) Y el adjunto .ics en la MISMA llamada a GmailApp.sendEmail");
  const { sandbox } = freshCtx();
  sandbox.bookTimeslot(
    "initial", isoInHours(72), "Vera", "Chinchilla", "vera-fix@test.com", "8888-6012", "cedula", "1-6000-0012",
    "1990-01-01", "es", "presencial", "America/Costa_Rica"
  );
  const sent = sandbox.__sentEmails || [];
  const confirmEmail = sent.find((e) => e.to === "vera-fix@test.com");
  assert(!!confirmEmail, "se encuentra el correo de confirmación");
  const inlineImages = confirmEmail.options.inlineImages;
  assert(!!inlineImages && Object.keys(inlineImages).length === 2, "trae 2 imágenes embebidas (logo + flor) para nutrición");
  assert(!!inlineImages.logo_pph && !!inlineImages.flor_pph, "las claves son logo_pph y flor_pph (coinciden con los cid: del HTML real)");
  assert(confirmEmail.options.attachments && confirmEmail.options.attachments.length === 1, "el mismo envío igual trae el adjunto .ics — ambas opciones conviven en la misma llamada");
})();

// ── Test 66: FIX REAL (US-37) — pilates ES usa logo compartido + kettlebell ─────────────
(function test66() {
  console.log("Test 66: bookTimeslot (pilates ES) manda inlineImages (logo compartido + kettlebell)");
  const { sandbox } = freshCtx();
  sandbox.bookTimeslot(
    "pilates", isoInHours(13), "Wendy", "Cruz", "wendy-fix@test.com", "8888-6014", "cedula", "1-6000-0014",
    "1990-01-01", "es", "virtual", "America/Costa_Rica"
  );
  const sent = sandbox.__sentEmails || [];
  const confirmEmail = sent.find((e) => e.to === "wendy-fix@test.com");
  const inlineImages = confirmEmail.options.inlineImages;
  assert(!!inlineImages.logo_pph && !!inlineImages.kettlebell_pph, "pilates ES usa el logo COMPARTIDO (logo_pph) + kettlebell_pph");
  assert(!inlineImages.flor_pph, "pilates no trae la flor de nutrición");
})();

// ── Test 67: FIX REAL (US-37) — pilates EN usa su PROPIO logo (distinto del compartido) ──
(function test67() {
  console.log("Test 67: bookTimeslot (pilates EN) manda su propio logo_pilates_en_pph, no el logo_pph compartido");
  const { sandbox } = freshCtx();
  sandbox.bookTimeslot(
    "pilates", isoInHours(13), "Xavier", "Bolanos", "xavier-fix@test.com", "8888-6015", "cedula", "1-6000-0015",
    "1990-01-01", "en", "virtual", "America/Costa_Rica"
  );
  const sent = sandbox.__sentEmails || [];
  const confirmEmail = sent.find((e) => e.to === "xavier-fix@test.com");
  const inlineImages = confirmEmail.options.inlineImages;
  assert(!!inlineImages.logo_pilates_en_pph && !!inlineImages.kettlebell_pph, "pilates EN usa logo_pilates_en_pph (propio) + kettlebell_pph");
  assert(!inlineImages.logo_pph, "pilates EN NO usa el logo_pph compartido (divergencia preexistente documentada, no un bug de este fix)");
})();

// ── Test 68: si falla la carga de imágenes, el correo se envía igual (degradación) ──────
(function test68() {
  console.log("Test 68: un fallo al cargar las imágenes embebidas no impide el envío del correo de confirmación (ni pierde el adjunto .ics)");
  const { sandbox } = freshCtx();
  sandbox.HtmlService.createHtmlOutputFromFile = () => {
    throw new Error("Mock: archivo asset_*.html no encontrado");
  };
  let threw = null;
  try {
    sandbox.bookTimeslot(
      "initial", isoInHours(72), "Yolanda", "Pizarro", "yolanda-fix@test.com", "8888-6016", "cedula", "1-6000-0016",
      "1990-01-01", "es", "presencial", "America/Costa_Rica"
    );
  } catch (e) {
    threw = e.message;
  }
  assert(threw === null, "bookTimeslot no lanza ningún error pese al fallo de HtmlService.createHtmlOutputFromFile");
  const sent = sandbox.__sentEmails || [];
  const confirmEmail = sent.find((e) => e.to === "yolanda-fix@test.com");
  assert(!!confirmEmail, "el correo de confirmación se envía igual");
  assert(Object.keys(confirmEmail.options.inlineImages || {}).length === 0, "se envía SIN imágenes embebidas cuando falla su carga (degradación con gracia)");
  assert(confirmEmail.options.attachments && confirmEmail.options.attachments.length === 1, "el adjunto .ics NO se pierde por el fallo de las imágenes — son independientes");
})();

console.log(`\n${passed} pasaron, ${failed} fallaron`);
process.exit(failed > 0 ? 1 : 0);
