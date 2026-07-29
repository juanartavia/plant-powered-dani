# CLAUDE.md — Plant Powered by Dani
## Sistema de Agendamiento Automatizado
> Documento vivo — actualizar conforme avanza el desarrollo
> Última actualización: 28 julio 2026 — **Sistema funcionalmente completo de punta a punta.** Todo el flujo de correos (confirmación, recordatorio 48h, notificación interna, cancelación tardía), la página de gestión de citas (reagendar/cancelar/confirmar asistencia), y el brandbook están Done, desplegados y validados en real. Además, hoy se recuperó por completo un incidente de corrupción de OneDrive que afectó tanto backend como frontend — ver nota técnica #42 para el detalle. Deploy activo: **v48**.
>
> ⚠️ **Nota crítica sobre este documento (repetida, léela con atención):** este archivo ya sufrió DOS VECES el mismo problema — una versión parcheada incrementalmente sobre una copia vieja, sin que alguien reemplazara primero con la versión completa más reciente. La primera vez fue documentado en la nota #11 original (ronda de US-28). La segunda vez ocurrió el 27-28 de julio: al reconstruir el repo tras el incidente de OneDrive, `git clone` trajo de vuelta un CLAUDE.md desactualizado (de la era ~17-18 jul, antes de que existieran US-11 a US-32 completas), y los parches de esa sesión (US-33, recuperación de frontend) se aplicaron sobre esa base vieja sin corregirla primero. **Esta versión que estás leyendo ahora es la reconstrucción consolidada y correcta** — reemplaza cualquier otra copia con esta.
> **Regla reforzada, otra vez:** antes de patchear este archivo, SIEMPRE confirmar que la copia sobre la que se va a editar es realmente la más reciente y completa — comparar contra el estado real de deploys/Trello si algo se ve inconsistente, no asumir que "está bien" solo porque abre sin errores.

---

## 0. LÉEME PRIMERO — PARA EL PRÓXIMO CHAT

Si estás retomando este proyecto en un chat nuevo, este documento es tu única fuente de verdad. Antes de generar cualquier prompt para Claude Code:

1. Lee completo este documento, especialmente las secciones 11 (estado de sprints), 13 (notas técnicas), y 14/15 (método de trabajo y Trello).
2. **Todo el flujo de correos, gestión de citas, y branding está Done y probado de punta a punta con citas reales:**
   - **US-11 a US-14** — Familia completa de correos automatizados (confirmación, recordatorio 48hrs, notificación interna, y ahora también la alerta de cancelación tardía de US-33).
   - **US-13/US-30** — Notificación interna a Dani/Ali en agendar/reagendar/cancelar.
   - **US-31** — Página visual de reagendar/cancelar/confirmar asistencia (RF-2.6). Backend y frontend completos.
   - **US-32** — Notificación interna cuando el cliente confirma su asistencia + correo al cliente al reagendar/cancelar.
   - **US-33** — Notificación de cancelación tardía (RF-2.5), con plantilla de branding real (no HTML armado a mano).
   - **US-28** — Look & feel del portal según brandbook: colores, tipografía Jost, logo.
   - **US-41** — Quitado el título `CardTitle` redundante en la pantalla de cancelación.
