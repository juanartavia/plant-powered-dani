# Harness de pruebas — US-06 (reagendar/cancelar)

No hay framework de test instalado en el proyecto (`npm test` en `backend/` es un stub).
Este harness corre la lógica pura de `app.ts` en Node, mockeando los globals de Google
Apps Script (`SpreadsheetApp`, `Calendar`, `LockService`, `Utilities`, etc.) con un
spreadsheet en memoria — no necesita ninguna cuenta ni credencial real.

## Cómo correrlo

```powershell
cd backend
npx tsc --target ES2019 --module none --outDir test-harness/out src/app.ts --skipLibCheck
node test-harness/run-tests.js
```

`gas-mock.js` implementa el sandbox (hojas en memoria, Calendar mock, zona horaria fija
America/Costa_Rica = UTC-6). `run-tests.js` carga `app.js` compilado con `vm.runInContext`
y llama directamente a las funciones expuestas (`bookTimeslot`, `cancelBooking`,
`rescheduleBooking`, `findBookingByToken`, `getClientPaymentStatus`, etc.).

Cubre: reagendar dentro/fuera de la ventana de 24hrs, cancelar dentro/fuera de la ventana,
2 cancelaciones tardías consecutivas de un mismo cliente en tipos de cita DISTINTOS
(`requiere_pago=true`), que el historial nunca borre filas, token inexistente,
reagendamiento de pilates entre dos slots grupales, cancelación tardía (US-33),
reagendamientos múltiples (US-42), y (US-37) construcción de los 3 links "agregar a
calendario" (formato UTC básico/extendido, ubicación física/virtual), el endpoint
`?action=ics` (token válido/inválido/cancelado, y que refleja la fecha NUEVA tras un
reagendamiento) y la invitación .ics real (METHOD:REQUEST) adjunta al correo de
confirmación, incluyendo degradación con gracia si falla su construcción.

**US-43 (cupos de pilates vía calendario de disponibilidad):** `gas-mock.js` agrega
`Calendar.Events.list` (reutiliza el mismo store en memoria de `.insert`, filtrando por
calendarId/timeMin/timeMax) y el Script Property `PILATES_AVAILABILITY_CALENDAR_ID`, para
poder sembrar clases de prueba con `sandbox.Calendar.Events.insert(resource,
availabilityCalendarId)` sin necesitar ningún mecanismo de siembra separado. Los tests 69-74
cubren: `getAvailableCapacityForClass` (default de 5 sin fila, y con `max_participantes`
editado a mano), `CLASE_LLENA` al agendar y al reagendar hacia una clase llena (la cita
original nunca cambia si el reagendamiento se bloquea), que cancelar libera el cupo de
inmediato (conteo en vivo desde "Pilates", no un rollback manual de un contador), que
`fetchAvailability("pilates")` ya no depende de sábados/10am hardcodeado sino del calendario
de disponibilidad + cupo real, y que `syncPilatesClassesToCuposSheet` es idempotente (no
duplica filas en corridas repetidas) y nunca pisa `max_participantes` ya editado a mano.
Blind spot conocido: el mock de `Calendar.Events.list` no reproduce ningún límite de
paginación (`pageToken`) del API real — irrelevante hoy dado el volumen bajo de clases, pero
a tener en cuenta si el número de clases de disponibilidad creciera mucho.

**Recurrencia (Test 75):** `Calendar.Events.list` del mock ahora expande eventos con
`recurrence: ["RRULE:FREQ=WEEKLY..."]` en instancias individuales, en list-time — igual que
hace Calendar real cuando se pide `singleEvents:true` (que `getPilatesAvailabilityEvents()`
ya envía). Soporte MÍNIMO a propósito: solo `FREQ=WEEKLY` (+ `INTERVAL`/`COUNT`/`UNTIL`
opcionales, ver `parseWeeklyRecurrence` en `gas-mock.js`) — no es un parser RFC 5545 completo
(sin `BYDAY`, sin `FREQ=DAILY/MONTHLY`, sin `EXDATE`). Test 75 confirma que el código de
`app.ts` trata cada instancia expandida como un slot independiente (su propio
`disponibilidad_event_id`, su propia fila en `Cupos_Pilates`, su propio timeslot en
`fetchAvailability`) — **lo que NO confirma** es que Calendar real expanda la recurrencia
exactamente así; eso es responsabilidad documentada del API y solo se puede validar contra
Calendar real con una clase recurrente de verdad (parte del checklist de deploy de US-43).

**US-44 (disponibilidad real de nutrición vía calendario de bloques):** mismo mecanismo de
siembra que US-43 (`sandbox.Calendar.Events.insert(resource,
NUTRICION_AVAILABILITY_CALENDAR_ID)`, agregado a `gas-mock.js`), pero para bloques CONTINUOS
en vez de clases discretas — `getNutricionAvailabilityBlocks()` lee el calendario
"Disponibilidad - Nutrición" y `fetchAvailability()` talla cada bloque en sub-slots
consecutivos según la duración del tipo de cita, sin huecos. A diferencia de pilates, este
flujo no tiene ninguna capa intermedia tipo `Cupos_Pilates` — la disponibilidad se calcula
100% en vivo, así que no hizo falta ningún mecanismo de dedup nuevo. Los tests 80-84 cubren:
un bloque parcial talla exactamente los sub-slots que caben completos dentro de su rango
(sin desbordar ni un minuto), cero bloques marcados → cero slots (sin fallback a
`WORKDAYS`/`WORKHOURS`, que quedaron en el código sin uso activo como plan de rollback), un
sub-slot con conflicto real (vía `Calendar.Freebusy.query`, mockeado ad-hoc en el test) queda
excluido sin afectar el resto del bloque, un bloque recurrente semanal se expande en
instancias independientes (mismo soporte mínimo de `parseWeeklyRecurrence`), y una regresión
explícita de que `fetchAvailability("pilates")` no se vio afectado por este cambio.
