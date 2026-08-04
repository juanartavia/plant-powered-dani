# CLAUDE.md — Plant Powered by Dani
## Sistema de Agendamiento Automatizado
> Documento vivo — actualizar conforme avanza el desarrollo
> Última actualización: 3 agosto 2026 — **Sprint 5 completo.** Se cerró el fix de `NOTIFICACION_INTERNA_DESTINATARIOS` (US-46), se agregó `setupNewAccountSheets()` (US-47), se implementó y validó la Opción B de remitente de pilates (US-48), se corrigió un bug de duplicación de eventos en el calendario del cliente reportado por Luis/Danilo (US-49), y se investigó y cerró una falla de correos que resultó ser cuota de Gmail agotada, no un bug (3 ago). Se ejecutaron **dos rondas completas de ensayo de deploy en preproducción**, la segunda sin ningún tropiezo nuevo. Decisión del equipo: el banner de Google Apps Script (US-36) se acepta como limitación — cerrado.

---

## 0. LÉEME PRIMERO — PARA EL PRÓXIMO CHAT

Si estás retomando este proyecto en un chat nuevo, este documento es tu única fuente de verdad — está armado para ser autosuficiente, sin depender de ninguna versión anterior.

1. Lee completo este documento, especialmente las secciones 11 (sprints), 12-bis (preproducción), 13 (notas técnicas — TODAS son relevantes, especialmente #43, #46, #51, #52), y 14/15 (método de trabajo/Trello).
2. **Todo el flujo de correos, gestión de citas, branding, botones de calendario, cupos/duración de pilates, disponibilidad real de nutrición, notificaciones internas, remitente real de pilates, y ausencia de eventos duplicados está Done y probado de punta a punta:**
   - **US-11 a US-14** — Familia completa de correos automatizados (confirmación, recordatorio 48h, notificaciones).
   - **US-13/US-30, US-32, US-33** — Notificaciones internas (nueva cita, asistencia confirmada, cancelación tardía).
   - **US-31, US-28, US-41** — Página de gestión de citas + brandbook + fix de título redundante.
   - **US-34** — Formato de fecha en español corregido (día-mes-año).
   - **US-40** — Campo de fecha de nacimiento: selector propio (3 rondas de desarrollo, ver sección 3-k).
   - **US-42** — Notificación de reagendamientos múltiples (3er en adelante).
   - **US-37** — Correo de confirmación con 4 botones de calendario. **Ya NO lleva `.ics` adjunto** (quitado en US-49) — los 4 botones siguen intactos, incluido Apple/iCal (descarga manual vía `?action=ics`).
   - **US-43** — Cupos de pilates dinámicos vía calendario de disponibilidad dedicado.
   - **US-45** — Duración dinámica de clases de pilates + trigger de sincronización cada 5 minutos.
   - **US-44** — Disponibilidad real de NUTRICIÓN vía calendario de disponibilidad dedicado.
   - **US-46** — Fix de `NOTIFICACION_INTERNA_DESTINATARIOS`: notificaciones internas usan Script Properties, no hardcode.
   - **US-47** — `setupNewAccountSheets()`: esquema completo de Sheets de una sola corrida para cuentas nuevas.
   - **US-48** — Opción B: correos al cliente de pilates salen con remitente real de la instructora.
   - **US-49** — Fix de duplicación de eventos: se quitó el `attendee` del evento operativo y el `.ics` adjunto — confirmado en real en 3 cuentas de preproducción.
3. **Bug crítico histórico, ya corregido:** los links de los correos usaban `ScriptApp.getService().getUrl()`, que devuelve `/dev` (deployment HEAD, roto) en vez de `/exec`. Corregido con `WEB_APP_URL` fija (línea 247 de `backend/src/app.ts`).
4. **Lección de arquitectura (US-28):** el portal se compila a un ÚNICO archivo HTML inlineado (`vite-plugin-singlefile`) — `frontend/public/` NO sirve para nada en producción.
5. **Gap de build (27 jul), corregido:** `backend/package.json` → `"build": "tsc && node copy-to-dist.js"`.
6. **Incidente grave de corrupción de OneDrive (27-28 jul), completamente recuperado.** El proyecto vive en `C:\dev\plant-powered-dani` — **NUNCA** en una carpeta de OneDrive. Existe una segunda carpeta de recuperación (con `.git` propio, `design-reference/`) nunca terminada de auditar.
7. **Apps Script Web Apps corren dentro de un iframe cross-origin real, con implicaciones serias:**
   - `HTMLInputElement.showPicker()` lanza `SecurityError` si se llama desde ese iframe — **nunca usar esta API** para nada que dependa de abrirse dentro del portal (descubierto en US-40).
   - `Logger.log()`/`console.log()` **no aparecen de forma confiable** en el panel de "Ejecuciones" para ejecuciones reales disparadas por el Web App.
   - **Cualquier prueba de una funcionalidad nueva debe hacerse contra la URL pública real (`/exec`), nunca solo contra `localhost`**.
   - **Corolario US-44:** para funciones parametrizadas, la única prueba real es a través del portal público con el parámetro en la URL, o envolverla en una función wrapper sin parámetros (ver nota #52).
8. **Regla crítica de correos con imágenes + adjuntos, ver nota #43:** nunca embeber imágenes base64 en un correo que también lleve un adjunto real vía `GmailApp.sendEmail()` — usar `inlineImages`. **Nota: desde US-49 el correo de confirmación ya no lleva ningún adjunto real, así que este riesgo específico ya no aplica ahí.**
9. **Regla crítica de Sheets, ver nota #46:** nunca `getLastRow()` inmediatamente después de `appendRow()` sin flush en un loop.
10. **`clasp push` vs `clasp deploy`:** `push` solo actualiza el HEAD del editor. La URL pública `/exec` solo se mueve con `clasp deploy` explícito.
11. **Nutrición y pilates leen calendarios de disponibilidad dedicados, con modelos distintos** (nota #47): pilates = clases discretas; nutrición = tiempo continuo tallado en sub-slots.
12. **US-20** cubierta al 100% por US-06/US-31 — pendiente cerrarla en Trello.
13. **Pendientes de fondo, seguros de dejar así:** coerción de fechas cosmética, `findClientByEmail()` con TIME_ZONE, acceso móvil sin validación formal.
14. **Destinatarios de notificaciones de TESTING siguen en placeholder** — reemplazar por reales en producción.
15. **Textos de copy en BORRADOR**, pendientes de aprobación de Gabriela/Dani.
16. Flujo de trabajo: prompt → Claude Code ejecuta → commit tras deploy → probar en real → actualizar CLAUDE.md.
17. Pedir siempre el checklist real de Trello antes de un prompt nuevo.
18. **Confirmar que este documento es la versión más reciente antes de editarlo** — y confirmar después que quedó guardado. **Este documento se mantiene deliberadamente SIN referencias a "ver versión anterior"** — cada sección tiene el detalle completo, autosuficiente para cualquier chat nuevo.
19. **`WEB_APP_URL` fija siempre**, línea 247 de `backend/src/app.ts`.
20. **Construido SIN diseño de Gabriela:** botones de calendario (US-37, sin invitación nativa desde US-49), notificación interna, correos de reagendar/cancelar, página de gestión de citas, plantillas de alertas, selector de fecha de nacimiento.
21. Pendiente de fondo: segunda carpeta de recuperación de OneDrive sin auditar.
22. `build.sh` no ejecuta en cmd.exe — pendiente, no bloquea.
23. **US-36 (banner GAS) — CERRADO.** Aceptado como limitación de la versión gratuita, comunicado como condición del servicio.
24. **Coordinación pendiente:** Dani/instructora deben cargar disponibilidad real antes de apagar el modelo viejo.
25. Sin tarjetas grandes de arquitectura pendientes.
26. **Terminología: "preproducción" (preprod)**, confirmado en StandUp del 1 ago.
27. **Bug de fecha en banner de Calendar — CERRADO**, causado por token fijo de función de testing, no reproducible en producción real. Riesgo aceptado en su momento (nota: esto fue ANTES de la decisión posterior de US-49 de quitar el `.ics` adjunto por completo por otras razones).
28. **Pendientes del StandUp, no iniciados:** bajar trigger de pilates a 1 min, decidir sobre correo de cancelación, historia de usuario de preprod formal en Trello, documentar modelo de doble calendario, manual de usuario, acortadores de URL (Danilo).
29. **Reunión de deploy real: martes**, enfocada en producción con la cuenta de Dani.
30. **Facturación:** una sola factura al final, colones, transferencia BAC.
31. **Secretaría "Ali" despedida** — correo genérico institucional, `ALI_EMAIL` sigue siendo el nombre de la property, sin cambio de código.
32. **Matriz de test cases formal:** Luis/Danilo armaron 54 test cases (Excel: Resumen/Matriz Test Cases/Bugs), bloques A (12, flujo completo), B (4, edad+cancelación tardía), C (12, ciclo de vida), D (26, funcionalidades Sprint 3). Al cierre de esta sesión: varios Pass, 6 en Fail (mismo bug, ver punto 33), resto Pendiente.
33. **US-49: Bug de duplicación de eventos en el calendario del cliente, ENCONTRADO Y CORREGIDO (1 ago noche).** Reportado por Danilo (BUG-001 a BUG-006, severidad Alta): una reserva podía generarle al cliente hasta 3 eventos. Causa raíz real: el código agregaba al cliente como `attendee` del evento OPERATIVO — eso solo alcanza para que le aparezca en su calendario sin clic — sumado al botón "Agregar a Google Calendar" y al `.ics` adjunto (banner nativo). Ver nota #51 para el detalle completo. **Decisión de negocio explícita del usuario: además de quitar el `attendee`, también se quitó el `.ics` adjunto por completo** ("solo dolores de cabeza, ya tenemos los botones, más que suficiente"). Quedan los 4 botones como única vía. **Validado en real en 3 cuentas de preproducción.**
34. **Falla intermitente de correos reportada por Luis (3 ago), INVESTIGADA Y CERRADA — NO es un bug de código.** Tras el deploy de US-49, Luis reportó (capturas de WhatsApp) varios síntomas en `deployprueba4@gmail.com`: cita creada en Calendar+Sheet pero sin correo a nadie; 3 citas agendadas, solo llegó 1 correo; correo al cliente sí pero notificación interna no (o viceversa); cancelar marcaba bien "Cancelada" en el Sheet pero a veces no enviaba correo ni borraba el evento de Calendar. **Auditoría estática de Claude Code** descartó cualquier referencia colgante o problema de control de flujo. **Diagnóstico confirmado reproduciendo el bug en caliente**, corriendo `bookTimeslot()` manualmente desde el editor: el log mostró el mensaje exacto `Service invoked too many times for one day: email.` — **cuota diaria de envío de Gmail agotada**, no un bug. Reproducido dos veces seguidas. **Causa de fondo:** `deployprueba4@gmail.com` es Gmail de consumidor (no Workspace), límite bajo (~100/día) — agotado entre todas las pruebas del equipo en un solo día. **No afecta a producción real:** la cuenta de Dani será Workspace (~1500/día). **Ningún cambio de código aplicado.** Ver nota #52 para el detalle completo del diagnóstico.
35. **Gabi pidió 3 capturas para completar el manual de usuario (3 ago):** (1) cómo se habilita/verifica el alias "Enviar correo como" en Gmail (Opción B, US-48), (2) cómo se revisan las citas en el calendario de test, (3) cómo se ven ambos calendarios seleccionados en el panel izquierdo de Calendar — **pendiente confirmar con Gabi si el punto 3 se refiere a los calendarios de Citas (`Nutrición - Citas`+`Pilates - Citas`) o de Disponibilidad**. Instrucciones ya enviadas a Gabi por el usuario.

---

## 1. CONTEXTO DEL PROYECTO

### El cliente
**Plant Powered by Dani** — estudio de nutrición y pilates en Costa Rica.
- **Dani**: nutricionista, admin principal del sistema.
- **Instructora de pilates**: cuenta separada bajo el mismo dominio. Pilates no tiene recordatorio de 48hrs.
- **Secretaría**: distribuye los links de agendamiento por WhatsApp. Recibe las notificaciones internas junto con Dani. **Correo genérico institucional** — el rol se mantiene bajo la Script Property `ALI_EMAIL`. (Nombre histórico "Ali" — persona real despedida, ver punto 31.)

### El negocio
- Atiende clientes en **español e inglés**, incluyendo clientes en **Estados Unidos** (zonas horarias múltiples).
- Modalidades: presencial y virtual.
- Infraestructura: **Squarespace** + **Google Workspace** (Gmail, Calendar, Sheets, Drive, Forms, Meet).
- Dominio: `PlantPoweredbyDani.com`.
- **Squarespace fuera de alcance del MVP** — la cuenta de Dani no soporta bien iframes/código embebido en su plan actual (relevante para US-36).
- **Volumen de negocio:** 100-200 clientes por mes (relevante también para la nota #52 sobre cuotas de correo, aunque en producción con Workspace esto no debería ser un problema).

### Facturación del proyecto
Una sola factura electrónica al final. Pago en colones, transferencia a cuenta BAC de AutomáTica.

### Dirección física de la consulta ✅ CONFIRMADO
```
Santa Ana Town Center
Work Space Republic – Segundo piso
Consultorio #33
```

### Formalización de AutomáTica
Danilo está gestionando el registro de la empresa como PYME y la firma digital.

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

**Formato de fecha en español (US-34):** corregido el orden a día-mes-año en las 4 pantallas afectadas. Inglés no se tocó, ya estaba bien.

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
- `?action=ics&token=...` → endpoint que genera un `.ics` **descargable manualmente** con los datos ACTUALES de la cita — botón Apple/iCal. **Este endpoint sigue exactamente igual tras US-49**, es distinto del adjunto automático que sí se eliminó.

### 3-e. Página visual de gestión de citas (US-31) — ✅ Done
4 pantallas: menú, confirmar asistencia, reagendar, cancelar. Título redundante quitado (US-41). **Validado en real en testing y en las tres rondas de preproducción.**

**⚠️ Nota de arquitectura crítica (US-40):** el portal corre dentro de un **iframe cross-origin real**. Esto bloquea `showPicker()` con `SecurityError`.

### 3-f. Bug crítico: `getUrl()` sensible al contexto de ejecución — RESUELTO
Fix: constante `WEB_APP_URL` fija.

### 3-g. Correo al cliente al reagendar/cancelar (US-32)
Reagendar reutiliza `renderConfirmationEmail()`. Cancelar usa plantilla propia sin botones de calendario. **Cancelar nunca tuvo adjunto .ics tampoco** (confirmado en la auditoría de US-49).

### 3-h. US-32 — Notificación interna de asistencia confirmada — ✅ Done, validada en real (testing + 3 rondas de preprod)

### 3-i. Brandbook del portal (US-28) — ✅ Done
Paleta `#2C3F27`/`#F9BFC6`/`#B9BD5B`/`#FFF9F1`/`#EFE7DA`. Tipografía Jost + Century Gothic. Logo real.

### 3-j. US-33 — Alerta de cancelación tardía (RF-2.5) — ✅ Done
Badge rojo `#C0392B`. Destinatarios: Nutrición → Dani+Ali; Pilates → instructora+Ali. Columna `cancelaciones_tardias` (col 20 Nutrición, col 17 Pilates).

**Nota técnica:** el emoji ⚠️ salía corrupto en Gmail real hasta usar la entidad HTML numérica `&#9888;` — mismo patrón aplicado después a 📅 en US-37.

### 3-k. US-40 — Campo de fecha de nacimiento (3 rondas) — ✅ Done

**Problema original:** el `<input type="date">` nativo solo se abría al hacer clic exactamente en el ícono de calendario.

**Ronda 1 (fallida en producción):** `focus()` + `showPicker()`. Funcionaba en localhost, pero fallaba silenciosamente en producción real (`showPicker()` lanza `SecurityError` en el iframe cross-origin).

**Ronda 2 (solución definitiva):** trigger `<button>` + `Popover` + `Calendar`, con `captionLayout="dropdown"`. Preserva edad mínima 15, validación bilingüe, contrato de datos (input hidden, `yyyy-MM-dd`).

**Ronda 3:** el `<select>` nativo de mes/año no tenía estilo propio. Fix: `CalendarDropdown` propio.

**Validado en real:** clic en cualquier parte abre el selector; estilo correcto en tema oscuro; límite de edad verificado.

### 3-l. US-42 — Notificación de reagendamientos múltiples — ✅ Done
Columna `contador_reagendamientos` (col 24 Nutrición, col 18 Pilates). Se incrementa en cada reagendamiento exitoso. A partir del 3er reagendamiento y en cada posterior, alerta a Dani/instructora+Ali. Badge ámbar `#C9791A`. Bloqueo por ventana vencida NO incrementa. **Validado en real.**

### 3-m. US-37 — Correo de confirmación con botones de calendario — ✅ Done, MODIFICADA por US-49

**Alcance original:** 4 botones (Google/Outlook/Yahoo/Apple-iCal) + invitación `.ics` real **adjunta directamente al correo**, disparando el prompt nativo de "Sí/No/Tal vez".

**Funciones/mecanismos originales:**
- `buildAddCalLinks()` — arma los 3 deep-links (fechas en UTC) + link al endpoint propio de `.ics`.
- `buildBookingIcsContent()`/`buildIcsContent()` — generan el `.ics` real (RFC 5545). **Siguen existiendo**, usadas por el endpoint de descarga manual `?action=ics`.
- `doGet(?action=ics&token=...)` — evaluado ANTES del branch genérico de `?token=`.
- `buildInlineImagesForTemplate()` — mapa `{cid: Blob}` de las imágenes (nota #43).

**⚠️ MODIFICADO por US-49:** el correo **ya NO lleva la invitación `.ics` adjunta** — eliminado por completo. Quedan los 4 botones intactos, incluido Apple/iCal (sin cambios, apunta al endpoint de descarga manual).

**Decisión histórica de US-37 (YA NO APLICA tras US-49):** el `.ics` original incluía `ORGANIZER` — si el cliente respondía, podía llegarle un correo de RSVP. Ya no relevante.

**Trade-off de testing histórico:** Yahoo solo se verificó parcialmente. Sigue pendiente.

### 3-n. US-43 — Cupos de pilates dinámicos vía calendario de disponibilidad — ✅ Done, confirmado en real

**Motivación:** Dani quería ofrecer clases especiales, imposible con horario fijo hardcodeado. Se escogió: la instructora marca clases en un calendario dedicado.

**Modelo:** `Disponibilidad - Pilates` es **aditivo** — nada disponible hasta que se marca explícitamente. Separado del operativo (`PILATES_CALENDAR_ID`).

**Flujo de sincronización:**
1. Instructora marca cada clase en `Disponibilidad - Pilates`.
2. Trigger (cada 5 min, pendiente bajar a 1 min) corre `syncPilatesClassesToCuposSheet()`, crea fila en `Cupos_Pilates` sin duplicar (dedup por `disponibilidad_event_id`).
3. `max_participantes` vacío por defecto (interpretado como 5).
4. Cupo real calculado **en vivo**: `max_participantes` menos inscripciones activas contadas en "Pilates" — `inscritos` en `Cupos_Pilates` es solo cache.
5. Al llegar a 0 cupo, la clase deja de ofrecerse. Cancelar libera de inmediato.
6. Reagendar a clase llena bloquea con `CLASE_LLENA`.

**Conflicto de schema resuelto ANTES de escribir código (nota #45):** `event_id`/`meet_link` ya en uso para el evento OPERATIVO — se agregó `disponibilidad_event_id` (columna G) separada.

**Bug real encontrado (nota #46):** `getLastRow()` justo después de `appendRow()` en un loop sin flush causaba escrituras sobre filas viejas.

**Validado en real:** portal muestra exactamente las clases marcadas, respeta cupo, libera/bloquea correctamente.

### 3-o. US-45 — Duración dinámica de clases de pilates + trigger de sync — ✅ Done. **Pendiente: bajar frecuencia de 5 min a 1 min.**

**Motivación:** el sistema seguía asumiendo 60 min fijos para pilates.

**Cambios:**
- Columna `duracion_minutos` (columna H) en `Cupos_Pilates`.
- Toda la cadena de pilates usa la duración real. **Desde US-49, la verificación se hace vía `?action=ics` en vez del adjunto del correo (eliminado)** — mismo comportamiento real, solo cambió el mecanismo de verificación en el harness.
- UX: sin número de minutos hasta elegir un slot concreto.
- Fix del trigger: `installPilatesAvailabilitySyncTrigger()` ahora siempre borra triggers previos. Frecuencia bajada de cada hora a cada 5 min (pendiente bajar a 1).

**Gotcha (nota #46):** después de pushear, el portal seguía mostrando "60 min" — faltaba `clasp deploy` explícito.

**Validado en real:** clase de 45 min mostró correctamente "(45 min)"; clase regular de 60 min sin regresión; trigger sin duplicados.

### 3-p. US-44 — Disponibilidad real de NUTRICIÓN vía calendario de disponibilidad — ✅ Done, ver nota #47

**Motivación:** nutrición seguía usando `WORKDAYS`/`WORKHOURS` fijas.

**Diferencia de modelo respecto a pilates (nota #47):** nutrición es **continua** — cada evento en `Disponibilidad - Nutrición` es un bloque abierto que se "talla" en sub-slots según el tipo de cita, sin huecos. Los 3 tipos comparten el mismo calendario.

**Investigación previa sin conflictos:** nutrición no tenía Script Property de calendario operativo dedicada (usa `CALENDARS` genérica) ni capa intermedia tipo `Cupos_Pilates`.

**Cambios:**
- `getNutricionAvailabilityCalendarId()`, `getNutricionAvailabilityBlocks()` (lee `Calendar.Events.list`, expande recurrencias, ventana 8 semanas).
- `fetchAvailability()` (rama nutrición) — talla sub-slots según duración del tipo.
- Freebusy contra `CALENDARS` sin cambios.
- `WORKDAYS`/`WORKHOURS` quedan en el código sin uso activo, plan de rollback.

**Validado en real, dos bloques con hueco (8am-12pm y 1pm-5pm):** Consulta Inicial (60min): 8,9,10,11am y 1,2,3,4pm, respetando el hueco. Seguimiento (45min) y Solo medición (15min): mismos bloques, más sub-slots.

### 3-q. US-46 — Fix de destinatarios de notificaciones internas — ✅ Done, confirmado en real

**Motivación:** desde Sprint 3 existía `NOTIFICACION_INTERNA_DESTINATARIOS` hardcodeada a la cuenta de testing, usada por `sendNotificacionInterna()`/`sendNotificacionInternaConfirmada()`. `getLateCancellationRecipients(esPilates)` ya existía y se usaba bien en US-33/US-42.

**Descubierto durante:** la primera ronda de preprod — notificación de "nueva cita" seguía llegando a testing.

**Fix:** las 2 llamadas ahora usan `getLateCancellationRecipients(params.esPilates).join(",")`. Constante eliminada.

**Cambio de comportamiento confirmado y aceptado:** notificaciones de PILATES ahora le llegan a la instructora (+Ali), no a Dani.

**Validado:** Harness 322→324. Real: header `To:` confirmado con "Mostrar original".

### 3-r. US-47 — `setupNewAccountSheets()` — ✅ Done, confirmado en real (dos veces)

**Motivación:** el camino existente era `initializeSheets()` + migraciones separadas, secuencia larga sin razón de repetirse en cuenta nueva.

**Qué hace:**
- Crea Spreadsheet, guarda ID en `SPREADSHEET_ID`.
- Arma 4 pestañas con esquema FINAL completo (reutiliza `SHEET_SCHEMAS`/`CLIENTES_SCHEMA`).
- NO crea `Debug_US37`.
- Aplica `ensureCuposPilatesPlainTextFormat()`.
- Lanza error si `SPREADSHEET_ID` ya existe.
- `initializeSheets()` y migraciones quedan intactas.

**Verificación de columnas:** 24 Nutrición, 18 Pilates, 8 Cupos_Pilates, 12 Clientes — cero desfase.

**Validado en real: dos veces.**

**Decisión relacionada:** `Debug_US37` borrada manualmente del Sheet de testing.

### 3-s. US-48 — Opción B: remitente real de la instructora — ✅ Done, confirmado en real

**Contexto:** 3 opciones evaluadas — A (compartir calendario, correo "como" Dani), B (ELEGIDA: alias verificado), C (todo bajo cuenta instructora, descartada por rotación de personal).

**Hallazgo clave:** `executeAs: USER_DEPLOYING` — el alias debe configurarse en la cuenta que hace el deploy (Dani), no en la de la instructora.

**Cambios originales (ANTES de US-49):**
- `getPilatesSenderEmail()` — getter de `PILATES_SENDER_EMAIL`.
- 3 llamadas (`bookTimeslot`, `rescheduleBooking`, `cancelBooking`) con `fromOption` condicional.

**⚠️ Riesgo:** sin `PILATES_SENDER_EMAIL` configurada, los 3 correos fallan en silencio.

**Validado en orden correcto:** alias verificado → property configurada → deploy → clase agendada con remitente correcto → notificación interna correcta.

**Harness:** 324→332. **Re-confirmado tras US-49:** sigue funcionando igual.

### 3-t. US-49 — Fix de duplicación de eventos en el calendario del cliente — ✅ Done, confirmado en real

**Origen:** reportado por Danilo (BUG-001 a BUG-006, severidad Alta), 6 combinaciones. Confirmado que usó correos distintos al del sistema (se descartó autoenvío).

**Investigación — 3 mecanismos, no 2:**

Inspeccionando 3 eventos que le aparecieron a un cliente de prueba (Sheyla Villalobos) al mismo horario:

1. **Evento A — el evento OPERATIVO mismo:** `createCalendarEventWithMeet()` agregaba `attendees: [{email: guestEmail}]`. Ser invitado hace que el evento aparezca en el calendario del invitado sin clic, sin `.ics`, sin botón. Traía ficha completa (cédula, fecha de nacimiento) — **problema de privacidad real**.
2. **Evento B — botón "Agregar a Google Calendar"** (`buildAddCalLinks()`), deep-link propio.
3. **Evento C — invitación nativa del `.ics` adjunto**, banner "Sí/No/Tal vez", auto-agregable según config personal.

**Por qué el `attendee` no tenía propósito:** `asistencia_confirmada` solo se escribe desde `confirmAttendance(token)`; `show_no_show` no referencia `responseStatus`. Remanente de implementación anterior a US-37. El equipo ya notó el problema el 18 jul e intentó `sendUpdates:'none'` — solo suprime el correo nativo, no evita el evento en el calendario del invitado.

**El título genérico "Appointment with X"** venía del Evento A — se resuelve solo al eliminarlo.

**Decisión de negocio:** además del `attendee`, se quitó también el `.ics` adjunto por completo.

**Cambios de código:**
- `createCalendarEventWithMeet()`: sin `attendees`/`guestEmail`.
- `bookNutricionCalendarEvent()`: firma actualizada.
- `bookPilatesCalendarEvent()`: branch "inscritos siguientes" ya no hace get()+patch(), solo devuelve `meetLink`.
- `leavePilatesSlot()`/`joinPilatesSlot()`: mismo mecanismo corregido, no en el pedido original pero mismo bug en el camino de reagendar.
- `renderConfirmationEmail()`: ya no construye `icsAttachment` (bloque completo eliminado, con parámetros `correo`/`icsSequence`).
- `bookTimeslot`/`rescheduleBooking`: `sendEmail()` sin `attachments`.
- `testSendConfirmationEmails()` actualizada.
- NO tocado: `buildBookingIcsContent()`, `doGet(?action=ics)`.
- Eliminadas (sin caller): `verifySentEmailAttachmentsViaGmail()`, `getOrganizerEmailForTipoCita()`.

**Confirmado antes del deploy:** `rescheduleBooking()` de nutrición nunca toca `attendees` — no hizo falta cambio ahí.

**Harness: 332→303.** 6 tests retirados (sin equivalente), tests de US-45 reescritos contra `?action=ics`, tests nuevos de `attachments.length === 0`.

**Validado en real, 3 cuentas de preproducción:** sin banner nativo, 4 botones funcionando, sin duplicado al usar el botón, remitente de pilates intacto.

**Deploy:** preprod `deployprueba4@gmail.com`, v4, confirmado con `clasp deployments`. Commit `54ba637` — confirmar si ya se subió.

**Pendiente avisar a Luis/Danilo:** D-07 a D-10 esperaban detección nativa automática — ya no aplica.

---

## 4. TIPOS DE CITA

### Nutrición (flujo Dani)
| Tipo | ?type= | Duración | Modalidad |
|------|--------|----------|-----------|
| Consulta inicial | `initial` | 60 min | Presencial o virtual |
| Cita de seguimiento | `followup` | 45 min | Presencial o virtual |
| Solo medición | `measurement` | 15 min | Solo presencial |

**Horario ya NO es fijo desde US-44:** Dani/Ali marcan bloques abiertos en `Disponibilidad - Nutrición`, el portal talla sub-slots. Sin bloques marcados, cero slots ese día.

### Pilates (flujo instructora)
| Tipo | ?type= | Duración | Modalidad | Formato | Horario | Ventana mínima | Cupo |
|------|--------|----------|-----------|---------|---------|----------------|------|
| Clase de pilates | `pilates` | **Dinámico (US-45)**, pendiente bajar trigger a 1 min | Virtual únicamente | Grupal | **Dinámico (US-43)** | 12 horas | 5 default, ajustable en `Cupos_Pilates` |

**Pilates NO tiene recordatorio de 48hrs.** Correos al cliente con remitente real de la instructora (US-48). Notificaciones internas a instructora+Ali (US-46). **Cliente ya NO invitado del evento operativo** (US-49), ni al reagendar.

Ver notas técnicas #43 a #52 para el detalle completo.

---

## 5. MODELO DE DISTRIBUCIÓN DE LINKS

```
?type=initial       → Consulta inicial (nutrición)
?type=followup      → Cita de seguimiento (nutrición)
?type=measurement   → Solo medición (nutrición)
?type=pilates       → Clase grupal (pilates)

?token=<token>                              → Menú gestionar cita
?token=<token>&accion=confirmar             → Confirmar asistencia
?token=<token>&accion=reagendar             → Reagendar directo
?token=<token>&accion=cancelar              → Cancelar directo
?action=ics&token=<token>                   → Descarga .ics MANUAL (botón Apple/iCal),
                                                sin cambios tras US-49
```
Construidos con `WEB_APP_URL` fija — nunca con `getUrl()`.

**US-36, CERRADO:** el banner de Google Apps Script no se puede quitar con código. Investigado a fondo (whitelisting de Gmail requiere volumen mucho mayor; página envoltorio cambiaría el modelo de links). **Decisión de equipo: aceptado como limitación, comunicado como condición del servicio.**

**Pendiente (Danilo):** explorar acortadores de URL, con precaución de no usar nombres definitivos en pruebas.

---

## 6. ACTORES DEL SISTEMA

| Actor | Rol |
|-------|-----|
| **Dani** | Admin/nutricionista. Notificación interna en cada acción de nutrición. Marca disponibilidad en `Disponibilidad - Nutrición`. |
| **Secretaría** (correo genérico) | Distribuye links por WhatsApp. Notificaciones internas de ambos flujos. |
| **Instructora de pilates** | Marca clases en `Disponibilidad - Pilates`, ajusta `max_participantes`. Notificaciones internas de pilates (US-46). Remitente real de correos al cliente (US-48). |
| **Cliente (ES/EN)** | Agenda, reagenda, cancela, confirma. 15+. **Ya no invitado del evento operativo** (US-49) — solo agrega vía los 4 botones. |
| **Google Apps Script** | `executeAs: USER_DEPLOYING` — siempre la identidad de quien hizo el último `clasp deploy`. |

### Checklist de acceso necesario para producción
- Compartir Calendar de la instructora con la cuenta de deploy (Opción A) o alias verificado (Opción B).
- Crear `Disponibilidad - Nutrición` real, compartido con la cuenta de deploy.
- Reemplazar correos placeholder por reales.
- Configurar `PILATES_SENDER_EMAIL` ANTES de deployar código que dependa de ella.
- Deploy final bajo cuenta de Dani.
- Coordinar carga de disponibilidad real.
- Bajar trigger de pilates a 1 minuto.

---

## 7. FLUJOS COMPLETOS

### Flujo principal — Agendar cita de nutrición ✅ 100% COMPLETO, testing + 3 rondas de preprod
```
1. Dani/Ali marcan bloques en "Disponibilidad - Nutrición".
2. Comparte link ?type=... por WhatsApp.
3. Cliente ve sub-slots tallados, conflictos excluidos vía Freebusy contra
   CALENDARS. Elige fecha/hora.
4. Ingresa correo → busca en "Clientes".
5. Completa datos (edad, upsert).
6. Verifica ventana + LockService.
7. Escribe fila. Crea evento en Calendar (CALENDARS[0]) + Meet si virtual.
   Cliente NO se agrega como invitado (US-49).
8. Envía correo de confirmación — 4 botones, SIN adjunto .ics (US-49).
9. Envía notificación interna a Dani/Ali (US-46).
10. [Nutrición] 47-49hrs antes: recordatorio.
11. Cliente hace clic → página visual (US-31):
    - Confirmar → notificación interna (US-32)
    - Reagendar → notificación + correo → 3er+ reagendamiento: alerta (US-42)
    - Cancelar → notificación + correo de cancelación → <24hrs: alerta (US-33)
```

### Flujo pilates ✅ 100% COMPLETO, testing + 3 rondas de preprod
```
1. Instructora marca cada clase en "Disponibilidad - Pilates".
2. syncPilatesClassesToCuposSheet() (5min, pendiente 1min) crea fila en
   Cupos_Pilates.
3. Instructora ajusta max_participantes si hace falta.
4. Link ?type=pilates compartido.
5. Cliente ve clases con cupo, duración real.
6. Al agendar: cliente NO invitado del evento (US-49). Correo con remitente
   real de instructora (US-48), sin .ics (US-49). Notificación interna a
   instructora+Ali (US-46).
7. Reagendar: leavePilatesSlot()/joinPilatesSlot() sin tocar attendees (US-49).
8. Resto igual que nutrición, sin recordatorio 48h, cupo en vivo.
```

### Flujo reagendamiento/cancelación ✅ 100% completo, ambos flujos.

---

## 8. SCHEMA DE GOOGLE SHEETS

### Spreadsheet de testing
- **ID:** 16M6WUqMAK9XkVoIutIn9UkJojlS5biT5o470GySs5gw
- **URL:** https://docs.google.com/spreadsheets/d/16M6WUqMAK9XkVoIutIn9UkJojlS5biT5o470GySs5gw/edit
- `Debug_US37` borrada manualmente el 1 de agosto.

### Pestaña "Nutrición" (24 columnas)
```
token | nombre | apellido | correo | telefono | tipo_id | numero_id | fecha_nacimiento |
tipo_cita | fecha | hora | zona_horaria_cliente | modalidad | idioma |
meet_link | estado | fecha_creacion | recordatorio_enviado | show_no_show |
cancelaciones_tardias (col 20) | requiere_pago (legacy) | event_id |
asistencia_confirmada | contador_reagendamientos (col 24)
```
Estados: `Agendada` → `Reagendada` → `Cancelada`, también `Error_Calendar`. Sin cambios de schema en US-44 ni US-49.

### Pestaña "Pilates" (18 columnas)
```
token | nombre | apellido | correo | telefono | tipo_id | numero_id | fecha_nacimiento |
fecha_clase | hora_clase | zona_horaria_cliente | idioma |
estado | fecha_inscripcion | recordatorio_enviado | show_no_show |
cancelaciones_tardias (col 17) | contador_reagendamientos (col 18)
```
Fuente de verdad real del cupo (conteo en vivo, US-43).

### Pestaña "Cupos_Pilates" (8 columnas)
```
fecha_clase | hora_clase | inscritos | max_participantes | event_id | meet_link |
disponibilidad_event_id (col G) | duracion_minutos (col H)
```
- `inscritos` — cache, nunca fuente de verdad.
- `max_participantes` — vacía = 5 default.
- `event_id`/`meet_link` — evento OPERATIVO.
- `disponibilidad_event_id` (G) — evento del calendario de disponibilidad, separado (nota #45).
- `duracion_minutos` (H) — fin-inicio del evento de disponibilidad.

### Pestaña "Clientes" (12 columnas)
```
correo | nombre | apellido | telefono | tipo_id | numero_id | fecha_nacimiento | idioma |
cancelaciones_tardias | requiere_pago | cliente_nutricion | cliente_pilates
```

### `Debug_US37` — YA NO SE CREA en cuentas nuevas
Cumplió su propósito. `setupNewAccountSheets()` (US-47) NO la crea. Borrada de testing. `logDebugUS37()` sin caller activo tras US-49, salvo fallback de imágenes embebidas.

### Valores válidos de `tipo_id`
```
cedula | pasaporte | licencia | otro
```

---

## 9. REQUERIMIENTOS FUNCIONALES

### RF-2 — Correos y Automatizaciones — **TODO DONE**
| ID | Requerimiento | Estado |
|----|--------------|--------|
| RF-2.1 | Correo de confirmación inmediato | ✅ Done (sin .ics desde US-49) |
| RF-2.2 | Correos nutrición/pilates con remitente correcto | ✅ Done — US-48 |
| RF-2.3 | Notificación interna, destinatarios correctos | ✅ Done — US-46 |
| RF-2.4 | Recordatorio 48h (solo nutrición) | ✅ Done |
| RF-2.5 | Notificación cancelación tardía | ✅ Done — US-33 |
| RF-2.6 | Frontend reagendar/cancelar/confirmar | ✅ Done — US-31 |
| — | Look & feel brandbook | ✅ Done — US-28 |
| — | Título redundante quitado | ✅ Done — US-41 |
| — | Formato de fecha español | ✅ Done — US-34 |
| — | Fecha de nacimiento clic-en-cualquier-parte | ✅ Done — US-40 |
| — | Reagendamientos múltiples (3ro+) | ✅ Done — US-42 |
| — | Botones de calendario | ✅ Done — US-37, modificada por US-49 |
| — | Cupos de pilates dinámicos | ✅ Done — US-43 |
| — | Duración dinámica de pilates + trigger | ✅ Done — US-45 (pendiente 1min) |
| — | Disponibilidad real de nutrición | ✅ Done — US-44 |
| — | Fix destinatarios notif. internas | ✅ Done — US-46 |
| — | Setup de Sheets de una corrida | ✅ Done — US-47 |
| — | Remitente real de instructora | ✅ Done — US-48 |
| — | **Sin eventos duplicados** | ✅ **Done — US-49** |
| — | Banner de Google Apps Script | ✅ CERRADO — aceptado, US-36 |

---

## 10. STACK TÉCNICO

### Constantes clave
```typescript
const WEB_APP_URL = "..."; // línea 247 de backend/src/app.ts

// NOTIFICACION_INTERNA_DESTINATARIOS ELIMINADA (US-46). Ahora:
// getLateCancellationRecipients(esPilates): string[]
//   → nutrición: [DANI_EMAIL, ALI_EMAIL]
//   → pilates:   [INSTRUCTORA_EMAIL, ALI_EMAIL]

// DANI_EMAIL, INSTRUCTORA_EMAIL, ALI_EMAIL (destinatarios internos)

// PILATES_SENDER_EMAIL (remitente cliente pilates, US-48) — alias
//   verificado en la cuenta que hace clasp deploy, NO en la de la
//   instructora. Si falta, correos fallan en silencio.

// CALENDARS (nutrición, JSON array, default ["primary"] si falta —
//   FALLA SILENCIOSA, doble-chequear siempre), PILATES_CALENDAR_ID
//   (operativos)
// PILATES_AVAILABILITY_CALENDAR_ID, NUTRICION_AVAILABILITY_CALENDAR_ID
//   (disponibilidad, solo lectura)
// SPREADSHEET_ID (poblada por setupNewAccountSheets(), US-47)
```

### Funciones principales (backend/src/app.ts)
```typescript
// US-11/12: renderConfirmationEmail(params): {subject, htmlBody, inlineImages}
//   Desde US-49 YA NO devuelve icsAttachment.

// US-13/30: renderNotificacionInterna(), sendNotificacionInterna()
//   Desde US-46 usa getLateCancellationRecipients(params.esPilates).

// US-14: renderRecordatorio48h(), sendRemindersJob(), installRemindersTrigger(),
//   confirmAttendance(token), buildBookingActionLink(token, accion)

// US-31: doGet(e) — branches ?action=ics → ?token= (SPA) → portal normal
//   getManageBookingInfo(token)

// US-32: renderNotificacionInternaConfirmada(), sendNotificacionInternaConfirmada(),
//   renderCancellationEmail() // sin botones, nunca tuvo adjunto

// US-33: notifyLateCancellation(), markLateCancellationOnBookingRow(),
//   getLateCancellationRecipients(esPilates), renderNotificacionCancelacionTardia(),
//   sendNotificacionCancelacionTardia()

// US-42: incrementRescheduleCounterOnBookingRow(), formatOrdinalReagendamiento(),
//   renderNotificacionReagendamientosMultiples(), sendNotificacionReagendamientosMultiples()

// US-37: buildAddCalLinks(), buildBookingIcsContent() (usada SOLO por ?action=ics
//   desde US-49), buildInlineImagesForTemplate(), logDebugUS37() (sin caller
//   activo salvo fallback de imágenes)

// US-43: getPilatesAvailabilityCalendarId(), getPilatesAvailabilityEvents(),
//   syncPilatesClassesToCuposSheet() (idempotente, fix nota #46),
//   installPilatesAvailabilitySyncTrigger() (borra triggers previos,
//   everyMinutes(5), pendiente 1), getAvailableCapacityForClass(),
//   countActivePilatesRegistrations()

// US-45: getPilatesClassDurationMinutes()

// US-44: getNutricionAvailabilityCalendarId(), getNutricionAvailabilityBlocks(),
//   fetchAvailability(type) (rama nutrición talla sub-slots)
//   WORKDAYS/WORKHOURS sin uso activo, plan de rollback.

// US-47: setupNewAccountSheets() — Spreadsheet completo de una corrida,
//   sin Debug_US37, reutiliza SHEET_SCHEMAS/CLIENTES_SCHEMA.

// US-48: getPilatesSenderEmail() — lanza si falta PILATES_SENDER_EMAIL.
//   bookTimeslot/rescheduleBooking/cancelBooking agregan {from: ...}
//   condicionalmente para pilates.

// US-49: createCalendarEventWithMeet() sin attendees/guestEmail.
//   bookNutricionCalendarEvent()/bookPilatesCalendarEvent() actualizadas.
//   leavePilatesSlot()/joinPilatesSlot() sin tocar attendees.
//   ELIMINADAS: verifySentEmailAttachmentsViaGmail(), getOrganizerEmailForTipoCita().
```

### Frontend
```
frontend/src/components/manage-booking.tsx  // 4 pantallas gestión de citas
frontend/src/hooks/useManageBookingInfo.tsx / useConfirmAttendance.tsx /
                    useCancelBooking.tsx / useRescheduleBooking.tsx
frontend/src/index.css  // paleta + @font-face Jost (US-28)

// US-40: calendar-picker.tsx — Popover+Calendar propio, CalendarDropdown
//   inyectado, input hidden yyyy-MM-dd

// US-45: Timeslots.tsx/useGoogleTimeslots.tsx exponen durationMinutes/
//   slotDurations; título dinámico en calendar-picker.tsx
```
`CalendarTimeslotPicker` exportado para reutilizar en reagendar. **US-44 y US-49 no requirieron cambios de frontend.**

### Templates de correo (backend/templates/)
```
correo_confirmacion_{nutricion,pilates}_{es,en}.html  // 4 botones, imágenes
  cid: — SIN adjunto .ics desde US-49
correo_cancelacion_cliente_{es,en}.html
notificacion_interna_nueva_cita.html, notificacion_interna_confirmada.html,
notificacion_cancelacion_tardia.html, notificacion_reagendamientos_multiples.html
recordatorio_48h_nutricion_{es,en}.html
asset_logo_pph.html, asset_flor_pph.html, asset_kettlebell_pph.html,
asset_logo_pilates_en_pph.html // divergencia preexistente documentada
```
Sin plantillas nuevas en US-43 a US-49.

### Build pipeline
```
backend/package.json → "build": "tsc && node copy-to-dist.js"
```
**`copy-to-dist.js` NO copia `appsscript.json`** — copiar manualmente de la raíz a `dist/` ANTES del primer `clasp push` en cuentas nuevas (nota #49-preprod).

**Scope de manifest:** `https://mail.google.com/` agregado en US-37. Scope OAuth nuevo requiere autorización manual una vez. US-43 a US-49 no requirieron scope nuevo.

### Test harness
`backend/test-harness/` — **303 aserciones, todas pasando** (bajó de 332 tras US-49).

**Recordatorio operativo:** el harness corre contra `test-harness/out/app.js`, build APARTE de `backend/dist/` — recompilar a mano (`npx tsc --target ES2019 --module none --outDir test-harness/out src/app.ts --skipLibCheck`) antes de correr pruebas.

**Puntos ciegos del mock:** no valida content-type real de `Utilities.newBlob()`; no reproduce paginación de `Calendar.Events.list`; no reproduce el bug real de `getLastRow()` (solo confirmado contra Sheet real); **no reproduce cuotas de envío de Gmail** (nota #52) — solo confirmable contra el sistema real.

---

## 11. SPRINTS Y ESTADO ACTUAL

### Sprint 2 — Completo salvo US-20 (Trello pendiente)
US-11 a US-14, US-13/30, US-28, US-31, US-32, US-33, US-41 — ✅ Done.

### Sprint 4 — Completo
| US | Título | Estado |
|----|--------|--------|
| US-34 | Fix fecha español | ✅ Done |
| US-40 | Fix fecha de nacimiento | ✅ Done (3 rondas) |
| US-42 | Reagendamientos múltiples | ✅ Done |
| US-37 | Botones calendario + .ics (histórico) | ✅ Done, luego MODIFICADA por US-49 |
| US-43 | Cupos de pilates dinámicos | ✅ Done |
| US-45 | Duración dinámica pilates + trigger | ✅ Done, pendiente 1min |
| US-44 | Disponibilidad real nutrición | ✅ Done |

### Sprint 5 — Completo
| US | Título | Estado |
|----|--------|--------|
| US-46 | Fix destinatarios notif. internas | ✅ Done, 3 cuentas preprod |
| US-47 | `setupNewAccountSheets()` | ✅ Done, 2 veces |
| US-48 | Remitente instructora (Opción B) | ✅ Done, re-confirmado tras US-49 |
| US-49 | Fix duplicación de eventos | ✅ Done, 3 cuentas preprod |
| US-36 | Banner GAS | ⏸️➡️✅ CERRADO |

### Preproducción — tres "cuentas"
**Ronda 1** (`pruebadeploy8`): 6 tropiezos resueltos (nota #49-preprod). **Ronda 2** (`deployprueba4`): sin tropiezos nuevos, cuenta activa con fix US-49. **Correo personal del usuario:** tercera cuenta de prueba, solo como cliente.

**Checklist funcional completado:** agendar/reagendar/cancelar/confirmar en ambos flujos; fix notif. internas confirmado con headers; remitente pilates confirmado con headers; sin eventos duplicados confirmado en nutrición y pilates, 3 cuentas.

### Matriz de testing Luis/Danilo
54 test cases. 6 en Fail (BUG-001 a BUG-006, ya corregido, pendiente re-test). Resto Pass/Pendiente. Pendiente avisar cambio de resultado esperado D-07 a D-10.

### Textos en BORRADOR
Sin cambios — ninguno bloquea.

### Pendientes sin bloquear
Bajar trigger pilates a 1min. Decidir correo de cancelación. Documentar doble calendario. Manual de usuario (3 capturas pendientes para Gabi, confirmar par de calendarios del punto 3). Historia de preprod en Trello. Acortadores URL. Reemplazar correos placeholder. Configurar `PILATES_SENDER_EMAIL` real + alias en cuenta de Dani. Checklist producción. Coordinar disponibilidad real. Cerrar US-20 en Trello. Verificar branding aprobado. Reconstruir deploys v28-v42. Auditar OneDrive. Arreglar `build.sh`. Confirmar Yahoo. Limpiar `Cupos_Pilates` de prueba. **`git push` de `54ba637` — confirmar.** Auditar "Ali" visible en templates. **Avisar a Luis/Danilo sobre re-test y D-07 a D-10.** **Reunión deploy real: martes.**

---

## 12. ENTORNO DE TESTING

| Dato | Valor |
|------|-------|
| Cuenta | plantpoweredani.testing@gmail.com |
| URL | https://script.google.com/macros/s/AKfycbwNUEjG8CXo2D5bk2eq1w6wBrme9XqJpCqOt-TkP0otTypiXd7GCEk7L7uFhdDOLCaJ/exec |
| Editor | https://script.google.com/d/1cu-HdKiAmfUYOgjwtjKcE9lCO6waLfFsL71PwP4GgcdGiQWzqygPS3fK/edit |
| Repo | https://github.com/juanartavia/plant-powered-dani |
| Local | `C:\dev\plant-powered-dani` — NO OneDrive |
| Spreadsheet | https://docs.google.com/spreadsheets/d/16M6WUqMAK9XkVoIutIn9UkJojlS5biT5o470GySs5gw/edit (sin Debug_US37) |
| Harness | 303 aserciones, todas pasando |

**Nota: el fix de US-49 NO se llevó a la cuenta de testing** — se hizo directo en preprod (`deployprueba4`). Confirmar si hace falta replicarlo ahí.

### Links de testing
```
Consulta Inicial: .../exec?type=initial
Cita de Seguimiento: .../exec?type=followup
Solo Medición: .../exec?type=measurement
Clase de Pilates: .../exec?type=pilates
```

### Historial de deploys de testing (v28-v42 detallado pendiente de reconstruir)
| Versión | Cambios |
|---------|---------|
| v8-v27 | Sprint 1 + primeros ajustes Sprint 2 |
| v28-v42 | US-13/30, US-14, US-31 (1ra), US-32, US-28, US-33 (1ra) — detalle pendiente |
| v43-v44 | US-33 completa, tras recuperación OneDrive |
| v45,v47 | `clasp version` huérfanas |
| v46 | US-33 branding real |
| v48 | US-31 frontend + US-28 + US-41 |
| v49-v51 | intermedias sin documentar |
| v52 | US-34 fix fecha español |
| v53-v56 | US-40 (3 rondas, ronda 1 falló en prod) |
| v57-v60 | US-42 |
| v61-v76 | US-37 (implementación + investigación larga del bug .ics, nota #43) |
| v77 | US-43 (incluye fix getLastRow) |
| v78-v80 | US-45 |
| v81 | US-44 |

---

## 12-bis. ENTORNO DE PREPRODUCCIÓN

> Confirmado formalmente en el StandUp del 1 de agosto como parte del proceso oficial de despliegue.

### Ronda 1 — `pruebadeploy8@gmail.com`
| Dato | Valor |
|------|-------|
| `deploymentId` | AKfycbzO6SthAS_-cbE1eZGENDj3g1EKXR9QP7-lb3Nliru8pKnLxwvDmwKDIYOPksOhDey8nw |
| URL | https://script.google.com/macros/s/AKfycbzO6SthAS_-cbE1eZGENDj3g1EKXR9QP7-lb3Nliru8pKnLxwvDmwKDIYOPksOhDey8nw/exec |
| Editor | https://script.google.com/d/1E2ifta3XyJC7d6Xa1VVsNuTqwOILQssyRS43uhiawWW1KuSOnX3FFKpI/edit |
| Nutrición - Citas | 876b650623be938149ecabaddf14bee2416f4a3a6219561bc0f332a5897fb041@group.calendar.google.com |
| Disponibilidad - Nutrición | 724acd654d8c4548c025f6790489a954d2a3492172a26650cf5c9fd8f97bb571@group.calendar.google.com |
| Pilates - Citas | 6ab51db650e9e84059f8071bc5099c07937aaf1bbaa01e21243f1af549627964@group.calendar.google.com |
| Disponibilidad - Pilates | 66c1033c3c20951f0bcedbb80da69768fcbe9d14d83ea76b536518b7b2809685@group.calendar.google.com |
| Rol Opción B | Simula instructora (destinatario `INSTRUCTORA_EMAIL` en Ronda 2) |

6 tropiezos resueltos (nota #49-preprod).

### Ronda 2 — `deployprueba4@gmail.com` (cuenta activa, fix US-49)
| Dato | Valor |
|------|-------|
| `deploymentId` | AKfycbxzU6YQzHeT0l7h5gFsVhXgDNr8cJK1HclFkOy3y_oS5CHfuqlc_bfXifmQEG9IAz7GJQ |
| URL | https://script.google.com/macros/s/AKfycbxzU6YQzHeT0l7h5gFsVhXgDNr8cJK1HclFkOy3y_oS5CHfuqlc_bfXifmQEG9IAz7GJQ/exec |
| Spreadsheet | https://docs.google.com/spreadsheets/d/1TMNBKxe0kxQ1XKRH7Z325C4IUKJmDZFhYRs4rCpv7Ns/edit |
| Editor | https://script.google.com/d/1xQct7-WuuxreROqASeQjJGxXQLgiur8qhr__cBI4FIMUm48W0THW6xQZ/edit |
| Nutrición - Citas | 6775d1f64bf46fc152ae2c39ec86af0f1e3a99155ad4131a40ab2d2a735fcc41@group.calendar.google.com |
| Disponibilidad - Nutrición | 5e20364d88e0ecf3242e49d7ab85c04157e63c2dfdb32925f718bbf2f8d09feb@group.calendar.google.com |
| Pilates - Citas | 812a3b260529deb402ec095b0a90389f0e60392ec36852eda15ae4c2a3b8d813@group.calendar.google.com |
| Disponibilidad - Pilates | d01f15d9a51d8ebdf6bf8b9b6a4d89d36667cfbe7b29b165eb7152aa43315167@group.calendar.google.com |
| `PILATES_SENDER_EMAIL` | Correo personal del usuario, alias verificado en esta cuenta |
| `DANI_EMAIL`/`ALI_EMAIL` | plantpoweredani.testing@gmail.com |
| `INSTRUCTORA_EMAIL` | pruebadeploy8@gmail.com |
| **Versión activa** | **v4** — "Fix duplicacion de eventos", confirmada con `clasp deployments` |

Sin tropiezos nuevos. Trabajo de Sprint 5 (US-46/47/48/49) hecho directamente sobre esta cuenta.

**Hallazgo relevante de esta cuenta (3 ago, nota #52):** Gmail de consumidor, cuota diaria baja (~100/día), agotada durante sesión intensa de pruebas — causó falla intermitente de correos, investigada y confirmada como cuota, no bug.

### Notas de seguridad
Contraseñas de preproducción NO documentadas en este archivo.

---

## 13. NOTAS TÉCNICAS CRÍTICAS

**43. El adjunto `.ics` de US-37 se perdía en silencio dentro de `GmailApp.sendEmail()` — causa raíz real: imágenes embebidas en base64 dentro del HTML. (Este adjunto fue eliminado por completo en US-49 por otras razones — nota #51 — pero la lección técnica sobre imágenes+adjuntos sigue válida para cualquier correo futuro que combine ambos.)**

**Síntoma:** el correo debía llevar 4 botones + `.ics` real adjunto. Los botones funcionaban, el adjunto nunca llegaba.

**Causa raíz, prueba de control A/B:** un correo sin imágenes embebidas sí traía el `.ics`. Con imágenes como `<img src="data:...base64...">`, el adjunto se perdía. **Gmail extrae internamente esas imágenes como adjuntos reales al enviar, descartando cualquier adjunto real agregado por nosotros en el mismo envío.**

**Fix (histórico):** `<img src="cid:...">` + `inlineImages: {cid: Blob}`.

**Regla reforzada, sigue vigente:** nunca combinar imágenes base64 con un adjunto real en la misma llamada — usar `inlineImages`+`cid:`. Solo se confirma contra Gmail real, el harness no lo detecta.

**44. `HTMLInputElement.showPicker()` lanza `SecurityError` dentro del iframe cross-origin de Apps Script Web Apps.**

Apps Script sirve el portal en un iframe de 3 niveles, cross-origin. `showPicker()` está bloqueado por especificación del navegador ahí. **Regla reforzada:** nunca depender de esta API para nada que abra dentro del portal.

**45. US-43 — conflicto de schema detectado ANTES de escribir código, y reordenación de operaciones descubierta a medio camino.**

**Conflicto de schema:** el prompt pedía reutilizar `event_id`/`meet_link` de `Cupos_Pilates` para dedup, pero ya estaban en uso para el evento OPERATIVO. Se agregó `disponibilidad_event_id` (columna G) separada. **Lección:** revisar usos existentes de columnas ANTES de escribir código sobre una tabla activa.

**Reordenación en `rescheduleBooking` (pilates):** con el cupo pasando a conteo en vivo, el ORDEN importa — `leavePilatesSlot` debe correr DESPUÉS de mover la fila al nuevo horario.

**46. US-43 — bug real de `getLastRow()` justo después de `appendRow()` en un loop sin flush, invisible para el harness. Más el gotcha de `clasp push` vs `clasp deploy`.**

**Causa:** `syncPilatesClassesToCuposSheet()` llamaba `getLastRow()` inmediatamente después de cada `appendRow()`, sin flush — en Sheets real no garantiza reflejar la escritura, varias iteraciones escribieron sobre la misma fila vieja.

**Fix:** número de fila calculado una sola vez al inicio, incrementado localmente.

**Gotcha relacionado (US-45):** después de pushear, el portal seguía mostrando "60 min" — faltaba `clasp deploy`. **Regla reforzada:** si un fix pusheado "no se refleja" en real pero funciona corriendo manualmente, sospechar de un deploy pendiente.

**Regla reforzada para Sheets en loop:** nunca volver a preguntarle a Sheets su estado inmediatamente después de escribir sin flush — calcular la posición localmente.

**47. US-44 — nutrición y pilates leen disponibilidad con el mismo espíritu pero modelos de cómputo distintos; y un límite real de pruebas manuales con funciones parametrizadas.**

**Por qué el modelo es distinto:** pilates = clases discretas (cada evento ES una clase reservable). Nutrición = tiempo continuo (cada evento es un bloque a tallar en sub-slots). **Regla:** confirmar primero si el dominio es discreto o continuo antes de asumir arquitectura compartida.

**Investigación previa sin conflictos:** nutrición más simple que pilates — sin Script Property de calendario operativo dedicada, sin capa intermedia.

**Límite de pruebas manuales:** el botón "Ejecutar" del editor no permite pasar argumentos. **Regla:** para funciones parametrizadas, probar vía portal público con el parámetro en la URL, o envolver en una función wrapper sin parámetros (ver nota #52).

**48. US-46 — la lección de "ya existía el patrón bueno, solo había que aplicarlo en los 2 lugares que faltaban".**

El código ya documentaba la deuda desde US-33: un comentario decía literalmente que valdría la pena migrar US-13/30/32 al mismo mecanismo — quedó sin ejecutar por 2 sprints, hasta que el ensayo de preproducción lo hizo evidente. **Regla reforzada:** un comentario de deuda técnica tipo "esto debería usar el mismo patrón" es una tarea real, no decorativa.

**49-preprod. Dos rondas de ensayo de preproducción — 6 tropiezos de la Ronda 1, ninguno repetido en la Ronda 2.**

1. **API de Apps Script no habilitada:** `clasp create` falla con *"User has not enabled the Apps Script API"* la primera vez en cuenta nueva. Fix: activar en https://script.google.com/home/usersettings, esperar 1-2 min. **Regla: activar ANTES de `clasp create`, no esperar a que falle.**

2. **`clasp create --type webapp` inválido:** el tipo correcto es `standalone` — "Web App" no es tipo de contenedor, es forma de desplegar un `standalone` vía el manifest.

3. **`.clasp.json` preexistente bloquea `clasp create`:** falla con "Project file already exists". Fix: respaldar (`copy .clasp.json .clasp.json.NOMBRE-backup`) y borrar el original antes de crear el nuevo.

4. **Manifest vacío tras `clasp create` — causa de "Google Drive no pudo abrir el archivo":** `clasp create` clona un `dist/appsscript.json` vacío. `copy-to-dist.js` NO lo copia. Sin `webapp`/scopes, la URL `/exec` no se comporta como Web App. **Fix:** copiar `appsscript.json` de la raíz a `dist/` ANTES del primer push. **Diagnóstico:** en "Administrar implementaciones", si NO aparece "Quién tiene acceso", falta la sección `webapp`.

5. **Error `I` mayúscula vs `l` minúscula al tipear un `deploymentId`:** casi idénticos en muchas fuentes. **Regla: siempre copiar/pegar, nunca reescribir.**

6. **Comilla sin cerrar en `--description "..."` deja la terminal en `>>`:** `Ctrl+C` y reintentar completo.

**Ninguno se repitió en la Ronda 2**, con el orden correcto (API → `clasp create standalone` → copiar manifest → push).

**Hallazgo aparte, comportamiento esperado:** cuentas Gmail nuevas sin historial reciben sus primeros correos con adjunto en Spam — no es bug, es reputación de remitente nueva. No aplica a Workspace real. **Distinto de la nota #52** (cuota de envío, no clasificación).

**50. US-48 — el alias "Enviar como" se configura en la cuenta que EJECUTA el script, no en la que se simula; y el organizador del evento sigue siendo distinto del remitente del correo, a propósito.**

Por `executeAs: USER_DEPLOYING`, el alias debe estar verificado en la cuenta que despliega (Dani), no en la de la instructora. Fácil de asumir al revés.

**Dato aparte, no un bug:** el organizador del evento de Calendar (antes de US-49) seguía mostrando la cuenta operativa — `from` del correo y `organizer` del evento son mecanismos independientes.

**Verificación del alias:** Gmail → Configuración → "Cuentas e importación" → "Enviar mensaje como" → agregar dirección → código de verificación → confirmar desde la cuenta que despliega.

**51. US-49 — el `attendee` de un evento de Calendar es, por sí solo, un mecanismo de "compartir" tan efectivo como una invitación real.**

**Hallazgo central:** al investigar "2 eventos duplicados", la sospecha inicial fue el mecanismo conocido (`.ics`+botón). Pero apareció un TERCER evento — el operativo mismo — visible en el calendario del cliente sin clic. Causa: el cliente estaba en `attendees` del evento interno. **Un evento con `attendee` se comporta, para ese invitado, como una invitación ya aceptada** — independiente de `GmailApp.sendEmail()`.

**Por qué es fácil no notarlo:** se revisa "¿llegó el correo? ¿tiene botones?" pero rara vez "¿qué le apareció a este cliente en SU calendario sin que hiciera nada?".

**Lección futura:** al agregar un correo a `attendees` (aunque sea "solo para registro"), asumir que esa persona VA a ver el evento en su calendario, con toda la descripción — incluyendo datos sensibles que no deberían estar ahí.

**Regla reforzada:** antes de usar `attendees`/`guests`, preguntarse "¿quiero que esta persona vea este evento en su calendario, con todo lo que dice la descripción?" — si no, no usarlo.

**Decisión de negocio vs. bug técnico:** el `attendee` era bug puro. El `.ics` adjunto era feature funcionando como diseñada en US-37 — retirada por decisión de negocio (costo de soporte/investigación vs. beneficio de autodetección, que de todas formas depende de configuración de cada cliente).

**52. Falla intermitente de correos (3 ago) — cuota diaria de Gmail agotada en cuenta de consumidor, confirmada por reproducción directa.**

**Contexto:** justo después de US-49, Luis reportó fallas de correo que parecían indicar una regresión del refactor grande — el timing coincidía con la sospecha lógica.

**Por qué no se asumió sin evidencia:** auditoría estática del diff de US-49 — sin referencias colgantes, sin errores de `tsc`, cada operación con try/catch independiente. El patrón de fallos inconsistente (a veces esto, a veces aquello, sin correlación) no encaja con un bug de lógica compartida.

**Cómo se confirmó:** "Registros de Cloud" no disponible en esta cuenta (requiere proyecto GCP vinculado). Se usó el método de función wrapper temporal (`testBookingDebug()`, mismo patrón que `testCancelFila16`), corrida manualmente desde el editor. Log mostró: `Service invoked too many times for one day: email.` Reproducido dos veces.

**Detalle práctico:** el código pegado en el editor web debe ser JavaScript puro, no TypeScript — `(e as Error).message` da `SyntaxError`. Usar `e.message`/`e.stack` directo.

**Causa de fondo:** `deployprueba4@gmail.com` es Gmail de consumidor, cuota baja (~100/día), agotada por volumen acumulado del equipo. **No afecta producción real** (Workspace, ~1500/día). Ningún cambio de código.

**Regla reforzada:** ante fallos intermitentes justo después de un deploy, no asumir automáticamente que el deploy es la causa por coincidencia de timing — auditar primero, reproducir en caliente con evidencia real antes de tocar código.

---

## 14. MÉTODO DE TRABAJO

### Flujo por cada US
```
1. Este chat analiza la US + checklist de Trello, genera el prompt
2. Dev pega en Claude Code → ejecuta cambios (puede correr clasp push/
   deploy/git commit directo si tiene terminal — confirmado Sprint 5)
3. Dev pega respuesta acá → se analiza, se genera siguiente prompt si hace falta
4. Commit inmediato tras deploy exitoso
5. Probar en real contra URL PÚBLICA antes de marcar cualquier checkbox
6. Solo si funciona en real → marcar Trello → mover a Done
7. Actualizar CLAUDE.md, confirmando que quedó guardado en disco
```

### Reglas añadidas el 29 jul
- Scope OAuth nuevo requiere autorización manual una vez, no basta `clasp deploy`.
- Ante "se ve bien en variables pero no en real", diagnosticar contra el sistema externo.
- Nunca base64 + adjunto real en el mismo correo.
- `showPicker()` y APIs sensibles al origen no usar en el portal.
- Probar siempre contra URL pública antes de dar por buena una función.

### Reglas añadidas el 30 jul (US-43/44/45)
- Nunca `getLastRow()` justo después de `appendRow()` sin flush en loop.
- Revisar usos existentes de columnas antes de escribir sobre tabla activa.
- `clasp push` no mueve `/exec`, solo `clasp deploy`.
- Revisar ORDEN de operaciones cuando la fuente de verdad pasa de cacheada a en vivo.
- Confirmar clases discretas vs. tiempo continuo antes de asumir arquitectura compartida.
- Funciones parametrizadas solo se prueban vía portal público o función wrapper.

### Reglas añadidas el 1 ago (Sprint 5 — notificaciones, cuentas nuevas, Opción B)
- Comentario de deuda "esto debería usar el mismo patrón" = tarea real pendiente.
- Activar Apps Script API ANTES de `clasp create` en cuenta nueva.
- `clasp create` usa `--type standalone`, nunca `webapp`.
- Copiar `appsscript.json` de la raíz a `dist/` ANTES del primer push en cuenta nueva.
- Copiar/pegar `deploymentId` siempre, nunca reescribir.
- Alias "Enviar como" se configura en la cuenta que EJECUTA el script.
- Antes de deployar código con Script Property nueva crítica, confirmar que está configurada.
- Confirmar que CLAUDE.md realmente se actualizó en disco, no solo que se describió.

### Reglas añadidas el 1-3 ago (US-49 — duplicación, y falla de cuota)
- Antes de `attendees`/`guests` en un evento, preguntarse si esa persona debe ver el evento en su calendario personal.
- Un evento con `attendee` = invitación aceptada automáticamente, independiente de correo.
- Al investigar "evento duplicado", auditar TODAS las rutas posibles, no asumir solo 2 mecanismos.
- Distinguir bug real vs. decisión de negocio al eliminar una feature.
- Claude Code puede correr `clasp push`/`deploy`/`git commit` directo con acceso a terminal.
- Ante fallos intermitentes justo tras un deploy, auditar antes de asumir causa por coincidencia de timing.
- Código en el editor web de Apps Script debe ser JavaScript puro, sin sintaxis TypeScript.
- Sin "Registros de Cloud", usar función wrapper temporal corrida manualmente.

**URL del editor de testing:** https://script.google.com/d/1cu-HdKiAmfUYOgjwtjKcE9lCO6waLfFsL71PwP4GgcdGiQWzqygPS3fK/edit

---

## 15. FLUJO DE TRABAJO — TRELLO

### Estados: Backlog → In Progress → Done

### Reglas
- Al iniciar una US → In Progress. Al completar checkboxes validados en real → Done.
- Ningún checkbox se marca solo porque Claude Code terminó el código.
- **Pendiente:** mover US-46/47/48/49 a Done. Mover US-36 a Done/Archivada. Formalizar historia de "paso a preproducción".

---

## 16. FLUJO DE DEPLOY EN WINDOWS (PowerShell)

### Deployment existente
```powershell
cd C:\dev\plant-powered-dani
cd backend
npm run build
cd ..
clasp push
clasp version "descripción"
clasp deploy --deploymentId <id> -V <número> --description "descripción"
git add .
git commit -m "descripción"
git push
```
Claude Code puede correr toda la secuencia con acceso a terminal.

### Cuenta nueva desde cero
```powershell
# 0. Crear cuenta + 4 calendarios manualmente, copiar IDs.
# 1. Activar Apps Script API: https://script.google.com/home/usersettings
# 2. copy .clasp.json .clasp.json.VIEJA-backup ; del .clasp.json
# 3. clasp login
# 4. clasp create --type standalone --title "TITULO" --rootDir ./dist
# 5. CRÍTICO: copy appsscript.json dist\appsscript.json
# 6. cd backend; npm run build; cd ..; clasp push
# 7. Script Properties: CALENDARS (con [""]), NUTRICION_AVAILABILITY_CALENDAR_ID,
#    PILATES_CALENDAR_ID, PILATES_AVAILABILITY_CALENDAR_ID, DANI_EMAIL,
#    INSTRUCTORA_EMAIL, ALI_EMAIL (y PILATES_SENDER_EMAIL si Opción B)
# 8. Correr setupNewAccountSheets() manualmente
# 9. clasp deploy --description "inicial"
# 10. Copiar deploymentId, actualizar WEB_APP_URL (línea 247)
# 11. Si Opción B: verificar alias en Gmail de ESTA cuenta ANTES de
#     configurar PILATES_SENDER_EMAIL y deployar
# 12. Rebuild+push+version+deploy final con URL corregida
# 13. Marcar disponibilidad de prueba, probar en real (copiar/pegar URL)
```

### Notas importantes
`C:\dev\plant-powered-dani`, nunca OneDrive. `&&` no funciona en PowerShell nativo. `rootDir` en `dist/`. Siempre push antes de deploy. `-V` explícito siempre. `copy-to-dist.js` no copia `appsscript.json`. Copiar/pegar `deploymentId`. Código del editor web: JS puro, sin TypeScript.

---

## 17. REGISTRO DE CAMBIOS

| Fecha | Cambio |
|-------|--------|
| 27-28 jul 2026 | Incidente OneDrive, recuperación completa. US-33 con branding real. US-41 resuelto. |
| 29 jul 2026 | US-34/40/42/37 Done. Deploy testing: v76. |
| 30 jul 2026 | US-43/44/45 Done, validados en real. Deploy: v81. Harness 322/322. |
| 1 ago 2026 (día) | Sprint 5: US-46/47/48 Done. Dos rondas de preprod (pruebadeploy8, deployprueba4) — Ronda 1 con 6 tropiezos, Ronda 2 sin ninguno. StandUp: US-36 cerrado, bug de fecha investigado y cerrado. Harness 332/332. |
| 1 ago 2026 (noche) | **US-49 Done** — fix duplicación de eventos (BUG-001 a BUG-006 de Danilo). Causa: `attendee` en evento operativo + botón + `.ics` adjunto. Se quitó `attendee` (nutrición/pilates, incl. reagendar) y `.ics` adjunto (decisión de negocio). Quedan 4 botones. Harness 332→303. Deploy preprod v4. Commit `54ba637`. Validado en 3 cuentas. |
| 3 ago 2026 | Luis reportó falla intermitente de correos justo después del deploy de US-49 — **investigada y confirmada como cuota diaria de Gmail agotada, no un bug** (nota #52). Auditoría estática descartó regresión de código; confirmado reproduciendo en caliente, mensaje `Service invoked too many times for one day: email.`, 2 veces. No afecta producción real. Sin cambios de código. Gabi pidió 3 capturas para el manual de usuario — pendiente confirmar par de calendarios del punto 3. |

---

*Última actualización: 3 agosto 2026 — Sprint 5 completo: US-46/47/48/49 Done, validadas en real en preproducción (303/303 en harness). US-36 cerrado por decisión de equipo. Falla de correos del 3 ago confirmada como cuota de Gmail agotada, no un bug — nota #52. Pendientes: confirmar `git push` de `54ba637`, avisar a Luis/Danilo sobre re-test de BUG-001 a BUG-006 y cambio de resultado esperado en D-07 a D-10, bajar trigger de pilates a 1 min, decidir sobre el correo de cancelación, configurar `PILATES_SENDER_EMAIL` real + verificar alias en la cuenta real de Dani antes del deploy de producción, reemplazar correos placeholder, completar el manual de usuario (capturas pendientes para Gabi), documentar el modelo de doble calendario, y la reunión de deploy real programada para el martes.*