3. **Bug crítico histórico, ya corregido:** los links de los correos usaban `ScriptApp.getService().getUrl()`, que devuelve `/dev` (deployment HEAD, roto) en vez de `/exec` (URL pública real) cuando el código corre por ejecución manual desde el editor. Corregido con una constante fija `WEB_APP_URL`. Ver nota técnica #40.
4. **Lección de arquitectura (US-28):** el portal se compila a un ÚNICO archivo HTML inlineado (`vite-plugin-singlefile`) — `frontend/public/` NO sirve para nada en producción. Cualquier asset nuevo debe importarse como módulo para que Vite lo incruste en base64. Ver nota técnica #41.
5. **Gap de build detectado y corregido (27 jul):** `backend/package.json` tenía `"build": "tsc"`, que NO copiaba nada a `dist/` de la raíz — esto permitía un `clasp push` "exitoso" con código desactualizado, sin ningún error visible. Corregido con `backend/copy-to-dist.js`. Ver nota técnica #35.
6. **Incidente grave de corrupción de OneDrive (27-28 jul), completamente recuperado.** El repositorio local vivía dentro de una carpeta sincronizada por OneDrive, que corrompió el `.git` (sin commits, sin remote) y borró archivos completos del disco — no solo el historial de git. Se perdieron y recuperaron: `backend/src/app.ts`, las 10 plantillas de correo, y **todo `frontend/src/`** (incluyendo `manage-booking.tsx`, sus 4 hooks, y el brandbook completo de US-28). Ver nota técnica #42 para el episodio completo, y la nota crítica al inicio de este documento sobre el CLAUDE.md desactualizado que este mismo incidente generó.
7. **El proyecto ahora vive en `C:\dev\plant-powered-dani`, NO en la carpeta antigua de OneDrive.** La carpeta `Documentos` de Windows en esa máquina quedó permanentemente redirigida a OneDrive (Copia de seguridad de carpetas conocidas) — cualquier trabajo futuro debe hacerse en `C:\dev\`, nunca dentro de `OneDrive\Documentos\...`.
8. **US-20 (token único)** cubierta en su totalidad por US-06/US-31, validada en real — pendiente que el usuario la cierre/archive en Trello.
9. **Pendientes de fondo, de baja urgencia, confirmados como seguros de dejar así:**
   - `fecha_nacimiento` (copia en Nutrición/Pilates) y `fecha_creacion`/`fecha_inscripcion` siguen coercionadas a Date real en Sheets — confirmado cosmético.
   - `findClientByEmail()` lee `fecha_nacimiento` con `TIME_ZONE` en vez de `UTC` — bajo riesgo.
   - Acceso desde móvil: validado visualmente en desarrollo (Playwright, viewport 375px) pero no formalmente con un dispositivo real de un usuario externo.
10. **Destinatarios de notificaciones internas siguen en placeholder** (correo de testing para "Dani"/"Ali"/"instructora") — reemplazar antes de producción (Sprint 3).
11. **Varios textos de copy siguen en BORRADOR**, pendientes de aprobación de Gabriela/Dani (lista completa en sección 11) — no bloquean nada.
12. Sigue el flujo de trabajo de siempre: prompt → Claude Code ejecuta → **commit inmediato tras deploy** → **probar en real antes de marcar cualquier checkbox** → actualizar CLAUDE.md.
13. **Pedir siempre el checklist real de Trello antes de generar un prompt nuevo** — varias tarjetas de este proyecto han tenido checklists distintos a lo que sugería el título.
14. **Antes de patchear este documento, confirmar que es la versión más completa y reciente** — no una parchada incrementalmente sobre una copia vieja (ver nota crítica al inicio; ya pasó dos veces).
15. **Regla reforzada de US-31:** cualquier link construido para apuntar al propio Web App debe usar `WEB_APP_URL` fija, nunca `ScriptApp.getService().getUrl()`.
16. **Lista de todo lo construido SIN diseño de Gabriela** (para revisar con ella cuando haya oportunidad):
    - Extensiones sobre diseños que ella sí hizo: botón "Agregar a mi calendario", notificación interna con 3 variantes (reagendada/cancelada), correo al cliente al reagendar.
    - 100% nuevo sin ninguna referencia de ella: correo de cancelación al cliente, toda la página web de gestión de citas (US-31), y la plantilla de alerta de cancelación tardía (US-33, basada en el esqueleto de otra notificación de Gabriela pero con contenido/colores propios).
17. **Pendiente de fondo, no urgente:** hay una segunda carpeta de recuperación de OneDrive (más completa, con `.git` propio y `design-reference/`) que nunca se terminó de auditar — podría contener el historial de git real que falta reconstruir en la sección 12. Revisar cuando haya oportunidad.
18. `build.sh` de la raíz no ejecuta correctamente en `cmd.exe`/Windows (falla con `"." no se reconoce como comando`) — pendiente para Sprint 3, no bloquea porque `backend/package.json` ya compila y copia correctamente por su cuenta.

---

## 1. CONTEXTO DEL PROYECTO

### El cliente
**Plant Powered by Dani** — estudio de nutrición y pilates en Costa Rica.
- **Dani**: nutricionista, admin principal del sistema. Vio el sistema en demo (17 jul), quedó satisfecha.
- **Instructora de pilates**: cuenta separada bajo el mismo dominio. Recordatorios de pilates salen desde su correo (pilates no tiene recordatorio de 48hrs, solo nutrición).
- **Ali (secretaria)**: distribuye los links de agendamiento por WhatsApp. Recibe las notificaciones internas junto con Dani.

### El negocio
- Atiende clientes en **español e inglés**, incluyendo clientes en **Estados Unidos** (zonas horarias múltiples)
- Modalidades: presencial y virtual
- Infraestructura: **Squarespace** + **Google Workspace** (Gmail, Calendar, Sheets, Drive, Forms, Meet)
- Dominio: `PlantPoweredbyDani.com`
- **Squarespace fuera de alcance del MVP** (confirmado en P27) — la cuenta de Dani no soporta bien iframes/código embebido en su plan actual.

### Facturación del proyecto
- Una sola factura electrónica al final del proyecto
- Pago en colones, transferencia a cuenta BAC de AutomáTica

### Dirección física de la consulta (nutrición, citas presenciales) ✅ CONFIRMADO Y EN USO
```
Santa Ana Town Center
Work Space Republic – Segundo piso
Consultorio #33
```

---

## 2. PROPUESTA COMERCIAL — LO QUE SE VENDIÓ

**Propuesta 1 — Calendario Base (₡655,000 IVA incluido) — APROBADA**
**Empresa:** AutomáTica | **Plazo:** 3 semanas | **Soporte:** 1 mes post-entrega

### Incluido
- Portal de agendamiento self-service por link directo (sin landing page)
- Disponibilidad en tiempo real desde Google Calendar
- Duración automática según tipo de cita
- Selector de modalidad donde aplique
- Detección automática de zona horaria del cliente (crítico — clientes en EEUU)
- Verificación de conflictos antes de confirmar
- Sin cuenta de Google requerida — acceso por link con token único
- Correo de confirmación personalizado por tipo de cita (bilingüe)
- Link único por cita para reagendar o cancelar (token UUID v4)
- Recordatorio automático 48 horas antes
- Notificación interna a Dani o instructora (agendar / reagendar / cancelar)
- Tracker show/no-show en Google Sheets
- Base de datos de clientes en Google Sheets
- Flujos completamente separados: nutrición y pilates
- Soporte bilingüe ES/EN completo
- Google Meet automático para citas virtuales

### NO incluido (Propuesta 2 / fuera de scope)
- ❌ Encuesta de satisfacción post-cita
- ❌ Correo automático de reagendamiento si no-show
- ❌ Landing page
- ❌ Pagos en línea
- ❌ App móvil
- ❌ WhatsApp / SMS
- ❌ Login de cliente
- ❌ Dashboard de analíticas avanzadas
- ❌ Clases privadas one-on-one de pilates

---

## 3. DECISIONES CONFIRMADAS

### Flujo del cliente
- **Primer contacto:** siempre humano, por WhatsApp
- **No hay landing page** — Ali y Dani distribuyen links directos por WhatsApp, un link distinto por tipo de cita
- **Confirmación:** automática al agendar, sin validación manual de Dani

### Política de cancelación y reagendamiento ✅ (US-06)
- **Tiempo mínimo para cancelar/reagendar: 24 horas de anticipación**
- Cancelación tardía → incrementa contador de cancelaciones tardías del cliente
- 2 cancelaciones consecutivas tardías → `requiere_pago=true` en "Clientes"

### ⚠️ Asimetría intencional: cancelar vs. reagendar con menos de 24hrs
| Acción | Con <24hrs de anticipación |
|--------|------------------------------|
| **Cancelar** | Siempre se permite. Se marca como tardía. |
| **Reagendar** | Se BLOQUEA por completo (`VENTANA_REAGENDAMIENTO_VENCIDA`). |

### Ventana de agendamiento
| | Nutrición | Pilates |
|---|---|---|
| **Ventana mínima** | 48 horas | 12 horas |
| **Ventana máxima** | 8 semanas | 8 semanas |

### Formulario del cliente
Nombre, Apellido, Correo, Teléfono, Tipo de identificación + Número, Fecha de nacimiento (mín. 15 años), Modalidad (solo initial/followup). Sin notas. Idioma solo en Paso 1.

### Edad mínima: 15 años ✅ Doble capa frontend+backend en `upsertClient()`.

### Idioma ✅ Selector con banderas SVG reales, solo en Paso 1.

### Flujo del formulario en 3 pasos ✅ Calendario → Correo → Datos.

### Creación de evento y Meet ✅ Evento se crea después de escritura exitosa en Sheet.

### Reagendar y cancelar ✅ Backend (US-06) + Frontend (US-31) — 100% completo.

---

### 3-a. Correos automatizados — modelo de zona horaria (regla permanente)

| Correo | Audiencia | Zona horaria mostrada |
|---|---|---|
| Confirmación (US-12) | Cliente | La DEL CLIENTE (`clientTimezone`) |
| Recordatorio 48hrs (US-14) | Cliente | La DEL CLIENTE (`clientTimezone`) |
| Reagendamiento/cancelación (mejora en US-32) | Cliente | La DEL CLIENTE (`clientTimezone`) |
| Notificación interna (US-13/US-30/US-32) | Dani/Ali | SIEMPRE Costa Rica (`TIME_ZONE`) |
| Alerta de cancelación tardía (US-33) | Dani/instructora/Ali | SIEMPRE Costa Rica (`TIME_ZONE`) |

El evento de Calendar y las ventanas de anticipación/cancelación son cálculos internos que **siempre** usan `TIME_ZONE`.

**Invitación nativa de Google Calendar:** `sendUpdates: "none"` en creación/reagendamiento. `Calendar.Events.remove()` (cancelar) se dejó en `"all"` — decisión explícita del usuario.

**Botón "Agregar a mi calendario"** — EXPERIMENTAL, en las 4 plantillas de confirmación. No es diseño de Gabriela.

### 3-b. Modelo de notificación interna (US-13/US-30) — un solo template, 3 acciones

Un solo archivo (`notificacion_interna_nueva_cita.html`) sirve para nutrición/pilates y para `tipoAccion: "agendada" | "reagendada" | "cancelada"`:

| tipoAccion | Título | Color del badge |
|---|---|---|
| agendada | Original de Gabriela | Verde/rosado original |
| reagendada | "Cita/Clase reagendada" | `#B9BD5B` (oliva) |
| cancelada | "Cita/Clase cancelada" | `#8B8B8B` (gris) |

