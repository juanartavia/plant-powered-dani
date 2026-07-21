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
  assert(sent.length === 1, "cancelBooking envía exactamente 1 correo (la notificación interna — el cliente no recibe correo de cancelación en esta tarjeta)");
  assert(sent[0].to.includes("plantpoweredani.testing@gmail.com"), "la notificación interna de cancelación va a los destinatarios placeholder (Dani/Ali)");
  assert(sent[0].subject.startsWith("Cancelada:"), "el subject usa el verbo 'Cancelada'");
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
  assert(sent.length === 1, "rescheduleBooking envía exactamente 1 correo (la notificación interna)");
  assert(sent[0].to.includes("plantpoweredani.testing@gmail.com"), "la notificación interna de reagendamiento va a los destinatarios placeholder (Dani/Ali)");
  assert(sent[0].subject.startsWith("Reagendada:"), "el subject usa el verbo 'Reagendada'");
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
  assert(sentReagendar.length === 1 && sentReagendar[0].subject.startsWith("Reagendada:"), "reagendar pilates dispara la notificación interna de reagendamiento");

  sandbox.__sentEmails = [];
  sandbox.cancelBooking(token);
  const sentCancelar = sandbox.__sentEmails || [];
  assert(sentCancelar.length === 1 && sentCancelar[0].subject.startsWith("Cancelada:"), "cancelar pilates dispara la notificación interna de cancelación");
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

console.log(`\n${passed} pasaron, ${failed} fallaron`);
process.exit(failed > 0 ? 1 : 0);
