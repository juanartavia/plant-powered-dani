# CLAUDE.md — Plant Powered by Dani
## Sistema de Agendamiento Automatizado
> Documento vivo — actualizar conforme avanza el desarrollo
> Última actualización: 30 julio 2026 — **Sprint 4.** Hoy se cerraron **US-43** (cupos de pilates dinámicos vía calendario de disponibilidad) y **US-45** (duración dinámica de clases de pilates + trigger de sync cada 5 min), ambas **validadas en real contra la URL pública de testing**, no solo en el harness. Deploy activo: última versión sobre el deploymentId de testing (confirmar número exacto con `clasp deployments` antes de la próxima tarjeta — la sesión que cerró US-45 no dejó registrado el número final).

---

## 0. LÉEME PRIMERO — PARA EL PRÓXIMO CHAT

Si estás retomando este proyecto en un chat nuevo, este documento es tu única fuente de verdad. Antes de generar cualquier prompt para Claude Code:

1. Lee completo este documento, especialmente las secciones 11 (estado de sprints), 13 (notas técnicas — la #43 y la #46 son las más extensas: correos con adjuntos+imágenes, y el bug real de `getLastRow()`/`appendRow()` en Sheets), y 14/15 (método de trabajo y Trello).
2. **Todo el flujo de correos, gestión de citas, branding, botones de calendario, cupos de pilates y duración dinámica está Done y probado de punta a punta con datos/citas reales:**
   - **US-11 a US-14** — Familia completa de correos automatizados.
   - **US-13/US-30, US-32, US-33** — Notificaciones internas (nueva cita, asistencia confirmada, cancelación tardía).
   - **US-31, US-28, US-41** — Página de gestión de citas + brandbook + fix de título redundante.
   - **US-34** — Formato de fecha en español corregido (día-mes-año, no al revés).
   - **US-40** — Campo de fecha de nacimiento: reemplazado el `<input type="date">` nativo por un selector propio (Popover+Calendar+Dropdown), porque el nativo no se podía abrir con clic en cualquier parte del campo dentro del iframe de Apps Script, y además el `<select>` de mes/año no tenía estilo propio.
   - **US-42** — Notificación a Dani/instructora + Ali cuando un cliente reagenda 3 veces o más (cada vez, no solo la primera).
   - **US-37** — Correo de confirmación con 4 botones de calendario (Google/Outlook/Yahoo/Apple-iCal) + invitación `.ics` real adjunta, que dispara el prompt nativo de "Sí/No/Tal vez" en Gmail/Outlook — **confirmado en real**.
   - **US-43** — Cupos de pilates dinámicos: reemplaza el horario fijo hardcodeado ("sábados 10am") por clases marcadas por la instructora en un calendario de Google dedicado, con capacidad configurable por clase — **confirmado en real**.
   - **US-45** — Duración dinámica de clases de pilates (ya no fija en 60 min) + trigger de sincronización corriendo cada 5 minutos en vez de cada hora — **confirmado en real**.
3. **Bug crítico histórico, ya corregido:** los links de los correos usaban `ScriptApp.getService().getUrl()`, que devuelve `/dev` (deployment HEAD, roto) en vez de `/exec`. Corregido con `WEB_APP_URL` fija.
4. **Lección de arquitectura (US-28):** el portal se compila a un ÚNICO archivo HTML inlineado (`vite-plugin-singlefile`) — `frontend/public/` NO sirve para nada en producción.
5. **Gap de build (27 jul), corregido:** `backend/package.json` → `"build": "tsc && node copy-to-dist.js"`.
6. **Incidente grave de corrupción de OneDrive (27-28 jul), completamente recuperado.** Ver nota técnica correspondiente en sección 13. El proyecto vive en `C:\dev\plant-powered-dani` — **NUNCA** en una carpeta de OneDrive.
7. **Apps Script Web Apps corren dentro de un iframe cross-origin real, con implicaciones serias:**
   - `HTMLInputElement.showPicker()` lanza `SecurityError` si se llama desde ese iframe — **nunca usar esta API** para nada que dependa de abrirse dentro del portal (descubierto en US-40, confirmado contra producción real, no solo localhost).
   - `Logger.log()`/`console.log()` **no aparecen de forma confiable** en el panel de "Ejecuciones" para ejecuciones reales disparadas por el Web App (a diferencia de correr una función manualmente desde el editor) — para diagnósticos reales, escribir a una hoja de Google Sheets dedicada es más confiable. Ver `Debug_US37` en sección 8 (**sigue existiendo en el Sheet, decidir si se limpia o se deja como herramienta de diagnóstico permanente**).
   - **Cualquier prueba de una funcionalidad nueva debe hacerse contra la URL pública real (`/exec`), nunca solo contra `localhost`** — varios bugs (US-40, US-37) pasaban perfecto en local y fallaban en real, precisamente por el iframe cross-origin.
8. **Regla crítica de correos con imágenes + adjuntos, ver nota #43:** nunca embeber imágenes como `<img src="data:image/png;base64,...">` directo en un correo que también lleve un archivo adjunto real vía `GmailApp.sendEmail()` — Gmail descarta el adjunto en silencio. Usar siempre `inlineImages` (con `<img src="cid:...">`) para las imágenes cuando el correo también lleva adjuntos.
9. **NUEVO — regla crítica de Sheets, ver nota #46:** nunca llamar `sheet.getLastRow()` inmediatamente después de `sheet.appendRow()` dentro de un loop, sin flush entre medio — en Sheets real (no en el harness) puede devolver un número de fila desactualizado y hacer que la escritura aterrice sobre una fila vieja en vez de la recién creada. Calcular el número de fila localmente (a partir del largo de los datos ya leídos + un contador incremental) en vez de volver a preguntarle a Sheets dentro del loop.
10. **NUEVO — `clasp push` vs `clasp deploy`, distinción importante:** `clasp push` solo actualiza el HEAD que ve el editor de Apps Script (correr una función manualmente desde ahí SIEMPRE usa el código más reciente pusheado). La URL pública `/exec` que usa el portal y dispara los correos **NO se actualiza con `push`** — solo se mueve haciendo `clasp deploy` explícito sobre el `deploymentId` correspondiente. Si el código parece "no aplicarse" en el portal real después de un push, este es el primer sospechoso antes de pensar que el fix está mal.
11. **US-20 (token único)** cubierta al 100% por US-06/US-31 — pendiente que el usuario la cierre/archive en Trello.
12. **Pendientes de fondo, de baja urgencia, confirmados como seguros de dejar así:** coerción de fechas a Date en Sheets (cosmético), `findClientByEmail()` lee con TIME_ZONE en vez de UTC, acceso móvil sin validación formal con dispositivo externo.
13. **Destinatarios de notificaciones internas siguen en placeholder** — reemplazar antes de producción.
14. **Varios textos de copy siguen en BORRADOR**, pendientes de aprobación de Gabriela/Dani (lista en sección 11).
15. Flujo de trabajo de siempre: prompt → Claude Code ejecuta → **commit inmediato tras deploy** → **probar en real (URL pública) antes de marcar cualquier checkbox** → actualizar CLAUDE.md.
16. **Pedir siempre el checklist real de Trello antes de generar un prompt nuevo.**
17. **Antes de patchear este documento, confirmar que es la versión más completa y reciente.** Ya pasó dos veces que no lo era — ver nota crítica de recuperación en sección 13.
18. **`WEB_APP_URL` fija siempre, nunca `ScriptApp.getService().getUrl()`.**
19. **Lista de todo lo construido SIN diseño de Gabriela** (revisar con ella cuando haya oportunidad): botón "Agregar a mi calendario" (ahora expandido a 4 botones + invitación real, US-37), notificación interna con 3 variantes, correo al cliente al reagendar, correo de cancelación al cliente, toda la página de gestión de citas (US-31), plantilla de alerta de cancelación tardía (US-33), plantilla de reagendamientos múltiples (US-42), el selector de fecha de nacimiento propio (US-40).
20. **Pendiente de fondo, no urgente:** segunda carpeta de recuperación de OneDrive (con `.git` propio, `design-reference/`) nunca se terminó de auditar por si tiene el historial de git real que falta reconstruir.
21. `build.sh` de la raíz no ejecuta en `cmd.exe`/Windows — pendiente, no bloquea.
22. **US-36** (banner "Un usuario de Google Apps Script creó esta aplicación") — investigado a fondo, no se puede quitar con código; requiere página envoltorio (iframe) en otro dominio. **Pendiente de decisión del equipo** en reunión — ver sección 5.
23. **NUEVO — Siguiente tarjeta grande del roadmap: disponibilidad real desde Google Calendar para NUTRICIÓN** (mismo espíritu que US-43, pero para el flujo de Dani). Actualmente nutrición sigue usando constantes fijas (`WORKDAYS`/`WORKHOURS`) sin leer el Calendar real de Dani. El modelo acordado es el mismo que ya se implementó para pilates: sin marco fijo por defecto — Dani/Ali marcan explícitamente en un calendario dedicado (`Disponibilidad - Nutrición`, calendario separado del operativo, mismo patrón que `PILATES_AVAILABILITY_CALENDAR_ID` vs `PILATES_CALENDAR_ID`) los bloques de tiempo en que sí se puede agendar; si no marcan nada, no aparece ningún slot ese día. La diferencia con pilates: nutrición es agendamiento continuo (el bloque se "talla" en sub-slots de 60/45/15 min), pilates es clases discretas (cada evento = una clase completa). Aún no se ha creado la tarjeta de Trello para esto ni el calendario correspondiente — pendiente de iniciar.

---

## 1. CONTEXTO DEL PROYECTO

### El cliente
**Plant Powered by Dani** — estudio de nutrición y pilates en Costa Rica.
- **Dani**: nutricionista, admin principal del sistema.
- **Instructora de pilates**: cuenta separada bajo el mismo dominio. Pilates no tiene recordatorio de 48hrs.
- **Ali (secretaria)**: distribuye los links de agendamiento por WhatsApp. Recibe las notificaciones internas junto con Dani.

### El negocio
- Atiende clientes en **español e inglés**, incluyendo clientes en **Estados Unidos** (zonas horarias múltiples).
- Modalidades: presencial y virtual.
- Infraestructura: **Squarespace** + **Google Workspace** (Gmail, Calendar, Sheets, Drive, Forms, Meet).
- Dominio: `PlantPoweredbyDani.com`.
- **Squarespace fuera de alcance del MVP** — la cuenta de Dani no soporta bien iframes/código embebido en su plan actual (relevante para US-36).
- **Volumen de negocio:** 100-200 clientes por mes (dato relevante para US-36: muy por debajo del umbral de "alto volumen" que Google exige para el programa de whitelisting de Gmail Actions/schema.org).

### Facturación del proyecto
- Una sola factura electrónica al final. Pago en colones, transferencia a cuenta BAC de AutomáTica.

### Dirección física de la consulta ✅ CONFIRMADO
```
Santa Ana Town Center
Work Space Republic – Segundo piso
Consultorio #33
```

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
Nombre, Apellido, Correo, Teléfono, Tipo de identificación + Número, Fecha de nacimiento (mín. 15 años, **selector propio desde US-40**), Modalidad. Sin notas. Idioma solo en Paso 1.

### Edad mínima: 15 años ✅ Doble capa frontend+backend en `upsertClient()`.

### Flujo del formulario en 3 pasos ✅ Calendario → Correo → Datos.

---

### 3-a. Correos automatizados — modelo de zona horaria (regla permanente)

| Correo | Audiencia | Zona horaria mostrada |
|---|---|---|
| Confirmación (US-12) | Cliente | La DEL CLIENTE (`clientTimezone`) |
| Recordatorio 48hrs (US-14) | Cliente | La DEL CLIENTE |
| Reagendamiento/cancelación (US-32) | Cliente | La DEL CLIENTE |
| Notificación interna (US-13/30/32) | Dani/Ali | SIEMPRE Costa Rica (`TIME_ZONE`) |
| Alerta de cancelación tardía (US-33) | Dani/instructora/Ali | SIEMPRE Costa Rica |
| Alerta de reagendamientos múltiples (US-42) | Dani/instructora/Ali | SIEMPRE Costa Rica |

**Formato de fecha en español (US-34, 29 jul):** corregido el orden a día-mes-año en las 4 pantallas afectadas (pantalla de "gracias", paso de calendario, y las de US-31) — antes salía en el orden equivocado en español. Inglés no se tocó, ya estaba bien.

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
- **Desde US-37:** `?action=ics&token=...` → endpoint que genera un `.ics` descargable con los datos ACTUALES de la cita (se regenera en cada clic, así que refleja reagendamientos posteriores al envío del correo original).

### 3-e. Página visual de gestión de citas (US-31) — ✅ Done
4 pantallas: menú, confirmar asistencia, reagendar, cancelar. Título redundante quitado (US-41). Validado en real.

**⚠️ Nota de arquitectura crítica (descubierta en US-40, 29 jul):** el portal corre dentro de un **iframe cross-origin real** (`script.google.com` → `*.googleusercontent.com`). Esto bloquea `showPicker()` con `SecurityError` — cualquier funcionalidad nueva que dependa de APIs del navegador debe verificarse explícitamente contra este contexto, no asumir que "funciona en localhost" es suficiente.

### 3-f. Bug crítico: `getUrl()` sensible al contexto de ejecución — RESUELTO
Fix: constante `WEB_APP_URL` fija.

### 3-g. Correo al cliente al reagendar/cancelar (US-32)
Reagendar reutiliza `renderConfirmationEmail()` (por lo que **hereda automáticamente** los botones de calendario y el adjunto `.ics` de US-37, sin cambios adicionales). Cancelar usa plantilla propia sin botones de calendario (no tiene sentido ofrecer agendar algo que se acaba de cancelar).

### 3-h. US-32 — Notificación interna de asistencia confirmada — ✅ Done

### 3-i. Brandbook del portal (US-28) — ✅ Done
Paleta `#2C3F27`/`#F9BFC6`/`#B9BD5B`/`#FFF9F1`/`#EFE7DA`. Tipografía Jost + Century Gothic. Logo real.

### 3-j. US-33 — Alerta de cancelación tardía (RF-2.5) — ✅ Done
Badge rojo `#C0392B`. Destinatarios: Nutrición → Dani+Ali; Pilates → instructora+Ali (Script Properties `DANI_EMAIL`/`INSTRUCTORA_EMAIL`/`ALI_EMAIL`). Columna `cancelaciones_tardias` por cita (col 20 Nutrición, col 17 Pilates).

**Nota técnica sobre el emoji del asunto:** el emoji ⚠️ salía corrupto (`?????`) en Gmail real hasta que se reemplazó por la entidad HTML numérica `&#9888;` — mismo patrón de fix aplicado después a 📅 en US-37 (ver nota #43).

### 3-k. US-40 — Campo de fecha de nacimiento (Sprint 4, 29 jul, 3 rondas) — ✅ Done

**Problema original del checklist:** el `<input type="date">` nativo solo se abría al hacer clic exactamente en el ícono de calendario, no en cualquier parte del campo.

**Ronda 1 (fallida en producción):** se intentó usar `focus()` + `showPicker()` con mejora progresiva. Funcionaba perfecto en `localhost`, pero **fallaba silenciosamente en producción real** — `showPicker()` lanza `SecurityError` cuando se llama desde el iframe cross-origin de Apps Script (confirmado con Playwright apuntando directo a la URL pública). Lección: probar SIEMPRE contra la URL pública real, nunca solo local.

**Ronda 2 (solución definitiva):** se reemplazó el `<input type="date">` nativo por un trigger `<button>` + `Popover` + `Calendar` (los mismos componentes que ya usa el calendario principal de selección de cita), con `captionLayout="dropdown"` para saltar directo a años lejanos. Preserva: edad mínima 15 años (año ni siquiera aparece como opción si haría al cliente menor de edad — más estricto que el input nativo original), validación bilingüe de campo requerido, contrato de datos intacto (input hidden, mismo formato `yyyy-MM-dd`).

**Ronda 3 (bug visual encontrado por el usuario):** el `<select>` nativo de mes/año de `react-day-picker` no tenía estilo propio — se veía con el tema oscuro del sistema operativo, ilegible. Fix: componente `CalendarDropdown` propio inyectado vía `components={{ Dropdown: CalendarDropdown }}`, reutilizando el mismo patrón Popover+Command que ya usan `LanguageDropdown`/`TimezoneDropdown`.

**Validado en real** (URL pública, no local): clic en label/borde/centro abre el selector; menú de mes/año con estilo correcto incluso en tema oscuro del sistema; límite de edad exacto verificado.

### 3-l. US-42 — Notificación de reagendamientos múltiples (Sprint 4, 29 jul) — ✅ Done
Columna nueva `contador_reagendamientos` por cita (col 24 Nutrición, col 18 Pilates) — nunca existió antes en ninguna de las dos pestañas, requirió 2 migraciones nuevas. Se incrementa en cada `rescheduleBooking()` exitoso (el reagendamiento SIEMPRE se permite, esta notificación es puramente informativa). A partir del 3er reagendamiento (inclusive) y **en cada uno posterior** (3ro, 4to, 5to... — decisión explícita del usuario, no solo la primera vez que se cruza el umbral) se envía una alerta a Dani/instructora+Ali (mismo ruteo de US-33). Plantilla nueva con badge ámbar `#C9791A` (distinto a los 4 colores ya usados). Bloqueo por ventana vencida NO incrementa el contador ni dispara la alerta. Fallo de Gmail no revierte nada. **Validado en real** por el usuario (reagendó la misma cita 3+ veces).

### 3-m. US-37 — Correo de confirmación con botones de calendario e invitación real (Sprint 4, 29 jul) — ✅ Done, ver nota técnica #43 para la investigación completa

**Alcance:** reemplaza el botón único experimental de Google Calendar (de US-11/12) por 4 botones (Google/Outlook/Yahoo/Apple-iCal) en las 4 plantillas de confirmación (nutrición/pilates × es/en), más una invitación `.ics` real **adjunta directamente al correo**, que dispara el prompt nativo de "Sí/No/Tal vez" en Gmail/Outlook sin que el cliente tenga que hacer clic en nada — confirmado en real.

**Nuevas funciones/mecanismos (backend):**
- `buildAddCalLinks()` — arma los 3 deep-links (fechas en UTC, formato correcto por proveedor — Outlook usa UTC extendido `yyyy-MM-ddTHH:mm:ssZ`, distinto del básico de Google/Yahoo) + el link al endpoint propio de `.ics`. Desde US-45, usa la duración real de la clase para pilates, no una constante fija.
- `buildBookingIcsContent()`/`buildIcsContent()` — generan el `.ics` real (RFC 5545), con `METHOD:PUBLIC` para el endpoint de descarga y `METHOD:REQUEST` + `ATTENDEE` para el adjunto del correo (`SEQUENCE` reutiliza el contador de reagendamientos de US-42, sin necesitar un contador nuevo).
- `doGet(?action=ics&token=...)` — nuevo branch, evaluado ANTES del branch genérico de `?token=` (para no romper la SPA de US-31). Token inválido/cita cancelada → error en texto plano, nunca un `.ics` roto.
- `buildInlineImagesForTemplate()` — arma el mapa `{cid: Blob}` de las imágenes del correo (logo, flor/kettlebell), ver nota #43 para por qué esto fue necesario.

**Reagendamiento hereda todo automáticamente** (misma función `renderConfirmationEmail()`), sin cambios adicionales. **Cancelación NO lleva botones de calendario** (no tiene sentido, decisión de diseño).

**Decisión de negocio tomada durante esta tarjeta:** el `.ics` adjunto incluye `ORGANIZER` (Dani/instructora según tipo de cita) — si el cliente responde al prompt nativo, le puede llegar un correo de RSVP a esa cuenta. Aceptado dado el volumen bajo del negocio (100-200/mes).

**Trade-off de testing:** Yahoo solo se verificó parcialmente (el link navega bien, sin cuenta real para confirmar el evento creado) — cuenta de Yahoo bloqueada al crearla por verificación de SMS. Pendiente si alguien del equipo consigue una cuenta.

### 3-n. US-43 — Cupos de pilates dinámicos vía calendario de disponibilidad — ✅ Done, confirmado en real (30 jul)

**Motivación:** Dani quería poder ofrecer clases de pilates especiales (fecha/hora/capacidad distintas a la clase regular), algo imposible con el horario fijo hardcodeado ("sábados 10am"). Se presentaron varias opciones y se escogió la más simple: la instructora marca las clases en un calendario de Google dedicado, y ajusta el cupo máximo directamente en el Sheet si una clase necesita una capacidad distinta al default.

**Modelo de disponibilidad (decisión de arquitectura, ver también punto 23 de la sección 0):** el calendario `Disponibilidad - Pilates` es **aditivo**, no sustractivo — nada está disponible hasta que la instructora marca explícitamente un evento ahí. Es un calendario **separado** del operativo (`PILATES_CALENDAR_ID`, donde el sistema crea los eventos reales de cada reserva) — nunca deben confundirse ni fusionarse, tienen Script Properties distintas.

**Flujo de sincronización:**
1. La instructora marca cada clase (regular o especial, incluyendo recurrencias semanales) como evento en `Disponibilidad - Pilates`.
2. Un trigger de tiempo (cada 5 min desde US-45, antes cada hora) corre `syncPilatesClassesToCuposSheet()`, que crea automáticamente una fila en `Cupos_Pilates` por cada clase nueva detectada — sin duplicar filas ya sincronizadas (dedup por `disponibilidad_event_id`, no por fecha/hora, para tolerar que la instructora mueva una clase de horario) y sin pisar `max_participantes` ya editado a mano.
3. `max_participantes` queda **vacío** por defecto (nunca se escribe "5" a la fuerza) — la lectura interpreta celda vacía como 5, y un número escrito como ese número exacto.
4. El cupo real de cada clase se calcula **en vivo**: `max_participantes` (o 5 default) menos inscripciones activas (`Agendada`/`Reagendada`) contadas directamente en la pestaña "Pilates" — la columna `inscritos` de `Cupos_Pilates` queda como un valor cacheado/informativo, nunca la fuente de verdad.
5. Al llegar a 0 cupo, la clase deja de ofrecerse en el portal. Cancelar libera el cupo de inmediato (recalculado en vivo, no vía rollback manual de un contador).
6. Reagendar hacia una clase llena se bloquea con `CLASE_LLENA`, sin afectar la cita original del cliente.

**Conflicto de schema detectado y resuelto ANTES de escribir código (ver nota #45):** las columnas `event_id`/`meet_link` de `Cupos_Pilates` ya estaban en uso productivo para el evento OPERATIVO — se agregó una columna nueva y separada (`disponibilidad_event_id`, columna G) en vez de repurpose, evitando romper `bookPilatesCalendarEvent`/`joinPilatesSlot`/`leavePilatesSlot`.

**Bug real encontrado y corregido durante las pruebas en real (ver nota #46):** `getLastRow()` llamado justo después de `appendRow()`, repetidamente dentro de un loop y sin flush, hacía que varias escrituras de `syncPilatesClassesToCuposSheet()` aterrizaran sobre filas viejas en vez de crear filas nuevas — solo visible probando contra el Sheet real, el harness no lo detectó (su mock de Sheets es un array de JS síncrono, siempre consistente).

**Validado en real:** el portal muestra exactamente las clases marcadas en el calendario (incluyendo expansión correcta de un evento recurrente semanal en instancias individuales), respeta el cupo configurado por clase, y libera/bloquea cupo correctamente al cancelar/reagendar.

### 3-o. US-45 — Duración dinámica de clases de pilates + trigger de sync cada 5 min — ✅ Done, confirmado en real (30 jul)

**Motivación:** durante las pruebas reales de US-43 se descubrió que el sistema seguía asumiendo 60 minutos fijos para toda clase de pilates (`getDurationForType("pilates")`), ignorando la duración real del evento en `Disponibilidad - Pilates`. Se decidió resolverlo de inmediato en la misma ronda, dado el bajo costo relativo de hacerlo con el contexto ya fresco.

**Cambios:**
- Columna nueva `duracion_minutos` (columna H) en `Cupos_Pilates`, poblada por el sync a partir de la diferencia real `fin - inicio` del evento de disponibilidad.
- Toda la cadena de pilates (disponibilidad mostrada al cliente, cálculo de hora de fin al reservar, reagendamiento — siempre toma la duración de la clase **destino**, no la original —, botones "agregar al calendario", `.ics` adjunto) usa la duración real por clase en vez de la constante fija. Nutrición no se tocó — sigue usando duración fija por tipo de cita.
- **Ajuste de UX pedido por el usuario:** antes de que el cliente seleccione una fecha/hora específica, el portal ya no muestra ningún número de minutos ("Clase de Pilates" a secas, sin "(60 min)" por defecto) — el número aparece solo después de elegir un slot concreto, con su duración real.
- **Fix del trigger de sincronización:** `installPilatesAvailabilitySyncTrigger()` no borraba ningún trigger existente antes de instalar uno nuevo (podía dejar dos triggers de la misma función corriendo en paralelo si se volvía a ejecutar). Se corrigió para que siempre borre cualquier trigger previo de `syncPilatesClassesToCuposSheet` antes de instalar el nuevo. Aprovechando el cambio, se bajó la frecuencia de cada hora a **cada 5 minutos**.

**Gotcha de deploy encontrado en esta tarjeta (ver nota #46/punto 10 de la sección 0):** después de pushear el fix, el portal público seguía mostrando "60 min" — no era un bug de código, sino que `clasp push` no mueve la URL pública `/exec`; hacía falta un `clasp deploy` explícito adicional. Las funciones corridas manualmente desde el editor (como el trigger) sí usan siempre el código más reciente pusheado, por eso esas se veían bien de inmediato mientras el portal seguía atrasado.

**Validado en real:** una clase de prueba de 45 min mostró correctamente "(45 min)" en el portal, en el correo de confirmación, y en el `.ics` adjunto; una clase regular de 60 min se comportó exactamente igual que antes de esta tarjeta (regresión confirmada); el trigger quedó instalado corriendo cada 5 minutos, sin duplicados.

---

## 4. TIPOS DE CITA

### Nutrición (flujo Dani)
| Tipo | ?type= | Duración | Modalidad |
|------|--------|----------|-----------|
| Consulta inicial | `initial` | 60 min | Presencial o virtual |
| Cita de seguimiento | `followup` | 45 min | Presencial o virtual |
| Solo medición | `measurement` | 15 min | Solo presencial |

*(Pendiente: nutrición sigue con `WORKDAYS`/`WORKHOURS` fijos, sin leer Calendar real — ver punto 23 de la sección 0, próxima tarjeta grande del roadmap.)*

### Pilates (flujo instructora)
| Tipo | ?type= | Duración | Modalidad | Formato | Horario | Ventana mínima | Cupo |
|------|--------|----------|-----------|---------|---------|----------------|------|
| Clase de pilates | `pilates` | **Dinámico (US-45)** — la duración real de cada clase se lee del evento de Calendar, ya no una constante fija de 60 min | Virtual únicamente | Grupal | **Dinámico (US-43)** — la instructora marca las clases en el calendario `Disponibilidad - Pilates`, ya no un horario fijo | 12 horas | 5 (default) — ajustable por clase en `Cupos_Pilates` |

**Pilates NO tiene recordatorio de 48hrs.**

**Horario y duración ya NO son fijos desde US-43/US-45 (30 jul, ✅ Done, validado en real):** hasta antes de estas tarjetas, la ÚNICA clase disponible era siempre "sábados 10 AM, 60 min" (constantes `PILATES_DAY_OF_WEEK`/`PILATES_START_HOUR`, ya eliminadas del código). Ahora la instructora marca cada clase (regular o especial, con horario y duración propios) como un evento en el calendario de Google `Disponibilidad - Pilates` (Script Property `PILATES_AVAILABILITY_CALENDAR_ID`) y el portal ofrece exactamente esas clases, con su duración real, filtradas por cupo real. Ver sección 8 (schema de `Cupos_Pilates`), sección 10 (funciones nuevas) y notas técnicas #45/#46 para el detalle completo.

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

**⚠️ US-36, pendiente de decisión del equipo:** el banner "Un usuario de Google Apps Script creó esta aplicación" no se puede quitar con código. Investigado a fondo:
- **Marcado schema.org/Event de Gmail:** requiere aprobación de whitelisting de Google (mínimo ~100 correos/día sostenido), muy por encima del volumen real del negocio (100-200/**mes**) — casi seguro no calificaría. Solo se ve dentro de la misma cuenta de Gmail (self-send), dando una falsa sensación de que funciona en testing.
- **Página envoltorio (iframe) en otro dominio:** técnicamente viable (GitHub Pages/Cloudflare Pages/subdominio propio), pero cambia el modelo completo de distribución de links. Pendiente de decisión de equipo en su próxima reunión.
- Acortar los links (bit.ly, etc.) es un problema DISTINTO al del banner — no lo resuelve, solo acorta el texto.

---

## 6. ACTORES DEL SISTEMA

| Actor | Rol |
|-------|-----|
| **Dani** | Admin/nutricionista. Recibe notificación interna en cada acción. |
| **Ali (secretaria)** | Distribuye links por WhatsApp. Recibe las mismas notificaciones que Dani. |
| **Instructora de pilates** | Calendar y correo propios. Marca las clases disponibles en `Disponibilidad - Pilates` y puede ajustar `max_participantes` directamente en `Cupos_Pilates`. |
| **Cliente (ES/EN)** | Agenda, reagenda, cancela, confirma asistencia. Mayor de 15 años. |
| **Google Apps Script** | Motor de automatización. |

### Checklist de acceso necesario para producción
- Compartir Calendar real de la instructora con la cuenta de deploy (tanto el operativo como `Disponibilidad - Pilates`).
- Reemplazar correos placeholder de Dani/Ali/instructora por los reales.
- Deploy final bajo cuenta de Dani.

---

## 7. FLUJOS COMPLETOS

### Flujo principal — Agendar cita de nutrición ✅ 100% COMPLETO
```
1. Ali/Dani comparte link ?type=... por WhatsApp
2. Cliente ve calendario (zona propia), elige fecha/hora
3. Ingresa correo → busca en "Clientes"
4. Completa datos (valida edad con selector propio US-40, upsert)
5. Apps Script re-verifica ventana + LockService
6. Escribe fila (fecha/hora protegidas como texto plano)
7. Crea evento en Calendar + Meet si es virtual
8. Envía correo de confirmación — CON 4 botones de calendario + invitación .ics
   real adjunta (US-37): logo/flor vía inlineImages, no base64 en <img>
9. Envía notificación interna a Dani/Ali
10. [Solo nutrición] 47-49hrs antes: recordatorio con confirmar/reagendar/cancelar
11. Cliente hace clic en cualquiera de los 3 botones → página visual (US-31):
    - Confirmar → asistencia_confirmada=true → notificación interna (US-32)
    - Reagendar → nuevo horario → Sheet/Calendar actualizados → notificación
      interna + correo al cliente (hereda botones de calendario de US-37)
      → Si es el 3er reagendamiento o más: alerta especial a Dani/instructora+Ali (US-42)
    - Cancelar → Sheet/Calendar actualizados → notificación interna + correo
      de cancelación al cliente (sin botones de calendario)
      → Si fue con <24hrs: alerta especial de cancelación tardía (US-33)
```

### Flujo pilates ✅ 100% COMPLETO (incluye US-43/US-45)
```
1. La instructora marca cada clase (fecha/hora/duración) como evento en
   "Disponibilidad - Pilates" — incluye soporte de eventos recurrentes.
2. syncPilatesClassesToCuposSheet() (trigger cada 5 min) crea la fila
   correspondiente en Cupos_Pilates si no existe todavía (max_participantes
   y duracion_minutos calculados/vacíos según corresponda).
3. La instructora puede ajustar max_participantes directamente en el Sheet
   para cualquier clase (default 5 si lo deja vacío).
4. Ali/Dani/instructora comparte el link ?type=pilates por WhatsApp — el
   mismo link para todas las clases, regulares o especiales.
5. Cliente ve solo las clases con cupo disponible, con su duración real.
6. Resto del flujo (correo, notificación interna, reagendar/cancelar,
   cancelación tardía, reagendamientos múltiples) igual que nutrición,
   salvo que NO hay recordatorio de 48hrs y el cupo se valida en vivo en
   cada paso (agendar, reagendar hacia otro slot, cancelar).
```

### Flujo reagendamiento/cancelación ✅ 100% completo

---

## 8. SCHEMA DE GOOGLE SHEETS

### Spreadsheet de testing
- **ID:** 16M6WUqMAK9XkVoIutIn9UkJojlS5biT5o470GySs5gw
- **URL:** https://docs.google.com/spreadsheets/d/16M6WUqMAK9XkVoIutIn9UkJojlS5biT5o470GySs5gw/edit

### Pestaña "Nutrición"
```
token | nombre | apellido | correo | telefono | tipo_id | numero_id | fecha_nacimiento |
tipo_cita | fecha | hora | zona_horaria_cliente | modalidad | idioma |
meet_link | estado | fecha_creacion | recordatorio_enviado | show_no_show |
cancelaciones_tardias (col 20, US-33) | requiere_pago (legacy) | event_id |
asistencia_confirmada | contador_reagendamientos (col 24, US-42, NUEVA)
```
**Estados posibles:** `Agendada` → `Reagendada` → `Cancelada`, también `Error_Calendar`.

### Pestaña "Pilates"
```
token | nombre | apellido | correo | telefono | tipo_id | numero_id | fecha_nacimiento |
fecha_clase | hora_clase | zona_horaria_cliente | idioma |
estado | fecha_inscripcion | recordatorio_enviado | show_no_show |
cancelaciones_tardias (col 17, US-33) | contador_reagendamientos (col 18, US-42, NUEVA)
```
Es la fuente de verdad real del cupo de cada clase (conteo en vivo de filas activas, ver US-43).

### Pestaña "Cupos_Pilates"
```
fecha_clase | hora_clase | inscritos | max_participantes | event_id | meet_link |
disponibilidad_event_id (columna G, US-43) | duracion_minutos (columna H, US-45)
```
**Significado de cada columna (actualizado, ✅ Done y validado en real):**
- `inscritos` (columna C) — valor CACHEADO/informativo únicamente (se actualiza automáticamente en cada reserva/cancelación/reagendamiento para que la instructora lo vea de un vistazo). **Nunca** es la fuente de verdad del cupo — eso es un conteo en vivo desde la pestaña "Pilates" (`getAvailableCapacityForClass()`/`countActivePilatesRegistrations()`).
- `max_participantes` (columna D) — puede quedar VACÍA (se interpreta como default de 5). La instructora escribe un número distinto para ajustar el cupo de una clase específica, y el sync nunca lo pisa.
- `event_id`/`meet_link` (columnas E/F) — el evento del calendario OPERATIVO (`PILATES_CALENDAR_ID`) que el sistema mismo crea cuando un cliente agenda de verdad. Sin cambios de significado desde antes de US-43.
- `disponibilidad_event_id` (columna G, US-43) — el ID del evento del calendario `Disponibilidad - Pilates` (`PILATES_AVAILABILITY_CALENDAR_ID`) que originó esta fila. Usado únicamente por `syncPilatesClassesToCuposSheet()` para deduplicar (por evento, no por fecha/hora — tolera que la instructora mueva una clase de horario sin duplicar fila). Deliberadamente SEPARADA de `event_id`/`meet_link` — ver nota técnica #45.
- `duracion_minutos` (columna H, US-45) — la duración real de la clase, calculada como `fin - inicio` del evento de disponibilidad. Vacía solo en el caso de red de seguridad (fila creada fuera del flujo normal); en la práctica el sync siempre la puebla.

### Pestaña "Clientes"
```
correo | nombre | apellido | telefono | tipo_id | numero_id | fecha_nacimiento | idioma |
cancelaciones_tardias | requiere_pago | cliente_nutricion | cliente_pilates
```

### Pestaña "Debug_US37" (NUEVA, 29 jul — herramienta de diagnóstico)
```
timestamp | mensaje
```
Creada durante la investigación de US-37 porque `Logger.log()`/`console.log()` no aparecían de forma confiable en ejecuciones reales del Web App. Se usó para: confirmar la construcción del adjunto `.ics`, verificar contra Gmail real (`GmailApp.search()`+`getAttachments()`) qué adjuntos llegaban de verdad, y las pruebas de control (A/B) que aislaron la causa raíz. **Sigue existiendo en el Sheet — pendiente decidir si se limpia/vacía o se deja como herramienta de diagnóstico permanente para futuros problemas similares.**

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
| RF-2.2 | Correos de nutrición desde Dani, pilates desde instructora | ⚠️ Parcial — todo sale desde cuenta de testing |
| RF-2.3 | Notificación interna en cada acción | ✅ Done |
| RF-2.4 | Recordatorio 48 hrs (solo nutrición) | ✅ Done |
| RF-2.5 | Notificación a Dani/Ali/instructora si cancelación tardía | ✅ Done — US-33 |
| RF-2.6 | Frontend de reagendar/cancelar/confirmar asistencia | ✅ Done — US-31 |
| (nuevo) | Look & feel según brandbook | ✅ Done — US-28 |
| (nuevo) | Quitar título redundante en vista de cancelación | ✅ Done — US-41 |
| (nuevo) | Formato de fecha en español correcto | ✅ **Done — US-34** |
| (nuevo) | Campo de fecha de nacimiento clic-en-cualquier-parte | ✅ **Done — US-40** |
| (nuevo) | Notificación de reagendamientos múltiples (3ro+) | ✅ **Done — US-42** |
| (nuevo) | Botones de calendario + invitación .ics real | ✅ **Done — US-37** |
| (nuevo) | Cupos de pilates dinámicos vía calendario de disponibilidad | ✅ **Done — US-43** |
| (nuevo) | Duración dinámica de clases de pilates + trigger de sync cada 5 min | ✅ **Done — US-45** |
| (pendiente) | Quitar banner de Google Apps Script | ⏸️ US-36 — decisión de equipo pendiente |
| (pendiente) | Disponibilidad real desde Calendar para NUTRICIÓN | 📋 Próxima tarjeta grande — ver punto 23 sección 0 |

---

## 10. STACK TÉCNICO

### Constantes clave
```typescript
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwNUEjG8CXo2D5bk2eq1w6wBrme9XqJpCqOt-TkP0otTypiXd7GCEk7L7uFhdDOLCaJ/exec";
// NO usar ScriptApp.getService().getUrl() para construir links propios.

const NOTIFICACION_INTERNA_DESTINATARIOS = ["plantpoweredani.testing@gmail.com", "plantpoweredani.testing@gmail.com"];
// TODO: reemplazar por correos reales de Dani y Ali antes de producción.

// Script Properties (US-33/US-42/US-37 comparten el mismo ruteo):
// DANI_EMAIL, INSTRUCTORA_EMAIL, ALI_EMAIL

// Script Properties de calendario de pilates — DOS propiedades DISTINTAS, no confundir:
// PILATES_CALENDAR_ID              → calendario OPERATIVO (sin cambios desde US-10): donde
//                                     el sistema crea el evento real cuando un cliente agenda.
// PILATES_AVAILABILITY_CALENDAR_ID → calendario "Disponibilidad - Pilates" (US-43, de solo
//                                     lectura para el sistema): donde la instructora marca
//                                     qué clases va a ofrecer. Ya creado y en uso en testing.
```

### Funciones principales (backend, `backend/src/app.ts`)
```typescript
// US-11/US-12
renderConfirmationEmail(params): { subject, htmlBody, icsAttachment, inlineImages }
// Arma y devuelve el adjunto .ics real (US-37) y el mapa de imágenes en línea
// (US-37, nota #43) — ambos con degradación con gracia propia si fallan (el
// correo se sigue enviando igual). Desde US-45, usa la duración real de la
// clase para pilates (parámetro durationMinutes opcional, default a
// getDurationForType si no se especifica).

// US-13/US-30
renderNotificacionInterna(params), sendNotificacionInterna(params)

// US-14
renderRecordatorio48h(), sendRemindersJob(), installRemindersTrigger(),
confirmAttendance(token), buildBookingActionLink(token, accion)

// US-31 — backend
doGet(e) // branches: ?action=ics (US-37) → ?token= (SPA) → portal normal
getManageBookingInfo(token)

// US-32
renderNotificacionInternaConfirmada(), sendNotificacionInternaConfirmada(),
renderCancellationEmail() // sin botones de calendario

// US-33
notifyLateCancellation(), markLateCancellationOnBookingRow(),
getLateCancellationRecipients(esPilates), setupLateCancellationEmailProperties(),
renderNotificacionCancelacionTardia(), sendNotificacionCancelacionTardia(),
addCancelacionTardiaColumnToPilates() // migración manual ejecutada

// US-42
incrementRescheduleCounterOnBookingRow(),
addContadorReagendamientosColumnToNutricion() // migración manual ejecutada
addContadorReagendamientosColumnToPilates()    // migración manual ejecutada
formatOrdinalReagendamiento(), buildReagendamientosMultiplesSubject(),
renderNotificacionReagendamientosMultiples(), sendNotificacionReagendamientosMultiples(),
notifyMultipleReschedules(), testSendNotificacionReagendamientosMultiples()

// US-37
buildAddCalLinks(params): { addCalGoogleLink, addCalOutlookLink, addCalYahooLink, addCalIcsLink }
buildBookingIcsContent(params): string // .ics crudo, reusado por endpoint y adjunto
buildInlineImagesForTemplate(isPilates, idioma): { [cid: string]: Blob }
verifySentEmailAttachmentsViaGmail() // diagnóstico — confirma contra Gmail real
                                       // qué llegó, no solo nuestras variables
describeError(error) // logging reforzado (.message + .toString() + .stack)
logDebugUS37(mensaje) // escribe a la hoja Debug_US37, no depende de Logger/console

// Fixes de fecha/coerción
normalizeSheetDateCell(value, pattern), appendBookingToSheet(...)

// US-43 — cupos de pilates dinámicos — ✅ Done, validado en real
getPilatesAvailabilityCalendarId() // getter de PILATES_AVAILABILITY_CALENDAR_ID
getPilatesAvailabilityEvents(): PilatesClassSlot[] // lee el calendario de disponibilidad
                                                     // (Calendar.Events.list, singleEvents:true
                                                     // — expande recurrencias), única función
                                                     // que debe leerlo, nunca escribe ahí
syncPilatesClassesToCuposSheet() // refleja las clases del calendario en Cupos_Pilates,
                                   // idempotente (dedup por disponibilidad_event_id, nunca
                                   // por fecha/hora). FIX REAL (ver nota #46): ya no usa
                                   // getLastRow() dentro del loop tras appendRow() — calcula
                                   // el número de fila localmente. Envuelta en LockService.
installPilatesAvailabilitySyncTrigger() // instala/reinstala el trigger — SIEMPRE borra
                                          // cualquier trigger previo de esta función antes de
                                          // crear el nuevo (fix US-45, antes hacía no-op si ya
                                          // existía uno, con riesgo de duplicados). Frecuencia
                                          // actual: everyMinutes(5) (antes everyHours(1)).
addDisponibilidadEventIdColumnToCuposPilates() // migración de la columna G, ejecutada
addDuracionMinutosColumnToCuposPilates() // migración de la columna H (US-45), ejecutada
getAvailableCapacityForClass(fecha, hora): number // ÚNICA función que decide si una clase
                                                    // tiene cupo — max_participantes
                                                    // (Cupos_Pilates, default 5) menos
                                                    // countActivePilatesRegistrations()
countActivePilatesRegistrations(fecha, hora): number // fuente de verdad real del cupo:
                                                       // cuenta filas 'Agendada'/'Reagendada'
                                                       // en "Pilates" en vivo
refreshCuposPilatesInscritosCache(fecha, hora) // actualiza la columna cacheada "inscritos"
                                                 // (nunca decide disponibilidad)
findCuposPilatesRow(cuposData, fecha, hora): number // helper de lookup

// US-45 — duración dinámica de pilates — ✅ Done, validado en real
getPilatesClassDurationMinutes(fecha, hora): number // ÚNICA fuente de verdad para la
                                                       // duración de una clase de pilates ya
                                                       // agendada/por agendar — lee
                                                       // duracion_minutos de Cupos_Pilates,
                                                       // default a getDurationForType("pilates")
                                                       // (60) con gracia si la fila no existe
```

### Frontend
```
frontend/src/components/manage-booking.tsx  // 4 pantallas de gestión de citas
frontend/src/hooks/useManageBookingInfo.tsx / useConfirmAttendance.tsx /
                    useCancelBooking.tsx / useRescheduleBooking.tsx
frontend/src/index.css                      // paleta + @font-face Jost (US-28)
frontend/src/assets/logo.png, fonts/Jost-*.ttf

// US-40: selector de fecha de nacimiento propio dentro de calendar-picker.tsx
// - Trigger <button> + Popover + Calendar (react-day-picker), captionLayout="dropdown"
// - CalendarDropdown: componente propio inyectado vía components={{ Dropdown: ... }},
//   reemplaza el <select> nativo de mes/año (sin estilo propio, ilegible en tema oscuro)
// - Input hidden sincronizado, mismo formato yyyy-MM-dd — sin cambios en el backend

// US-45: duración dinámica en el frontend
// - frontend/src/models/Timeslots.tsx: cada slot carga su durationMinutes real
// - frontend/src/hooks/useGoogleTimeslots.tsx: expone slotDurations (ISO → minutos)
// - calendar-picker.tsx: el título ("Clase de Pilates (X min)") se arma dinámicamente
//   según la clase seleccionada — antes de seleccionar, muestra solo "Clase de Pilates",
//   sin ningún número por defecto. Nutrición sigue con sus textos fijos de siempre.
```
`CalendarTimeslotPicker` exportado desde `calendar-picker.tsx` para reutilizar en reagendar.

### Templates de correo (backend/templates/)
```
correo_confirmacion_{nutricion,pilates}_{es,en}.html  // US-37: 4 botones de
  calendario + imágenes vía cid: (ya NO base64 directo, ver nota #43)
correo_cancelacion_cliente_{es,en}.html               // sin botones de calendario
notificacion_interna_nueva_cita.html                  // 3 variantes de tipoAccion
notificacion_interna_confirmada.html                  // US-32
notificacion_cancelacion_tardia.html                  // US-33, badge rojo
notificacion_reagendamientos_multiples.html           // US-42, badge ámbar #C9791A
recordatorio_48h_nutricion_{es,en}.html

// Extraídos de los <img base64> originales (US-37):
asset_logo_pph.html            // logo compartido (nutrición es/en, pilates es)
asset_flor_pph.html            // flor decorativa (nutrición)
asset_kettlebell_pph.html      // kettlebell decorativo (pilates)
asset_logo_pilates_en_pph.html // logo propio de pilates EN (divergencia preexistente, no un bug)
// Cada archivo contiene SOLO el string base64, cargado vía
// HtmlService.createHtmlOutputFromFile().getContent() + Utilities.base64Decode()
```
No se agregaron plantillas nuevas en US-43/US-45 — ambas reutilizan las plantillas de pilates ya existentes, ahora con datos dinámicos (fecha/hora/duración) en vez de valores fijos.

### Build pipeline (corregido 27 jul, nota #35)
```
backend/package.json → "build": "tsc && node copy-to-dist.js"
backend/copy-to-dist.js → copia backend/dist/app.js y backend/templates/*.html a ../dist/
```
El build del **frontend** (`vite build`) NO se copia automáticamente a `dist/index.html` — hay que hacerlo a mano antes de `clasp push` si hubo cambios de frontend (recordatorio reforzado tras US-45, donde este paso ya se había hecho bien esa vez — el problema real fue otro, ver nota #46/punto 10 sección 0). `build.sh` de la raíz sigue sin funcionar en cmd.exe — pendiente, no bloquea.

**⚠️ Scope de manifest (29 jul, US-37):** se agregó `https://mail.google.com/` a `appsscript.json` (acceso completo de lectura/escritura de Gmail, no solo `gmail.send`) para poder usar `GmailApp.search()`/`.getAttachments()` en `verifySentEmailAttachmentsViaGmail()`. **Cualquier scope OAuth nuevo en un Web App con `executeAs: USER_DEPLOYING` requiere que alguien autorice manualmente corriendo una función desde el editor una vez** — no puede pasar solo con un `clasp deploy`. US-43/US-45 NO requirieron ningún scope nuevo (el servicio avanzado de Calendar y el scope completo de `calendar` ya estaban habilitados desde antes).

### Test harness
`backend/test-harness/` — **307 aserciones, todas pasando** (subió de 278 el 30 jul: +19 de US-45 — clase de 45 min de punta a punta, regresión de la clase regular de 60 min, reagendar 60↔45 tomando siempre la duración de la clase destino, y el trigger reinstalándose sin dejar duplicados).

**Puntos ciegos confirmados del mock, agregados el 29 jul (US-37):**
- No valida el content-type real que `Utilities.newBlob()` acepta o rechaza (llevó a un bug real no detectado en testing).
- `Blob.setContentType()` en el mock no reproducía la mutación en el mismo lugar del objeto real — un test de control mal diseñado (dos "instancias" que en realidad eran la misma) pasó el harness pero no correspondía a la realidad, hasta que se corrigió con dos instancias genuinamente independientes.
- No reproduce el comportamiento real de Gmail al combinar imágenes embebidas en HTML + attachments (la causa raíz final de todo el bug de US-37) — esto solo se pudo confirmar contra Gmail real, nunca hubiera aparecido en el harness.

**Punto ciego del mock, agregado el 30 jul (US-43):** `Calendar.Events.list` (agregado al mock para simular el calendario de disponibilidad) no reproduce paginación (`pageToken`) ni límites de cuota del API real de Calendar — irrelevante hoy dado el volumen bajo del negocio, pero a revisar si el número de clases de disponibilidad creciera mucho. El mock sí expande recurrencia semanal (`FREQ=WEEKLY` + `INTERVAL`/`COUNT`/`UNTIL` opcionales) para poder probar la expansión de eventos recurrentes en el harness, pero **no es un parser RFC 5545 completo** — sin `BYDAY`, sin `FREQ=DAILY/MONTHLY`, sin `EXDATE`. La expansión real de Calendar solo se pudo confirmar probando contra Calendar real.

**Punto ciego crítico confirmado el 30 jul (US-43, ver nota #46):** el mock de Sheets (`appendRow()`/`getLastRow()` como un array de JS síncrono, siempre consistente) **no puede reproducir** el bug real de `getLastRow()` devolviendo un número de fila desactualizado justo después de un `appendRow()` sin flush dentro de un loop — este bug **solo fue visible probando contra el Sheet real de Google**, nunca hubiera aparecido corriendo el harness. Ya es la tercera vez que este patrón de bug aparece en el proyecto (ver también el incidente de `addServicioColumnsToClientes`/`recoverLostClientRows` documentado en versiones anteriores de este archivo) — cualquier código nuevo que escriba a Sheets dentro de un loop debe evitar re-preguntarle a Sheets su propio estado a mitad de la ejecución.

---

## 11. SPRINTS Y ESTADO ACTUAL

### Sprint 2 — Completo salvo US-20 (decisión de Trello pendiente)
US-11 a US-14, US-13/30, US-28, US-31, US-32, US-33, US-41 — todas ✅ Done.

### Sprint 4 — estado real

| US | Título | Estado |
|----|--------|--------|
| **US-34** | Fix formato de fecha en español | ✅ **Done** (v52) |
| **US-40** | Fix campo de fecha de nacimiento — clic en cualquier parte | ✅ **Done** (v56, 3 rondas) |
| **US-42** | Notificación de reagendamientos múltiples | ✅ **Done** (v60) |
| **US-37** | Correo de confirmación con botones de calendario + invitación .ics | ✅ **Done** (v76, investigación extensa — nota #43) |
| **US-43** | Cupos de pilates dinámicos vía calendario de disponibilidad | ✅ **Done** (v77 — incluye fix real de `getLastRow()`, ver nota #46). **Validado en real.** |
| **US-45** | Duración dinámica de clases de pilates + trigger de sync cada 5 min | ✅ **Done** (desplegada tras US-43 — confirmar número exacto de versión con `clasp deployments`). **Validado en real.** |
| **US-36** | Quitar banner de Google Apps Script | ⏸️ Investigado, **pendiente decisión de equipo** |

### US-43/US-45 — checklist real, ✅ TODO completado y validado
- [x] `clasp push` + `clasp deploy` de ambas tarjetas.
- [x] Migraciones ejecutadas: `addDisponibilidadEventIdColumnToCuposPilates()`, `addDuracionMinutosColumnToCuposPilates()`.
- [x] `installPilatesAvailabilitySyncTrigger()` corrido (instaló primero cada hora, luego reinstalado a cada 5 min tras el fix de US-45).
- [x] Clases de prueba marcadas en `Disponibilidad - Pilates` (recurrente semanal + clase suelta de 45 min + clase con `max_participantes=2`).
- [x] Confirmado en la URL pública que aparecen exactamente las clases marcadas, con su duración real.
- [x] Probado con `max_participantes=2`: el 3er cliente no puede agendar.
- [x] Cancelar libera el cupo, el slot reaparece.
- [x] Reagendar hacia clase llena bloquea con `CLASE_LLENA`, sin afectar la cita original.
- [x] `syncPilatesClassesToCuposSheet` confirmado idempotente contra el Sheet real tras el fix de `getLastRow()`.
- [x] Label de duración dinámico confirmado en el portal (sin número antes de elegir slot, número real después).
- [x] Trigger de 5 min confirmado sin duplicados tras reinstalar.

**Pendiente de higiene, no bloquea nada:** confirmar con `clasp deployments` el número de versión exacto que quedó activo tras el último deploy de US-45, y anotarlo en la sección 12.

### Textos en BORRADOR pendientes de aprobación de Gabriela/Dani (acumulado)
Sin cambios desde la última ronda — ver historial. Ninguno bloquea funcionalidad.

### Pendientes conocidos, sin bloquear nada
- Acceso móvil: validado visualmente, no formalmente con dispositivo externo.
- Reemplazar destinatarios placeholder de Dani/Ali/instructora por correos reales.
- Decidir "enviar como"/Reply-To para pilates.
- Checklist de acceso de producción (sección 6).
- **Disponibilidad real desde Calendar para NUTRICIÓN** — próxima tarjeta grande del roadmap, ver punto 23 de la sección 0. Reemplaza el auditar `WORKDAYS`/`WORKHOURS` fijos actuales por el mismo modelo aditivo ya validado en pilates (calendario dedicado `Disponibilidad - Nutrición`, separado del operativo).
- Reunir y enviar todos los textos BORRADOR a Gabriela/Dani.
- Decidir en Trello el estado final de US-20.
- Verificar en producción real que el branding coincide con lo aprobado por Dani.
- Reconstruir el historial de deploys faltante entre v28-v42 (no bloquea).
- **US-36** — pendiente de decisión del equipo (ver sección 5).
- Auditar la segunda carpeta de recuperación de OneDrive por si tiene el historial de git real que falta.
- Arreglar `build.sh` para cmd.exe/Windows (baja prioridad).
- Confirmar Yahoo con una cuenta real (US-37, testing quedó parcial).
- Decidir si limpiar/vaciar la hoja `Debug_US37` o dejarla como herramienta de diagnóstico permanente.
- Decidir si limpiar/vaciar la hoja `Cupos_Pilates` de datos de prueba antes de producción (o si se deja, ya que es puramente derivada/reconstruible desde el calendario + conteo en vivo).
- Confirmar con `clasp deployments` el número de versión final tras el último deploy de US-45.

---

## 12. ENTORNO DE TESTING

| Dato | Valor |
|------|-------|
| Cuenta de testing | plantpoweredani.testing@gmail.com |
| **Versión activa (US-43)** | **v77** (incluye fix real de `getLastRow()`, ver nota #46) |
| **Versión activa (US-45)** | Desplegada sobre el mismo deploymentId tras US-43 — **confirmar número exacto con `clasp deployments`** antes de la próxima tarjeta, no quedó registrado en esta sesión |
| URL de testing | https://script.google.com/macros/s/AKfycbwNUEjG8CXo2D5bk2eq1w6wBrme9XqJpCqOt-TkP0otTypiXd7GCEk7L7uFhdDOLCaJ/exec |
| Editor Apps Script | https://script.google.com/d/1cu-HdKiAmfUYOgjwtjKcE9lCO6waLfFsL71PwP4GgcdGiQWzqygPS3fK/edit |
| Repo | https://github.com/juanartavia/plant-powered-dani |
| **Ubicación local del repo** | `C:\dev\plant-powered-dani` — **NO en OneDrive** |
| Spreadsheet testing | https://docs.google.com/spreadsheets/d/16M6WUqMAK9XkVoIutIn9UkJojlS5biT5o470GySs5gw/edit |
| Harness de pruebas | `backend/test-harness/` — **307 aserciones, todas pasando** |
| Calendario `Disponibilidad - Pilates` (testing) | Creado en `plantpoweredani.testing@gmail.com`, propietaria = misma cuenta de testing (no requiere compartir nada en testing; en producción sí habrá que compartirlo con la cuenta de deploy si son cuentas distintas) |
| Cuenta secundaria de prueba (Outlook) | `juan.artavia.urena@est.una.ac.cr` — en realidad es Google Workspace educativo, NO un buzón real de Outlook (usar solo como referencia, no sirve para probar Outlook de verdad) |

### Links de testing
```
Consulta Inicial (60 min): .../exec?type=initial
Cita de Seguimiento (45 min): .../exec?type=followup
Solo Medición (15 min): .../exec?type=measurement
Clase de Pilates (duración dinámica, US-45): .../exec?type=pilates
```

### Historial de deploys (resumen — v28-v42 detallado pendiente de reconstruir)
| Versión | Cambios principales |
|---------|----------------------|
| v8-v27 | Sprint 1 + primeros ajustes de Sprint 2 |
| v28-v42 | US-13/30, US-14, US-31 (1ra versión), US-32, US-28, 1ra versión de US-33 — **historial detallado pendiente** |
| v43-v44 | US-33 completa (backend), tras recuperación de OneDrive |
| v45 | `clasp version` huérfana |
| v46 | US-33 — plantilla de branding real |
| v47 | `clasp version` huérfana |
| v48 | US-31 (frontend) + US-28 (brandbook) + US-41, recuperados tras incidente OneDrive |
| v49-v51 | (sin cambios documentados / intermedias) |
| v52 | **US-34** — fix formato de fecha en español (4 pantallas) |
| v53 | US-40 ronda 1 — fix showPicker() progresivo (**falló en producción**, ver nota #44) |
| v54 | US-40 ronda 1 confirmado roto en real por el usuario |
| v55 | US-40 ronda 2 — reemplazo por Popover+Calendar propio |
| v56 | **US-40 ronda 3** — CalendarDropdown propio, arregla el `<select>` sin estilo. **US-40 Done.** |
| v57-v59 | US-42 en desarrollo (versiones huérfanas de `clasp version`) |
| v60 | **US-42 Done** — notificación de reagendamientos múltiples |
| v61-v62 | US-37 primera implementación (4 botones + adjunto .ics — con el bug del content-type sin diagnosticar aún) |
| v63-v70 | US-37 — investigación del bug del adjunto .ics perdido (varias rondas de diagnóstico, ver nota #43) |
| v71-v74 | US-37 — pruebas de control A/B (PRUEBA-A sin imágenes / PRUEBA-B blob desde Drive) que aislaron la causa raíz |
| v75-v76 | **US-37 Done** — fix real: imágenes vía `inlineImages`+`cid` en vez de base64 en `<img>`. Confirmado en real: prompt nativo de "Sí/No/Tal vez" aparece en Gmail. |
| v77 | **US-43 Done** — cupos de pilates dinámicos, incluye el fix real de `getLastRow()` post-`appendRow()` en el sync (ver nota #46). Confirmado en real contra el Sheet y el portal. |
| v78+ | **US-45 Done** — duración dinámica de clases de pilates + trigger cada 5 min. Desplegada y confirmada en real (número exacto de versión pendiente de confirmar con `clasp deployments` en la próxima sesión). |

---

## 13. NOTAS TÉCNICAS CRÍTICAS

*(Notas 1-42 sin cambios — ver versión anterior del documento para el detalle completo de Sprint 1-3, incluyendo el incidente de recuperación de OneDrive.)*

**43. La investigación más larga del proyecto hasta antes de US-43: el adjunto `.ics` de US-37 se perdía en silencio dentro de `GmailApp.sendEmail()` — causa raíz real: imágenes embebidas en base64 dentro del HTML.**

**Síntoma:** el correo de confirmación debía llevar 4 botones de calendario + una invitación `.ics` real adjunta. Los 4 botones funcionaban perfecto. El adjunto `.ics`, en cambio, **nunca llegaba** al correo real — confirmado repetidamente con "Mostrar original" en Gmail (el MIME real solo tenía el HTML + 2 imágenes, nunca una parte `Content-Type: text/calendar`), aunque nuestro propio código, justo antes de llamar a `GmailApp.sendEmail()`, confirmaba una y otra vez que el adjunto se había construido perfecto (content-type limpio, bytes correctos, blob válido).

**Camino de diagnóstico, bugs reales encontrados en el camino (cada uno parcial, ninguno la causa final):**
1. `Utilities.newBlob(data, contentType, name)` en Apps Script real **rechaza** un `contentType` con parámetros extra separados por `;` (ej. `"text/calendar; method=REQUEST; charset=UTF-8"`) — el mock del harness nunca validaba ese string, así que este error quedó invisible en testing. Fix aplicado: construir el blob con content-type limpio, enriquecerlo en un segundo paso opcional.
2. Al intentar aislar ese fix con una prueba de control, se descubrió que **`Blob.setContentType()` muta el objeto en el mismo lugar y devuelve la MISMA instancia**, no una copia — la primera "prueba de control" estaba rota porque comparaba el mismo objeto contra sí mismo. El propio harness lo atrapó al construir un test genuinamente aislado con dos instancias independientes.
3. `Logger.log()`/`console.log()` **no aparecían de forma confiable** en el panel de "Ejecuciones" para ejecuciones reales disparadas por el Web App — hubo que construir un mecanismo de logging alternativo escribiendo directo a una hoja de Sheets (`Debug_US37`, ver sección 8) para poder diagnosticar nada en absoluto.
4. Con logging confiable por fin funcionando, se confirmó (vía `GmailApp.search()`+`.getAttachments()`, preguntándole a Gmail mismo qué había recibido, no a nuestras propias variables) que el adjunto real construido con contenido limpio **seguía sin llegar** — descartando definitivamente la hipótesis del content-type raro.
5. **Causa raíz real, encontrada con una prueba de control A/B:** un correo de prueba armado SIN ninguna imagen embebida en el HTML sí traía el adjunto `.ics` perfecto. Con las imágenes (el logo y la flor/kettlebell, incrustadas como `<img src="data:image/png;base64,...">` directo en el HTML), el adjunto se perdía. **Gmail, al procesar un correo con imágenes embebidas de esta forma, las extrae internamente como adjuntos reales al momento de enviar — desplazando/descartando cualquier adjunto real que hayamos agregado nosotros mismos en el mismo envío.**

**Fix definitivo:** reemplazar `<img src="data:image/png;base64,...">` por `<img src="cid:nombre_del_cid">` + la opción `inlineImages: { nombre_del_cid: Blob }` en `GmailApp.sendEmail()` — el mecanismo oficial de Apps Script para combinar imágenes en línea con adjuntos reales en el mismo correo, sin que compitan entre sí. Los 4 archivos de imagen se extrajeron a archivos `asset_*.html` separados (solo contienen el string base64), cargados con `HtmlService.createHtmlOutputFromFile()` + `Utilities.base64Decode()`. **Confirmado en real:** el prompt nativo de "Sí/No/Tal vez" de invitación de calendario apareció en Gmail al abrir el correo, con el logo y la flor decorativa intactos.

**Regla reforzada, para cualquier correo futuro de este proyecto (o de cualquier otro con Apps Script):**
- **Nunca combinar** `<img src="data:...;base64,...">` directo en el HTML con un adjunto real (`attachments`) en la misma llamada a `GmailApp.sendEmail()` — usar siempre `inlineImages`+`cid:` para las imágenes cuando el correo también lleva adjuntos.
- El harness/mock de este proyecto **no puede detectar este tipo de bug** — solo se puede confirmar contra Gmail real, preguntándole a Gmail mismo (vía `GmailApp.search()`+`getAttachments()`), nunca solo verificando las variables propias del código antes del envío.
- Cuando un objeto de una API tiene métodos que "parecen" devolver una copia pero en realidad mutan en el mismo lugar (como `Blob.setContentType()`), cualquier prueba de control necesita instancias genuinamente independientes, verificadas explícitamente — no asumir que una reasignación (`x = x.metodo()`) garantiza aislamiento.
- Ante un bug de "silencioso, no hay error, pero el resultado no aparece", escalar el diagnóstico en este orden: (1) confirmar que el código construye el dato correcto, (2) confirmar que ese dato realmente llega al punto exacto de la llamada externa (log justo antes), (3) confirmar contra el sistema externo mismo qué recibió de verdad (no solo las variables propias) — este último paso fue el que finalmente reveló la causa real.

**44. `HTMLInputElement.showPicker()` lanza `SecurityError` dentro del iframe cross-origin de Apps Script Web Apps — API descartada por completo para este proyecto (US-40, 29 jul).**

Apps Script sirve el portal dentro de un iframe de 3 niveles (`script.google.com` → `*.googleusercontent.com`), cross-origin respecto al top-level. `showPicker()` está bloqueado por especificación del navegador cuando se llama desde un iframe que no comparte origen con el documento de nivel superior — confirmado llamándolo directamente (sin `try/catch`) contra la URL pública real, con Playwright navegando dentro del iframe real de producción (no `localhost`, que no tiene este iframe y por eso "funcionaba" ahí). **Regla reforzada:** para cualquier funcionalidad que dependa de abrirse dentro del portal, nunca depender de esta API — usar componentes propios (Popover+Calendar, mismo patrón que ya usa el resto del proyecto para selects/dropdowns personalizados). Cualquier prueba de una funcionalidad nueva del portal debe hacerse contra la URL pública real antes de darla por buena, no solo contra `localhost`.

**45. US-43 (cupos de pilates dinámicos, 30 jul) — conflicto de schema detectado ANTES de escribir código, y una reordenación de operaciones descubierta a medio camino, necesaria para que el cupo "en vivo" no cuente mal a un cliente que se está moviendo de slot.**

**Conflicto de schema, resuelto ANTES de tocar código (evitó un bug en vez de corregirlo después):** el prompt original de esta tarjeta pedía reutilizar las columnas `event_id`/`meet_link` de `Cupos_Pilates` (E/F) para guardar el ID del evento del calendario `Disponibilidad - Pilates`, como clave de dedup del sync. Pero esas dos columnas YA estaban en uso productivo desde US-10: guardan el evento del calendario OPERATIVO (`PILATES_CALENDAR_ID`) que el sistema mismo crea cuando un cliente agenda de verdad (`bookPilatesCalendarEvent`/`joinPilatesSlot`/`leavePilatesSlot` dependen de eso). Repurpose esas columnas habría hecho que esas 3 funciones intentaran leer/mover un evento en el calendario EQUIVOCADO (el de disponibilidad, no el operativo) en cuanto el sync corriera. Se resolvió agregando una columna nueva y separada (`disponibilidad_event_id`, columna G) solo para el dedup del sync, dejando E/F intactas. Lección: cuando un prompt describe un cambio de schema sobre una tabla que el código YA usa activamente, vale la pena revisar los usos existentes de esas columnas ANTES de escribir una sola línea — encontrar el conflicto en el diseño es mucho más barato que encontrarlo en producción.

**Reordenación de operaciones en `rescheduleBooking` (pilates), descubierta al escribir los tests del harness, no al leer el código:** antes de US-43, el cupo de un slot de pilates era un contador cacheado (`inscritos`) que se incrementaba/decrementaba directamente — el ORDEN de las operaciones (unirse al slot nuevo → salir del viejo → mover la fila del cliente) no importaba, porque cada paso solo tocaba un número. US-43 cambia la fuente de verdad a un CONTEO EN VIVO de filas activas en la pestaña "Pilates" (`countActivePilatesRegistrations`) — y con eso, el orden sí importa: si `leavePilatesSlot` (slot viejo) corre ANTES de que la fila del cliente se actualice al horario nuevo, todavía cuenta a ese cliente como activo en el slot viejo (fila sin mover todavía), calculando mal el cupo liberado. Fix: mover la escritura del nuevo `fecha_clase`/`hora_clase`/`estado` ENTRE `joinPilatesSlot` (slot nuevo, que sigue corriendo primero — así una clase llena bloquea el reagendamiento ANTES de tocar cualquier cosa) y `leavePilatesSlot` (slot viejo, que ahora sí ve la fila ya movida). Esto se encontró escribiendo el Test 72 del harness (reagendar hacia una clase llena), no leyendo el código a simple vista — otra confirmación de que los tests de casos reales (no solo "el código compila") son los que exponen este tipo de bug de ordenamiento.

**46. US-43 (30 jul) — bug real de `getLastRow()` llamado justo después de `appendRow()` dentro de un loop sin flush, encontrado probando contra el Sheet real, invisible para el harness. Más el gotcha de `clasp push` vs `clasp deploy` que hizo parecer, en la tarjeta siguiente (US-45), que un fix ya pusheado "no se aplicaba".**

**Síntoma (US-43):** el log de `syncPilatesClassesToCuposSheet()` reportaba correctamente "8 filas nuevas creadas de 8 clases detectadas" tras crear un evento recurrente semanal en `Disponibilidad - Pilates`. Pero al revisar el Sheet real, solo había 6 filas totales (no 8 nuevas + las que ya existían), y varias tenían la hora vieja (10:00, de pruebas de antes de US-43) en vez de la hora real del nuevo evento (11:00). Además, la columna `max_participantes` mostraba "5" en filas que el sync nunca debía escribir ahí.

**Causa raíz:** la función llamaba `cuposSheet.getLastRow()` inmediatamente después de cada `cuposSheet.appendRow()`, repetidas veces dentro del mismo loop, sin ningún flush entre medio. En Sheets real (a diferencia del mock del harness, que es un array de JS síncrono siempre consistente), leer `getLastRow()` justo después de un `appendRow()` sin flush no garantiza reflejar esa escritura todavía — varias llamadas consecutivas devolvieron el mismo número de fila desactualizado, así que múltiples iteraciones del loop escribieron su fecha/hora/`disponibilidad_event_id` sobre la MISMA fila vieja en vez de sobre 8 filas nuevas distintas. La "5" que parecía un bug de escritura en `max_participantes` en realidad era dato viejo de esas filas pre-US-43 (cuando `max_participantes` sí se escribía fijo) que nunca se tocó, porque el bug solo escribía en las columnas A/B/G — quedó expuesto como si fuera otro bug, pero era el mismo.

**Fix:** eliminada toda dependencia de `getLastRow()` inmediatamente después de un `appendRow()` en este camino. El número de fila se calcula una sola vez a partir del largo de los datos ya leídos al inicio de la función (`cuposData.length + 1`) y se incrementa localmente en cada iteración, sin volver a preguntarle a Sheets a mitad del loop. Se aplicó el mismo fix a dos rutas de "red de seguridad" de menor riesgo en `appendBookingToSheet`/`joinPilatesSlot` que tenían el mismo antipatrón (solo un `appendRow` por llamada, no en loop, pero mismo riesgo). Se agregó además `LockService` a `syncPilatesClassesToCuposSheet()`, que no lo tenía — todos los demás escritores de `Cupos_Pilates` sí lo tienen.

**Confirmado con datos reales, no solo el harness:** se borraron las filas de datos de `Cupos_Pilates` (sheet puramente derivado, reconstruible) y se corrió el sync de nuevo — resultado: 8 filas nuevas correctas, todas con la hora real (11:00), `max_participantes`/`event_id`/`meet_link` vacíos como corresponde, `disponibilidad_event_id` distinto por fila.

**Gotcha relacionado, encontrado en la tarjeta siguiente (US-45):** después de pushear el fix de duración dinámica, el portal público seguía mostrando "60 min" — no era que el fix estuviera mal, sino que `clasp push` solo actualiza el HEAD que ve el editor de Apps Script (por eso correr una función manualmente desde ahí SÍ usaba el código nuevo, y el trigger se instaló bien de inmediato). La URL pública `/exec`, que sirve el portal y dispara los correos, **no se mueve con `push`** — solo se actualiza haciendo `clasp deploy` explícito sobre el `deploymentId`. Regla reforzada para el método de trabajo (sección 14): si un fix pusheado "no se refleja" en el portal real pero sí funciona corriendo la función manualmente desde el editor, sospechar primero de un deploy pendiente antes de asumir que el código está mal.

**Regla reforzada para cualquier código futuro de este proyecto que escriba a Sheets dentro de un loop:** nunca volver a preguntarle a Sheets su propio estado (`getLastRow()`, `getDataRange()`, etc.) inmediatamente después de una escritura sin flush, dentro del mismo loop — calcular la posición localmente a partir de una lectura hecha una sola vez al inicio. El harness de este proyecto **no puede detectar este tipo de bug** (su mock de Sheets es un array de JS, siempre perfectamente consistente) — solo se confirma probando contra el Sheet real, y esta es ya la tercera vez que este patrón exacto aparece en el proyecto (ver también el incidente histórico de `addServicioColumnsToClientes`/`recoverLostClientRows`).

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
   de nuevos scopes OAuth) → clasp deploy
6.5. Inmediatamente después de un clasp deploy exitoso: git add . && git commit
7. Probar en el navegador real contra el deploy (URL PÚBLICA, nunca solo local/Playwright)
   NO se marca nada como completado solo porque el código se escribió o Playwright pasó en local
8. Solo si la prueba real en la URL pública confirma que funciona → marcar checkbox(es) en Trello
9. Cuando todos los checkboxes de la tarjeta estén marcados → mover la tarjeta a Done
10. Actualizar CLAUDE.md — confirmando primero que la base sobre la que se edita es la más reciente
```

### Reglas añadidas el 29 jul
- Cualquier scope OAuth nuevo en `appsscript.json` requiere autorización MANUAL una vez desde el editor (correr cualquier función) antes de que funcione en ejecuciones reales del Web App — no basta con `clasp deploy`.
- Ante un bug donde "todo se ve bien en nuestras variables pero el resultado real no aparece", diagnosticar contra el sistema externo real (ej. `GmailApp.search()` preguntándole a Gmail), no solo contra el propio código.
- Nunca combinar imágenes en base64 embebidas en `<img src="data:...">` con adjuntos reales en el mismo correo — usar `inlineImages`+`cid:` siempre que un correo lleve ambas cosas.
- `showPicker()` y cualquier API sensible al origen del documento no se pueden usar dentro del portal — Apps Script lo sirve en un iframe cross-origin real.
- Antes de dar por buena cualquier funcionalidad nueva del portal, probarla contra la URL pública real — nunca conformarse con que "funciona en localhost".

### Reglas añadidas el 30 jul (US-43/US-45)
- **Nunca llamar `sheet.getLastRow()` inmediatamente después de `sheet.appendRow()` dentro de un loop, sin flush entre medio** — puede devolver un número de fila desactualizado en Sheets real (aunque el harness no lo detecte). Calcular la posición localmente a partir de una lectura hecha una sola vez, incrementando un contador propio.
- **Antes de escribir código sobre una tabla/Sheet que el proyecto YA usa activamente**, revisar primero los usos existentes de las columnas involucradas — encontrar un conflicto de schema en el diseño es mucho más barato que encontrarlo en producción (ver nota #45).
- **`clasp push` no mueve la URL pública `/exec`** — solo actualiza el HEAD del editor. Si un fix pusheado parece "no aplicarse" en el portal real pero sí funciona corriendo una función manualmente desde el editor, sospechar primero de un `clasp deploy` pendiente.
- Cuando la fuente de verdad de un conteo pasa de "contador cacheado" a "conteo en vivo desde otra tabla", revisar el ORDEN de las operaciones en cualquier flujo que mueva datos entre dos estados (ej. reagendar) — un conteo en vivo sí es sensible al orden en que se actualizan las filas, a diferencia de un contador aritmético simple.

**URL del editor:** https://script.google.com/d/1cu-HdKiAmfUYOgjwtjKcE9lCO6waLfFsL71PwP4GgcdGiQWzqygPS3fK/edit

---

## 15. FLUJO DE TRABAJO — TRELLO

### Estados de las tarjetas
```
Backlog → In Progress → Done
```

### Reglas
- Al **iniciar** una US → moverla a **In Progress**.
- Al **completar todos los checkboxes, validados en real** → moverla a **Done**.
- **Ningún checkbox ni tarjeta se marca como completado/Done solo porque Claude Code terminó de escribir el código** — requiere prueba real confirmada primero, contra la URL pública.
- **Acción pendiente en Trello:** mover US-34, US-40, US-42, US-37, **US-43, US-45** a Done (todas validadas en real).
- **Próxima tarjeta a crear en Trello:** disponibilidad real desde Calendar para nutrición (ver punto 23 de la sección 0) — aún no tiene tarjeta creada.

---

## 16. FLUJO DE DEPLOY EN WINDOWS (PowerShell)

```powershell
cd C:\dev\plant-powered-dani
cd backend
npm run build          # ya copia automáticamente a ../dist/ (nota #35)
cd ..
cd frontend
npm run build           # solo si hubo cambios en frontend — copiar dist/index.html a ../dist/ manualmente
cd ..
clasp push
# Si hay migraciones nuevas O scopes OAuth nuevos: ir al editor, ejecutar/autorizar
# manualmente, ANTES del deploy (o antes de la primera prueba real tras el deploy)
clasp version "descripción del cambio"
clasp deploy --deploymentId AKfycbwNUEjG8CXo2D5bk2eq1w6wBrme9XqJpCqOt-TkP0otTypiXd7GCEk7L7uFhdDOLCaJ -V <número de versión recién creada> --description "descripción"
git add .
git commit -m "descripción del cambio"
git push
```

### Notas importantes
- Trabajar SIEMPRE en `C:\dev\plant-powered-dani`, nunca en una carpeta de OneDrive.
- `&&` no funciona en PowerShell — correr comandos uno por uno.
- El `rootDir` en `.clasp.json` apunta a `dist/` — no cambiar.
- Siempre `clasp push` antes de `clasp deploy`.
- **Usar siempre el mismo `--deploymentId`:** `AKfycbwNUEjG8CXo2D5bk2eq1w6wBrme9XqJpCqOt-TkP0otTypiXd7GCEk7L7uFhdDOLCaJ`.
- **`clasp deploy` sin `-V` explícito crea su propia versión nueva** en vez de usar la que se acaba de crear con `clasp version` — confirmado real dos veces en el proyecto (ver historial de deploys). Pasar siempre `-V <número>` explícito desde el inicio, y de todas formas confirmar con `clasp deployments` cuál versión quedó realmente publicada sobre el deploymentId de testing.
- **`clasp push` actualiza el HEAD del editor, pero NO mueve la URL pública `/exec`** — esa solo se actualiza con `clasp deploy` explícito (ver nota #46). No asumir que un fix ya está "en producción de testing" solo porque se pusheó.
- `build.sh` de la raíz no funciona en cmd.exe.
- Si se agrega un scope OAuth nuevo a `appsscript.json`, hay que actualizarlo tanto en la raíz como en `dist/appsscript.json` (el build no lo copia automáticamente, ver nota #36) y luego autorizarlo manualmente corriendo cualquier función desde el editor una vez.

---

## 17. REGISTRO DE CAMBIOS (resumen)

| Fecha | Cambio |
|-------|--------|
| *(ver versiones anteriores para historial completo hasta 28 jul)* | |
| 27-28 jul 2026 | Incidente grave de OneDrive, recuperación completa backend+frontend. US-33 completada con plantilla de branding real. US-41 resuelto. |
| 29 jul 2026 | **US-34 Done** (formato de fecha español). **US-40 Done** tras 3 rondas (fix de clic fallido en producción por `showPicker()` bloqueado en iframe cross-origin → reemplazo completo por Popover+Calendar propio → fix del `<select>` sin estilo con Dropdown propio). **US-42 Done** (notificación de reagendamientos múltiples, 3ro en adelante). **US-37 Done** tras investigación extensa (múltiples bugs reales de Apps Script/Gmail encadenados — content-type con parámetros rechazado, `Blob.setContentType()` mutando en el mismo lugar, logging poco confiable en ejecuciones reales, y la causa raíz final: imágenes base64 en `<img>` descartando el adjunto real — resuelto con `inlineImages`+`cid:`). Confirmado en real: prompt nativo de invitación de calendario funcionando en Gmail. Deploy final: v76. US-36 investigado, pendiente de decisión de equipo. |
| 30 jul 2026 | **US-43 Done, validado en real** (cupos de pilates dinámicos vía calendario `Disponibilidad - Pilates`, reemplazando el hardcodeo de "sábados 10am"). Nueva columna `disponibilidad_event_id` en `Cupos_Pilates` (en vez de repurpose `event_id`/`meet_link`, ya en uso productivo — conflicto detectado y resuelto antes de escribir código, nota #45). `inscritos` pasa de contador incrementado a caché de un conteo en vivo. Reordenación de `rescheduleBooking` necesaria para que el conteo en vivo no siga contando al cliente en su slot original. Durante las pruebas reales se encontró y corrigió un bug real de `getLastRow()`/`appendRow()` en el sync (nota #46) — confirmado y corregido contra el Sheet real, invisible para el harness. Deploy final: v77. **US-45 Done, validado en real** (mismo día): duración dinámica de clases de pilates (columna `duracion_minutos` nueva, toda la cadena de reserva/reagendamiento/`.ics`/botones de calendario usa la duración real por clase), label del portal sin número de minutos hasta seleccionar slot, trigger de sync corregido para no duplicarse al reinstalar y bajado de cada hora a cada 5 minutos. Gotcha de `clasp push` vs `clasp deploy` documentado (nota #46). Harness: 307 aserciones, todas pasando. Nutrición no se tocó en ninguna de las dos tarjetas. |

---

*Última actualización: 30 julio 2026 — **US-43 y US-45 Done, ambas validadas en real contra la URL pública y el Sheet real**, no solo en el harness (307 aserciones). Pendientes reales para continuar: iniciar la próxima tarjeta grande (disponibilidad real desde Calendar para nutrición, mismo modelo aditivo ya validado en pilates — ver punto 23 sección 0), confirmar con `clasp deployments` el número exacto de versión activa tras el último deploy de US-45, mover US-43/US-45 a Done en Trello, decisión de equipo sobre US-36, aprobación formal de textos BORRADOR, correos reales de Dani/Ali/instructora, decisión sobre US-20, validación móvil formal, reconstrucción del historial de deploys v28-v42, confirmar Yahoo con una cuenta real cuando se consiga una, y decidir si limpiar los datos de prueba de `Cupos_Pilates`/`Debug_US37` antes de producción.*