### 3-c. Recordatorio de 48hrs (US-14) — solo nutrición

Pilates NO tiene recordatorio — decisión de negocio confirmada.
- Trigger de tiempo (`sendRemindersJob`, cada hora), instalado manualmente (`installRemindersTrigger()`).
- Ventana de envío: 47-49 horas antes.
- 3 botones: Confirmar asistencia, Reagendar, Cancelar.

### 3-d. Dos formatos de link — RESUELTO con US-31

- **Confirmación (US-12):** `linkReagendar` sin `accion` → menú "¿Qué deseas hacer?".
- **Recordatorio (US-14):** `?token=...&accion=confirmar|reagendar|cancelar` → pantalla directa.

### 3-e. Página visual de gestión de citas (US-31) — ✅ Done, recuperada 28 jul

- `doGet()` extendido: si la URL trae `?token=`, sirve el SPA en modo "gestionar mi cita".
- Endpoint `getManageBookingInfo(token)` — versión saneada de `findBookingByToken`.
- 4 pantallas en `manage-booking.tsx`: menú, confirmar asistencia, reagendar, cancelar (con `AlertDialog`).
- **Título redundante quitado (US-41, 28 jul):** la pantalla de cancelación ya no repite "Cancelar cita" como header — solo queda la tarjeta de detalles + el botón rojo.
- Errores mapeados a mensajes bilingües claros y distintos entre sí.
- Probado con Playwright (4 pantallas + diálogo cancelar + calendario reagendar + EN + móvil) y **validado de punta a punta en la URL pública real** (no solo local) — reagendar, cancelar, confirmar asistencia, token inválido, cita cancelada.

### 3-f. Bug crítico: `getUrl()` sensible al contexto de ejecución — RESUELTO

Ver nota técnica #40. Fix: constante `WEB_APP_URL` fija.

### 3-g. Correo al cliente al reagendar/cancelar (mejora dentro de US-32)

- **Reagendar:** reutiliza `renderConfirmationEmail()` con `tipoAccion: "reagendada"`.
- **Cancelar:** plantilla nueva y simple (`correo_cancelacion_cliente_{es,en}.html`), función `renderCancellationEmail()`.

### 3-h. US-32 — Notificación interna de asistencia confirmada — ✅ Done

Plantilla de Gabriela (`notificacion_interna_confirmada.html`), función dedicada `renderNotificacionInternaConfirmada`/`sendNotificacionInternaConfirmada`. Conectada en `confirmAttendance()`.

### 3-i. Brandbook del portal (US-28) — ✅ Done, recuperado 28 jul

