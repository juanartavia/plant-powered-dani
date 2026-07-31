# CLAUDE.md — Plant Powered by Dani
## Sistema de Agendamiento Automatizado
> Documento vivo — actualizar conforme avanza el desarrollo
> Última actualización: 30 julio 2026 — **Sprint 4.** Hoy se cerraron **US-43** (cupos de pilates dinámicos), **US-45** (duración dinámica de pilates + trigger cada 5 min) y **US-44** (disponibilidad real de NUTRICIÓN vía calendario de disponibilidad), las tres **validadas en real contra la URL pública de testing**, no solo en el harness. Deploy activo: **v81** — "US-44 disponibilidad nutrición", confirmado con `clasp deployments`.

---

## 0. LÉEME PRIMERO — PARA EL PRÓXIMO CHAT

Si estás retomando este proyecto en un chat nuevo, este documento es tu única fuente de verdad. Antes de generar cualquier prompt para Claude Code:

1. Lee completo este documento, especialmente las secciones 11 (estado de sprints), 13 (notas técnicas — la #43 y la #46 son las más extensas: correos con adjuntos+imágenes, y el bug real de `getLastRow()`/`appendRow()` en Sheets; la #47 cubre la diferencia de modelo entre nutrición y pilates), y 14/15 (método de trabajo y Trello).
2. **Todo el flujo de correos, gestión de citas, branding, botones de calendario, cupos/duración de pilates y disponibilidad real de nutrición está Done y probado de punta a punta con datos/citas reales:**
   - **US-11 a US-14** — Familia completa de correos automatizados.
   - **US-13/US-30, US-32, US-33** — Notificaciones internas (nueva cita, asistencia confirmada, cancelación tardía).
   - **US-31, US-28, US-41** — Página de gestión de citas + brandbook + fix de título redundante.
   - **US-34** — Formato de fecha en español corregido (día-mes-año, no al revés).
   - **US-40** — Campo de fecha de nacimiento: reemplazado el `<input type="date">` nativo por un selector propio (Popover+Calendar+Dropdown), porque el nativo no se podía abrir con clic en cualquier parte del campo dentro del iframe de Apps Script, y además el `<select>` de mes/año no tenía estilo propio.
   - **US-42** — Notificación a Dani/instructora + Ali cuando un cliente reagenda 3 veces o más (cada vez, no solo la primera).
   - **US-37** — Correo de confirmación con 4 botones de calendario (Google/Outlook/Yahoo/Apple-iCal) + invitación `.ics` real adjunta, que dispara el prompt nativo de "Sí/No/Tal vez" en Gmail/Outlook — **confirmado en real**.
   - **US-43** — Cupos de pilates dinámicos: reemplaza el horario fijo hardcodeado ("sábados 10am") por clases marcadas por la instructora en un calendario de Google dedicado, con capacidad configurable por clase — **confirmado en real**.
   - **US-45** — Duración dinámica de clases de pilates (ya no fija en 60 min) + trigger de sincronización corriendo cada 5 minutos en vez de cada hora — **confirmado en real**.
   - **US-44** — Disponibilidad real de NUTRICIÓN: reemplaza las constantes fijas `WORKDAYS`/`WORKHOURS` por bloques marcados por Dani/Ali en un calendario de Google dedicado (`Disponibilidad - Nutrición`), tallados en sub-slots según el tipo de cita — **confirmado en real, incluyendo huecos entre bloques respetados correctamente**.
3. **Bug crítico histórico, ya corregido:** los links de los correos usaban `ScriptApp.getService().getUrl()`, que devuelve `/dev` (deployment HEAD, roto) en vez de `/exec`. Corregido con `WEB_APP_URL` fija.
4. **Lección de arquitectura (US-28):** el portal se compila a un ÚNICO archivo HTML inlineado (`vite-plugin-singlefile`) — `frontend/public/` NO sirve para nada en producción.
5. **Gap de build (27 jul), corregido:** `backend/package.json` → `"build": "tsc && node copy-to-dist.js"`.
6. **Incidente grave de corrupción de OneDrive (27-28 jul), completamente recuperado.** Ver nota técnica correspondiente en sección 13. El proyecto vive en `C:\dev\plant-powered-dani` — **NUNCA** en una carpeta de OneDrive.
7. **Apps Script Web Apps corren dentro de un iframe cross-origin real, con implicaciones serias:**
   - `HTMLInputElement.showPicker()` lanza `SecurityError` si se llama desde ese iframe — **nunca usar esta API** para nada que dependa de abrirse dentro del portal (descubierto en US-40, confirmado contra producción real, no solo localhost).
   - `Logger.log()`/`console.log()` **no aparecen de forma confiable** en el panel de "Ejecuciones" para ejecuciones reales disparadas por el Web App (a diferencia de correr una función manualmente desde el editor) — para diagnósticos reales, escribir a una hoja de Google Sheets dedicada es más confiable. Ver `Debug_US37` en sección 8 (**sigue existiendo en el Sheet, decidir si se limpia o se deja como herramienta de diagnóstico permanente**).
   - **Cualquier prueba de una funcionalidad nueva debe hacerse contra la URL pública real (`/exec`), nunca solo contra `localhost`** — varios bugs (US-40, US-37) pasaban perfecto en local y fallaban en real, precisamente por el iframe cross-origin.
   - **Corolario descubierto en US-44:** ni siquiera correr una función manualmente desde el editor sirve para probar `fetchAvailability()` si la función espera parámetros (ej. el tipo de cita) — el botón "Ejecutar" del editor no permite pasar argumentos. Para funciones parametrizadas, la prueba real solo se puede hacer a través del portal público con el parámetro correcto en la URL (ej. `?type=initial`).
8. **Regla crítica de correos con imágenes + adjuntos, ver nota #43:** nunca embeber imágenes como `<img src="data:image/png;base64,...">` directo en un correo que también lleve un archivo adjunto real vía `GmailApp.sendEmail()` — Gmail descarta el adjunto en silencio. Usar siempre `inlineImages` (con `<img src="cid:...">`) para las imágenes cuando el correo también lleva adjuntos.
9. **Regla crítica de Sheets, ver nota #46:** nunca llamar `sheet.getLastRow()` inmediatamente después de `sheet.appendRow()` dentro de un loop, sin flush entre medio — en Sheets real (no en el harness) puede devolver un número de fila desactualizado y hacer que la escritura aterrice sobre una fila vieja en vez de la recién creada. Calcular el número de fila localmente (a partir del largo de los datos ya leídos + un contador incremental) en vez de volver a preguntarle a Sheets dentro del loop.
10. **`clasp push` vs `clasp deploy`, distinción importante:** `clasp push` solo actualiza el HEAD que ve el editor de Apps Script (correr una función manualmente desde ahí SIEMPRE usa el código más reciente pusheado). La URL pública `/exec` que usa el portal y dispara los correos **NO se actualiza con `push`** — solo se mueve haciendo `clasp deploy` explícito sobre el `deploymentId` correspondiente. Si el código parece "no aplicarse" en el portal real después de un push, este es el primer sospechoso antes de pensar que el fix está mal.
11. **Nutrición y pilates ya NO dependen de horarios/duraciones fijas en el código; ambas leen calendarios de disponibilidad dedicados, pero con modelos distintos** (ver nota #47): pilates es agendamiento de **clases discretas** (cada evento de disponibilidad = una clase completa, con su propia capacidad vía `Cupos_Pilates`); nutrición es agendamiento **continuo** (cada evento de disponibilidad = un bloque abierto que se "talla" en sub-slots según el tipo de cita, sin ninguna capa de Sheet intermedia). No asumir que el mismo patrón de código sirve para ambos sin adaptarlo.
12. **US-20 (token único)** cubierta al 100% por US-06/US-31 — pendiente que el usuario la cierre/archive en Trello.
13. **Pendientes de fondo, de baja urgencia, confirmados como seguros de dejar así:** coerción de fechas a Date en Sheets (cosmético), `findClientByEmail()` lee con TIME_ZONE en vez de UTC, acceso móvil sin validación formal con dispositivo externo.
14. **Destinatarios de notificaciones internas siguen en placeholder** — reemplazar antes de producción.
15. **Varios textos de copy siguen en BORRADOR**, pendientes de aprobación de Gabriela/Dani (lista en sección 11).
16. Flujo de trabajo de siempre: prompt → Claude Code ejecuta → **commit inmediato tras deploy** → **probar en real (URL pública) antes de marcar cualquier checkbox** → actualizar CLAUDE.md.
17. **Pedir siempre el checklist real de Trello antes de generar un prompt nuevo.**
18. **Antes de patchear este documento, confirmar que es la versión más completa y reciente.** Ya pasó dos veces que no lo era — ver nota crítica de recuperación en sección 13.
19. **`WEB_APP_URL` fija siempre, nunca `ScriptApp.getService().getUrl()`.**
20. **Lista de todo lo construido SIN diseño de Gabriela** (revisar con ella cuando haya oportunidad): botón "Agregar a mi calendario" (ahora expandido a 4 botones + invitación real, US-37), notificación interna con 3 variantes, correo al cliente al reagendar, correo de cancelación al cliente, toda la página de gestión de citas (US-31), plantilla de alerta de cancelación tardía (US-33), plantilla de reagendamientos múltiples (US-42), el selector de fecha de nacimiento propio (US-40).
21. **Pendiente de fondo, no urgente:** segunda carpeta de recuperación de OneDrive (con `.git` propio, `design-reference/`) nunca se terminó de auditar por si tiene el historial de git real que falta reconstruir.
22. `build.sh` de la raíz no ejecuta en `cmd.exe`/Windows — pendiente, no bloquea.
23. **US-36** (banner "Un usuario de Google Apps Script creó esta aplicación") — investigado a fondo, no se puede quitar con código; requiere página envoltorio (iframe) en otro dominio. **Pendiente de decisión del equipo** en reunión — ver sección 5.
24. **Coordinación pendiente con Dani/Ali antes de considerar esto "en producción":** deben cargar bloques de disponibilidad reales en `Disponibilidad - Nutrición` (y la instructora en `Disponibilidad - Pilates`) ANTES de que el modelo viejo se apague del todo — si no marcan nada, el portal no ofrece ningún slot ese día, lo cual puede parecer que "el sistema se rompió" si no están al tanto. Confirmar también si conviene usar eventos recurrentes de Calendar para la carga inicial de su horario habitual, en vez de marcar cada semana a mano.
25. **Sin tarjetas grandes de arquitectura pendientes por ahora** — las tres tarjetas de disponibilidad dinámica (US-43, US-44, US-45) están cerradas. Lo que queda son los pendientes de higiene/producción listados en la sección 11 (correos reales, banner US-36, textos BORRADOR, `git push` pendiente, etc.).

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

### 3-n. US-43 — Cupos de pilates dinámicos vía calendario de disponibilidad — ✅ Done, confirmado en real

**Motivación:** Dani quería poder ofrecer clases de pilates especiales (fecha/hora/capacidad distintas a la clase regular), algo imposible con el horario fijo hardcodeado ("sábados 10am"). Se presentaron varias opciones y se escogió la más simple: la instructora marca las clases en un calendario de Google dedicado, y ajusta el cupo máximo directamente en el Sheet si una clase necesita una capacidad distinta al default.

**Modelo de disponibilidad:** el calendario `Disponibilidad - Pilates` es **aditivo**, no sustractivo — nada está disponible hasta que la instructora marca explícitamente un evento ahí. Es un calendario **separado** del operativo (`PILATES_CALENDAR_ID`, donde el sistema crea los eventos reales de cada reserva) — nunca deben confundirse ni fusionarse, tienen Script Properties distintas.

**Flujo de sincronización:**
1. La instructora marca cada clase (regular o especial, incluyendo recurrencias semanales) como evento en `Disponibilidad - Pilates`.
2. Un trigger de tiempo (cada 5 min desde US-45, antes cada hora) corre `syncPilatesClassesToCuposSheet()`, que crea automáticamente una fila en `Cupos_Pilates` por cada clase nueva detectada — sin duplicar filas ya sincronizadas (dedup por `disponibilidad_event_id`, no por fecha/hora, para tolerar que la instructora mueva una clase de horario) y sin pisar `max_participantes` ya editado a mano.
3. `max_participantes` queda **vacío** por defecto (nunca se escribe "5" a la fuerza) — la lectura interpreta celda vacía como 5, y un número escrito como ese número exacto.
4. El cupo real de cada clase se calcula **en vivo**: `max_participantes` (o 5 default) menos inscripciones activas (`Agendada`/`Reagendada`) contadas directamente en la pestaña "Pilates" — la columna `inscritos` de `Cupos_Pilates` queda como un valor cacheado/informativo, nunca la fuente de verdad.
5. Al llegar a 0 cupo, la clase deja de ofrecerse en el portal. Cancelar libera el cupo de inmediato (recalculado en vivo, no vía rollback manual de un contador).
6. Reagendar hacia una clase llena se bloquea con `CLASE_LLENA`, sin afectar la cita original del cliente.

**Conflicto de schema detectado y resuelto ANTES de escribir código (ver nota #45):** las columnas `event_id`/`meet_link` de `Cupos_Pilates` ya estaban en uso productivo para el evento OPERATIVO — se agregó una columna nueva y separada (`disponibilidad_event_id`, columna G) en vez de repurpose, evitando romper `bookPilatesCalendarEvent`/`joinPilatesSlot`/`leavePilatesSlot`.

**Bug real encontrado y corregido durante las pruebas en real (ver nota #46):** `getLastRow()` llamado justo después de `appendRow()`, repetidamente dentro de un loop y sin flush, hacía que varias escrituras de `syncPilatesClassesToCuposSheet()` aterrizaran sobre filas viejas en vez de crear filas nuevas — solo visible probando contra el Sheet real, el harness no lo detectó (su mock de Sheets es un array de JS síncrono, siempre consistente).

**Validado en real:** el portal muestra exactamente las clases marcadas en el calendario (incluyendo expansión correcta de un evento recurrente semanal en instancias individuales), respeta el cupo configurado por clase, y libera/bloquea cupo correctamente al cancelar/reagendar. **Deploy: v77.**

### 3-o. US-45 — Duración dinámica de clases de pilates + trigger de sync cada 5 min — ✅ Done, confirmado en real

**Motivación:** durante las pruebas reales de US-43 se descubrió que el sistema seguía asumiendo 60 minutos fijos para toda clase de pilates (`getDurationForType("pilates")`), ignorando la duración real del evento en `Disponibilidad - Pilates`. Se decidió resolverlo de inmediato en la misma ronda, dado el bajo costo relativo de hacerlo con el contexto ya fresco.

**Cambios:**
- Columna nueva `duracion_minutos` (columna H) en `Cupos_Pilates`, poblada por el sync a partir de la diferencia real `fin - inicio` del evento de disponibilidad.
- Toda la cadena de pilates (disponibilidad mostrada al cliente, cálculo de hora de fin al reservar, reagendamiento — siempre toma la duración de la clase **destino**, no la original —, botones "agregar al calendario", `.ics` adjunto) usa la duración real por clase en vez de la constante fija.
- **Ajuste de UX pedido por el usuario:** antes de que el cliente seleccione una fecha/hora específica, el portal ya no muestra ningún número de minutos ("Clase de Pilates" a secas, sin "(60 min)" por defecto) — el número aparece solo después de elegir un slot concreto, con su duración real.
- **Fix del trigger de sincronización:** `installPilatesAvailabilitySyncTrigger()` no borraba ningún trigger existente antes de instalar uno nuevo (podía dejar dos triggers de la misma función corriendo en paralelo si se volvía a ejecutar). Se corrigió para que siempre borre cualquier trigger previo de `syncPilatesClassesToCuposSheet` antes de instalar el nuevo. Aprovechando el cambio, se bajó la frecuencia de cada hora a **cada 5 minutos**.

**Gotcha de deploy encontrado en esta tarjeta (ver nota #46/punto 10 de la sección 0):** después de pushear el fix, el portal público seguía mostrando "60 min" — no era un bug de código, sino que `clasp push` no mueve la URL pública `/exec`; hacía falta un `clasp deploy` explícito adicional.

**Validado en real:** una clase de prueba de 45 min mostró correctamente "(45 min)" en el portal, en el correo de confirmación, y en el `.ics` adjunto; una clase regular de 60 min se comportó exactamente igual que antes de esta tarjeta (regresión confirmada); el trigger quedó instalado corriendo cada 5 minutos, sin duplicados. **Deploy: sobre el mismo deploymentId, tras US-43.**

### 3-p. US-44 — Disponibilidad real de NUTRICIÓN vía calendario de disponibilidad — ✅ Done, confirmado en real (30 jul)

**Motivación:** mismo espíritu que US-43, pero para el flujo de Dani. Nutrición seguía usando constantes fijas `WORKDAYS`/`WORKHOURS` (martes-viernes 7am-7pm, sábados 7am-2pm salvo el último del mes) sin leer el Calendar real de Dani. Se acordó reemplazar ese modelo por el mismo principio aditivo ya validado en pilates: sin marco fijo por defecto, Dani/Ali marcan explícitamente en un calendario dedicado los bloques en que sí se puede agendar.

**Diferencia de modelo respecto a pilates (importante, ver nota #47):** nutrición es agendamiento **continuo**, no clases discretas. Cada evento en `Disponibilidad - Nutrición` es un **bloque abierto** (ej. "martes 7am-7pm"), no una clase puntual — el sistema "talla" ese bloque en sub-slots consecutivos según la duración del tipo de cita que se esté consultando (60 min inicial / 45 min seguimiento / 15 min solo medición), sin dejar huecos entre sub-slots. Los 3 tipos de cita comparten el mismo calendario de disponibilidad — no hay un calendario de disponibilidad por tipo de cita, el bloque es agnóstico al tipo; lo único que cambia por tipo es cómo se talla.

**Investigación previa (Paso 0), sin conflictos encontrados:** a diferencia de pilates, nutrición **no tenía** ninguna Script Property de calendario operativo dedicada tipo `PILATES_CALENDAR_ID` — usaba (y sigue usando, sin cambios) la Script Property genérica `CALENDARS` (`CALENDARS[0]` para crear/mover/borrar el evento real de cada cita). Tampoco existe ninguna capa intermedia tipo `Cupos_Pilates` para nutrición — su disponibilidad se calcula 100% en vivo dentro de `fetchAvailability()`, sin persistir nada a ningún Sheet. Esto hizo que esta tarjeta fuera estructuralmente **más simple** que pilates: sin necesidad de sync, sin trigger, sin columna de dedup, y sin ningún riesgo del bug de `getLastRow()`/`appendRow()` (nota #46), porque no se escribe a ningún Sheet en este flujo.

**Cambios:**
- `getNutricionAvailabilityCalendarId()` — getter de `NUTRICION_AVAILABILITY_CALENDAR_ID` (Script Property nueva y separada de `CALENDARS`), mismo patrón que `getPilatesAvailabilityCalendarId()`.
- `getNutricionAvailabilityBlocks()` — lee bloques del calendario `Disponibilidad - Nutrición` (`Calendar.Events.list`, `singleEvents: true` — expande recurrencias, mismo aprendizaje de US-43), ventana de 8 semanas.
- `fetchAvailability()` (rama nutrición) — reemplaza el grid fijo `WORKDAYS`/`WORKHOURS` por el tallado de cada bloque en sub-slots consecutivos según `getDurationForType(type)`, sin huecos, dentro del rango del bloque.
- El chequeo de conflictos (`Calendar.Freebusy` contra `CALENDARS`, el calendario operativo) **queda sin cambios** — el calendario de disponibilidad nunca entra en esa query, por la misma razón que en pilates: un evento de "disponibilidad" cuenta como "ocupado" en términos de Calendar, así que mezclarlo con el chequeo de conflictos lo haría bloquearse a sí mismo.
- `WORKDAYS`/`WORKHOURS` quedan en el código sin uso activo, como plan de rollback — a diferencia de cuando se hizo esto con pilates, nutrición sí tiene actividad real, así que se prefirió no eliminarlas todavía.

**Validado en real, con dos bloques el mismo día y un hueco entre ellos (8am-12pm y 1pm-5pm):**
- Consulta Inicial (60 min): 8, 9, 10, 11am y 1, 2, 3, 4pm — el hueco de 12-1pm se respetó exactamente, y el último slot antes del hueco (11am) cupo completo antes de las 12.
- Cita de Seguimiento (45 min) y Solo Medición (15 min): mismos bloques y hueco, con más sub-slots por caber más veces en el mismo tiempo — confirmado que los 3 tipos comparten el bloque pero se tallan independientemente.

**Deploy: v81** — "US-44 disponibilidad nutrición".

---

## 4. TIPOS DE CITA

### Nutrición (flujo Dani)
| Tipo | ?type= | Duración | Modalidad |
|------|--------|----------|-----------|
| Consulta inicial | `initial` | 60 min | Presencial o virtual |
| Cita de seguimiento | `followup` | 45 min | Presencial o virtual |
| Solo medición | `measurement` | 15 min | Solo presencial |

**Horario ya NO es fijo desde US-44 (30 jul, ✅ Done, validado en real):** hasta antes de esta tarjeta, la disponibilidad de nutrición se calculaba con las constantes `WORKDAYS`/`WORKHOURS` (martes-viernes 7am-7pm, sábados 7am-2pm salvo el último del mes). Ahora Dani/Ali marcan bloques de tiempo abiertos como eventos en el calendario `Disponibilidad - Nutrición` (Script Property `NUTRICION_AVAILABILITY_CALENDAR_ID`), y el portal talla esos bloques en sub-slots según la duración de cada tipo de cita. Si no hay ningún bloque marcado un día dado, ese día no ofrece ningún slot — sin caer a un horario por defecto. Las duraciones de la tabla arriba (60/45/15 min) siguen siendo fijas por tipo — lo dinámico es SOLO cuándo hay disponibilidad, no cuánto dura cada tipo de cita.

### Pilates (flujo instructora)
| Tipo | ?type= | Duración | Modalidad | Formato | Horario | Ventana mínima | Cupo |
|------|--------|----------|-----------|---------|---------|----------------|------|
| Clase de pilates | `pilates` | **Dinámico (US-45)** — la duración real de cada clase se lee del evento de Calendar, ya no una constante fija de 60 min | Virtual únicamente | Grupal | **Dinámico (US-43)** — la instructora marca las clases en el calendario `Disponibilidad - Pilates`, ya no un horario fijo | 12 horas | 5 (default) — ajustable por clase en `Cupos_Pilates` |

**Pilates NO tiene recordatorio de 48hrs.**

Ver notas técnicas #45/#46/#47 para el detalle completo de ambos modelos (nutrición continuo vs. pilates discreto) y por qué son intencionalmente distintos.

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
| **Dani** | Admin/nutricionista. Recibe notificación interna en cada acción. Marca su disponibilidad en `Disponibilidad - Nutrición` (US-44). |
| **Ali (secretaria)** | Distribuye links por WhatsApp. Recibe las mismas notificaciones que Dani. Puede marcar disponibilidad de Dani también, si aplica. |
| **Instructora de pilates** | Calendar y correo propios. Marca las clases disponibles en `Disponibilidad - Pilates` y puede ajustar `max_participantes` directamente en `Cupos_Pilates`. |
| **Cliente (ES/EN)** | Agenda, reagenda, cancela, confirma asistencia. Mayor de 15 años. |
| **Google Apps Script** | Motor de automatización. |

### Checklist de acceso necesario para producción
- Compartir Calendar real de la instructora con la cuenta de deploy (tanto el operativo como `Disponibilidad - Pilates`).
- Compartir/crear el calendario `Disponibilidad - Nutrición` real de Dani con la cuenta de deploy.
- Reemplazar correos placeholder de Dani/Ali/instructora por los reales.
- Deploy final bajo cuenta de Dani.
- Coordinar con Dani/Ali (y la instructora) que carguen su disponibilidad real ANTES de considerar el sistema listo para clientes reales — ver punto 24 de la sección 0.

---

## 7. FLUJOS COMPLETOS

### Flujo principal — Agendar cita de nutrición ✅ 100% COMPLETO (incluye US-44)
```
1. Dani/Ali marcan bloques de tiempo abiertos en "Disponibilidad - Nutrición"
   (evento único o recurrente).
2. Ali/Dani comparte link ?type=... por WhatsApp
3. Cliente ve calendario (zona propia): el sistema lee los bloques del punto 1,
   los talla en sub-slots según el tipo de cita, y excluye los que ya
   tengan conflicto real (Calendar.Freebusy contra el calendario OPERATIVO,
   CALENDARS). Elige fecha/hora.
4. Ingresa correo → busca en "Clientes"
5. Completa datos (valida edad con selector propio US-40, upsert)
6. Apps Script re-verifica ventana + LockService
7. Escribe fila (fecha/hora protegidas como texto plano)
8. Crea evento en Calendar (CALENDARS[0]) + Meet si es virtual
9. Envía correo de confirmación — CON 4 botones de calendario + invitación .ics
   real adjunta (US-37): logo/flor vía inlineImages, no base64 en <img>
10. Envía notificación interna a Dani/Ali
11. [Solo nutrición] 47-49hrs antes: recordatorio con confirmar/reagendar/cancelar
12. Cliente hace clic en cualquiera de los 3 botones → página visual (US-31):
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
**Sin cambios de schema en US-44** — esta tarjeta no agrega ninguna columna ni capa intermedia; la disponibilidad se calcula 100% en vivo, sin persistir nada nuevo.

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
**Significado de cada columna:**
- `inscritos` (columna C) — valor CACHEADO/informativo únicamente. **Nunca** es la fuente de verdad del cupo — eso es un conteo en vivo desde la pestaña "Pilates" (`getAvailableCapacityForClass()`/`countActivePilatesRegistrations()`).
- `max_participantes` (columna D) — puede quedar VACÍA (se interpreta como default de 5).
- `event_id`/`meet_link` (columnas E/F) — el evento del calendario OPERATIVO (`PILATES_CALENDAR_ID`) que el sistema mismo crea cuando un cliente agenda de verdad.
- `disponibilidad_event_id` (columna G, US-43) — el ID del evento del calendario `Disponibilidad - Pilates` (`PILATES_AVAILABILITY_CALENDAR_ID`) que originó esta fila. Deliberadamente SEPARADA de `event_id`/`meet_link` — ver nota técnica #45.
- `duracion_minutos` (columna H, US-45) — la duración real de la clase, calculada como `fin - inicio` del evento de disponibilidad.

**Nota comparativa con nutrición (US-44):** esta capa intermedia (`Cupos_Pilates`) existe SOLO para pilates, porque pilates necesita capacidad por clase (varias personas por slot). Nutrición no la necesita ni la tiene — cada slot de nutrición es 1 cliente, y su disponibilidad se recalcula en vivo sin persistir nada.

### Pestaña "Clientes"
```
correo | nombre | apellido | telefono | tipo_id | numero_id | fecha_nacimiento | idioma |
cancelaciones_tardias | requiere_pago | cliente_nutricion | cliente_pilates
```

### Pestaña "Debug_US37" (NUEVA, 29 jul — herramienta de diagnóstico)
```
timestamp | mensaje
```
Creada durante la investigación de US-37 porque `Logger.log()`/`console.log()` no aparecían de forma confiable en ejecuciones reales del Web App. **Sigue existiendo en el Sheet — pendiente decidir si se limpia/vacía o se deja como herramienta de diagnóstico permanente para futuros problemas similares.**

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
| (nuevo) | Disponibilidad real de nutrición vía calendario de disponibilidad | ✅ **Done — US-44** |
| (pendiente) | Quitar banner de Google Apps Script | ⏸️ US-36 — decisión de equipo pendiente |

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

// Script Properties de calendario OPERATIVO — sin cambios por US-43/44/45:
// CALENDARS                        → (nutrición) JSON array, default ["primary"] si no
//                                     está configurada. CALENDARS[0] es donde se crean los
//                                     eventos reales de las citas de nutrición.
// PILATES_CALENDAR_ID              → (pilates) calendario OPERATIVO: donde el sistema crea
//                                     el evento real cuando un cliente agenda una clase.

// Script Properties de calendario de DISPONIBILIDAD (US-43/US-44) — de solo lectura para
// el sistema, SEPARADAS de las operativas de arriba, nunca deben confundirse ni fusionarse:
// PILATES_AVAILABILITY_CALENDAR_ID    → "Disponibilidad - Pilates": clases que la instructora
//                                        ofrece (eventos discretos, uno por clase).
// NUTRICION_AVAILABILITY_CALENDAR_ID  → "Disponibilidad - Nutrición": bloques abiertos que
//                                        Dani/Ali marcan (eventos que se tallan en sub-slots).
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
                                          // crear el nuevo. Frecuencia: everyMinutes(5).
addDisponibilidadEventIdColumnToCuposPilates() // migración de la columna G, ejecutada
addDuracionMinutosColumnToCuposPilates() // migración de la columna H (US-45), ejecutada
getAvailableCapacityForClass(fecha, hora): number // ÚNICA función que decide si una clase
                                                    // tiene cupo — max_participantes
                                                    // (Cupos_Pilates, default 5) menos
                                                    // countActivePilatesRegistrations()
countActivePilatesRegistrations(fecha, hora): number // fuente de verdad real del cupo
refreshCuposPilatesInscritosCache(fecha, hora) // actualiza la columna cacheada "inscritos"
findCuposPilatesRow(cuposData, fecha, hora): number // helper de lookup

// US-45 — duración dinámica de pilates — ✅ Done, validado en real
getPilatesClassDurationMinutes(fecha, hora): number // ÚNICA fuente de verdad para la
                                                       // duración de una clase de pilates ya
                                                       // agendada/por agendar

// US-44 — disponibilidad real de nutrición — ✅ Done, validado en real
getNutricionAvailabilityCalendarId() // getter de NUTRICION_AVAILABILITY_CALENDAR_ID
getNutricionAvailabilityBlocks() // lee bloques del calendario Disponibilidad - Nutrición
                                   // (Calendar.Events.list, singleEvents:true — expande
                                   // recurrencias), ventana de 8 semanas
fetchAvailability(type) // rama nutrición reescrita: talla cada bloque en sub-slots
                          // consecutivos según getDurationForType(type), sin huecos,
                          // excluye conflictos vía el Freebusy existente contra CALENDARS
                          // (sin cambios en esa parte). Rama pilates SIN CAMBIOS (regresión
                          // confirmada en el harness).
// WORKDAYS/WORKHOURS: constantes que quedan en el código SIN uso activo (plan de
// rollback) — ya no participan en el cálculo de disponibilidad de nutrición.
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
//   sin ningún número por defecto. Nutrición sigue con sus textos fijos de siempre
//   (su duración por tipo de cita NO es dinámica, solo su disponibilidad lo es, US-44).
```
`CalendarTimeslotPicker` exportado desde `calendar-picker.tsx` para reutilizar en reagendar. **US-44 no requirió ningún cambio de frontend** — el contrato de `fetchAvailability` (timeslots/durationMinutes) se mantuvo idéntico, solo cambió de dónde salen los timeslots en el backend.

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
```
Sin plantillas nuevas en US-43/US-44/US-45.

### Build pipeline (corregido 27 jul, nota #35)
```
backend/package.json → "build": "tsc && node copy-to-dist.js"
backend/copy-to-dist.js → copia backend/dist/app.js y backend/templates/*.html a ../dist/
```
El build del **frontend** (`vite build`) NO se copia automáticamente a `dist/index.html` — hay que hacerlo a mano antes de `clasp push` si hubo cambios de frontend. `build.sh` de la raíz sigue sin funcionar en cmd.exe.

**⚠️ Scope de manifest (29 jul, US-37):** se agregó `https://mail.google.com/` a `appsscript.json`. **Cualquier scope OAuth nuevo requiere autorización manual desde el editor una vez** — no basta con `clasp deploy`. **US-43/US-44/US-45 NO requirieron ningún scope nuevo** — el servicio avanzado de Calendar y el scope completo de `calendar` ya estaban habilitados desde antes; `getNutricionAvailabilityBlocks()` reutiliza exactamente el mismo mecanismo (`Calendar.Events.list`) que `getPilatesAvailabilityEvents()`, solo con un `calendarId` distinto.

### Test harness
`backend/test-harness/` — **322 aserciones, todas pasando** (subió de 307 con US-44: +15 — bloque parcial tallado en sub-slots exactos sin huecos, cero bloques → cero slots, sub-slot con conflicto real excluido, bloque recurrente semanal de nutrición expandido correctamente, y regresión explícita de que pilates no se vio afectado).

**Puntos ciegos confirmados del mock:**
- No valida el content-type real que `Utilities.newBlob()` acepta o rechaza (US-37).
- `Blob.setContentType()` en el mock no reproducía la mutación en el mismo lugar del objeto real (US-37).
- No reproduce el comportamiento real de Gmail al combinar imágenes embebidas en HTML + attachments (US-37, causa raíz de la nota #43).
- `Calendar.Events.list` no reproduce paginación (`pageToken`) ni límites de cuota del API real (US-43) — irrelevante hoy dado el volumen bajo, a revisar si crece mucho. Sí expande recurrencia semanal (`FREQ=WEEKLY` + `INTERVAL`/`COUNT`/`UNTIL` opcionales) para poder probarla en el harness, pero no es un parser RFC 5545 completo.
- El mock de Sheets (`appendRow()`/`getLastRow()` como array de JS síncrono) **no puede reproducir** el bug real de `getLastRow()` de la nota #46 — solo se confirmó contra el Sheet real de Google.
- **US-44 no agrega puntos ciegos nuevos** más allá de los ya conocidos de `Calendar.Events.list` — no toca Sheets en absoluto, así que no hereda el riesgo de la nota #46.

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
| **US-45** | Duración dinámica de clases de pilates + trigger de sync cada 5 min | ✅ **Done** (desplegada tras US-43, sobre el mismo deploymentId). **Validado en real.** |
| **US-44** | Disponibilidad real de NUTRICIÓN vía calendario de disponibilidad | ✅ **Done** (v81). **Validado en real** — dos bloques con hueco entre ellos, los 3 tipos de cita tallando correctamente. |
| **US-36** | Quitar banner de Google Apps Script | ⏸️ Investigado, **pendiente decisión de equipo** |

### US-43/US-44/US-45 — checklist real, ✅ TODO completado y validado
- [x] `clasp push` + `clasp deploy` de las tres tarjetas.
- [x] Migraciones ejecutadas (solo pilates): `addDisponibilidadEventIdColumnToCuposPilates()`, `addDuracionMinutosColumnToCuposPilates()`. **Nutrición no requirió ninguna migración** (sin Sheet intermedio).
- [x] `installPilatesAvailabilitySyncTrigger()` corrido (instaló primero cada hora, luego reinstalado a cada 5 min tras el fix de US-45). **Nutrición no requiere ningún trigger** (todo se calcula en vivo).
- [x] Clases/bloques de prueba marcados en ambos calendarios de disponibilidad y confirmados en la URL pública.
- [x] Pilates: `max_participantes=2` bloquea al 3er cliente; cancelar libera cupo; reagendar hacia clase llena bloquea con `CLASE_LLENA`.
- [x] Nutrición: bloque parcial talla sub-slots exactos; hueco entre bloques se respeta; los 3 tipos de cita comparten el bloque pero tallan independientemente.
- [x] `syncPilatesClassesToCuposSheet` confirmado idempotente contra el Sheet real tras el fix de `getLastRow()`.
- [x] Label de duración dinámico de pilates confirmado en el portal.
- [x] Trigger de 5 min confirmado sin duplicados tras reinstalar.

**Acción pendiente en Trello:** marcar todos los checkboxes de las tarjetas US-43/US-44/US-45 y moverlas a Done.

### Textos en BORRADOR pendientes de aprobación de Gabriela/Dani (acumulado)
Sin cambios desde la última ronda — ver historial. Ninguno bloquea funcionalidad.

### Pendientes conocidos, sin bloquear nada
- Acceso móvil: validado visualmente, no formalmente con dispositivo externo.
- Reemplazar destinatarios placeholder de Dani/Ali/instructora por correos reales.
- Decidir "enviar como"/Reply-To para pilates.
- Checklist de acceso de producción (sección 6).
- **Coordinar con Dani/Ali/instructora la carga de disponibilidad real** en ambos calendarios ANTES de considerar el sistema listo para producción — ver punto 24 de la sección 0.
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
- **`git push` pendiente** — hay commits locales (incluyendo el de US-44, `17e701a`) sin subir a `origin/master` todavía.

---

## 12. ENTORNO DE TESTING

| Dato | Valor |
|------|-------|
| Cuenta de testing | plantpoweredani.testing@gmail.com |
| **Versión activa** | **v81** — "US-44 disponibilidad nutrición", confirmada con `clasp deployments` |
| URL de testing | https://script.google.com/macros/s/AKfycbwNUEjG8CXo2D5bk2eq1w6wBrme9XqJpCqOt-TkP0otTypiXd7GCEk7L7uFhdDOLCaJ/exec |
| Editor Apps Script | https://script.google.com/d/1cu-HdKiAmfUYOgjwtjKcE9lCO6waLfFsL71PwP4GgcdGiQWzqygPS3fK/edit |
| Repo | https://github.com/juanartavia/plant-powered-dani |
| **Ubicación local del repo** | `C:\dev\plant-powered-dani` — **NO en OneDrive** |
| Spreadsheet testing | https://docs.google.com/spreadsheets/d/16M6WUqMAK9XkVoIutIn9UkJojlS5biT5o470GySs5gw/edit |
| Harness de pruebas | `backend/test-harness/` — **322 aserciones, todas pasando** |
| Calendario `Disponibilidad - Pilates` (testing) | Creado en `plantpoweredani.testing@gmail.com` |
| Calendario `Disponibilidad - Nutrición` (testing) | Creado en `plantpoweredani.testing@gmail.com`, ID guardado en `NUTRICION_AVAILABILITY_CALENDAR_ID` |
| Cuenta secundaria de prueba (Outlook) | `juan.artavia.urena@est.una.ac.cr` — en realidad es Google Workspace educativo, NO un buzón real de Outlook |

### Links de testing
```
Consulta Inicial (disponibilidad dinámica, US-44): .../exec?type=initial
Cita de Seguimiento (disponibilidad dinámica, US-44): .../exec?type=followup
Solo Medición (disponibilidad dinámica, US-44): .../exec?type=measurement
Clase de Pilates (horario y duración dinámicos, US-43/US-45): .../exec?type=pilates
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
| v75-v76 | **US-37 Done** — fix real: imágenes vía `inlineImages`+`cid` en vez de base64 en `<img>`. |
| v77 | **US-43 Done** — cupos de pilates dinámicos, incluye el fix real de `getLastRow()` post-`appendRow()` en el sync (ver nota #46). |
| v78-v80 | **US-45 Done** — duración dinámica de clases de pilates + trigger cada 5 min (rondas intermedias incluyendo el gotcha de `clasp push` vs `clasp deploy`, ver nota #46). |
| v81 | **US-44 Done** — disponibilidad real de nutrición vía calendario de disponibilidad. Confirmado en real con bloques y hueco de prueba. **Deploy activo.** |

---

## 13. NOTAS TÉCNICAS CRÍTICAS

*(Notas 1-42 sin cambios — ver versión anterior del documento para el detalle completo de Sprint 1-3, incluyendo el incidente de recuperación de OneDrive.)*

**43. La investigación más larga del proyecto hasta antes de US-43: el adjunto `.ics` de US-37 se perdía en silencio dentro de `GmailApp.sendEmail()` — causa raíz real: imágenes embebidas en base64 dentro del HTML.**

**Síntoma:** el correo de confirmación debía llevar 4 botones de calendario + una invitación `.ics` real adjunta. Los 4 botones funcionaban perfecto. El adjunto `.ics`, en cambio, **nunca llegaba** al correo real — confirmado repetidamente con "Mostrar original" en Gmail.

**Causa raíz real, encontrada con una prueba de control A/B:** un correo de prueba armado SIN ninguna imagen embebida en el HTML sí traía el adjunto `.ics` perfecto. Con las imágenes (incrustadas como `<img src="data:image/png;base64,...">` directo en el HTML), el adjunto se perdía. **Gmail, al procesar un correo con imágenes embebidas de esta forma, las extrae internamente como adjuntos reales al momento de enviar — desplazando/descartando cualquier adjunto real que hayamos agregado nosotros mismos en el mismo envío.**

**Fix definitivo:** reemplazar `<img src="data:image/png;base64,...">` por `<img src="cid:nombre_del_cid">` + la opción `inlineImages: { nombre_del_cid: Blob }` en `GmailApp.sendEmail()`.

**Regla reforzada:** nunca combinar `<img src="data:...;base64,...">` directo en el HTML con un adjunto real en la misma llamada a `GmailApp.sendEmail()` — usar siempre `inlineImages`+`cid:`. El harness no puede detectar este tipo de bug — solo se confirma contra Gmail real.

**44. `HTMLInputElement.showPicker()` lanza `SecurityError` dentro del iframe cross-origin de Apps Script Web Apps — API descartada por completo para este proyecto (US-40, 29 jul).**

Apps Script sirve el portal dentro de un iframe de 3 niveles, cross-origin respecto al top-level. `showPicker()` está bloqueado por especificación del navegador cuando se llama desde un iframe que no comparte origen con el documento de nivel superior. **Regla reforzada:** para cualquier funcionalidad que dependa de abrirse dentro del portal, nunca depender de esta API.

**45. US-43 (cupos de pilates dinámicos, 30 jul) — conflicto de schema detectado ANTES de escribir código, y una reordenación de operaciones descubierta a medio camino.**

**Conflicto de schema, resuelto ANTES de tocar código:** el prompt original pedía reutilizar `event_id`/`meet_link` de `Cupos_Pilates` (E/F) para el dedup del sync — pero esas columnas ya estaban en uso productivo para el evento OPERATIVO. Se resolvió agregando una columna nueva y separada (`disponibilidad_event_id`, columna G). **Lección:** cuando un prompt describe un cambio de schema sobre una tabla que el código YA usa activamente, revisar los usos existentes de esas columnas ANTES de escribir una sola línea.

**Reordenación de operaciones en `rescheduleBooking` (pilates):** con el cupo pasando de contador cacheado a conteo en vivo, el ORDEN de las operaciones sí importa — `leavePilatesSlot` (slot viejo) debe correr DESPUÉS de que la fila del cliente ya se haya movido al horario nuevo, o cuenta mal el cupo liberado. Encontrado escribiendo el Test 72 del harness, no leyendo el código.

**46. US-43 (30 jul) — bug real de `getLastRow()` llamado justo después de `appendRow()` dentro de un loop sin flush, encontrado probando contra el Sheet real, invisible para el harness. Más el gotcha de `clasp push` vs `clasp deploy`.**

**Causa raíz:** `syncPilatesClassesToCuposSheet()` llamaba `cuposSheet.getLastRow()` inmediatamente después de cada `cuposSheet.appendRow()`, repetidas veces dentro del mismo loop, sin flush. En Sheets real (a diferencia del mock del harness, siempre consistente), esto no garantiza reflejar la escritura todavía — varias iteraciones escribieron sobre la MISMA fila vieja en vez de 8 filas nuevas distintas.

**Fix:** el número de fila se calcula una sola vez a partir del largo de los datos ya leídos al inicio de la función, y se incrementa localmente en cada iteración, sin volver a preguntarle a Sheets a mitad del loop.

**Gotcha relacionado (US-45):** después de pushear el fix de duración dinámica, el portal público seguía mostrando "60 min" — no porque el fix estuviera mal, sino porque `clasp push` solo actualiza el HEAD del editor; la URL pública `/exec` solo se mueve con `clasp deploy` explícito. **Regla reforzada:** si un fix pusheado "no se refleja" en el portal real pero sí funciona corriendo la función manualmente desde el editor, sospechar primero de un deploy pendiente.

**Regla reforzada para cualquier código futuro que escriba a Sheets dentro de un loop:** nunca volver a preguntarle a Sheets su propio estado inmediatamente después de una escritura sin flush — calcular la posición localmente a partir de una lectura hecha una sola vez al inicio. Ya es la tercera vez que este patrón exacto aparece en el proyecto.

**47. US-44 (30 jul) — nutrición y pilates leen calendarios de disponibilidad con el mismo espíritu, pero con modelos de cómputo deliberadamente distintos; y un límite real de las pruebas manuales desde el editor de Apps Script con funciones parametrizadas.**

**Por qué el modelo NO es el mismo entre nutrición y pilates, a propósito:** pilates es agendamiento de **clases discretas** — cada evento en `Disponibilidad - Pilates` ES una clase completa y reservable tal cual (con su propia capacidad, vía `Cupos_Pilates`). Nutrición es agendamiento **continuo** — cada evento en `Disponibilidad - Nutrición` es un **bloque abierto** que el sistema tiene que "tallar" en sub-slots consecutivos según la duración del tipo de cita solicitado, sin dejar huecos. Intentar reutilizar el código de pilates tal cual para nutrición habría sido un error — el patrón de "leer Calendar.Events.list con singleEvents:true" sí se comparte, pero lo que se hace con esos eventos después es fundamentalmente distinto. Antes de escribir código para cualquier tarjeta futura de este estilo, confirmar primero si el dominio es de clases discretas o de tiempo continuo — determina toda la arquitectura de la solución.

**Investigación previa (Paso 0) sin conflictos, a diferencia de US-43:** nutrición resultó ser una tarjeta estructuralmente más simple que pilates — no tiene ninguna Script Property de calendario operativo dedicada (usa la genérica `CALENDARS[0]`, ya existente desde antes) y no tiene ninguna capa intermedia tipo `Cupos_Pilates` (su disponibilidad se calcula 100% en vivo, sin persistir nada). Esto significó: sin necesidad de sync, sin trigger, sin columna de dedup, y sin ningún riesgo del bug de `getLastRow()`/`appendRow()` de la nota #46, porque este flujo no escribe a ningún Sheet. Investigar la arquitectura existente ANTES de codear (mismo hábito que evitó el conflicto de schema en US-43) confirmó esto de entrada, en vez de descubrirlo a medio camino.

**Límite real de las pruebas manuales desde el editor, descubierto en esta tarjeta:** correr una función manualmente desde el editor de Apps Script (botón "Ejecutar") solo funciona sin fricción para funciones sin parámetros, o cuyos parámetros se puedan editar directo en el código antes de correr. `fetchAvailability(type)` requiere un parámetro (`"initial"`, `"followup"`, `"measurement"`) que el editor no permite pasar por la UI de "Ejecutar". **Regla reforzada:** para cualquier función parametrizada, la única prueba real posible es a través del portal público con el parámetro correcto en la URL — no perder tiempo intentando correrla "a mano" desde el editor solo para confirmar el comportamiento de negocio; el editor sirve para correr funciones de instalación/migración (sin parámetros o con parámetros fijos en el código), no para probar lógica que depende de input externo.

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
- Cualquier scope OAuth nuevo en `appsscript.json` requiere autorización MANUAL una vez desde el editor antes de que funcione en ejecuciones reales del Web App — no basta con `clasp deploy`.
- Ante un bug donde "todo se ve bien en nuestras variables pero el resultado real no aparece", diagnosticar contra el sistema externo real, no solo contra el propio código.
- Nunca combinar imágenes en base64 embebidas con adjuntos reales en el mismo correo — usar `inlineImages`+`cid:`.
- `showPicker()` y cualquier API sensible al origen del documento no se pueden usar dentro del portal.
- Antes de dar por buena cualquier funcionalidad nueva del portal, probarla contra la URL pública real.

### Reglas añadidas el 30 jul (US-43/US-44/US-45)
- **Nunca llamar `sheet.getLastRow()` inmediatamente después de `sheet.appendRow()` dentro de un loop, sin flush entre medio.** Calcular la posición localmente a partir de una lectura hecha una sola vez, incrementando un contador propio.
- **Antes de escribir código sobre una tabla/Sheet que el proyecto YA usa activamente**, revisar primero los usos existentes de las columnas involucradas (ver nota #45).
- **`clasp push` no mueve la URL pública `/exec`** — solo actualiza el HEAD del editor. Si un fix pusheado parece "no aplicarse" en el portal real, sospechar primero de un `clasp deploy` pendiente.
- Cuando la fuente de verdad de un conteo pasa de "contador cacheado" a "conteo en vivo desde otra tabla", revisar el ORDEN de las operaciones en cualquier flujo que mueva datos entre dos estados.
- **Antes de asumir que dos tarjetas de "leer disponibilidad desde Calendar" comparten arquitectura**, confirmar si el dominio es de clases discretas (como pilates) o de tiempo continuo a tallar (como nutrición) — determina todo el diseño (ver nota #47).
- **Correr funciones manualmente desde el editor de Apps Script solo sirve como prueba real para funciones sin parámetros** (instalación, migraciones). Para cualquier función parametrizada (ej. `fetchAvailability(type)`), la única prueba real es a través del portal público con el parámetro en la URL.

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
- **Acción pendiente en Trello:** mover US-34, US-40, US-42, US-37, **US-43, US-44, US-45** a Done (todas validadas en real).

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
- **`clasp deploy` sin `-V` explícito crea su propia versión nueva** — pasar siempre `-V <número>` explícito, y confirmar con `clasp deployments` cuál versión quedó realmente publicada.
- **`clasp push` actualiza el HEAD del editor, pero NO mueve la URL pública `/exec`** — esa solo se actualiza con `clasp deploy` explícito (ver nota #46).
- `build.sh` de la raíz no funciona en cmd.exe.
- Si se agrega un scope OAuth nuevo a `appsscript.json`, hay que actualizarlo tanto en la raíz como en `dist/appsscript.json` y autorizarlo manualmente corriendo cualquier función desde el editor una vez.
- **Para probar funciones parametrizadas (ej. `fetchAvailability(type)`), usar el portal público con el parámetro en la URL** — el botón "Ejecutar" del editor no permite pasar argumentos (ver nota #47).

---

## 17. REGISTRO DE CAMBIOS (resumen)

| Fecha | Cambio |
|-------|--------|
| *(ver versiones anteriores para historial completo hasta 28 jul)* | |
| 27-28 jul 2026 | Incidente grave de OneDrive, recuperación completa backend+frontend. US-33 completada con plantilla de branding real. US-41 resuelto. |
| 29 jul 2026 | **US-34/US-40/US-42/US-37 Done** — ver versiones anteriores del documento para el detalle completo de cada una. Deploy final: v76. |
| 30 jul 2026 | **US-43 Done, validado en real** (cupos de pilates dinámicos vía calendario `Disponibilidad - Pilates`). Conflicto de schema resuelto antes de codear (columna `disponibilidad_event_id` separada, nota #45). Bug real de `getLastRow()`/`appendRow()` encontrado y corregido contra el Sheet real (nota #46). Deploy: v77. **US-45 Done, validado en real** (duración dinámica de pilates + trigger cada 5 min, gotcha de `clasp push` vs `clasp deploy` documentado). **US-44 Done, validado en real** (disponibilidad real de nutrición vía calendario `Disponibilidad - Nutrición`, modelo de tallado de bloques en sub-slots — deliberadamente distinto al de pilates, ver nota #47). Investigación previa (Paso 0) confirmó que nutrición no tiene calendario operativo dedicado ni capa Sheet intermedia, haciendo esta tarjeta más simple que pilates. Deploy: v81. Harness: 322 aserciones, todas pasando. Commits locales hechos, `git push` pendiente. |

---

*Última actualización: 30 julio 2026 — **US-43, US-44 y US-45 Done, las tres validadas en real contra la URL pública** (deploy activo v81), no solo en el harness (322 aserciones). Pendientes reales para continuar: mover las tres tarjetas a Done en Trello, hacer `git push` de los commits locales pendientes, coordinar con Dani/Ali/instructora la carga de disponibilidad real en ambos calendarios antes de producción, decisión de equipo sobre US-36, aprobación formal de textos BORRADOR, correos reales de Dani/Ali/instructora, decisión sobre US-20, validación móvil formal, reconstrucción del historial de deploys v28-v42, y confirmar Yahoo con una cuenta real cuando se consiga una.*