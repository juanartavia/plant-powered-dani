# CLAUDE.md — Plant Powered by Dani
## Sistema de Agendamiento Automatizado
> Documento vivo — actualizar conforme avanza el desarrollo
> Última actualización: 1 agosto 2026 — **Sprint 5.** Se cerró el fix de `NOTIFICACION_INTERNA_DESTINATARIOS` (ahora todas las notificaciones internas usan Script Properties, no una constante hardcodeada a la cuenta de testing), se agregó `setupNewAccountSheets()` para poder levantar el esquema completo de Sheets de una sola vez en cuentas nuevas, y se ejecutaron **dos rondas completas de ensayo de deploy en preproducción** (cuentas nuevas simulando a Dani), la segunda sin ningún tropiezo nuevo. Además se implementó y **validó en preproducción** la Opción B de remitente de pilates (alias "Enviar como" real de la instructora). Decisión del equipo: el banner de Google Apps Script (US-36) se acepta como limitación y se comunica como condición de servicio — cerrado, sin más trabajo pendiente ahí.

---

## 0. LÉEME PRIMERO — PARA EL PRÓXIMO CHAT

Si estás retomando este proyecto en un chat nuevo, este documento es tu única fuente de verdad. Antes de generar cualquier prompt para Claude Code:

1. Lee completo este documento, especialmente las secciones 11 (estado de sprints), 12-bis (entorno de preproducción, NUEVA), 13 (notas técnicas — la #43 y la #46 son las más extensas: correos con adjuntos+imágenes, y el bug real de `getLastRow()`/`appendRow()` en Sheets; la #47 cubre la diferencia de modelo entre nutrición y pilates; las #48/#49/#50 son las nuevas de esta sesión), y 14/15 (método de trabajo y Trello).
2. **Todo el flujo de correos, gestión de citas, branding, botones de calendario, cupos/duración de pilates, disponibilidad real de nutrición, notificaciones internas por Script Properties, y remitente real de pilates está Done y probado de punta a punta con datos/citas reales, tanto en testing como en dos cuentas de preproducción distintas:**
   - **US-11 a US-14** — Familia completa de correos automatizados.
   - **US-13/US-30, US-32, US-33** — Notificaciones internas (nueva cita, asistencia confirmada, cancelación tardía).
   - **US-31, US-28, US-41** — Página de gestión de citas + brandbook + fix de título redundante.
   - **US-34** — Formato de fecha en español corregido (día-mes-año, no al revés).
   - **US-40** — Campo de fecha de nacimiento: selector propio (Popover+Calendar+Dropdown).
   - **US-42** — Notificación a Dani/instructora + Ali cuando un cliente reagenda 3 veces o más.
   - **US-37** — Correo de confirmación con 4 botones de calendario + invitación `.ics` real adjunta.
   - **US-43** — Cupos de pilates dinámicos vía calendario de disponibilidad dedicado.
   - **US-45** — Duración dinámica de clases de pilates + trigger de sincronización cada 5 minutos.
   - **US-44** — Disponibilidad real de NUTRICIÓN vía calendario de disponibilidad dedicado.
   - **US-46 (nueva, 1 ago)** — Fix de `NOTIFICACION_INTERNA_DESTINATARIOS`: las notificaciones de "nueva cita/reagendada/cancelada/confirmada" ahora usan `getLateCancellationRecipients(esPilates)` (Script Properties `DANI_EMAIL`/`INSTRUCTORA_EMAIL`/`ALI_EMAIL`), igual que ya hacían cancelación tardía (US-33) y reagendamientos múltiples (US-42) — **confirmado en real en dos cuentas de preproducción distintas**.
   - **US-47 (nueva, 1 ago)** — `setupNewAccountSheets()`: función que arma el esquema completo y final de Google Sheets de una sola corrida, para cuentas nuevas (sin Debug_US37) — **usada con éxito en las dos rondas de ensayo**.
   - **US-48 (nueva, 1 ago)** — Opción B: los correos AL CLIENTE del flujo de pilates (confirmación, reagendamiento, cancelación) salen con el remitente real de la instructora, vía alias "Enviar como" de Gmail + Script Property `PILATES_SENDER_EMAIL` — **confirmado en real en preproducción, incluyendo verificación del alias**.
3. **Bug crítico histórico, ya corregido:** los links de los correos usaban `ScriptApp.getService().getUrl()`, que devuelve `/dev` (deployment HEAD, roto) en vez de `/exec`. Corregido con `WEB_APP_URL` fija.
4. **Lección de arquitectura (US-28):** el portal se compila a un ÚNICO archivo HTML inlineado (`vite-plugin-singlefile`) — `frontend/public/` NO sirve para nada en producción.
5. **Gap de build (27 jul), corregido:** `backend/package.json` → `"build": "tsc && node copy-to-dist.js"`.
6. **Incidente grave de corrupción de OneDrive (27-28 jul), completamente recuperado.** El proyecto vive en `C:\dev\plant-powered-dani` — **NUNCA** en una carpeta de OneDrive.
7. **Apps Script Web Apps corren dentro de un iframe cross-origin real, con implicaciones serias:**
   - `HTMLInputElement.showPicker()` lanza `SecurityError` si se llama desde ese iframe — **nunca usar esta API** para nada que dependa de abrirse dentro del portal.
   - `Logger.log()`/`console.log()` **no aparecen de forma confiable** en el panel de "Ejecuciones" para ejecuciones reales disparadas por el Web App.
   - **Cualquier prueba de una funcionalidad nueva debe hacerse contra la URL pública real (`/exec`), nunca solo contra `localhost`**.
   - **Corolario US-44:** para funciones parametrizadas (ej. `fetchAvailability(type)`), la única prueba real es a través del portal público con el parámetro en la URL — el botón "Ejecutar" del editor no permite pasar argumentos.
8. **Regla crítica de correos con imágenes + adjuntos, ver nota #43:** nunca embeber imágenes como `<img src="data:image/png;base64,...">` directo en un correo que también lleve un archivo adjunto real vía `GmailApp.sendEmail()` — usar siempre `inlineImages` (con `<img src="cid:...">`).
9. **Regla crítica de Sheets, ver nota #46:** nunca llamar `sheet.getLastRow()` inmediatamente después de `sheet.appendRow()` dentro de un loop, sin flush entre medio.
10. **`clasp push` vs `clasp deploy`, distinción importante:** `clasp push` solo actualiza el HEAD del editor. La URL pública `/exec` **NO se actualiza con `push`** — solo con `clasp deploy` explícito sobre el `deploymentId` correspondiente.
11. **Nutrición y pilates leen calendarios de disponibilidad dedicados, con modelos distintos** (ver nota #47): pilates = clases discretas; nutrición = tiempo continuo tallado en sub-slots.
12. **US-20 (token único)** cubierta al 100% por US-06/US-31 — pendiente que el usuario la cierre/archive en Trello.
13. **Pendientes de fondo, de baja urgencia, confirmados como seguros de dejar así:** coerción de fechas a Date en Sheets (cosmético), `findClientByEmail()` lee con TIME_ZONE en vez de UTC, acceso móvil sin validación formal con dispositivo externo.
14. **Destinatarios de notificaciones internas de TESTING siguen en placeholder** (`plantpoweredani.testing@gmail.com`) — normal para el ambiente de testing, hay que reemplazar por los correos reales de Dani/Ali/instructora recién en el deploy de producción final.
15. **Varios textos de copy siguen en BORRADOR**, pendientes de aprobación de Gabriela/Dani.
16. Flujo de trabajo de siempre: prompt → Claude Code ejecuta → **commit inmediato tras deploy** → **probar en real (URL pública) antes de marcar cualquier checkbox** → actualizar CLAUDE.md.
17. **Pedir siempre el checklist real de Trello antes de generar un prompt nuevo.**
18. **Antes de patchear este documento, confirmar que es la versión más completa y reciente.** Ya pasó varias veces que no lo era — incluyendo el 1 de agosto, cuando se pegó la versión vieja del 30 de julio pensando que ya estaba actualizada. **Regla reforzada: después de pedirle a Claude Code que actualice este archivo, confirmar explícitamente que el archivo en disco cambió (ej. pedirle que muestre las primeras líneas o busque una palabra clave nueva) antes de asumir que quedó guardado.**
19. **`WEB_APP_URL` fija siempre, nunca `ScriptApp.getService().getUrl()`.** Línea 247 de `backend/src/app.ts`.
20. **Lista de todo lo construido SIN diseño de Gabriela:** botón "Agregar a mi calendario" (4 botones + invitación real, US-37), notificación interna con 3 variantes, correo al cliente al reagendar, correo de cancelación al cliente, página de gestión de citas (US-31), plantilla de cancelación tardía (US-33), plantilla de reagendamientos múltiples (US-42), selector de fecha de nacimiento propio (US-40).
21. **Pendiente de fondo, no urgente:** segunda carpeta de recuperación de OneDrive nunca se terminó de auditar.
22. `build.sh` de la raíz no ejecuta en `cmd.exe`/Windows — pendiente, no bloquea.
23. **US-36 (banner de Google Apps Script) — CERRADO.** Decisión de equipo (StandUp viernes, 1 ago): se acepta como limitación de la versión gratuita y se comunica como condición del servicio. No requiere más trabajo técnico.
24. **Coordinación pendiente con Dani/Ali/instructora antes de producción:** deben cargar bloques de disponibilidad reales en `Disponibilidad - Nutrición`/`Disponibilidad - Pilates` ANTES de que el modelo viejo se apague del todo.
25. **Sin tarjetas grandes de arquitectura pendientes** — ver sección 11 para el detalle de lo que falta (mayormente higiene/producción y decisiones de negocio, no arquitectura).
26. **NUEVO — Terminología: "cuenta de ensayo" pasa a llamarse "preproducción" (preprod).** El equipo confirmó formalmente en el StandUp del 1 de agosto que este ambiente es parte del proceso oficial de despliegue, no una prueba informal — ver sección 12-bis.
27. **NUEVO — Bug de fecha inconsistente entre banner de Calendar y cuerpo del correo, INVESTIGADO Y CERRADO (no es un bug de producción):** causado por `testSendConfirmationEmails()` (función de prueba manual, no el flujo real de clientes) usando un token hardcodeado (`"test-token-1234"`) reutilizado entre corridas con fechas distintas — Gmail cachea el evento de Calendar bajo ese UID fijo y muestra la fecha del run más reciente en el banner, aunque el cuerpo del correo (leído de Sheets en el momento) muestre la fecha correcta. **Confirmado que no puede pasar con reservas reales** (el `token` real es un UUID único por fila, generado una sola vez). El equipo decidió en el StandUp del 1 de agosto **mantener el botón de calendario tal cual**, sin más cambios — riesgo aceptado, ver nota #49 para el detalle completo.
28. **NUEVO — Pendiente de la reunión del StandUp (1 ago), no iniciado todavía:**
    - Bajar la frecuencia del trigger de lectura de disponibilidad de Pilates de 5 min a **1 min**.
    - Investigar si se mantiene o se elimina la funcionalidad de correo de cancelación (decisión de negocio, no solo técnica).
    - Crear una historia de usuario formal para "paso a preproducción" (en la práctica, ya se ejecutó dos veces vía las rondas de ensayo — falta solo formalizarla en Trello).
    - Documentar para el usuario final el enfoque de doble calendario (citas + disponibilidad), enfatizando que da más privacidad y flexibilidad.
    - Elaborar manual de usuario detallado de todos los procesos.
    - Danilo explora acortadores de URL (TinyURL u otros) — con la precaución de no usar los nombres de enlace definitivos durante pruebas.
29. **NUEVO — Reunión de despliegue real programada para el martes**, enfocada exclusivamente en el paso a producción con la cuenta de Dani.
30. **NUEVO — Facturación del proyecto confirmada:** una sola factura electrónica al final, pago en colones vía transferencia a cuenta BAC.
31. **NUEVO — Cambio de personal, ya resuelto en el diseño:** la secretaria "Ali" fue despedida. El equipo decidió estandarizar el correo de secretaría a una dirección genérica (ej. `info@plantpoweredbydani.com`), no ligada al nombre de una persona — esto **no requiere ningún cambio de código**, la Script Property sigue llamándose `ALI_EMAIL` (es solo un nombre interno de variable) y simplemente se le pone el correo genérico nuevo cuando lo tengan. Si "Ali" aparece como texto VISIBLE en algún template de correo, revisar y genericizar aparte (pendiente de auditar, no confirmado si aplica).

---

## 1. CONTEXTO DEL PROYECTO

### El cliente
**Plant Powered by Dani** — estudio de nutrición y pilates en Costa Rica.
- **Dani**: nutricionista, admin principal del sistema.
- **Instructora de pilates**: cuenta separada bajo el mismo dominio. Pilates no tiene recordatorio de 48hrs.
- **Secretaría**: distribuye los links de agendamiento por WhatsApp. Recibe las notificaciones internas junto con Dani. **Correo genérico institucional** (no ligado a una persona específica, ver punto 31 de la sección 0) — el rol se mantiene bajo la Script Property `ALI_EMAIL`.

### El negocio
- Atiende clientes en **español e inglés**, incluyendo clientes en **Estados Unidos** (zonas horarias múltiples).
- Modalidades: presencial y virtual.
- Infraestructura: **Squarespace** + **Google Workspace** (Gmail, Calendar, Sheets, Drive, Forms, Meet).
- Dominio: `PlantPoweredbyDani.com`.
- **Squarespace fuera de alcance del MVP.**
- **Volumen de negocio:** 100-200 clientes por mes.

### Facturación del proyecto
- Una sola factura electrónica al final. Pago en colones, transferencia a cuenta BAC de AutomáTica.

### Dirección física de la consulta ✅ CONFIRMADO
```
Santa Ana Town Center
Work Space Republic – Segundo piso
Consultorio #33
```

### Formalización de AutomáTica (nuevo, 1 ago)
Danilo está gestionando el registro de la empresa como PYME y la firma digital, para poder facturar a nombre de la sociedad creada junto a Gabriela.

---

## 2. PROPUESTA COMERCIAL — LO QUE SE VENDIÓ

**Propuesta 1 — Calendario Base (₡655,000 IVA incluido) — APROBADA**

### Incluido
Portal self-service, disponibilidad en tiempo real, duración automática por tipo, selector de modalidad, zona horaria automática, verificación de conflictos, sin cuenta de Google, correo de confirmación bilingüe, link único de reagendar/cancelar, recordatorio 48hrs, notificación interna, tracker show/no-show, base de datos de clientes, flujos separados nutrición/pilates, soporte bilingüe, Meet automático.

### NO incluido
Encuesta de satisfacción, correo automático no-show, landing page, pagos en línea, app móvil, WhatsApp/SMS, login de cliente, dashboard analítico, clases privadas de pilates.

---

## 3. DECISIONES CONFIRMADAS

### Flujo del cliente
Primer contacto siempre humano (WhatsApp). Sin landing page. Confirmación automática.

### Política de cancelación y reagendamiento ✅ (US-06)
- Mínimo 24 horas de anticipación.
- Cancelación tardía → incrementa contador del cliente.
- 2 cancelaciones tardías consecutivas → `requiere_pago=true` en "Clientes".

### ⚠️ Asimetría intencional: cancelar vs. reagendar con menos de 24hrs
| Acción | Con <24hrs de anticipación |
|--------|------------------------------|
| **Cancelar** | Siempre se permite. Se marca como tardía. |
| **Reagendar** | Se BLOQUEA (`VENTANA_REAGENDAMIENTO_VENCIDA`). |

### Ventana de agendamiento
| | Nutrición | Pilates |
|---|---|---|
| **Ventana mínima** | 48 horas | 12 horas |
| **Ventana máxima** | 8 semanas | 8 semanas |

### Formulario del cliente
Nombre, Apellido, Correo, Teléfono, Tipo de identificación + Número, Fecha de nacimiento (mín. 15 años, selector propio desde US-40), Modalidad. Sin notas. Idioma solo en Paso 1.

### Edad mínima: 15 años ✅ Doble capa frontend+backend en `upsertClient()`.

### Flujo del formulario en 3 pasos ✅ Calendario → Correo → Datos.

---

### 3-a. Correos automatizados — modelo de zona horaria (regla permanente)

| Correo | Audiencia | Zona horaria mostrada |
|---|---|---|
| Confirmación (US-12) | Cliente | La DEL CLIENTE (`clientTimezone`) |
| Recordatorio 48hrs (US-14) | Cliente | La DEL CLIENTE |
| Reagendamiento/cancelación (US-32) | Cliente | La DEL CLIENTE |
| Notificación interna (US-13/30/32) | Dani/Ali/instructora | SIEMPRE Costa Rica (`TIME_ZONE`) |
| Alerta de cancelación tardía (US-33) | Dani/instructora/Ali | SIEMPRE Costa Rica |
| Alerta de reagendamientos múltiples (US-42) | Dani/instructora/Ali | SIEMPRE Costa Rica |

### 3-b. Modelo de notificación interna (US-13/US-30) — un solo template, 3 acciones
| tipoAccion | Título | Color del badge |
|---|---|---|
| agendada | Original de Gabriela | Verde/rosado original |
| reagendada | "Cita/Clase reagendada" | `#B9BD5B` (oliva) |
| cancelada | "Cita/Clase cancelada" | `#8B8B8B` (gris) |

### 3-c. Recordatorio de 48hrs (US-14) — solo nutrición
Trigger de tiempo cada hora, ventana 47-49hrs. 3 botones: Confirmar/Reagendar/Cancelar.

### 3-d. Dos formatos de link — RESUELTO con US-31
- Confirmación: `linkReagendar` sin `accion` → menú.
- Recordatorio: `?token=...&accion=confirmar|reagendar|cancelar` → pantalla directa.
- **Desde US-37:** `?action=ics&token=...` → endpoint que genera un `.ics` descargable con los datos ACTUALES de la cita.

### 3-e. Página visual de gestión de citas (US-31) — ✅ Done
4 pantallas: menú, confirmar asistencia, reagendar, cancelar. **Validado en real en testing Y en las dos rondas de preproducción (agendar, reagendar, cancelar, confirmar asistencia — los 4 flujos, tanto nutrición como pilates).**

### 3-f. Bug crítico: `getUrl()` sensible al contexto de ejecución — RESUELTO
Fix: constante `WEB_APP_URL` fija.

### 3-g. Correo al cliente al reagendar/cancelar (US-32)
Reagendar reutiliza `renderConfirmationEmail()`. Cancelar usa plantilla propia sin botones de calendario.

### 3-h. US-32 — Notificación interna de asistencia confirmada — ✅ Done, validada en real (testing + ambas rondas de preprod)

### 3-i. Brandbook del portal (US-28) — ✅ Done
Paleta `#2C3F27`/`#F9BFC6`/`#B9BD5B`/`#FFF9F1`/`#EFE7DA`. Tipografía Jost + Century Gothic. Logo real.

### 3-j. US-33 — Alerta de cancelación tardía (RF-2.5) — ✅ Done
Badge rojo `#C0392B`. Destinatarios: Nutrición → Dani+Ali; Pilates → instructora+Ali (Script Properties). Columna `cancelaciones_tardias` por cita (col 20 Nutrición, col 17 Pilates).

### 3-k. US-40 — Campo de fecha de nacimiento — ✅ Done (ver historial en versiones anteriores del documento)

### 3-l. US-42 — Notificación de reagendamientos múltiples — ✅ Done (ver historial en versiones anteriores del documento)

### 3-m. US-37 — Correo de confirmación con botones de calendario e invitación real — ✅ Done, ver nota #43

### 3-n. US-43 — Cupos de pilates dinámicos vía calendario de disponibilidad — ✅ Done, ver nota #45/#46

### 3-o. US-45 — Duración dinámica de clases de pilates + trigger de sync — ✅ Done. **Pendiente del StandUp del 1 ago: bajar la frecuencia del trigger de 5 min a 1 min** (ver punto 28 de la sección 0) — todavía no ejecutado.

### 3-p. US-44 — Disponibilidad real de NUTRICIÓN vía calendario de disponibilidad — ✅ Done, ver nota #47

### 3-q. US-46 (NUEVA) — Fix de destinatarios de notificaciones internas — ✅ Done, confirmado en real

**Motivación:** desde Sprint 3 existía una constante hardcodeada, `NOTIFICACION_INTERNA_DESTINATARIOS`, apuntando a `plantpoweredani.testing@gmail.com` dos veces (placeholder de Dani y de Ali). Usada por `sendNotificacionInterna()` (US-13/30: agendada/reagendada/cancelada) y `sendNotificacionInternaConfirmada()` (US-32). Mientras tanto, `getLateCancellationRecipients(esPilates)` ya existía y ya se usaba correctamente en cancelación tardía (US-33) y reagendamientos múltiples (US-42), leyendo `DANI_EMAIL`/`INSTRUCTORA_EMAIL`/`ALI_EMAIL` de Script Properties, distinguiendo destinatario según `esPilates`.

**Descubierto durante:** la primera ronda de ensayo de preproducción (1 ago) — se configuraron `DANI_EMAIL`/`INSTRUCTORA_EMAIL`/`ALI_EMAIL` correctamente para la cuenta nueva, pero la notificación de "nueva cita" seguía llegando a la cuenta de testing vieja. Investigado con "Mostrar original" del correo en Enviados, se confirmó el destinatario real.

**Fix aplicado:**
- Las 2 llamadas a `GmailApp.sendEmail()` en `sendNotificacionInterna()` y `sendNotificacionInternaConfirmada()` ahora usan `getLateCancellationRecipients(params.esPilates).join(",")` en vez de `NOTIFICACION_INTERNA_DESTINATARIOS.join(",")`.
- Constante `NOTIFICACION_INTERNA_DESTINATARIOS` eliminada por completo (ya no tiene ningún uso).
- Comentario viejo junto a `LATE_CANCELLATION_PROP_*` actualizado para reflejar que ahora sirve a las 4 notificaciones (US-13/30/32/33/42), no solo 2.

**Cambio de comportamiento real, ya confirmado y aceptado (no un edge case a evitar):** las notificaciones de PILATES (nueva/reagendada/cancelada/confirmada) ahora le llegan a la instructora (+Ali) en vez de a Dani — comportamiento correcto según el modelo de actores del sistema, pero distinto al de antes.

**Validado:**
- Harness: subió de 322 a 324 aserciones (2 nuevas en Test 17, confirmando explícitamente que pilates ya no notifica a Dani).
- Real: confirmado en la primera ronda de preproducción, revisando el header `To:` del correo con "Mostrar original".

### 3-r. US-47 (NUEVA) — `setupNewAccountSheets()`: setup de Sheets de una sola corrida para cuentas nuevas — ✅ Done, confirmado en real (dos veces)

**Motivación:** para levantar una cuenta nueva (ensayo o producción), el camino existente era correr `initializeSheets()` y luego cada migración incremental por separado (`addContadorReagendamientosColumnToNutricion()`, `addCancelacionTardiaColumnToPilates()`, `addDisponibilidadEventIdColumnToCuposPilates()`, `addDuracionMinutosColumnToCuposPilates()`, etc.) — una secuencia larga, calcada del historial de cómo fue creciendo el Sheet de testing con el tiempo, sin ninguna razón para repetirse en una cuenta que arranca de cero.

**Qué hace:**
- Crea un Spreadsheet nuevo (`SpreadsheetApp.create()`) y guarda su ID en `SPREADSHEET_ID`.
- Arma las 4 pestañas (`Nutrición`, `Pilates`, `Cupos_Pilates`, `Clientes`) con el esquema FINAL completo desde el inicio — reutilizando `SHEET_SCHEMAS`/`CLIENTES_SCHEMA` como base y anexando las columnas que hoy solo existen vía migración (`asistencia_confirmada`/`contador_reagendamientos` en Nutrición, `contador_reagendamientos` en Pilates), en vez de arrays literales nuevos — así no queda desincronizada si el esquema base cambia a futuro.
- **NO crea `Debug_US37`** — esa pestaña de diagnóstico ya cumplió su propósito (bug de US-37 resuelto) y no forma parte del esquema de ninguna cuenta nueva de aquí en adelante.
- Aplica `ensureCuposPilatesPlainTextFormat()` a `Cupos_Pilates`, igual que `initializeSheets()`.
- Si `SPREADSHEET_ID` ya tiene un valor, lanza un error explícito en vez de crear un Sheet duplicado.
- `initializeSheets()` y todas las migraciones individuales quedan intactas, sin tocar — por si algún día hace falta aplicarlas sobre un Sheet real que ya tenga datos.

**Verificación de columnas antes de escribir código (mismo hábito que evitó problemas en US-43/44):** conteo exacto contra las constantes `NUTRICION_*_COL`/`PILATES_*_COL`/`CUPOS_PILATES_*_COL`/`CLIENTES_*_COL` confirmó 24 columnas en Nutrición, 18 en Pilates, 8 en Cupos_Pilates, 12 en Clientes — cero desfase.

**Validado en real: dos veces**, una por cada ronda de ensayo de preproducción — ambas confirmaron el Spreadsheet creado con las 4 pestañas correctas, sin `Debug_US37`, y con el conteo de columnas correcto.

**Decisión relacionada:** la pestaña `Debug_US37` en el Sheet de **testing** (la vieja) fue borrada manualmente por el usuario el 1 de agosto — ya no existe ahí tampoco.

### 3-s. US-48 (NUEVA) — Opción B: remitente real de la instructora para correos de pilates al cliente — ✅ Done, confirmado en real

**Contexto de la decisión de negocio:** el equipo (Luis + resto) evaluó 3 opciones para que el sistema pueda gestionar el calendario/correos de pilates estando todo centralizado en la cuenta de Dani (dado el precedente de rotación de personal — ver punto 31 sección 0):
- **Opción A:** compartir el calendario de la instructora con la cuenta de Dani; correos salen "como" Dani con el nombre de la instructora.
- **Opción B (ELEGIDA):** alias "Enviar como" verificado en Gmail — los correos salen realmente desde la dirección de la instructora.
- **Opción C (descartada):** todo el proyecto bajo la cuenta de la instructora — más difícil de manejar si esa persona rota, descartada por el mismo motivo que llevó a estandarizar el correo de secretaría.

**Auditoría previa a escribir código, sin conflictos graves pero con un hallazgo no obvio importante:**
- Ninguna de las 8 llamadas a `GmailApp.sendEmail()` usaba el parámetro `from` antes de este cambio.
- **Hallazgo clave:** el manifest usa `"executeAs": "USER_DEPLOYING"` — el Web App SIEMPRE ejecuta bajo la identidad de quien hizo el último `clasp deploy` (la cuenta de Dani en producción), sin importar quién dispara la acción. Esto significa que el alias "Enviar como" de la instructora debe configurarse **en la cuenta que hace el deploy (Dani), no en la cuenta de la instructora misma** — fácil de asumir al revés. Ningún scope OAuth nuevo hace falta (`https://mail.google.com/` ya cubre `options.from`, agregado desde US-37).

**Cambios de código:**
- `getPilatesSenderEmail()` — getter nuevo, mismo patrón que `getPilatesAvailabilityCalendarId()`, lee la Script Property `PILATES_SENDER_EMAIL` (lanza si falta).
- 3 llamadas a `GmailApp.sendEmail()` AL CLIENTE actualizadas con un `fromOption` condicional (`{ from: getPilatesSenderEmail() }` si es pilates, `{}` si es nutrición):
  - `bookTimeslot` (confirmación) — condición `type === "pilates"`.
  - `rescheduleBooking` (reagendamiento) — condición `booking.sheetName === "Pilates"`.
  - `cancelBooking` (cancelación) — misma condición.
- Las notificaciones INTERNAS (US-46 arriba) no se tocaron — son un mecanismo distinto (destinatario interno, no remitente al cliente).

**⚠️ Riesgo operativo importante, ya conocido antes de deployar:** con este código en producción, si `PILATES_SENDER_EMAIL` no está configurada, los 3 correos al cliente de pilates dejan de enviarse **en silencio** (capturado por el mismo try/catch de resiliencia de siempre, que nunca revierte la reserva) — antes de este cambio, pilates no dependía de ninguna Script Property de remitente, así que este es un punto de falla nuevo. **Regla: nunca hacer `clasp push`/`deploy` de este código sin `PILATES_SENDER_EMAIL` ya configurada.**

**Validado en real en preproducción (segunda ronda), en este orden correcto:**
1. Alias verificado primero en Gmail de la cuenta que ejecuta el script (Configuración → Cuentas → "Enviar correo como" → agregar el correo real de quien simula a la instructora → confirmar el código de verificación que le llega a esa cuenta).
2. Script Property `PILATES_SENDER_EMAIL` configurada recién después de tener el alias verificado.
3. Deploy del código.
4. Clase de pilates agendada — correo de confirmación llegó con el remitente real del alias, confirmado con "Mostrar original" (línea `From:`).
5. Notificación interna de esa misma clase también confirmada correcta (llega a `INSTRUCTORA_EMAIL`, no a `DANI_EMAIL` — gracias al fix de US-46).

**Harness:** subió de 324 a 332 aserciones (8 nuevas: `from` presente y correcto en confirmación/reagendamiento/cancelación de pilates, y explícitamente AUSENTE en los mismos 3 casos para nutrición). El mock de `GmailApp.sendEmail()` en `gas-mock.js` usa un valor de `PILATES_SENDER_EMAIL` deliberadamente distinto al de `INSTRUCTORA_EMAIL` en las Script Properties por defecto del harness, para poder detectar si el código llegara a leer la property equivocada.

---

## 4. TIPOS DE CITA

### Nutrición (flujo Dani)
| Tipo | ?type= | Duración | Modalidad |
|------|--------|----------|-----------|
| Consulta inicial | `initial` | 60 min | Presencial o virtual |
| Cita de seguimiento | `followup` | 45 min | Presencial o virtual |
| Solo medición | `measurement` | 15 min | Solo presencial |

Horario no fijo desde US-44 — Dani/Ali marcan bloques abiertos en `Disponibilidad - Nutrición`, el portal talla sub-slots según el tipo de cita.

### Pilates (flujo instructora)
| Tipo | ?type= | Duración | Modalidad | Formato | Horario | Ventana mínima | Cupo |
|------|--------|----------|-----------|---------|---------|----------------|------|
| Clase de pilates | `pilates` | Dinámico (US-45) — próximamente lectura de sync cada 1 min, pendiente | Virtual únicamente | Grupal | Dinámico (US-43) | 12 horas | 5 (default) — ajustable en `Cupos_Pilates` |

**Pilates NO tiene recordatorio de 48hrs.** Correos al cliente salen con remitente real de la instructora (US-48, `PILATES_SENDER_EMAIL`). Notificaciones internas le llegan a la instructora+Ali, no a Dani (US-46).

Ver notas técnicas #45/#46/#47/#48/#49/#50 para el detalle completo.

---

## 5. MODELO DE DISTRIBUCIÓN DE LINKS

```
?type=initial       → Consulta inicial (nutrición)
?type=followup      → Cita de seguimiento (nutrición)
?type=measurement   → Solo medición (nutrición)
?type=pilates       → Clase grupal (pilates)

?token=<token>                              → Menú gestionar cita (reagendar/cancelar)
?token=<token>&accion=confirmar             → Confirmar asistencia
?token=<token>&accion=reagendar             → Reagendar directo
?token=<token>&accion=cancelar              → Cancelar directo
?action=ics&token=<token>                   → Descarga .ics con los datos ACTUALES de la cita (US-37)
```
Todos construidos con la constante fija `WEB_APP_URL` — nunca con `getUrl()`.

**US-36 — CERRADO (ver punto 23 de la sección 0):** el banner "Un usuario de Google Apps Script creó esta aplicación" se acepta como limitación de la versión gratuita, se comunica como condición del servicio al cliente. No se investiga más ni se pica más código para esto.

**Pendiente (Danilo):** explorar acortadores de URL gratuitos (TinyURL u otros) para mejorar la estética de los enlaces compartidos — con la precaución explícita de no usar los nombres de enlace definitivos durante fases de prueba.

---

## 6. ACTORES DEL SISTEMA

| Actor | Rol |
|-------|-----|
| **Dani** | Admin/nutricionista. Recibe notificación interna en cada acción de nutrición. Marca su disponibilidad en `Disponibilidad - Nutrición`. |
| **Secretaría** (correo genérico institucional) | Distribuye links por WhatsApp. Recibe las notificaciones internas de ambos flujos junto con Dani/instructora. Ya NO ligada al nombre de una persona específica (rotación de personal, ver punto 31 sección 0). |
| **Instructora de pilates** | Marca las clases en `Disponibilidad - Pilates`, ajusta `max_participantes` en `Cupos_Pilates`. Recibe notificaciones internas de pilates (US-46). Los correos AL CLIENTE de pilates salen con su remitente real vía alias verificado (US-48). |
| **Cliente (ES/EN)** | Agenda, reagenda, cancela, confirma asistencia. Mayor de 15 años. |
| **Google Apps Script** | Motor de automatización. Corre bajo `executeAs: USER_DEPLOYING` — SIEMPRE la identidad de quien hizo el último `clasp deploy` (será la cuenta de Dani en producción), sin importar quién dispara la acción. |

### Checklist de acceso necesario para producción
- Compartir Calendar real de la instructora con la cuenta de deploy (operativo + `Disponibilidad - Pilates`) — **si se usa Opción A**. Si se mantiene Opción B (ya validada), en cambio hace falta el alias "Enviar como" verificado en la cuenta de Dani.
- Compartir/crear el calendario `Disponibilidad - Nutrición` real de Dani con la cuenta de deploy.
- Reemplazar correos placeholder de testing por los reales de Dani/instructora/secretaría.
- Configurar `PILATES_SENDER_EMAIL` con el correo real de la instructora (si se mantiene Opción B) ANTES de deployar el código que lo requiere.
- Deploy final bajo cuenta de Dani.
- Coordinar con Dani/instructora que carguen su disponibilidad real ANTES de considerar el sistema listo.
- Bajar el trigger de sync de pilates a 1 minuto (pendiente, punto 28 sección 0).

---

## 7. FLUJOS COMPLETOS

### Flujo principal — Agendar cita de nutrición ✅ 100% COMPLETO, validado en real (testing + 2 rondas de preprod)
```
1. Dani/Ali marcan bloques de tiempo abiertos en "Disponibilidad - Nutrición".
2. Ali/Dani comparte link ?type=... por WhatsApp.
3. Cliente ve calendario: sub-slots tallados según tipo de cita, conflictos
   excluidos vía Freebusy contra CALENDARS. Elige fecha/hora.
4. Ingresa correo → busca en "Clientes".
5. Completa datos (valida edad, upsert).
6. Apps Script re-verifica ventana + LockService.
7. Escribe fila. Crea evento en Calendar (CALENDARS[0]) + Meet si es virtual.
8. Envía correo de confirmación (4 botones de calendario + .ics real adjunto).
9. Envía notificación interna a Dani/Ali (vía getLateCancellationRecipients,
   fix US-46).
10. [Solo nutrición] 47-49hrs antes: recordatorio con confirmar/reagendar/cancelar.
11. Cliente hace clic → página visual (US-31):
    - Confirmar → notificación interna (US-32)
    - Reagendar → notificación interna + correo al cliente
      → 3er reagendamiento o más: alerta especial (US-42)
    - Cancelar → notificación interna + correo de cancelación
      → <24hrs: alerta especial de cancelación tardía (US-33)
```

### Flujo pilates ✅ 100% COMPLETO, validado en real (testing + 2 rondas de preprod, incluyendo Opción B)
```
1. La instructora marca cada clase en "Disponibilidad - Pilates".
2. syncPilatesClassesToCuposSheet() (trigger cada 5 min, pendiente bajar a 1 min)
   crea la fila en Cupos_Pilates.
3. Instructora ajusta max_participantes si hace falta (default 5).
4. Se comparte el link ?type=pilates por WhatsApp.
5. Cliente ve solo clases con cupo, con su duración real.
6. Al agendar: correo de confirmación AL CLIENTE sale con el remitente real
   de la instructora (PILATES_SENDER_EMAIL, US-48). Notificación interna
   le llega a la instructora+Ali, no a Dani (US-46).
7. Resto del flujo (reagendar/cancelar, cancelación tardía, reagendamientos
   múltiples) igual que nutrición, salvo sin recordatorio de 48hrs y con
   validación de cupo en vivo.
```

### Flujo reagendamiento/cancelación ✅ 100% completo, validado en real en ambos flujos

---

## 8. SCHEMA DE GOOGLE SHEETS

### Spreadsheet de testing
- **ID:** 16M6WUqMAK9XkVoIutIn9UkJojlS5biT5o470GySs5gw
- **URL:** https://docs.google.com/spreadsheets/d/16M6WUqMAK9XkVoIutIn9UkJojlS5biT5o470GySs5gw/edit
- **`Debug_US37` fue borrada manualmente el 1 de agosto** — ya no existe en este Sheet.

### Pestaña "Nutrición" (24 columnas)
```
token | nombre | apellido | correo | telefono | tipo_id | numero_id | fecha_nacimiento |
tipo_cita | fecha | hora | zona_horaria_cliente | modalidad | idioma |
meet_link | estado | fecha_creacion | recordatorio_enviado | show_no_show |
cancelaciones_tardias (col 20) | requiere_pago (legacy) | event_id |
asistencia_confirmada | contador_reagendamientos (col 24)
```
**Estados posibles:** `Agendada` → `Reagendada` → `Cancelada`, también `Error_Calendar`.

### Pestaña "Pilates" (18 columnas)
```
token | nombre | apellido | correo | telefono | tipo_id | numero_id | fecha_nacimiento |
fecha_clase | hora_clase | zona_horaria_cliente | idioma |
estado | fecha_inscripcion | recordatorio_enviado | show_no_show |
cancelaciones_tardias (col 17) | contador_reagendamientos (col 18)
```

### Pestaña "Cupos_Pilates" (8 columnas)
```
fecha_clase | hora_clase | inscritos | max_participantes | event_id | meet_link |
disponibilidad_event_id (col G) | duracion_minutos (col H)
```

### Pestaña "Clientes" (12 columnas)
```
correo | nombre | apellido | telefono | tipo_id | numero_id | fecha_nacimiento | idioma |
cancelaciones_tardias | requiere_pago | cliente_nutricion | cliente_pilates
```

### `Debug_US37` — YA NO SE CREA en cuentas nuevas
Ya cumplió su propósito (diagnóstico del bug de US-37, resuelto). `setupNewAccountSheets()` (US-47) explícitamente NO la crea. Se borró manualmente del Sheet de testing el 1 de agosto. La función `logDebugUS37()` sigue existiendo en el código por si hiciera falta reactivar un diagnóstico similar en el futuro, pero no se usa activamente.

### Valores válidos de `tipo_id`
```
cedula | pasaporte | licencia | otro
```

---

## 9. REQUERIMIENTOS FUNCIONALES

### RF-2 — Correos y Automatizaciones — **TODO DONE**
| ID | Requerimiento | Estado |
|----|--------------|--------|
| RF-2.1 | Correo de confirmación inmediato | ✅ Done |
| RF-2.2 | Correos de nutrición desde Dani, pilates desde instructora | ✅ **Done — US-48 (Opción B, alias verificado)** |
| RF-2.3 | Notificación interna en cada acción, a los destinatarios correctos por Script Properties | ✅ **Done — US-46** |
| RF-2.4 | Recordatorio 48 hrs (solo nutrición) | ✅ Done |
| RF-2.5 | Notificación a Dani/Ali/instructora si cancelación tardía | ✅ Done — US-33 |
| RF-2.6 | Frontend de reagendar/cancelar/confirmar asistencia | ✅ Done — US-31, validado en ambos flujos |
| (nuevo) | Look & feel según brandbook | ✅ Done — US-28 |
| (nuevo) | Formato de fecha en español correcto | ✅ Done — US-34 |
| (nuevo) | Campo de fecha de nacimiento clic-en-cualquier-parte | ✅ Done — US-40 |
| (nuevo) | Notificación de reagendamientos múltiples (3ro+) | ✅ Done — US-42 |
| (nuevo) | Botones de calendario + invitación .ics real | ✅ Done — US-37 |
| (nuevo) | Cupos de pilates dinámicos | ✅ Done — US-43 |
| (nuevo) | Duración dinámica de pilates + trigger sync | ✅ Done — US-45 (pendiente bajar frecuencia a 1 min) |
| (nuevo) | Disponibilidad real de nutrición | ✅ Done — US-44 |
| (nuevo) | Fix destinatarios de notificaciones internas | ✅ **Done — US-46** |
| (nuevo) | Setup de Sheets de una corrida para cuentas nuevas | ✅ **Done — US-47** |
| (nuevo) | Remitente real de instructora para correos de pilates | ✅ **Done — US-48** |
| (resuelto) | Banner de Google Apps Script | ✅ **CERRADO — aceptado como limitación, US-36** |

---

## 10. STACK TÉCNICO

### Constantes clave
```typescript
const WEB_APP_URL = "..."; // línea 247 de backend/src/app.ts, distinta por cuenta/deployment
// NO usar ScriptApp.getService().getUrl() para construir links propios.

// NOTIFICACION_INTERNA_DESTINATARIOS fue ELIMINADA (US-46, 1 ago) — ya no existe en el código.
// Todas las notificaciones internas (US-13/30/32/33/42) usan ahora:
// getLateCancellationRecipients(esPilates): string[]
//   → nutrición: [DANI_EMAIL, ALI_EMAIL]
//   → pilates:   [INSTRUCTORA_EMAIL, ALI_EMAIL]

// Script Properties de destinatarios internos:
// DANI_EMAIL, INSTRUCTORA_EMAIL, ALI_EMAIL

// Script Property de remitente AL CLIENTE (US-48, NUEVA):
// PILATES_SENDER_EMAIL → correo real de la instructora, debe tener el alias
//   "Enviar como" YA VERIFICADO en Gmail de la cuenta que hace el clasp deploy
//   (no en la cuenta de la instructora misma — ver nota #50). Si falta esta
//   property, los 3 correos al cliente de pilates dejan de enviarse en
//   silencio — NUNCA deployar este código sin configurarla primero.

// Script Properties de calendario OPERATIVO:
// CALENDARS                        → (nutrición) JSON array, default ["primary"] si falta
//                                     (falla SILENCIOSA — ver nota #49, doble-chequear siempre)
// PILATES_CALENDAR_ID              → (pilates) calendario OPERATIVO

// Script Properties de calendario de DISPONIBILIDAD (de solo lectura):
// PILATES_AVAILABILITY_CALENDAR_ID
// NUTRICION_AVAILABILITY_CALENDAR_ID

// Script Property de base de datos:
// SPREADSHEET_ID → poblada automáticamente por setupNewAccountSheets() (US-47)
//                   en cuentas nuevas, o manualmente si se usa initializeSheets()
```

### Funciones principales (backend, `backend/src/app.ts`)
```typescript
// (todas las de Sprint 1-4 sin cambios — ver secciones anteriores del documento)

// US-46 (NUEVA, 1 ago) — fix de notificaciones internas
// sendNotificacionInterna() y sendNotificacionInternaConfirmada() ahora
// usan getLateCancellationRecipients(params.esPilates) en vez de la
// constante NOTIFICACION_INTERNA_DESTINATARIOS (eliminada).

// US-47 (NUEVA, 1 ago)
setupNewAccountSheets() // crea el Spreadsheet completo de una corrida para
                         // cuentas nuevas (4 pestañas, esquema final, sin
                         // Debug_US37). Lanza si SPREADSHEET_ID ya existe.
                         // Reutiliza SHEET_SCHEMAS/CLIENTES_SCHEMA como base.
                         // NO reemplaza initializeSheets() ni las migraciones
                         // individuales, que siguen existiendo intactas.

// US-48 (NUEVA, 1 ago)
getPilatesSenderEmail() // getter de PILATES_SENDER_EMAIL, lanza si falta,
                          // mismo patrón que getPilatesAvailabilityCalendarId()
// bookTimeslot/rescheduleBooking/cancelBooking: agregan {from: getPilatesSenderEmail()}
// condicionalmente cuando el flujo es pilates, en las llamadas a
// GmailApp.sendEmail() dirigidas AL CLIENTE.
```

### Frontend
Sin cambios en esta sesión — ver secciones anteriores del documento para el detalle completo (US-40, US-45).

### Templates de correo (backend/templates/)
Sin plantillas nuevas en esta sesión.

### Build pipeline
```
backend/package.json → "build": "tsc && node copy-to-dist.js"
backend/copy-to-dist.js → copia backend/dist/app.js y backend/templates/*.html a ../dist/
```
**IMPORTANTE, descubierto en la primera ronda de ensayo (ver nota #49): `copy-to-dist.js` NO copia `appsscript.json`.** Cuando se crea un proyecto de Apps Script nuevo con `clasp create`, este clona un `appsscript.json` vacío/genérico a `dist/` — hay que copiar manualmente el `appsscript.json` de la raíz del repo (el completo, con scopes y sección `webapp`) a `dist/appsscript.json` ANTES del primer `clasp push`, o el deployment no se comporta como Web App (ver nota #49 para el síntoma exacto).

### Test harness
`backend/test-harness/` — **332 aserciones, todas pasando** (subió de 322: +2 por el fix de destinatarios de notificaciones internas US-46, +8 por el remitente real de pilates US-48).

**Recordatorio operativo (ya documentado, reforzado esta sesión):** el harness corre contra `test-harness/out/app.js`, un build COMPILADO APARTE de `backend/dist/` — no se regenera solo al editar `src/app.ts`. Hay que recompilarlo a mano (`npx tsc --target ES2019 --module none --outDir test-harness/out src/app.ts --skipLibCheck`, el mismo comando del README del harness) antes de correr las pruebas después de cualquier cambio de código, o se sigue viendo el comportamiento viejo.

---

## 11. SPRINTS Y ESTADO ACTUAL

### Sprint 2 — Completo salvo US-20 (decisión de Trello pendiente)

### Sprint 4 — Completo (ver historial en versiones anteriores del documento para el detalle de cada US)

### Sprint 5 (NUEVO, 1 agosto) — estado real

| US | Título | Estado |
|----|--------|--------|
| **US-46** | Fix destinatarios de notificaciones internas (Script Properties, no hardcode) | ✅ **Done, validado en real** en 2 cuentas de preprod distintas |
| **US-47** | `setupNewAccountSheets()` — setup de Sheets de una corrida, sin Debug_US37 | ✅ **Done, validado en real** 2 veces (una por ronda de ensayo) |
| **US-48** | Remitente real de instructora para correos de pilates (Opción B, alias verificado) | ✅ **Done, validado en real** en preprod, incluyendo verificación completa del alias |
| **US-36** | Quitar banner de Google Apps Script | ⏸️➡️✅ **CERRADO** — decisión de equipo: se acepta como limitación, se comunica como condición de servicio |

### Preproducción — dos rondas de ensayo completo, ✅ ambas exitosas

**Ronda 1** (cuenta `pruebadeploy8@gmail.com`): con varios tropiezos de aprendizaje (API de Apps Script no habilitada, tipo `webapp` inválido en `clasp create`, manifest vacío tras crear el proyecto, error de tipeo en la URL, comilla sin cerrar en PowerShell). Todos diagnosticados y resueltos — ver nota #49 para el detalle completo de cada uno.

**Ronda 2** (cuenta `deployprueba4@gmail.com`): repitiendo el mismo proceso aplicando lo aprendido en la Ronda 1 (activar API antes de `clasp create`, copiar `appsscript.json` antes del primer push, tipo `standalone` correcto desde el inicio) — **sin ningún tropiezo nuevo**, funcionando de punta a punta a la primera. Confirma que el proceso de deploy real con Dani debería ser igual de directo. En esta misma ronda se validó también US-48 (Opción B).

**Checklist de pruebas funcionales, completado en las dos rondas combinadas:**
- [x] Nutrición: agendar, reagendar, cancelar, confirmar asistencia.
- [x] Pilates: agendar, reagendar, cancelar, confirmar asistencia.
- [x] Fix de notificaciones internas (US-46) confirmado con headers reales de correo.
- [x] Remitente real de pilates (US-48) confirmado con headers reales de correo.
- [x] Notificación interna llega al destinatario correcto según flujo (nutrición → Dani/Ali; pilates → instructora/Ali).

### Textos en BORRADOR pendientes de aprobación de Gabriela/Dani
Sin cambios — ver historial.

### Pendientes conocidos, sin bloquear nada
- Bajar el trigger de sync de disponibilidad de pilates de 5 min a 1 min (acordado en StandUp, no ejecutado).
- Investigar si se mantiene o elimina el correo de cancelación (decisión de negocio pendiente).
- Documentar para el usuario final el modelo de doble calendario.
- Manual de usuario detallado — pendiente de elaborar.
- Historia de usuario formal para "paso a preproducción" — formalizar en Trello (ya ejecutado 2 veces en la práctica).
- Danilo explorando acortadores de URL.
- Reemplazar destinatarios placeholder de testing por correos reales de Dani/instructora/secretaría antes de producción.
- **Decidir y configurar `PILATES_SENDER_EMAIL` real + verificar el alias en la cuenta real de Dani** antes del deploy de producción (si se mantiene Opción B).
- Checklist de acceso de producción (sección 6).
- Coordinar con Dani/instructora la carga de disponibilidad real antes de producción.
- Decidir en Trello el estado final de US-20.
- Verificar en producción real que el branding coincide con lo aprobado por Dani.
- Reconstruir historial de deploys v28-v42 (no bloquea).
- Auditar segunda carpeta de recuperación de OneDrive.
- Arreglar `build.sh` para cmd.exe/Windows (baja prioridad).
- Confirmar Yahoo con una cuenta real (US-37, testing quedó parcial).
- Decidir si limpiar `Cupos_Pilates` de datos de prueba antes de producción.
- `git push` de commits locales pendientes (confirmar estado actual).
- Auditar si "Ali" aparece como texto VISIBLE en algún template de correo (punto 31, sección 0) — no confirmado todavía.
- **Reunión de deploy real: martes** — enfocada exclusivamente en producción con la cuenta de Dani.

---

## 12. ENTORNO DE TESTING

| Dato | Valor |
|------|-------|
| Cuenta de testing | plantpoweredani.testing@gmail.com |
| URL de testing | https://script.google.com/macros/s/AKfycbwNUEjG8CXo2D5bk2eq1w6wBrme9XqJpCqOt-TkP0otTypiXd7GCEk7L7uFhdDOLCaJ/exec |
| Editor Apps Script | https://script.google.com/d/1cu-HdKiAmfUYOgjwtjKcE9lCO6waLfFsL71PwP4GgcdGiQWzqygPS3fK/edit |
| Repo | https://github.com/juanartavia/plant-powered-dani |
| Ubicación local del repo | `C:\dev\plant-powered-dani` — NO en OneDrive |
| Spreadsheet testing | https://docs.google.com/spreadsheets/d/16M6WUqMAK9XkVoIutIn9UkJojlS5biT5o470GySs5gw/edit (sin `Debug_US37`, borrada 1 ago) |
| Harness de pruebas | `backend/test-harness/` — **332 aserciones, todas pasando** |

### Links de testing
```
Consulta Inicial: .../exec?type=initial
Cita de Seguimiento: .../exec?type=followup
Solo Medición: .../exec?type=measurement
Clase de Pilates: .../exec?type=pilates
```

---

## 12-bis. ENTORNO DE PREPRODUCCIÓN (NUEVO — 1 agosto 2026)

> Confirmado formalmente en el StandUp del 1 de agosto como parte del proceso oficial de despliegue — ya no es una "prueba informal", es el paso de preproducción antes del deploy real con Dani.

### Objetivo
Simular el proceso de deploy completo en una cuenta nueva, antes de hacerlo en la cuenta real de Dani, para tener un checklist probado y no improvisar el día real.

### Ronda 1 — `pruebadeploy8@gmail.com`

| Dato | Valor |
|------|-------|
| Cuenta | pruebadeploy8@gmail.com |
| `deploymentId` | AKfycbzO6SthAS_-cbE1eZGENDj3g1EKXR9QP7-lb3Nliru8pKnLxwvDmwKDIYOPksOhDey8nw |
| URL | https://script.google.com/macros/s/AKfycbzO6SthAS_-cbE1eZGENDj3g1EKXR9QP7-lb3Nliru8pKnLxwvDmwKDIYOPksOhDey8nw/exec |
| Spreadsheet | https://docs.google.com/spreadsheets/d/1TMNBKxe0kxQ1XKRH7Z325C4IUKJmDZFhYRs4rCpv7Ns/edit *(nota: este ID corresponde en realidad a la Ronda 2 — confirmar el ID real de la Ronda 1 si se necesita volver a acceder al Sheet, puede haber quedado con otro ID; verificar en Drive de esta cuenta)* |
| Editor Apps Script | https://script.google.com/d/1E2ifta3XyJC7d6Xa1VVsNuTqwOILQssyRS43uhiawWW1KuSOnX3FFKpI/edit |
| Calendario Nutrición - Citas | 876b650623be938149ecabaddf14bee2416f4a3a6219561bc0f332a5897fb041@group.calendar.google.com |
| Calendario Disponibilidad - Nutrición | 724acd654d8c4548c025f6790489a954d2a3492172a26650cf5c9fd8f97bb571@group.calendar.google.com |
| Calendario Pilates - Citas | 6ab51db650e9e84059f8071bc5099c07937aaf1bbaa01e21243f1af549627964@group.calendar.google.com |
| Calendario Disponibilidad - Pilates | 66c1033c3c20951f0bcedbb80da69768fcbe9d14d83ea76b536518b7b2809685@group.calendar.google.com |
| Rol en Opción B | Simula a la instructora (destinatario de `INSTRUCTORA_EMAIL` en la Ronda 2) |

**Tropiezos encontrados y resueltos (ver nota #49 para el detalle completo):** API de Apps Script no habilitada, `clasp create --type webapp` inválido (correcto es `standalone`), `.clasp.json` viejo bloqueando la creación del proyecto, manifest vacío (falta copiar `appsscript.json` de la raíz a `dist/`), error de tipeo `I`/`l` en la URL, comilla sin cerrar en un comando de PowerShell.

### Ronda 2 — `deployprueba4@gmail.com`

| Dato | Valor |
|------|-------|
| Cuenta | deployprueba4@gmail.com |
| `deploymentId` | AKfycbxzU6YQzHeT0l7h5gFsVhXgDNr8cJK1HclFkOy3y_oS5CHfuqlc_bfXifmQEG9IAz7GJQ |
| URL | https://script.google.com/macros/s/AKfycbxzU6YQzHeT0l7h5gFsVhXgDNr8cJK1HclFkOy3y_oS5CHfuqlc_bfXifmQEG9IAz7GJQ/exec |
| Spreadsheet | https://docs.google.com/spreadsheets/d/1TMNBKxe0kxQ1XKRH7Z325C4IUKJmDZFhYRs4rCpv7Ns/edit |
| Editor Apps Script | https://script.google.com/d/1xQct7-WuuxreROqASeQjJGxXQLgiur8qhr__cBI4FIMUm48W0THW6xQZ/edit |
| Calendario Nutrición - Citas | 6775d1f64bf46fc152ae2c39ec86af0f1e3a99155ad4131a40ab2d2a735fcc41@group.calendar.google.com |
| Calendario Disponibilidad - Nutrición | 5e20364d88e0ecf3242e49d7ab85c04157e63c2dfdb32925f718bbf2f8d09feb@group.calendar.google.com |
| Calendario Pilates - Citas | 812a3b260529deb402ec095b0a90389f0e60392ec36852eda15ae4c2a3b8d813@group.calendar.google.com |
| Calendario Disponibilidad - Pilates | d01f15d9a51d8ebdf6bf8b9b6a4d89d36667cfbe7b29b165eb7152aa43315167@group.calendar.google.com |
| Rol en Opción B | Simula a Dani — cuenta que ejecuta el script y tiene el alias "Enviar como" de la instructora configurado |
| `PILATES_SENDER_EMAIL` en esta ronda | Correo personal del usuario (simula a la instructora, alias verificado en esta misma cuenta) |
| `DANI_EMAIL`/`ALI_EMAIL` en esta ronda | plantpoweredani.testing@gmail.com |
| `INSTRUCTORA_EMAIL` en esta ronda | pruebadeploy8@gmail.com (cuenta de la Ronda 1) |

**Sin tropiezos nuevos** — confirma que el proceso, aplicando lo aprendido en la Ronda 1, es directo y repetible.

### Notas de seguridad
Las contraseñas de las cuentas de preproducción NO se documentan en este archivo — están registradas por separado entre el equipo (compartidas puntualmente para que Luis pueda probar el flujo completo). Recordatorio: cambiarlas si estas cuentas dejan de usarse activamente para pruebas.

---

## 13. NOTAS TÉCNICAS CRÍTICAS

*(Notas 1-42 sin cambios — ver versiones anteriores del documento. Notas 43-47 tampoco cambiaron — ver más abajo.)*

**43-47.** Ver versión anterior del documento — cubren: imágenes+adjuntos en Gmail (#43), `showPicker()` en iframe (#44), conflicto de schema US-43 (#45), bug `getLastRow()`/`appendRow()` (#46), diferencia de modelo nutrición/pilates (#47).

**48. US-46 (1 ago) — la lección de "ya existía el patrón bueno, solo había que aplicarlo en los 2 lugares que faltaban".**

El propio código ya documentaba la deuda desde US-33: un comentario junto a `LATE_CANCELLATION_PROP_*` decía literalmente que valdría la pena migrar las notificaciones de US-13/30/32 a ese mismo mecanismo de Script Properties — quedó anotado y nunca ejecutado por 2 sprints, hasta que el ensayo de preproducción lo hizo evidente de forma práctica (notificación llegando a la cuenta equivocada). **Regla reforzada:** cuando el código ya deja un comentario de deuda técnica señalando "esto debería hacerse igual que aquello", tratarlo como una tarea real pendiente, no solo un comentario decorativo — especialmente si aparece en una auditoría previa a otro cambio.

**49. Dos rondas de ensayo de preproducción (1 ago) — inventario completo de tropiezos encontrados en la Ronda 1, todos resueltos y confirmados que no se repiten en la Ronda 2.**

1. **API de Apps Script no habilitada:** `clasp create` falla con *"User has not enabled the Apps Script API"* la primera vez que se usa Apps Script en una cuenta de Google nueva. Fix: activar el toggle en https://script.google.com/home/usersettings, esperar 1-2 min, reintentar. **Regla reforzada: activar esto ANTES de intentar `clasp create` en cualquier cuenta nueva, no esperar a que falle.**

2. **`clasp create --type webapp` es inválido:** el tipo correcto es `standalone` — "Web App" no es un tipo de contenedor de Apps Script, es una forma de desplegar un script `standalone`, configurada vía el manifest (`appsscript.json`), no vía el flag `--type`.

3. **`.clasp.json` preexistente bloquea `clasp create`:** si ya existe un `.clasp.json` en la carpeta (de una cuenta anterior), `clasp create` falla con *"Project file already exists"*. Fix: respaldar el archivo viejo con otro nombre (`copy .clasp.json .clasp.json.NOMBRE-backup`) y borrar el original (`del .clasp.json`) antes de crear el proyecto nuevo.

4. **Manifest vacío tras `clasp create` — causa raíz del error "Google Drive no pudo abrir el archivo":** `clasp create` clona un `dist/appsscript.json` genérico y vacío (sin scopes, sin sección `webapp`) al crear un proyecto nuevo. El pipeline de build (`copy-to-dist.js`) **no copia `appsscript.json`** — solo `app.js` y templates. Si se hace `clasp push`/`deploy` con ese manifest vacío, la URL `/exec` no se comporta como Web App — Google intenta abrirla como un archivo de Drive cualquiera y falla con un error de "No se pudo abrir el archivo", sin ninguna pista de que el problema es el manifest. **Fix:** copiar manualmente `appsscript.json` de la raíz del repo a `dist/appsscript.json` ANTES del primer `clasp push` en cualquier proyecto nuevo. **Diagnóstico si ya se dio el error:** revisar el diálogo "Administrar implementaciones" del editor — si NO aparece el campo "Quién tiene acceso" (normal en un Web App), es señal de que el manifest no tiene la sección `webapp`.

5. **Error de tipeo `I` mayúscula vs. `l` minúscula al escribir un `deploymentId` a mano:** estos IDs son largos y ambos caracteres se ven casi idénticos en muchas fuentes. **Regla reforzada: siempre copiar y pegar el `deploymentId` directo de la salida de la terminal, nunca reescribirlo a mano.**

6. **Comilla sin cerrar en un comando de PowerShell con `--description "..."` deja la terminal esperando más input** (se ve como `>>` repetido) — se resuelve con `Ctrl+C` y reintentando el comando completo con la comilla de cierre bien puesta.

**Ninguno de estos 6 tropiezos se repitió en la Ronda 2**, aplicando el orden correcto desde el inicio (activar API → `clasp create --type standalone` → copiar manifest → recién ahí `clasp push`).

**Hallazgo aparte, no un tropiezo sino un comportamiento esperado a explicar de antemano:** las cuentas de Gmail creadas el mismo día, sin historial de envío, reciben sus primeros correos con adjunto `.ics` en la carpeta de Spam — no es un bug, es el comportamiento normal de reputación de remitente nueva. No aplica a la cuenta real de Dani (dominio de Workspace con su propia reputación), y de todas formas no bloquea la entrega, solo la clasificación.

**50. US-48 (1 ago) — el alias "Enviar como" se configura en la cuenta que EJECUTA el script, no en la cuenta que se quiere simular; y el organizador del evento de Calendar sigue siendo distinto del remitente del correo, a propósito.**

Por `executeAs: USER_DEPLOYING` en el manifest, todo el Web App corre siempre bajo la identidad de quien hizo el último `clasp deploy`. Esto significa que si se quiere que un correo salga "desde" la instructora, el alias tiene que estar verificado en la bandeja de Gmail de la cuenta que despliega (la de Dani en producción) — no tiene ningún efecto configurarlo en la cuenta de la instructora misma. Fácil de asumir al revés la primera vez.

**Dato aparte confirmado durante la prueba real, no confundir con un bug:** el organizador del evento de Google Calendar (visible en el banner del correo) sigue mostrando la cuenta que ejecuta el script (la operativa, `PILATES_CALENDAR_ID`) — el `from` del correo y el `organizer` del evento de Calendar son dos mecanismos independientes. Cambiar uno no cambia el otro automáticamente; si en algún momento se quisiera que el organizador del evento también fuera la instructora, sería un cambio aparte (no evaluado ni pedido en esta ronda).

**Verificación del alias, proceso real:** Gmail → Configuración → "Ver todos los ajustes" → pestaña "Cuentas e importación" → "Enviar mensaje como" → "Agregar otra dirección de correo electrónico" → Gmail manda un código a la dirección agregada → confirmar el código desde la cuenta que despliega. Una vez verificado, aparece sin ningún link de "verificar" pendiente junto a la dirección, solo "convertir en predeterminada"/"eliminar".

---

## 14. MÉTODO DE TRABAJO

### Flujo por cada US
```
1. Este chat analiza la US (y el checklist real de Trello) y genera el prompt
2. Dev pega el prompt en Claude Code
3. Claude Code ejecuta los cambios
4. Dev pega la respuesta de Claude Code en este chat
5. Este chat analiza, detecta problemas, genera siguiente prompt si hace falta
6. clasp push → pasos manuales en el editor si aplica (migraciones, autorización
   de nuevos scopes OAuth, Script Properties nuevas) → clasp deploy
6.5. Inmediatamente después de un clasp deploy exitoso: git add . && git commit
7. Probar en el navegador real contra el deploy (URL PÚBLICA, nunca solo local/Playwright)
   NO se marca nada como completado solo porque el código se escribió o Playwright pasó en local
8. Solo si la prueba real en la URL pública confirma que funciona → marcar checkbox(es) en Trello
9. Cuando todos los checkboxes de la tarjeta estén marcados → mover la tarjeta a Done
10. Actualizar CLAUDE.md — confirmando primero que la base sobre la que se edita
    es la más reciente, Y confirmando después que el archivo quedó realmente
    guardado en disco (ver punto 18 de la sección 0)
```

### Reglas añadidas el 29 jul
- Cualquier scope OAuth nuevo en `appsscript.json` requiere autorización MANUAL una vez desde el editor.
- Ante un bug "se ve bien en nuestras variables pero el resultado real no aparece", diagnosticar contra el sistema externo real.
- Nunca combinar imágenes base64 con adjuntos reales en el mismo correo.
- `showPicker()` y APIs sensibles al origen del documento no se pueden usar dentro del portal.
- Probar siempre contra la URL pública real antes de dar por buena una funcionalidad nueva.

### Reglas añadidas el 30 jul (US-43/US-44/US-45)
- Nunca `getLastRow()` inmediatamente después de `appendRow()` sin flush en un loop.
- Revisar usos existentes de columnas ANTES de escribir código sobre una tabla ya activa.
- `clasp push` no mueve `/exec` — solo `clasp deploy` explícito.
- Revisar el ORDEN de operaciones cuando una fuente de verdad pasa de cacheada a en-vivo.
- Confirmar si el dominio es de clases discretas o tiempo continuo antes de asumir arquitectura compartida.
- Funciones parametrizadas solo se prueban de verdad contra el portal público con el parámetro en la URL.

### Reglas añadidas el 1 ago (Sprint 5 — fix de notificaciones, setup de cuentas nuevas, Opción B)
- **Cuando el código ya deja un comentario de deuda técnica tipo "esto debería usar el mismo patrón que aquello"**, tratarlo como tarea pendiente real, no decorativo (ver nota #48).
- **Antes de `clasp create` en una cuenta de Google nueva, activar primero la Apps Script API** en https://script.google.com/home/usersettings — no esperar a que falle.
- **`clasp create` usa `--type standalone`, nunca `--type webapp`** (no es un tipo válido).
- **Copiar manualmente `appsscript.json` de la raíz a `dist/appsscript.json` ANTES del primer `clasp push`** en cualquier proyecto de Apps Script nuevo — el build normal no lo copia, y un manifest vacío rompe el comportamiento de Web App de forma confusa (ver nota #49).
- **Copiar y pegar siempre los `deploymentId` de la terminal, nunca reescribirlos a mano** (riesgo de confundir `I`/`l`).
- **Un alias "Enviar como" de Gmail se configura en la cuenta que EJECUTA el script (`executeAs`), no en la cuenta que se quiere simular como remitente** (ver nota #50).
- **Antes de deployar código que dependa de una Script Property nueva y crítica** (ej. `PILATES_SENDER_EMAIL`), confirmar que ya está configurada — o el fallo será silencioso en producción, no un error visible.
- **Confirmar que un archivo (como CLAUDE.md) realmente se actualizó en disco**, no solo que un chat describió los cambios — pedir una verificación explícita (ver punto 18, sección 0).

**URL del editor de testing:** https://script.google.com/d/1cu-HdKiAmfUYOgjwtjKcE9lCO6waLfFsL71PwP4GgcdGiQWzqygPS3fK/edit

---

## 15. FLUJO DE TRABAJO — TRELLO

### Estados de las tarjetas
```
Backlog → In Progress → Done
```

### Reglas
- Al **iniciar** una US → moverla a **In Progress**.
- Al **completar todos los checkboxes, validados en real** → moverla a **Done**.
- **Ningún checkbox ni tarjeta se marca como completado/Done solo porque Claude Code terminó de escribir el código** — requiere prueba real confirmada primero.
- **Acción pendiente en Trello:** mover US-46, US-47, US-48 a Done (todas validadas en real en preproducción). Mover US-36 a Done/Archivada (decisión de equipo, cerrada). Formalizar como tarjeta la historia de usuario de "paso a preproducción" (ya ejecutada en la práctica).

---

## 16. FLUJO DE DEPLOY EN WINDOWS (PowerShell)

### Para un deployment EXISTENTE (código nuevo sobre una cuenta ya configurada)
```powershell
cd C:\dev\plant-powered-dani
cd backend
npm run build
cd ..
clasp push
clasp version "descripción del cambio"
clasp deploy --deploymentId <deploymentId de esa cuenta> -V <número de versión recién creada> --description "descripción"
git add .
git commit -m "descripción del cambio"
git push
```

### Para una cuenta NUEVA desde cero (basado en las dos rondas de preproducción — ver sección 12-bis para el detalle narrado)
```powershell
# 0. Crear la cuenta de Google y los 4 calendarios manualmente primero
#    (Nutrición - Citas, Disponibilidad - Nutrición, Pilates - Citas,
#    Disponibilidad - Pilates) — copiar los 4 IDs.

# 1. Activar la Apps Script API en la cuenta nueva ANTES de seguir:
#    https://script.google.com/home/usersettings

# 2. Respaldar el .clasp.json actual si existe
copy .clasp.json .clasp.json.CUENTA-VIEJA-backup
del .clasp.json

# 3. Login con la cuenta nueva
clasp login

# 4. Crear el proyecto — SIEMPRE standalone, nunca webapp
clasp create --type standalone --title "TITULO" --rootDir ./dist

# 5. CRÍTICO: copiar el manifest completo ANTES del primer push
copy appsscript.json dist\appsscript.json

# 6. Build y push
cd backend
npm run build
cd ..
clasp push

# 7. En el editor: Configuración del proyecto → Propiedades del script,
#    agregar los 7 (o más) valores: CALENDARS (¡con corchetes y comillas!),
#    NUTRICION_AVAILABILITY_CALENDAR_ID, PILATES_CALENDAR_ID,
#    PILATES_AVAILABILITY_CALENDAR_ID, DANI_EMAIL, INSTRUCTORA_EMAIL,
#    ALI_EMAIL (y PILATES_SENDER_EMAIL si se usa Opción B — ver paso 11)

# 8. Correr setupNewAccountSheets() manualmente desde el editor
#    (primera vez pide autorizar permisos — aceptar todo)

# 9. Crear el primer deployment
clasp deploy --description "descripción inicial"

# 10. Copiar el deploymentId de la salida, actualizar WEB_APP_URL en
#     backend/src/app.ts (línea 247) con la URL /exec correspondiente

# 11. Si se usa Opción B (alias real para pilates): verificar el alias en
#     Gmail de ESTA cuenta (Configuración → Cuentas → "Enviar correo como")
#     ANTES de configurar PILATES_SENDER_EMAIL y ANTES de deployar código
#     que dependa de esa property.

# 12. Rebuild + push + deploy con la URL corregida
cd backend
npm run build
cd ..
clasp push
clasp version "URL actualizada"
clasp deploy --deploymentId <deploymentId del paso 9> -V <número> --description "descripción"

# 13. Marcar bloques/clases de prueba en los calendarios de disponibilidad,
#     y probar contra la URL pública (copiar/pegar, nunca tipear)
```

### Notas importantes
- Trabajar SIEMPRE en `C:\dev\plant-powered-dani`, nunca en una carpeta de OneDrive.
- `&&` no funciona en PowerShell — correr comandos uno por uno.
- El `rootDir` en `.clasp.json` apunta a `dist/` — no cambiar.
- Siempre `clasp push` antes de `clasp deploy`.
- **`clasp deploy` sin `-V` explícito crea su propia versión nueva** — pasar siempre `-V <número>` explícito, confirmar con `clasp deployments`.
- **`clasp push` actualiza el HEAD del editor, pero NO mueve la URL pública `/exec`**.
- `build.sh` de la raíz no funciona en cmd.exe.
- Scope OAuth nuevo → actualizar tanto en la raíz como en `dist/appsscript.json`, autorizar manualmente una vez.
- Para funciones parametrizadas, usar el portal público con el parámetro en la URL.
- **`copy-to-dist.js` NO copia `appsscript.json`** — copiarlo a mano en cuentas nuevas (ver nota #49).
- **Copiar/pegar siempre los `deploymentId`, nunca reescribirlos a mano** (riesgo `I`/`l`).

---

## 17. REGISTRO DE CAMBIOS (resumen)

| Fecha | Cambio |
|-------|--------|
| *(ver versiones anteriores para historial completo hasta 30 jul)* | |
| 30 jul 2026 | US-43/US-44/US-45 Done, validados en real. Deploy: v81. Harness: 322/322. |
| 1 ago 2026 | **Sprint 5.** US-46 Done (fix `NOTIFICACION_INTERNA_DESTINATARIOS` → `getLateCancellationRecipients`, eliminada la constante hardcodeada). US-47 Done (`setupNewAccountSheets()`, sin `Debug_US37`; borrada también del Sheet de testing). US-48 Done (Opción B: remitente real de instructora vía alias "Enviar como" + `PILATES_SENDER_EMAIL`). **Dos rondas completas de ensayo de deploy en preproducción** ejecutadas (`pruebadeploy8@gmail.com` y `deployprueba4@gmail.com`) — la primera con 6 tropiezos de aprendizaje (todos documentados en nota #49), la segunda sin ningún tropiezo nuevo. Validado en preproducción: agendar/reagendar/cancelar/confirmar asistencia en ambos flujos, fix de notificaciones, y Opción B. StandUp de equipo: **US-36 cerrado** (banner aceptado como limitación), bug de fecha en banner de Calendar **investigado y cerrado** (causa: token fijo de función de testing, no reproducible en producción real — botón se mantiene). Harness: 332/332. Pendientes nuevos del StandUp: bajar trigger de pilates a 1 min, decidir sobre correo de cancelación, manual de usuario, historia de usuario de preprod formal, acortadores de URL. Reunión de deploy real: martes. |

---

*Última actualización: 1 agosto 2026 — **Sprint 5 completo: US-46, US-47 y US-48 Done, todas validadas en real en dos rondas de preproducción independientes** (332/332 en harness). US-36 cerrado por decisión de equipo. Pendientes reales para continuar: bajar trigger de pilates a 1 min, decidir sobre el correo de cancelación, configurar `PILATES_SENDER_EMAIL` real + verificar alias en la cuenta real de Dani antes del deploy de producción, reemplazar correos placeholder por los reales, manual de usuario, documentación del modelo de doble calendario para Dani/instructora, y la reunión de deploy real programada para el martes.*