- **Colores:** variables CSS en `index.css` — paleta: `#2C3F27` (verde oscuro), `#F9BFC6` (rosado), `#B9BD5B` (oliva), `#FFF9F1` (crema), `#EFE7DA` (borde).
- **Tipografía:** Jost real (4 pesos, vía `@font-face`) para títulos/subtítulos. Cuerpo con `Century Gothic/Futura/Trebuchet MS`.
- **Logo:** `logo.png` real, agregado en el header del portal (`calendar-picker.tsx`) y sobre el paso de calendario.
- **Las 4 pantallas de US-31 heredan el branding automáticamente**, sin código propio de color.
- Verificado en la URL pública real (no solo local): logo, fuentes y colores presentes en el HTML servido por `/exec`.

### 3-j. US-33 — Alerta de cancelación tardía (RF-2.5) — ✅ Done, plantilla con branding real

Cuando un cliente cancela con menos de `CANCELLATION_HOURS` (24hrs) de anticipación, además de la notificación interna general (US-13/US-30) se envía una segunda alerta aparte (`notifyLateCancellation` → `sendNotificacionCancelacionTardia`), dirigida a:
- **Nutrición** → Dani + Ali (Script Properties `DANI_EMAIL` + `ALI_EMAIL`)
- **Pilates** → instructora + Ali (`INSTRUCTORA_EMAIL` + `ALI_EMAIL`)

**Plantilla con branding real:** `backend/templates/notificacion_cancelacion_tardia.html`, construida a partir del esqueleto de `notificacion_interna_nueva_cita.html` (mismo logo, tipografía, estructura de tabla). `renderNotificacionCancelacionTardia()` usa `HtmlService.createTemplateFromFile()`, igual que `renderNotificacionInterna()`. Es **solo español** (igual que las otras notificaciones internas — van dirigidas al equipo, no al cliente).

**Diferenciación visual exigida por el checklist:** badge siempre rojo (`#C0392B`, "⚠️ Cancelación tardía"), caja de contexto roja con la anticipación real, filas de "Se canceló el"/"Anticipación real" en rojo, botón CTA rojo — ninguno de esos rojos se usa en una notificación normal. **Aprobado visualmente por el usuario** (capturas de Gmail real, nutrición y pilates).

**Columna por cita:** `cancelaciones_tardias` reutilizada en Nutrición (columna 20, ya existía como legacy), y **creada nueva en Pilates** (columna 17, nunca había existido ahí) vía `addCancelacionTardiaColumnToPilates()` — migración manual ejecutada una vez desde el editor.

**Script Properties:** `DANI_EMAIL`, `INSTRUCTORA_EMAIL`, `ALI_EMAIL` — configuradas en testing (mismo correo de testing en las 3, ya que solo hay una cuenta disponible) vía `setupLateCancellationEmailProperties()`, ejecutada una vez desde el editor.

**Trade-off de cobertura de tests, aceptado conscientemente:** el mock de `HtmlService.createTemplateFromFile()` en `gas-mock.js` devuelve un HTML fijo que ignora las variables inyectadas — mismo límite que ya tenían `renderNotificacionInterna()`/`renderConfirmationEmail()`. La verificación de que el HTML final se ve bien con datos reales queda en manos de revisión visual manual (`testSendNotificacionCancelacionTardia()` desde el editor) — ya hecha y aprobada.

**Test-harness:** Tests 35-39 específicos de US-33 (148/148 total en el harness completo).

---

## 4. TIPOS DE CITA

### Nutrición (flujo Dani)
| Tipo | ?type= | Duración | Modalidad |
|------|--------|----------|-----------|
| Consulta inicial | `initial` | 60 min | Presencial o virtual |
| Cita de seguimiento | `followup` | 45 min | Presencial o virtual |
| Solo medición | `measurement` | 15 min | Solo presencial |

### Pilates (flujo instructora)
| Tipo | ?type= | Duración | Modalidad | Formato | Horario | Ventana mínima | Máx. participantes |
|------|--------|----------|-----------|---------|---------|----------------|-------------------|
| Clase de pilates | `pilates` | 60 min | Virtual únicamente | Grupal | Sábados 10 AM | 12 horas | 5 personas |

**Pilates NO tiene recordatorio de 48hrs.**

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
```
Todos construidos con la constante fija `WEB_APP_URL` — nunca con `getUrl()`.

**⚠️ Pendiente de discusión con el equipo (US-36):** el banner "Un usuario de Google Apps Script creó esta aplicación" no se puede quitar con código — requiere alojar una página envoltorio (iframe) en otro dominio y cambiar el modelo de distribución de estos links. Ver conversación pendiente de reunión de equipo.

---

## 6. ACTORES DEL SISTEMA

| Actor | Rol |
|-------|-----|
| **Dani** | Admin/nutricionista. Bloquea disponibilidad en su Calendar. Recibe notificación interna en cada acción (correo de testing por ahora). |
| **Ali (secretaria)** | Distribuye links por WhatsApp. Recibe las mismas notificaciones que Dani (correo de testing por ahora). |
| **Instructora de pilates** | Calendar y correo propios. |
| **Cliente (ES/EN)** | Agenda, reagenda, cancela, confirma asistencia — todo vía link. Mayor de 15 años. |
| **Google Apps Script** | Motor de automatización. |

### Checklist de acceso necesario para producción
- Compartir Calendar real de la instructora con la cuenta de deploy.
- Reemplazar correos placeholder de Dani/Ali/instructora por los reales.
- Deploy final bajo cuenta de Dani (Sprint 3).

---

## 7. FLUJOS COMPLETOS

### Flujo principal — Agendar cita de nutrición ✅ 100% COMPLETO
```
1. Ali/Dani comparte link ?type=... por WhatsApp
2. Cliente ve calendario (zona propia), elige fecha/hora
3. Ingresa correo → busca en "Clientes"
4. Completa datos (valida edad, upsert)
5. Apps Script re-verifica ventana + LockService
6. Escribe fila (fecha/hora protegidas como texto plano)
7. Crea evento en Calendar + Meet si es virtual
8. Envía correo de confirmación (con "Agregar a mi calendario")
9. Envía notificación interna a Dani/Ali
10. [Solo nutrición] 47-49hrs antes: recordatorio con confirmar/reagendar/cancelar
11. Cliente hace clic en cualquiera de los 3 botones → página visual (US-31):
    - Confirmar → asistencia_confirmada=true → notificación interna (US-32)
    - Reagendar → nuevo horario → Sheet/Calendar actualizados → notificación interna + correo al cliente
    - Cancelar → confirmación explícita → Sheet/Calendar actualizados → notificación interna + correo de cancelación al cliente
      → Si fue con <24hrs: además, alerta especial de cancelación tardía (US-33) a Dani/instructora+Ali
