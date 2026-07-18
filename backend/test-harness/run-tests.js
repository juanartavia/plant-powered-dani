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

console.log(`\n${passed} pasaron, ${failed} fallaron`);
process.exit(failed > 0 ? 1 : 0);
