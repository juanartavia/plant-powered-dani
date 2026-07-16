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
(`requiere_pago=true`), que el historial nunca borre filas, token inexistente, y
reagendamiento de pilates entre dos slots grupales.