```

### Flujo pilates ✅ Completo salvo recordatorio (no aplica)

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
cancelaciones_tardias (col 20, EN USO desde US-33) | requiere_pago (legacy) | event_id | asistencia_confirmada
```
**Estados posibles:** `Agendada` → `Reagendada` → `Cancelada`, también `Error_Calendar`.

`fecha`/`hora` — ✅ protegidas como texto plano.

`asistencia_confirmada` — marcada por `confirmAttendance(token)`.

`cancelaciones_tardias` (col 20) — booleano POR CITA, marcado por `markLateCancellationOnBookingRow()` (US-33). Distinto del contador acumulado en "Clientes".

### Pestaña "Pilates"
```
token | nombre | apellido | correo | telefono | tipo_id | numero_id | fecha_nacimiento |
fecha_clase | hora_clase | zona_horaria_cliente | idioma |
estado | fecha_inscripcion | recordatorio_enviado | show_no_show | cancelaciones_tardias (col 17, NUEVA — US-33)
```
`fecha_clase`/`hora_clase` protegidas igual que Nutrición. Columna `cancelaciones_tardias` (col 17) creada específicamente para US-33 vía `addCancelacionTardiaColumnToPilates()` — nunca existió antes.

### Pestaña "Cupos_Pilates"
```
fecha_clase | hora_clase | inscritos | max_participantes | event_id | meet_link
```

### Pestaña "Clientes"
```
correo | nombre | apellido | telefono | tipo_id | numero_id | fecha_nacimiento | idioma |
cancelaciones_tardias | requiere_pago | cliente_nutricion | cliente_pilates
```

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
| RF-2.2 | Correos de nutrición desde Dani, pilates desde instructora | ⚠️ Parcial — todo sale desde cuenta de testing hoy |
| RF-2.3 | Notificación interna en cada acción | ✅ Done |
| RF-2.4 | Recordatorio 48 hrs (solo nutrición) | ✅ Done |
| RF-2.5 | Notificación a Dani/Ali/instructora si cancelación tardía | ✅ **Done — US-33** |
| RF-2.6 | Frontend de reagendar/cancelar/confirmar asistencia | ✅ **Done — US-31** |
| (nuevo) | Notificación interna: cliente confirmó asistencia | ✅ **Done — US-32** |
| (nuevo) | Correo al cliente al reagendar/cancelar | ✅ **Done** (mejora dentro de US-32) |
| (nuevo) | Look & feel según brandbook | ✅ **Done — US-28** |
| (nuevo) | Quitar título redundante en vista de cancelación | ✅ **Done — US-41** |

---

## 10. STACK TÉCNICO

### Constantes clave
```typescript
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwNUEjG8CXo2D5bk2eq1w6wBrme9XqJpCqOt-TkP0otTypiXd7GCEk7L7uFhdDOLCaJ/exec";
// NO usar ScriptApp.getService().getUrl() para construir links propios — ver nota #40.

const NOTIFICACION_INTERNA_DESTINATARIOS = ["plantpoweredani.testing@gmail.com", "plantpoweredani.testing@gmail.com"];
// TODO: reemplazar por correos reales de Dani y Ali antes de producción.

// US-33 (Script Properties, no constantes de código):
// DANI_EMAIL, INSTRUCTORA_EMAIL, ALI_EMAIL — configuradas via setupLateCancellationEmailProperties()
```

### Funciones principales (backend, `backend/src/app.ts`)
```typescript
// US-11/US-12
renderConfirmationEmail(params): { subject, htmlBody }
buildAddToCalendarLink(params): string

// US-13/US-30
renderNotificacionInterna(params: { esPilates, tipoAccion, ... }): { subject, htmlBody }
sendNotificacionInterna(params): void

// US-14
renderRecordatorio48h(params): { subject, htmlBody }
sendRemindersJob(): void
installRemindersTrigger(): void
confirmAttendance(token): void
buildBookingActionLink(token, accion): string

// US-31 — backend
doGet(e) // extendido: ?token= sirve el SPA en modo gestión
getManageBookingInfo(token): {...}

// US-32
renderNotificacionInternaConfirmada(params): { subject, htmlBody }
sendNotificacionInternaConfirmada(params): void
renderCancellationEmail(params): { subject, htmlBody }

// US-33
notifyLateCancellation(booking, accion, canceladaEn): void
markLateCancellationOnBookingRow(booking): void
getLateCancellationRecipients(esPilates): string[]
setupLateCancellationEmailProperties(): void // helper idempotente
renderNotificacionCancelacionTardia(params): { subject, htmlBody }
sendNotificacionCancelacionTardia(params): void
addCancelacionTardiaColumnToPilates(): void // migración manual, ejecutada una vez
testSendNotificacionCancelacionTardia(): void // envío manual de las 2 variantes

// Fixes de fecha/coerción
normalizeSheetDateCell(value, pattern): string
appendBookingToSheet(...)
```

### Frontend (US-31/US-28)
```
frontend/src/components/manage-booking.tsx  // 4 pantallas de gestión de citas
frontend/src/hooks/useManageBookingInfo.tsx
frontend/src/hooks/useConfirmAttendance.tsx
frontend/src/hooks/useCancelBooking.tsx
frontend/src/hooks/useRescheduleBooking.tsx
frontend/src/index.css                      // paleta + @font-face Jost (US-28)
frontend/src/assets/logo.png                // importado como módulo, NO en public/
frontend/src/assets/fonts/Jost-*.ttf         // idem
```
`CalendarTimeslotPicker` exportado desde `calendar-picker.tsx` para reutilizar en reagendar.

### Build pipeline (corregido 27 jul, nota #35)
```
backend/package.json → "build": "tsc && node copy-to-dist.js"
backend/copy-to-dist.js → copia backend/dist/app.js y backend/templates/*.html a ../dist/
```
Portable entre cmd.exe/PowerShell/bash (no depende de comandos de shell tipo `cp`/`mkdir -p`). `build.sh` de la raíz sigue sin funcionar en cmd.exe — pendiente Sprint 3, no bloquea.

### Test harness
`backend/test-harness/` — **148 aserciones, todas pasando** (confirmado 28 jul, tras la recuperación completa). Cubre todos los flujos de agendar/reagendar/cancelar/confirmar/cancelación tardía, envío de correos (conteos exactos), casos de error, coerción de fecha, y fallo de Gmail sin bloquear la acción real.

**Recordatorio permanente:** el mock nunca reproduce la auto-coerción real de Google Sheets, ni las variables inyectadas en `HtmlService.createTemplateFromFile()` — cualquier fix relacionado necesita verificación manual adicional (Sheet real / revisión visual del correo).

---

## 11. SPRINTS Y ESTADO ACTUAL

### Sprint 2 — Completo salvo US-20 (decisión de Trello pendiente)

| US | Título | Estado |
|----|--------|--------|
| US-11 a US-14 | Familia de correos automatizados | ✅ **Todas Done** |
| US-13/US-30 | Notificación interna agendar/reagendar/cancelar | ✅ **Done** |
| US-20 | Token único por cita | ⚠️ Cubierta 100% por US-06/US-31 — pendiente que el usuario la cierre/archive en Trello |
| **US-28** | **Look & feel según brandbook** | ✅ **Done** — recuperado 28 jul tras incidente de OneDrive |
| **US-31** | **Página visual: reagendar/cancelar/confirmar asistencia** | ✅ **Done** — recuperado 28 jul tras incidente de OneDrive |
| **US-32** | **Notificación interna: cliente confirmó asistencia** | ✅ **Done** |
| **US-33** | **Alerta de cancelación tardía (RF-2.5)** | ✅ **Done** — plantilla de branding real aprobada visualmente |
| **US-41** | **Quitar título redundante en vista de cancelación** | ✅ **Done** (28 jul) |

### Textos en BORRADOR pendientes de aprobación de Gabriela/Dani (acumulado)
- Títulos ES/EN de seguimiento/medición y subject pilates ES/EN (US-11).
- Subject de notificación interna general.
- Subject/copy del recordatorio 48hrs.
- Título/subject del correo al cliente al reagendar y al cancelar.
- Subject de la notificación interna de "asistencia confirmada".

Ninguno bloquea funcionalidad.

### Sprint 3 (en curso, ver Trello para lista completa) — pendientes conocidos
- Acceso móvil: validado visualmente en desarrollo, no formalmente con dispositivo real externo.
- Reemplazar destinatarios placeholder de Dani/Ali/instructora por correos reales.
- Decidir "enviar como"/Reply-To para pilates.
- Checklist de acceso de producción (sección 6).
- Auditar `WORKDAYS`/`WORKHOURS` reales de nutrición.
- Reunir y enviar todos los textos BORRADOR a Gabriela/Dani para aprobación formal.
- Decidir en Trello el estado final de US-20.
- Verificar en producción real que el branding coincide con lo aprobado por Dani.
- Reconstruir el historial de deploys faltante entre v28-v42 (no bloquea nada).
- **US-36** (banner de Google Apps Script) — pendiente de decisión del equipo en reunión, ver sección 5. Investigado: requiere página envoltorio en otro dominio (GitHub Pages / Cloudflare Pages / subdominio propio), no se puede quitar solo con código.
- **US-37, US-40, US-42, y la de cupos de pilates** — nuevas tarjetas del demo reciente con Dani, checklists aún no revisados en detalle.
- Auditar la segunda carpeta de recuperación de OneDrive (con `.git` propio, `design-reference/`) por si contiene el historial de git real que falta.
- Arreglar `build.sh` para que funcione en cmd.exe/Windows (baja prioridad, no bloquea).
- Desactivar/mover la redirección de "Documentos" a OneDrive en la máquina de desarrollo, o seguir trabajando exclusivamente desde `C:\dev\`.

---

## 12. ENTORNO DE TESTING

| Dato | Valor |
|------|-------|
| Cuenta de testing | plantpoweredani.testing@gmail.com |
| **Versión actual** | **v48** |
| URL de testing | https://script.google.com/macros/s/AKfycbwNUEjG8CXo2D5bk2eq1w6wBrme9XqJpCqOt-TkP0otTypiXd7GCEk7L7uFhdDOLCaJ/exec |
| Editor Apps Script | https://script.google.com/d/1cu-HdKiAmfUYOgjwtjKcE9lCO6waLfFsL71PwP4GgcdGiQWzqygPS3fK/edit |
| Repo | https://github.com/juanartavia/plant-powered-dani |
| **Ubicación local del repo** | `C:\dev\plant-powered-dani` — **NO en OneDrive**, ver nota #42 |
| Spreadsheet testing | https://docs.google.com/spreadsheets/d/16M6WUqMAK9XkVoIutIn9UkJojlS5biT5o470GySs5gw/edit |
| Harness de pruebas | `backend/test-harness/` — 148 aserciones, todas pasando |

### Links de testing
```
Consulta Inicial (60 min): .../exec?type=initial
Cita de Seguimiento (45 min): .../exec?type=followup
Solo Medición (15 min): .../exec?type=measurement
Clase de Pilates (60 min): .../exec?type=pilates
```

### Historial de deploys (resumen — detalle fino de v28-v42 pendiente de reconstruir, no bloquea)
| Versión | Cambios principales |
|---------|----------------------|
| v8-v27 | Sprint 1 + primeros ajustes de Sprint 2 (ver versiones anteriores del documento) |
| v28-v42 | US-13/US-30, US-14, US-31 (primera versión), US-32, US-28, primera versión de US-33 (HTML armado a mano) — **historial detallado pendiente de reconstruir** |
| v43-v44 | Implementación completa de US-33 (backend) tras la recuperación del incidente de OneDrive (backend) |
| v45 | `clasp version` huérfana (sin deploy real detrás) |
| v46 | **US-33 — plantilla de branding real**, aprobada visualmente (nutrición y pilates) |
| v47 | `clasp version` huérfana (mismo patrón que v45) |
| v48 | **US-31 (frontend) + US-28 (brandbook) + US-41**, recuperados tras el incidente de OneDrive en frontend. Verificado en real: logo/fuentes/colores presentes en la URL pública, las 4 pantallas de gestión de citas funcionando de punta a punta. **Deploy activo.** |

---

## 13. NOTAS TÉCNICAS CRÍTICAS

*(Notas 1-34 sin cambios — ver versiones anteriores del documento para el detalle completo de Sprint 1 y primera mitad de Sprint 2.)*

35. **`backend/package.json` tenía `"build": "tsc"`, que NO copiaba nada a `dist/` de la raíz — gap detectado y corregido (27 jul).** El flujo real de deploy pasa por `build.sh` (raíz), que encadena `tsc` + copias a `dist/`. Si se corría `npm run build` dentro de `backend/` directamente, solo se ejecutaba `tsc` — `dist/app.js` de la raíz (el que `clasp push` sube de verdad) quedaba con la versión vieja, **sin ningún error visible**. **Regla reforzada:** `backend/package.json` → `"build"` ahora también copia `backend/dist/app.js` y `backend/templates/*.html` hacia `../dist/`. Antes de confiar en un `clasp push` "exitoso", verificar que `dist/app.js` realmente contiene el cambio esperado. **Detalle de implementación:** se usó un script `backend/copy-to-dist.js` (Node puro) en vez de `cp`/`mkdir -p`, porque en Windows `npm run build` ejecuta los scripts vía `cmd.exe`, no bash, y esos comandos no existen ahí.

36. **`appsscript.json` de la RAÍZ es la ÚNICA fuente de verdad completa del manifest** (incluyendo `runtimeVersion: "V8"`) — nunca editar `dist/appsscript.json` de forma independiente.

37. **Emoji Unicode no sirven como solución de iconografía multiplataforma.** Ver detalle histórico en versión anterior de este documento.

38-41. *(Ver versión anterior del documento — cubren: lección de arquitectura de `frontend/public/` en singlefile builds, y otras notas de la ronda de US-28/US-31.)*

42. **Incidente grave de corrupción de OneDrive (27-28 jul) — episodio completo, backend y frontend, ambos recuperados.**

   **Qué pasó:** el repositorio local vivía dentro de `C:\Users\...\OneDrive\Documentos\automatica-projects\plant-powered-dani` — una carpeta activamente sincronizada por OneDrive. En algún punto no identificado, OneDrive corrompió el `.git` (quedó con cero commits y sin remote configurado, aunque GitHub sí tenía historial real) y además **borró archivos completos del disco**, no solo el historial de git.

   **Backend, recuperado primero:** `backend/src/app.ts` (con todo el código de US-14/31/32/33) sobrevivió intacto en disco pese a la corrupción de git — se recuperó copiándolo a una carpeta nueva fuera de OneDrive (`C:\dev\plant-powered-dani`, clonada limpia desde GitHub) y reemplazando la versión vieja del clon. Las plantillas de correo (`backend/templates/*.html`) se habían perdido del disco, pero se recuperaron con `clasp pull` desde el proyecto real de Apps Script en Google — que sí las conservaba, aunque nunca se hubieran comiteado a git.

   **Frontend, descubierto perdido después, recuperado por una vía distinta:** al auditar el repo para trabajar en US-41, se descubrió que `frontend/src/components/manage-booking.tsx` (y sus 4 hooks asociados) no existía en NINGÚN lugar accesible desde la máquina: ni en el working tree, ni en ningún commit de git, ni en el VS Code Local History, ni siquiera en la copia corrupta de OneDrive en disco (que sí conservaba `components/ui/` y las fuentes `.ttf`, pero cero archivos `.tsx` de la app). La única fuente que sí lo tenía era **el historial de versiones del sitio web de OneDrive.com** — distinto del archivo sincronizado en disco, y accesible solo desde el navegador. El usuario restauró ahí una versión anterior de `frontend/src/` y la descargó como zip. Comparado archivo por archivo contra el repo actual antes de fusionar: todo el diff resultó aditivo (nunca hubo que elegir entre versiones en conflicto) — de paso, esa misma versión recuperada traía también el brandbook completo de US-28, que tampoco estaba en ningún otro lado.

   **Efecto secundario encontrado y corregido — CLAUDE.md desactualizado, otra vez:** el `git clone` limpio trajo de vuelta el último CLAUDE.md que SÍ estaba comiteado en GitHub — pero ese resultó ser una instantánea mucho más vieja (~17-18 julio, antes de que existieran US-11 a US-32 completas) que la versión "21 de julio consolidada" que se venía usando en el chat de análisis (esa nunca se había comiteado, vivía solo en el disco que se corrompió). Los parches de esta misma sesión de recuperación (notas #35/#36 originales, versiones v44-v48) se aplicaron sobre esa base vieja sin corregirla primero — repitiendo el mismo error ya documentado en la nota #11 original. Se corrigió reconstruyendo el documento completo a partir de la versión de 21 de julio + todo lo confirmado después.

   **Regla reforzada, para el futuro:**
   - Nunca trabajar un repo de git dentro de una carpeta sincronizada por OneDrive/Dropbox/similar — usar una ruta local genuina (`C:\dev\`, no `Documentos\` si esa carpeta tiene "Copia de seguridad de carpetas conocidas" activada).
   - Cuando una recuperación de incidente toca solo una parte del stack (ej. backend), auditar cada capa por separado — no asumir que el resto está a salvo solo porque no se mencionó.
   - El historial de versiones WEB de un servicio de sincronización (accesible desde el navegador) puede conservar archivos que la copia LOCAL sincronizada ya perdió — son fuentes de recuperación distintas, revisar ambas.
   - Antes de patchear CLAUDE.md incrementalmente, confirmar explícitamente que la copia base es la más completa y reciente conocida — comparar contra el estado real de Trello/deploys si algo se ve inconsistente (ver nota crítica al inicio de este documento).

---

## 14. MÉTODO DE TRABAJO

### Flujo por cada US
```
1. Este chat analiza la US (y el checklist real de Trello) y genera el prompt
2. Dev pega el prompt en Claude Code
3. Claude Code ejecuta los cambios
4. Dev pega la respuesta de Claude Code en este chat
5. Este chat analiza, detecta problemas, genera siguiente prompt si hace falta
6. clasp push → pasos manuales en el editor si aplica → clasp deploy
6.5. Inmediatamente después de un clasp deploy exitoso: git add . && git commit
7. Probar en el navegador real contra el deploy (URL pública, no solo local/Playwright)
   NO se marca nada como completado solo porque el código se escribió o Playwright pasó en local
8. Solo si la prueba real en la URL pública confirma que funciona → marcar checkbox(es) en Trello
9. Cuando todos los checkboxes de la tarjeta estén marcados → mover la tarjeta a Done
10. Actualizar CLAUDE.md — confirmando primero que la base sobre la que se edita es la más reciente
```

### Reglas añadidas en esta ronda (28 jul)
- Nunca trabajar el repo dentro de una carpeta de OneDrive/Dropbox — usar `C:\dev\` o equivalente.
- Al regenerar CLAUDE.md, verificar contra el estado real de Trello/deploys si algo se ve inconsistente — no confiar en que el archivo "se ve bien" solo porque abre sin errores.
- La prueba real que habilita marcar un checkbox en Trello es contra la URL pública desplegada, no solo Playwright en `localhost` — Playwright confirma que el código no se rompió, no reemplaza la validación en producción.

**URL del editor:** https://script.google.com/d/1cu-HdKiAmfUYOgjwtjKcE9lCO6waLfFsL71PwP4GgcdGiQWzqygPS3fK/edit

---

## 15. FLUJO DE TRABAJO — TRELLO

### Estados de las tarjetas
```
Backlog → In Progress → Done
```

### Reglas
- Al **iniciar** una US → moverla a **In Progress**
- Al **completar todos los checkboxes, validados en real** → moverla a **Done**
- **Ningún checkbox ni tarjeta se marca como completado/Done solo porque Claude Code terminó de escribir el código** — requiere prueba real confirmada primero, contra la URL pública.

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
# Si hay migraciones nuevas: ir al editor, ejecutarlas manualmente, ANTES del deploy
clasp version "descripción del cambio"
clasp deploy --deploymentId AKfycbwNUEjG8CXo2D5bk2eq1w6wBrme9XqJpCqOt-TkP0otTypiXd7GCEk7L7uFhdDOLCaJ --description "descripción"
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
- `clasp deploy` sin `-V` explícito crea su propia versión nueva (puede diferir de la última creada con `clasp version`) — no es un error, solo confirmar con `clasp deployments` cuál versión quedó realmente publicada.
- `build.sh` de la raíz no funciona en cmd.exe — usar el flujo de `npm run build` dentro de `backend/`/`frontend/` por separado.

---

## 17. REGISTRO DE CAMBIOS (resumen)

| Fecha | Cambio |
|-------|--------|
| *(ver versiones anteriores para historial completo hasta 21 jul)* | |
| 27-28 jul 2026 | **Incidente grave de OneDrive** — corrupción de `.git` + pérdida de archivos completos (backend y frontend). Recuperación completa: backend vía copia de disco sana + `clasp pull`; frontend (incl. brandbook) vía historial de versiones web de OneDrive.com. US-33 completada e implementada con plantilla de branding real (reemplazando el HTML armado a mano inicial). US-41 resuelto de paso. CLAUDE.md reconstruido tras detectar que la reconstrucción del repo había traído de vuelta una versión desactualizada del documento. Deploy final: v48, verificado en la URL pública real. |

---

*Última actualización: 28 julio 2026 — **Sistema funcionalmente completo de punta a punta, con branding aplicado y verificado en producción real.** Repo recuperado del incidente de OneDrive (backend + frontend), ahora en `C:\dev\plant-powered-dani`. Pendientes reales para el resto de Sprint 3: aprobación formal de textos BORRADOR, correos reales de Dani/Ali/instructora, decisión sobre US-20, validación móvil formal, reconstrucción del historial de deploys v28-v42, decisión del equipo sobre US-36 (banner de Apps Script), y revisión de las nuevas tarjetas del sprint (US-37, US-40, US-42, cupos de pilates).*