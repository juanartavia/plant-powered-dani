# CLAUDE.md — Plant Powered by Dani
## Sistema de Agendamiento Automatizado
> Documento vivo — actualizar conforme avanza el desarrollo
> Última actualización: 14 julio 2026 — **Sprint 1 completo.** Todas las US (01-10, 17, 27) en Done, validadas en testing real. Deploy activo: v16. Listo para iniciar Sprint 2 (correos + cambio de orden de pantallas).

---

## 0. LÉEME PRIMERO — PARA EL PRÓXIMO CHAT (Sprint 2)

Si estás retomando este proyecto en un chat nuevo, este documento es tu única fuente de verdad. Antes de generar cualquier prompt para Claude Code:

1. Lee completo este documento, especialmente las secciones 11 (estado de sprints), 13 (notas técnicas — contiene lecciones aprendidas que evitan repetir bugs ya resueltos), y 14/15 (método de trabajo y reglas de Trello).
2. **Dos cosas quedaron confirmadas en la reunión de equipo del 14 de julio, pendientes de implementar al iniciar Sprint 2** (ver sección 3, "Cambios confirmados en reunión del 14 julio"):
   - Nuevo orden de las 3 pantallas del portal: **Calendario → Correo → Datos** (actualmente es Correo → Datos → Calendario, implementado en US-27). Esto es un cambio de flujo, no solo de UI.
   - Mostrar dirección física (si presencial) o link de Meet (si virtual) en el correo de confirmación y en la pantalla de "¡Gracias!" — dirección ya confirmada, ver sección 1.
3. El Sprint 2 empieza en la tabla de la sección 11 con US-11 en adelante (plantillas de correo, confirmación, notificaciones internas, recordatorio 48hrs) — todas en Backlog.
4. Sigue el mismo flujo de trabajo documentado en la sección 14: generar prompt → Claude Code ejecuta → deploy → **probar en real antes de marcar cualquier checkbox** → actualizar este documento.

---

## 1. CONTEXTO DEL PROYECTO

### El cliente
**Plant Powered by Dani** — estudio de nutrición y pilates en Costa Rica.
- **Dani**: nutricionista, admin principal del sistema
- **Instructora de pilates**: cuenta separada bajo el mismo dominio. Recordatorios de pilates salen desde su correo.
- **Ali (secretaria)**: distribuye los links de agendamiento por WhatsApp. Tanto Ali como Dani tienen acceso a los links.

### El negocio
- Atiende clientes en **español e inglés**, incluyendo clientes en **Estados Unidos** (zonas horarias múltiples)
- Modalidades: presencial y virtual
- Infraestructura: **Squarespace** + **Google Workspace** (Gmail, Calendar, Sheets, Drive, Forms, Meet)
- Dominio: `PlantPoweredbyDani.com`

### Facturación del proyecto
- Una sola factura electrónica al final del proyecto
- Pago en colones, transferencia a cuenta BAC de AutomáTica

### Dirección física de la consulta (nutrición, citas presenciales) ✅ CONFIRMADO
```
Santa Ana Town Center
Work Space Republic – Segundo piso
Consultorio #33
```
**Pendiente Sprint 2 (RF-2.1):** el correo de confirmación y la pantalla de "¡Gracias!" deben mostrar esta dirección cuando la modalidad sea presencial, y el link de Meet cuando sea virtual — Meet ya se genera y guarda correctamente desde US-10, pero todavía no se muestra al cliente en ningún correo ni pantalla (los correos completos son Sprint 2).

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

## 3. DECISIONES CONFIRMADAS EN REUNIÓN (2 julio 2026)

### Flujo del cliente
- **Primer contacto:** siempre humano, por WhatsApp
- **No hay landing page** — Ali y Dani distribuyen links directos por WhatsApp
- **Confirmación:** automática al agendar, sin validación manual de Dani

### Política de cancelación y reagendamiento ✅ CONFIRMADO Y VALIDADO (US-06, 14 jul)
- **Tiempo mínimo para cancelar/reagendar: 24 horas de anticipación**
- Si el cliente cancela con menos de 24 hrs → sistema envía notificación automática a Dani y a Ali (stub implementado, correo real es Sprint 2), y se incrementa el contador de cancelaciones tardías **del cliente** (por correo, no por cita)
- Tras **2 cancelaciones consecutivas tardías** (contadas por cliente, cruzando tipos de cita distintos) → se marca `requiere_pago=true` en la pestaña "Clientes"
  - El sistema trackea el conteo de cancelaciones tardías por cliente (identificado por correo), no por cita individual
  - No hay integración de pagos (fuera de scope) — el flag es solo informativo para que Dani lo revise manualmente en el Sheet

### ⚠️ Asimetría intencional: cancelar vs. reagendar con menos de 24hrs ✅ CONFIRMADO Y VALIDADO (US-06, 14 jul)
Estas dos acciones se comportan **distinto** a propósito cuando faltan menos de 24 horas para la cita:

| Acción | Con &lt;24hrs de anticipación |
|--------|------------------------------|
| **Cancelar** | Siempre se permite. Se marca como tardía (incrementa el contador del cliente), pero la cita SÍ se cancela y el slot se libera. |
| **Reagendar** | Se BLOQUEA por completo (error `VENTANA_REAGENDAMIENTO_VENCIDA`). La cita no se mueve. El intento bloqueado también incrementa el contador de cancelaciones tardías del cliente. |

**Por qué:** cancelar libera el horario (beneficia a todos, incluso tarde), mientras que permitir reagendar tarde podría usarse para mover la cita al último minuto de forma repetida sin consecuencia real — por eso ahí se pone el freno duro en vez de solo una marca.

Esto se presentó al equipo en la reunión del 14 de julio con un diagrama comparativo y **no se pidió ningún cambio** — queda confirmado tal como está implementado.

### Ventana de agendamiento ✅ CONFIRMADO
- **Máximo 8 semanas (56 días) de anticipación** para agendar
- El portal solo muestra disponibilidad dentro de ese rango
- **Mínimo 48 horas de anticipación** para agendar (ver más abajo) — confirmada desde la reunión del 2 jul, implementada y validada en testing real el 13 jul (US-09)

### Ventana mínima de 48 horas ✅ CONFIRMADO Y VALIDADO (US-09, 13 jul)
Un cliente no puede agendar una cita que empiece en menos de 48 horas desde el momento exacto en que abre el portal. **La ventana se calcula por hora exacta, no por día calendario completo.** Ejemplo: si son las 2:00pm del lunes, la ventana termina el miércoles a las 2:00pm — los slots del miércoles antes de esa hora NO están disponibles, pero los de esa hora en adelante sí. Se recalcula constantemente (minuto a minuto).

Esta regla es **distinta** de la política de cancelación/reagendamiento (24 horas) — ambas coexisten como reglas de negocio separadas.

### Formulario del cliente ✅ CONFIRMADO (actualizado 12 jul — US-17, US-27)
Nombre y apellido van en campos **separados**.
Campos exactos requeridos (en este orden):
1. Nombre
2. Apellido
3. Correo electrónico
4. Número de teléfono
5. Cédula
6. Fecha de nacimiento
7. Idioma (ES/EN) *(sincronizado con el selector global de idioma)*
8. Modalidad *(solo para initial y followup — automático para los demás)*

> ⚠️ **Sin campo de notas** — eliminado para mantener el proceso simple.

### Flujo del formulario en 3 pasos ✅ IMPLEMENTADO EN US-27 — ⚠️ ORDEN A CAMBIAR EN SPRINT 2
Implementación actual (US-27, 12 jul), correo como clave única de búsqueda del cliente:
1. **Paso 1 — Correo:** el cliente ingresa solo su correo. El sistema busca ese correo en la pestaña "Clientes" (`findClientByEmail`).
2. **Paso 2 — Datos del cliente:** si el correo existe, el formulario aparece precargado (todos editables); si no existe, vacío. Al continuar, upsert en "Clientes".
3. **Paso 3 — Calendario:** se muestra la disponibilidad con el botón final "Confirmar cita" (`bookTimeslot`).

**⚠️ CAMBIO CONFIRMADO EN REUNIÓN DEL 14 JULIO — PENDIENTE DE IMPLEMENTAR EN SPRINT 2:**
El equipo decidió que el **nuevo orden debe ser: Calendario → Correo → Datos** (el cliente elige primero fecha/hora, luego se identifica con su correo, y luego completa/confirma sus datos). Esto es lo único que cambió de fondo en esa reunión respecto a lo ya construido. Implicaciones a considerar al implementarlo:
- La lógica de `findClientByEmail`/upsert de "Clientes" sigue siendo válida, solo cambia CUÁNDO se dispara en el flujo.
- Hay que revisar si la ventana de 48hrs y el lock/conflict-check (que hoy corren en el Paso 3 actual) deben moverse a validarse más temprano, ya que ahora el calendario es el primer paso — podría ser necesario re-validar la disponibilidad al final igualmente (justo antes de confirmar), para cubrir el caso de que el cliente tarde en llenar el correo/datos y el slot se ocupe mientras tanto.
- Revisar cómo interactúa esto con el precargado de datos: si el cliente ya eligió un horario y LUEGO se identifica con un correo que ya existe, hay que decidir si se le muestra el resumen del horario elegido junto con sus datos precargados, o si se le permite cambiar de horario en ese punto.
- No se discutió el detalle de implementación en la reunión — esto queda para el análisis del próximo chat al iniciar Sprint 2.

### Zona horaria ✅ CONFIRMADO
- El sistema debe manejar múltiples zonas horarias, incluyendo Estados Unidos
- Los horarios se muestran en la hora local del cliente
- Los eventos en Calendar se crean en hora de Costa Rica

### Idioma ✅ IMPLEMENTADO
- Selector de idioma (ES/EN) visible desde la primera pantalla, al lado del selector de zona horaria
- Al cambiar idioma, TODA la interfaz cambia
- El idioma seleccionado se guarda en el Sheet → los correos automáticos se envían en el idioma del cliente

### Creación de evento y Meet ✅ CONFIRMADO Y VALIDADO (US-10, 13 jul)
- El evento de Calendar se crea **después** de que la escritura en el Sheet fue exitosa, nunca antes.
- Si modalidad es **virtual**, se genera un Google Meet real y el link se guarda en la Sheet.
- Si modalidad es **presencial**, no se genera Meet — pendiente mostrar la dirección física en su lugar (ver sección 1 y RF-2.1).
- Para **pilates**: el evento se crea en un calendario dedicado (`PILATES_CALENDAR_ID`), separado del de nutrición. La primera inscripción crea el evento con Meet; las siguientes se agregan como invitados al mismo evento.

### Reagendar y cancelar ✅ CONFIRMADO Y VALIDADO (US-06, 14 jul)
- Identificación de la cita por **token único** (nunca por correo — el correo identifica al cliente, el token identifica la cita específica).
- Nunca se borran filas del historial — solo cambia el estado (`Cancelada`/`Reagendada`).
- El evento real de Calendar se mueve (reagendar) o se elimina (cancelar) de forma consistente con el Sheet, incluyendo el caso grupal de pilates (sale del evento sin borrarlo si hay más invitados).
- Ver tabla de asimetría cancelar/reagendar más arriba en esta sección.

---

## 4. TIPOS DE CITA — TODOS CONFIRMADOS

### Nutrición (flujo Dani)
| Tipo | ?type= | Duración | Modalidad |
|------|--------|----------|-----------|
| Consulta inicial | `initial` | 60 min | Presencial o virtual |
| Cita de seguimiento | `followup` | 45 min | Presencial o virtual |
| Solo medición | `measurement` | 15 min | Solo presencial |

> **Nota importante (US-09):** aunque `initial`, `followup` y `measurement` son "tipos" distintos, los tres comparten el mismo Google Calendar de Dani. El conflict-check y el lock de disponibilidad protegen el Calendar real, no cada tipo por separado.

### Pilates (flujo instructora — completamente independiente) ✅ CONFIRMADO
| Tipo | ?type= | Duración | Modalidad | Formato | Horario | Máx. participantes |
|------|--------|----------|-----------|---------|---------|-------------------|
| Clase de pilates | `pilates` | 60 min | Virtual únicamente | **Grupal** | Sábados 10 AM | **5 personas** |

#### Detalles importantes de pilates:
- **Grupal** → un slot puede tener múltiples clientes hasta el límite
- Si la clase está llena (5/5), el sistema **bloquea automáticamente** nuevas inscripciones ✅
- Clases privadas one-on-one: **fuera de la app**
- Recordatorios salen desde el **correo de la instructora**
- ⚠️ **Pendiente para Sprint 3:** `WORKDAYS`/`WORKHOURS` genéricos no reflejan el horario real de Dani (martes–sábado, 7–19 entre semana / 7–14 sábado, cerrado domingo-lunes, no trabaja el último sábado del mes; ni la restricción de "solo sábados" para pilates). Ver sección 13, nota 14.
- ✅ **Resuelto en US-10:** eventos de Calendar duplicados por inscripción — ahora 1 solo evento por slot con múltiples invitados.
- ✅ **Resuelto en US-10:** Calendar de pilates dedicado y separado (`PILATES_CALENDAR_ID`), no el de nutrición.

---

## 5. MODELO DE DISTRIBUCIÓN DE LINKS

```
?type=initial       → Consulta inicial (60 min, nutrición, Dani)
?type=followup      → Cita de seguimiento (45 min, nutrición, Dani)
?type=measurement   → Solo medición (15 min, nutrición, solo presencial, Dani)
?type=pilates       → Clase grupal (60 min, virtual, instructora, sáb 10 AM, máx 5)
```

---

## 6. ACTORES DEL SISTEMA

| Actor | Rol |
|-------|-----|
| **Dani** | Admin/nutricionista. Bloquea disponibilidad en su Calendar. Marca show/no-show en Sheet. |
| **Ali (secretaria)** | Distribuye links correctos a cada cliente por WhatsApp. También Dani puede distribuirlos. |
| **Instructora de pilates** | Calendar y correo propios. Los recordatorios de pilates salen desde su cuenta. |
| **Cliente (ES/EN)** | Agenda, reagenda o cancela vía link. Sin cuenta de Google. Puede ser de CR o EEUU. |
| **Google Apps Script** | Motor de automatización: crea eventos, envía correos, ejecuta triggers, escribe en Sheets. |

### Checklist de acceso necesario para producción (ninguno requiere que Dani/la instructora usen código)
Apps Script corre en la nube bajo la cuenta que hizo el deploy — ni Dani ni la instructora instalan ni ven código. Antes de producción (Sprint 3):

**De la instructora de pilates:**
1. Compartir su Google Calendar real con la cuenta que hará el deploy de producción, con permiso **"Realizar cambios y administrar el uso compartido"**.
2. (Pendiente decidir con Dani) "Enviar correo como" en su Gmail vs. usar Reply-To con su correo real — evaluar en Sprint 2 al construir las plantillas de correo, ya que ahí se define el remitente real de los correos de pilates (RF-2.2).

**De Dani:**
- Deploy final se hace bajo su cuenta (a definir en sesión conjunta de Sprint 3).

**Variable técnica:** `PILATES_CALENDAR_ID` en Script Properties — en testing apunta a un calendario de prueba ("Pilates - Testing"); en producción debe reemplazarse por el ID real del calendario de la instructora.

---

## 7. FLUJOS COMPLETOS

### Flujo principal — Agendar cita de nutrición (orden actual, PENDIENTE de reordenar en Sprint 2 — ver sección 3)
```
1. Ali o Dani comparte link ?type=initial/followup/measurement por WhatsApp
2. Cliente accede → selecciona idioma (ES/EN)
3. Paso 1: cliente ingresa su correo → sistema busca en pestaña "Clientes"
4. Paso 2: formulario precargado o vacío → upsert en "Clientes"
5. Paso 3: ve disponibilidad (excluyendo <48hrs), selecciona fecha y hora
6. Apps Script re-verifica ventana 48hrs + LockService (protege contra colisiones entre tipos de cita)
7. Si el slot ya no está disponible: error claro + recarga automática
8. Escribe fila en Sheet de Nutrición (con flush()) PRIMERO
9. Solo si tuvo éxito: crea evento en Calendar de Dani + Meet real si es virtual
10. Si el evento falla después de un Sheet exitoso: fila queda 'Error_Calendar' (no se borra)
11. Envía correo de confirmación (dirección física o Meet según modalidad) — pendiente Sprint 2
12. Envía notificación interna a Dani — pendiente Sprint 2
13. Trigger 48hrs antes → recordatorio — pendiente Sprint 2
14. Cita se realiza → Dani marca show/no-show en Sheet
```

### Flujo pilates — Inscripción a clase grupal
```
1. Ali o Dani comparte link ?type=pilates
2. Cliente selecciona idioma
3. Paso 1: correo → busca en "Clientes" (compartida con nutrición)
4. Paso 2: formulario precargado o vacío → upsert
5. Paso 3: disponibilidad de sábados con cupos
6. Si hay cupo: verifica en Cupos_Pilates (LockService)
7. Escribe fila en Pilates PRIMERO (flush()), incrementa contador
8. Si es la primera inscripción del slot: crea evento en calendario dedicado con Meet, guarda event_id/meet_link
9. Si ya existe event_id: agrega al cliente como invitado (no crea evento nuevo)
10. Si cupo = 5: "clase llena"
11-13. Correos y notificaciones — pendiente Sprint 2
14. Clase se realiza → instructora marca show/no-show
```

### Flujo reagendamiento ✅ IMPLEMENTADO Y VALIDADO (US-06)
```
1. (Hoy: manual vía wrappers de testing, ya removidos. Falta frontend real — ver sección 9, RF-1.13)
2. Sistema busca la cita por TOKEN (findBookingByToken) — nunca por correo
3. Si faltan <24hrs para la cita ACTUAL: bloquea con VENTANA_REAGENDAMIENTO_VENCIDA + incrementa contador de cancelaciones tardías del CLIENTE
4. Si ≥24hrs: valida el nuevo horario igual que bookTimeslot (48hrs, lock, cupos pilates)
5. Actualiza Sheet: fecha, hora, estado='Reagendada' (con flush())
6. Mueve el evento real de Calendar (patch en nutrición; sale-y-entra en slots grupales de pilates)
7. Notificación a Dani/Ali — stub, pendiente Sprint 2
```

### Flujo cancelación ✅ IMPLEMENTADO Y VALIDADO (US-06)
```
1. (Hoy: manual vía wrappers, ya removidos. Falta frontend real)
2. Sistema busca la cita por TOKEN
3. SIEMPRE se permite cancelar (a diferencia de reagendar)
4. Si faltan <24hrs: se marca como tardía + incrementa contador del CLIENTE (correo, cruza tipos de cita)
   → Al llegar a 2 consecutivas: requiere_pago=true en pestaña "Clientes"
5. Actualiza Sheet: estado='Cancelada' (con flush()) — NUNCA borra la fila
6. Elimina el evento real de Calendar (o solo remueve al invitado si es pilates grupal con más personas)
7. Notificación a Dani/Ali — stub, pendiente Sprint 2
```

---

## 8. SCHEMA DE GOOGLE SHEETS

### Spreadsheet de testing
- **Nombre:** PlantPoweredDani - Base de Datos (Testing)
- **ID:** 16M6WUqMAK9XkVoIutIn9UkJojlS5biT5o470GySs5gw
- **URL:** https://docs.google.com/spreadsheets/d/16M6WUqMAK9XkVoIutIn9UkJojlS5biT5o470GySs5gw/edit

### Pestaña "Nutrición" (schema actual, verificado 14 jul)
```
token | nombre | apellido | correo | telefono | cedula | fecha_nacimiento |
tipo_cita | fecha | hora | zona_horaria_cliente | modalidad | idioma |
meet_link | estado | fecha_creacion | recordatorio_enviado | show_no_show |
cancelaciones_tardias (legacy, sin usar) | requiere_pago (legacy, sin usar) | event_id
```
**Estados posibles:** `Agendada` → `Reagendada` → `Cancelada`, y también `Error_Calendar`.

> ⚠️ **Nota operativa:** los TÍTULOS de la fila 1 de esta pestaña (y de "Pilates") pueden estar desactualizados visualmente respecto al orden real de columnas, porque el schema fue evolucionando (US-17 separó nombre/apellido, US-10 agregó event_id) y los encabezados de texto no se actualizaron automáticamente. **Los datos SÍ se escriben en las columnas correctas según el código actual** — solo el texto de la fila 1 puede confundir visualmente. Si esto genera confusión al operar el Sheet, limpiar y reescribir manualmente la fila 1 con los nombres de columna correctos (no requiere tocar código, ver conversación del 14 jul si se necesita el detalle paso a paso).

### Pestaña "Pilates"
```
token | nombre | apellido | correo | telefono | cedula | fecha_nacimiento |
fecha_clase | hora_clase | zona_horaria_cliente | idioma |
estado | fecha_inscripcion | recordatorio_enviado | show_no_show
```

### Pestaña "Cupos_Pilates"
```
fecha_clase | hora_clase | inscritos | max_participantes | event_id | meet_link
```

### Pestaña "Clientes" — correo es la clave única (fuente de verdad del tracker de cancelaciones)
```
correo | nombre | apellido | telefono | cedula | fecha_nacimiento | idioma | cancelaciones_tardias | requiere_pago
```
Las columnas `cancelaciones_tardias`/`requiere_pago` de esta pestaña (agregadas en US-06 vía `addCancelacionesColumnsToClientes()`) son la **única fuente de verdad** para la regla de "2 tardías consecutivas → debe pagar". Las columnas del mismo nombre en Nutrición/Pilates son legacy y no se usan para la lógica de negocio.

---

## 9. REQUERIMIENTOS FUNCIONALES

### RF-1 — Portal de Agendamiento
| ID | Requerimiento | Estado |
|----|--------------|--------|
| RF-1.1 | Cliente accede por link ?type= y ve disponibilidad en tiempo real | ✅ |
| RF-1.2 | Duración automática por tipo. Pilates: lógica de cupos grupales (máx 5) | ✅ |
| RF-1.3 | Formulario: nombre y apellido separados, correo, teléfono, cédula, fecha de nacimiento, idioma, modalidad | ✅ US-17 |
| RF-1.4 | Sin cuenta de Google — portal público por link con token | ✅ (⚠️ nota 17 — pendiente investigar fallo reportado en acceso desde móvil) |
| RF-1.5 | Datos en Sheets. Pilates: también actualizar contador en Cupos_Pilates | ✅ US-05 |
| RF-1.11 | Correo como identificador único del cliente — flujo de 3 pasos | ✅ US-27 (⚠️ orden a cambiar en Sprint 2, ver sección 3) |
| RF-1.12 | Ventana mínima de 48 horas + verificación de conflictos con lock en tiempo real | ✅ US-09 |
| RF-1.13 | Creación de evento de Calendar tras escritura exitosa en Sheet; Meet real; evento único con múltiples invitados en pilates; calendario dedicado | ✅ US-10 |
| RF-1.14 | Reagendar/cancelar por token; política 24hrs con asimetría intencional; tracker de tardías por cliente; requiere_pago tras 2 consecutivas; Calendar consistente | ✅ US-06 — **falta frontend** (hoy solo probado vía backend/wrappers manuales, ya removidos) |
| RF-1.8 | Ventana máxima de agendamiento: 56 días (8 semanas) | ✅ |
| RF-1.9 | Horarios en zona horaria del cliente. Evento creado en hora CR. | ✅ US-08 |
| RF-1.10 | Selector de idioma ES/EN desde primera pantalla | ✅ |

### RF-2 — Correos y Automatizaciones (SPRINT 2 — TODO PENDIENTE)
| ID | Requerimiento | Estado |
|----|--------------|--------|
| RF-2.1 | Correo de confirmación inmediato (idioma del cliente, link reagendar/cancelar, Meet si virtual **o dirección física si presencial** — Santa Ana Town Center, ver sección 1) | ⏳ Pendiente Sprint 2 |
| RF-2.2 | Correos de nutrición desde cuenta Dani. Correos de pilates desde cuenta instructora (o Reply-To, decisión pendiente — ver sección 6) | ⏳ Pendiente Sprint 2 |
| RF-2.3 | Notificación interna a Dani o instructora en cada acción (agendar/reagendar/cancelar) — el stub `notifyLateCancellation` ya existe con TODO en cancelBooking/rescheduleBooking, falta implementarlo de verdad y extenderlo a agendar | ⏳ Pendiente Sprint 2 |
| RF-2.4 | Recordatorio 48 hrs antes. Solo si estado='Agendada' o 'Reagendada'. | ⏳ Pendiente Sprint 2 |
| RF-2.5 | Notificación a Dani y Ali si cancelación/reagendamiento fuera de ventana | ⏳ Pendiente Sprint 2 (stub ya cableado, ver RF-2.3) |
| RF-2.6 (nuevo) | Frontend para que el cliente reagende/cancele desde el link único del correo (hoy solo existe el backend) | ⏳ Pendiente Sprint 2 |
| RF-2.7 (nuevo) | Reordenar las 3 pantallas del portal: Calendario → Correo → Datos (ver sección 3) | ⏳ Pendiente Sprint 2 |

---

## 10. STACK TÉCNICO

### Base del proyecto
- **Repo:** https://github.com/juanartavia/plant-powered-dani
- **Repo original (Someday):** https://github.com/rbbydotdev/someday.git

| Capa | Tecnología |
|------|-----------|
| Frontend | React + TypeScript + Vite + Shadcn/UI + Tailwind |
| Backend | Google Apps Script (TypeScript con clasp) — único archivo `backend/src/app.ts` |
| Calendario | Google Calendar API |
| Correo | GmailApp (Apps Script) — aún no usado, es Sprint 2 |
| Base de datos | Google Sheets (un archivo, pestañas separadas) |
| Triggers | Time-based triggers (Apps Script) — aún no configurados, es Sprint 2 |
| Deploy | clasp (CLI de Google) |

### Variables en `backend/src/app.ts`
```typescript
TIME_ZONE = "America/Costa_Rica"
WORKDAYS = [1,2,3,4,5,6]              // ⚠️ genérico, no refleja horario real de Dani — Sprint 3
WORKHOURS = { start: 7, end: 20 }     // ⚠️ genérico — Sprint 3
DAYS_IN_ADVANCE = 56                   // 8 semanas
MIN_BOOKING_HOURS = 48                 // ✅ US-09
CANCELLATION_HOURS = 24               // ✅ US-06
MAX_PILATES_PARTICIPANTS = 5
PILATES_CALENDAR_ID                   // Script Property, no constante — calendario dedicado de pilates (US-10)
```

### Firma actual de funciones en backend (al cierre de Sprint 1, 14 jul)
```typescript
getDurationForType(type: string): number
fetchAvailability(type: string): { timeslots: string[], durationMinutes: number }

bookTimeslot(type, timeslot, nombre, apellido, email, phone, cedula, birthdate, language, modalidad, clientTimezone): string
// Orden interno: 1) appendBookingToSheet (con flush) 2) solo si tuvo éxito, crea evento +
// Meet. Si Calendar falla después: markBookingRowError + rollback cupo (pilates) + flush.

findBookingByToken(token: string): { sheet, row, data }
// Lanza TOKEN_NO_ENCONTRADO si no existe. Busca en Nutrición y Pilates.

rescheduleBooking(token, newTimeslot, clientTimezone): string
// Bloquea con VENTANA_REAGENDAMIENTO_VENCIDA si faltan <24hrs para la cita ACTUAL.
// Si no hay event_id (cita vieja pre-US-06): actualiza el Sheet igual, sin error, solo loguea.
// Si hay event_id: mueve el evento real (patch nutrición / sale-y-entra pilates grupal).

cancelBooking(token: string): { lateCancellation: boolean }
// SIEMPRE permite cancelar. Si <24hrs: lateCancellation=true, incrementa contador del cliente.
// Nunca borra la fila. Elimina el evento real de Calendar (o solo el invitado, en pilates grupal).

incrementClientLateCancellation(correo) / resetClientLateCancellationCounter(correo)
// Tocan las columnas cancelaciones_tardias/requiere_pago en pestaña "Clientes" (fuente de verdad).
getClientPaymentStatus(correo): { cancelaciones_tardias, requiere_pago }
notifyLateCancellation(...) // STUB con TODO — implementar de verdad en Sprint 2

addCancelacionesColumnsToClientes(): void  // ✅ ejecutada manualmente 13 jul
addEventIdColumnToNutricion(): void        // ✅ ejecutada manualmente 13 jul
addEventIdColumnToCuposPilates(): void     // ✅ ejecutada manualmente 13 jul
setupPilatesTestCalendar(): void           // ✅ ejecutada manualmente 13 jul, idempotente
initializeSheets(): void                    // ✅ ejecutada, NO volver a correr
addClientesSheet(): void                    // ✅ ejecutada manualmente 12 jul
findClientByEmail(correo: string): ClientRecord | null
upsertClient(data: ClientRecord): void
getSheet(sheetName: string): GoogleAppsScript.Spreadsheet.Sheet
getPilatesCalendarId(): string
```

> **Nota:** los wrappers temporales `manualTestCancelBooking`/`manualTestRescheduleBooking` que existieron brevemente para testing manual de US-06 (13-14 jul) ya fueron **removidos del código** el 14 de julio, tras validar la US por completo. Si se necesita un mecanismo similar en el futuro para probar funciones sin frontend, ver el patrón documentado en nota técnica #23 (sección 13) — no reinventar el enfoque, solo recrear wrappers análogos y volver a borrarlos al terminar.

---

## 11. SPRINTS Y ESTADO ACTUAL

### Sprint 1 (3–9 Jul, extendido hasta 14 Jul) — Setup + Portal base — ✅ **100% COMPLETO**

| US | Título | Estado |
|----|--------|--------|
| US-01 | Fork de Someday y setup del entorno de testing | ✅ Done |
| US-02 | Configuración de calendarios y horarios por tipo de cita | ✅ Done |
| US-03 | Links separados por tipo de cita via ?type= en URL | ✅ Done |
| US-04 | Diseño e inicialización del schema de Sheets | ✅ Done |
| US-05 | Función de escritura de nueva cita en Sheet (token UUID v4, atómica) | ✅ Done |
| US-06 | Funciones de actualización de estado (reagendar/cancelar) | ✅ **Done** (14 jul) — 8/8 checkboxes validados en testing real: mecánica básica, ventana 24hrs, asimetría cancelar/reagendar, tracker por cliente, requiere_pago tras 2 tardías, Calendar consistente. Deploy v16. |
| US-07 | Formulario extendido: idioma, modalidad, cédula, fecha de nacimiento | ✅ Done |
| US-08 | Detección y ajuste de zona horaria del cliente | ✅ Done |
| US-09 | Verificación de conflictos, lock y ventana mínima de 48 hrs | ✅ Done — incluyendo hallazgo real de falta de lock en conflict-check heredado |
| US-10 | Creación de evento en Calendar y generación de Meet | ✅ Done — incluyendo 3 bugs reales encontrados y corregidos (orden Sheet/Calendar, evento duplicado pilates, flush() de SpreadsheetApp) |
| US-17 | Separar nombre y apellido en campos independientes | ✅ Done |
| US-27 | Correo como identificador único — pestaña "Clientes" + flujo de 3 pasos | ✅ Done — orden de pasos pendiente de cambiar en Sprint 2 (ver sección 3) |

**Todas las tarjetas movidas a Done en Trello. Deploy activo: v16.**

### Sprint 2 (a iniciar) — Correos + Reagendamiento/Cancelación (frontend) + Reordenar flujo

| US | Título | Estado |
|----|--------|--------|
| US-11 | Plantillas HTML bilingües (nutrición y pilates) — debe incluir dirección física (presencial) o Meet (virtual), ver sección 1 | ⏳ Backlog |
| US-12 | Correo de confirmación inmediato al cliente | ⏳ Backlog |
| US-13 | Notificación interna a Dani o instructora (implementar de verdad el stub `notifyLateCancellation` + extender a agendar) | ⏳ Backlog |
| US-14 | Recordatorio automático 48 horas antes de la cita (time-based trigger) | ⏳ Backlog |
| US-15+ | Frontend de reagendamiento y cancelación (hoy solo existe backend, ver RF-1.14/RF-2.6) | ⏳ Backlog |
| (nueva, sin número aún) | Reordenar flujo del portal: Calendario → Correo → Datos (decisión de reunión 14 jul, ver sección 3) | ⏳ Backlog — analizar implicaciones antes de generar el prompt |

### Sprint 3 (pendiente) — Producción + Pruebas
**Epics:** Flujos independientes nutrición y pilates · Pruebas end-to-end · Paso a producción y capacitación
**Notas:**
- Resolver el hallazgo de nota 17 (acceso desde móvil) antes de dar por completo RNF-3/RF-1.4.
- Ejecutar el checklist de acceso de la sección 6 (compartir Calendar real de la instructora; decidir "Enviar correo como" vs Reply-To; reemplazar `PILATES_CALENDAR_ID` por el ID real).
- Auditar `WORKDAYS`/`WORKHOURS` reales de Dani y la restricción de "pilates solo sábados" (nota 14).

---

## 12. ENTORNO DE TESTING

| Dato | Valor |
|------|-------|
| Cuenta de testing | plantpoweredani.testing@gmail.com |
| Credenciales | Guardadas en Drive: AutomáTica / Plant Powered Dani / Interno |
| URL de testing activa | https://script.google.com/macros/s/AKfycbwNUEjG8CXo2D5bk2eq1w6wBrme9XqJpCqOt-TkP0otTypiXd7GCEk7L7uFhdDOLCaJ/exec |
| Editor Apps Script | https://script.google.com/d/1cu-HdKiAmfUYOgjwtjKcE9lCO6waLfFsL71PwP4GgcdGiQWzqygPS3fK/edit |
| Versión actual | **v16** |
| Repo | https://github.com/juanartavia/plant-powered-dani |
| Spreadsheet testing | https://docs.google.com/spreadsheets/d/16M6WUqMAK9XkVoIutIn9UkJojlS5biT5o470GySs5gw/edit |
| Calendario pilates (testing) | "Pilates - Testing" |
| Harness de pruebas backend | `backend/test-harness/` (run-tests.js + gas-mock.js + README.md) — 37 aserciones, todas pasando al cierre de Sprint 1 |

### ⚠️ Lección crítica de proceso — deploy vs. push (ver nota técnica #25)
`clasp push` actualiza el código fuente del proyecto (lo que se ve en el editor), pero la URL pública `/exec` de un deployment queda **congelada** a la versión que tenía en el último `clasp deploy` sobre ese mismo `deploymentId`. Si se hace solo `push` sin `deploy`, cualquier prueba a través del link real seguirá corriendo código viejo, aunque el editor muestre el código nuevo y los wrappers manuales (que sí leen del HEAD) funcionen bien. **Siempre confirmar que se hizo `clasp deploy` antes de dar una prueba por válida usando el link público.**

### Links de testing por tipo de cita (v16)
```
Consulta Inicial (60 min)
https://script.google.com/macros/s/AKfycbwNUEjG8CXo2D5bk2eq1w6wBrme9XqJpCqOt-TkP0otTypiXd7GCEk7L7uFhdDOLCaJ/exec?type=initial

Cita de Seguimiento (45 min)
.../exec?type=followup

Solo Medición (15 min)
.../exec?type=measurement

Clase de Pilates (60 min)
.../exec?type=pilates
```

### Historial de deploys
| Versión | Fecha | Cambios principales |
|---------|-------|----------------------|
| v8-v11 | ≤12 jul | Base + US-05 + US-08 + US-17 + US-27 |
| v12 | 13 jul | US-09: ventana 48hrs + lock en conflict-check |
| v13 | 13 jul | US-10 primera iteración: Sheet-antes-Calendar, evento único pilates, Meet real, calendario dedicado. Bug encontrado: "Fila de Cupos_Pilates no encontrada" en slots nuevos. |
| v14 | 13 jul | Fix del bug de v13: `SpreadsheetApp.flush()` en 3 puntos. **US-10 Done.** |
| v15 | 14 jul | US-06: reagendar/cancelar por token, tracker por cliente. Deploy hecho tras detectar que v14 seguía activo en la URL (gap de deploy, no bug de código — ver nota 25). |
| v16 | 14 jul | Wrappers temporales de testing manual removidos del código tras validar US-06 por completo. **Sprint 1 100% cerrado. Deploy activo.** |

---

## 13. NOTAS TÉCNICAS CRÍTICAS

1. **Todo en cuenta de testing primero** — nunca tocar cuenta real de Dani hasta Sprint 3.
2. **Pilates grupal es arquitectónicamente distinto** — usa contador en Cupos_Pilates, no slot individual.
3. **Pilates solo sábados** — restricción pendiente de implementar en Sprint 3.
4. **Función atómica (US-05, reforzada US-10):** si falla Sheets → no crear evento en Calendar. Si falla Calendar DESPUÉS de un Sheet exitoso → la fila NO se borra, queda `estado='Error_Calendar'` (decisión: borrar arriesga desincronizar índices y pierde auditoría).
5. **Token UUID v4:** columna 1 del Sheet, es el único identificador válido para localizar una cita — nunca el correo (eso identifica al cliente, en la pestaña "Clientes").
6. **Trigger 48hrs (Sprint 2):** solo disparar si estado = 'Agendada' o 'Reagendada'. Marcar recordatorio_enviado para evitar duplicados.
7. **Cancelaciones tardías — fuente de verdad es "Clientes", no Nutrición/Pilates** (confirmado en US-06): las columnas `cancelaciones_tardias`/`requiere_pago` de Nutrición/Pilates son legacy, sin usar; el tracker real vive por correo en la pestaña "Clientes", cruzando tipos de cita.
8. **Correos pilates** salen desde cuenta de la instructora — o Reply-To, decisión pendiente Sprint 2 (sección 6).
9. **Idioma del cliente** guardado en Sheet → determina idioma de todos los correos automáticos (Sprint 2).
10. **Cédula** ya NO es el identificador único (reemplazada por correo desde US-27) — se mantiene como campo normal del formulario.
11. **initializeSheets()** — UNA SOLA VEZ, ya ejecutada. NO volver a correr.
12. **Permisos en appsscript.json** — incluye spreadsheets, drive, calendar. Agregar scope si se suman integraciones nuevas (ej. Gmail para Sprint 2).
13. **Pilates: eventos duplicados — RESUELTO en US-10.** Un solo evento por slot con múltiples invitados vía `addGuest`/`patch`.
14. **`WORKDAYS`/`WORKHOURS` genéricos (pendiente Sprint 3)** — no reflejan el horario real de Dani (martes-sábado, 7am-7pm entre semana, 7am-2pm sábados, cerrado domingo-lunes, no último sábado del mes, sin virtuales los sábados).
15. **Criterio validado dos veces: auditar y adaptar código heredado de Someday, no asumir que ya cumple las reglas del cliente** — funcionó en US-09 (lock faltante) y US-10 (eventos duplicados, Meet nunca implementado de verdad). Aplicar el mismo criterio a cualquier código heredado restante.
16. **Coerción de tipos en Google Sheets** — un string de fecha/hora puede autodetectarse y guardarse como objeto `Date`, rompiendo comparaciones `===`. Mitigación: `normalizeSheetDateCell()` + `setNumberFormat("@")`. Ya aplicado consistentemente en US-05/US-06/US-10.
17. **Acceso desde móvil — pendiente investigar.** Reporte inicial: el link de testing no cargó desde un teléfono. No bloquea el trabajo actual, pero debe resolverse antes de Sprint 3 / producción (RNF-3, RF-1.4) — la mayoría de clientes reales van a abrir el link desde el celular (compartido por WhatsApp).
18. **El lock de conflict-check protege el Calendar real, no el "tipo" de cita** (US-09) — `initial`/`followup`/`measurement` comparten Calendar; validado con colisión cruzada entre tipos distintos.
19. **`SpreadsheetApp` cachea escrituras — requiere `flush()` explícito antes de releer en la misma ejecución** (lección de US-10, reforzada en US-06). Cualquier código que escriba y luego relea el mismo Sheet dentro de la MISMA ejecución necesita `SpreadsheetApp.flush()` entre medio — no asumir que una escritura es visible de inmediato a una lectura posterior en el mismo run. Ya aplicado en `appendBookingToSheet`, `bookPilatesCalendarEvent`, el catch de `bookTimeslot`, y en `cancelBooking`/`rescheduleBooking`.
20. **Calendar de pilates nunca estuvo realmente separado del de nutrición hasta US-10** — resuelto con `PILATES_CALENDAR_ID` dedicado, separado de `CALENDARS` (que sigue siendo específico del conflict-check de Freebusy de nutrición).
21. **Asimetría intencional cancelar/reagendar** (US-06) — ver tabla completa en sección 3. Cancelar siempre se permite (solo marca tardía); reagendar se bloquea duro con &lt;24hrs. Confirmado con el equipo en reunión del 14 jul, sin cambios solicitados.
22. **Ventana de 24hrs para reagendar se evalúa contra la cita ACTUAL, no la nueva** — al reagendar, primero se valida si la cita que se quiere mover ya está a menos de 24hrs (se bloquea si sí); si se permite avanzar, el NUEVO horario se valida por separado con las reglas normales de `bookTimeslot` (ventana 48hrs mínima, lock, cupos).
23. **Patrón para testing manual sin frontend (US-06)** — cuando una función de backend no tiene todavía un punto de entrada en frontend, se pueden crear wrappers temporales en `app.ts` (ej. `manualTestX()`) con un valor hardcodeado (token, etc.), ejecutarlos desde el dropdown del editor de Apps Script, revisar el Registro de ejecución + Sheet + Calendar real, y **borrarlos del código antes de dar la US por Done** (o documentarlos explícitamente si se decide conservarlos). Alternativa más robusta pero con más setup: `clasp run <función> --params '[...]'`, que requiere habilitar la Apps Script API y desplegar como "API executable" — evaluar si vale la pena en Sprint 3 si se repite mucho la necesidad de probar funciones sin UI.
24. **rescheduleBooking y cancelBooking deben comportarse igual ante citas sin `event_id` (pre-migración)** — ambas deben actualizar el Sheet igual y solo loguear un aviso, sin lanzar un error duro que bloquee toda la operación. Se encontró y corrigió una inconsistencia real en US-06 donde `cancelBooking` ya era tolerante pero `rescheduleBooking` lanzaba `EVENTO_CALENDAR_NO_ENCONTRADO` y bloqueaba todo — ya unificado.
25. **Gap de deploy causó un falso positivo de bug (lección de proceso, 14 jul)** — al pedir explícitamente "solo push, sin deploy" en una iteración anterior, quedó pendiente un `clasp deploy`. Cuando se probó vía el link público, el código corrido era el de la versión desplegada anterior (v14), no el más reciente en el editor — pareciendo un bug real (`bookNutricionCalendarEvent` "no guardaba event_id") que en realidad no existía: el código en el HEAD del proyecto ya era correcto (confirmado con una prueba de harness dedicada, Test 10, 37/37 pasando). **Regla reforzada:** antes de dar cualquier resultado de prueba por "bug confirmado", verificar primero con `clasp deployments` que la URL usada para probar corresponde a la versión de código que se cree estar probando.
26. **Wrappers temporales de US-06 removidos (14 jul)** — `manualTestCancelBooking`/`manualTestRescheduleBooking` cumplieron su propósito (validar reagendar/cancelar en testing real sin frontend) y fueron eliminados del código tras confirmar los 8 checkboxes de la US. Si Sprint 2 necesita un mecanismo similar antes de que el frontend de reagendar/cancelar exista (RF-2.6), recrear wrappers análogos siguiendo el patrón de la nota 23, y volver a borrarlos al finalizar esa US.

---

## 14. MÉTODO DE TRABAJO

### Cómo trabajamos en este proyecto
El desarrollo se divide entre dos herramientas de Claude:

**Este chat / el chat sucesor (Claude.ai — dentro del Proyecto):**
- Es el cerebro — analiza cada US, toma decisiones, detecta problemas, hace preguntas de negocio cuando hace falta
- Genera los prompts exactos para Claude Code
- Recibe y analiza los resultados de Claude Code — revisa hallazgos, bugs, decisiones tomadas, no solo "listo/no listo"
- Actualiza el CLAUDE.md después de cada US completada
- Maneja documentación y decisiones de Trello

**Claude Code (extensión en VS Code):**
- Es las manos — ejecuta código, edita archivos, hace builds y deploys
- Lee este CLAUDE.md al inicio de cada prompt para tener contexto
- Reporta resultados de vuelta al chat

### Flujo por cada US
```
1. Este chat analiza la US (y el checklist real de Trello, no solo la descripción) y genera el prompt
2. Dev pega el prompt en Claude Code
3. Claude Code ejecuta los cambios (y a veces encuentra bugs reales al auditar código heredado — normal y esperado)
4. Dev pega la respuesta de Claude Code en este chat
5. Este chat analiza, detecta problemas o inconsistencias, genera siguiente prompt si hace falta
6. clasp push (para revisar en el editor) → si aplica, pasos manuales en el editor (migraciones) → clasp deploy
7. Probar en el navegador real contra el deploy — NO se marca nada como completado solo porque el código se escribió
8. Solo si la prueba real confirma que funciona → marcar checkbox(es) en Trello
9. Cuando todos los checkboxes de la tarjeta estén marcados → mover la tarjeta a Done
10. Actualizar CLAUDE.md
```

### ⚠️ Cuándo ir al editor de Apps Script manualmente
- **Ejecutar funciones de inicialización/migración** (initializeSheets, addClientesSheet, setupPilatesTestCalendar, addEventIdColumnToNutricion, addEventIdColumnToCuposPilates, addCancelacionesColumnsToClientes) — dropdown de funciones → Ejecutar. Son de UNA SOLA VEZ salvo que sean explícitamente idempotentes.
- **Autorizar permisos nuevos** — Revisar permisos → Avanzado → Ir a (no seguro) → Permitir.
- **Ver logs de ejecución** — Registro de ejecución, para debuggear.
- **El editor solo muestra código ya subido con `clasp push`** — si algo no aparece en el dropdown, recargar la página del editor primero.

**URL del editor:** https://script.google.com/d/1cu-HdKiAmfUYOgjwtjKcE9lCO6waLfFsL71PwP4GgcdGiQWzqygPS3fK/edit

### Reglas importantes
- Claude Code siempre lee el CLAUDE.md al inicio de cada prompt
- Cada `clasp deploy` genera una URL nueva (o actualiza la existente si se usa el mismo `--deploymentId`) — siempre documentarla aquí
- Los comandos en Windows PowerShell van uno por uno (sin &&)
- Nunca tocar la cuenta real de Dani hasta Sprint 3
- Si hay que agregar permisos nuevos → agregar scope en dist/appsscript.json Y appsscript.json (raíz)
- **Antes de aceptar un resultado de prueba como bug confirmado, verificar que se probó contra la versión de deploy correcta** (ver nota 25)

---

## 15. FLUJO DE TRABAJO — TRELLO

### Estados de las tarjetas
```
Backlog → In Progress → Done
```

### Reglas
- Al **iniciar** una US → moverla a **In Progress**
- Al **completar todos los checkboxes** → moverla a **Done**
- Agregar comentario en cada US con lo que se hizo y decisiones tomadas
- Si una US bloquea a otra, no mover la dependiente a In Progress hasta que la anterior esté en Done

### Recordatorio permanente (regla de proceso)
- Cada vez que se acuerde una US nueva o un cambio de alcance en el chat, **antes de generar el prompt para Claude Code**: (1) mover la tarjeta a **In Progress**, y (2) al recibir confirmación de que algo del checklist quedó validado en testing, marcar ese checkbox específico en Trello — no asumir que se marcó solo porque el código se escribió.
- **Ningún checkbox ni tarjeta se marca como completado/Done solo porque Claude Code terminó de escribir el código.** El orden correcto:
  1. Claude Code hace el cambio
  2. `clasp push` → (pasos manuales si aplica) → `clasp deploy` (documentar en CLAUDE.md sección 12)
  3. Probar en el navegador contra el deploy real
  4. Solo si la prueba confirma que funciona → marcar el checkbox correspondiente en Trello
  5. Cuando todos los checkboxes estén marcados → mover la tarjeta a **Done**

### El Trello no es una fuente rígida — se ajusta a la realidad del desarrollo
Las tarjetas, descripciones y checklists de Trello reflejan la mejor comprensión del momento en que se crearon, pero **no son inmutables**. Es normal descubrir ambigüedades, reinterpretar redacciones confusas, o agregar/quitar ítems del checklist sobre la marcha (como pasó en US-09 con la ventana de 48hrs, y en US-10 con los 3 ítems nuevos del fix de pilates). Cuando esto pase:
1. Discutirlo primero en el chat para alinear el entendimiento.
2. Si aplica, ajustar el checklist o la descripción de la tarjeta en Trello para que coincida con la realidad.
3. Documentar el cambio de interpretación en el CLAUDE.md, para que quede registro de por qué se interpretó así.

---

## 16. FLUJO DE DEPLOY EN WINDOWS (PowerShell)

```powershell
cd backend
npm run build
cd ..
cd frontend
npm run build        # solo si hubo cambios en frontend
cd ..
Copy-Item backend/dist/* dist/ -Force
Copy-Item frontend/dist/* dist/ -Force   # solo si hubo cambios en frontend
clasp push
# Si hay migraciones nuevas: ir al editor, ejecutarlas manualmente, ANTES del deploy
clasp deploy --deploymentId <mismo-id-de-siempre>   # mantiene la misma URL de testing
```

### Notas importantes para Windows
- `&&` no funciona en PowerShell — correr comandos uno por uno
- `deploy.sh` y `build.sh` no funcionan en Windows
- El `.claspignore` está renombrado a `.claspignore.bak` — no revertir
- El `rootDir` en `.clasp.json` apunta a `dist/` — no cambiar
- Siempre `clasp push` antes de `clasp deploy`
- **Usar siempre el mismo `--deploymentId`** para mantener la misma URL de testing en vez de crear deployments nuevos sueltos — el deploymentId actual es el que corresponde a la URL documentada en sección 12
- Si clasp push pide confirmación del manifest → usar `clasp push --force`

---

## 17. REGISTRO DE CAMBIOS (resumen — historial completo disponible en versiones anteriores de este documento)

| Fecha | Cambio |
|-------|--------|
| 07-08 jul 2026 | Duración medición 15min, selector idioma, campo cédula, US-04 (3 pestañas iniciales) |
| 09 jul 2026 | US-05 Done. US-08 Done. Bug fix pilates (bloqueo con 1 inscripción). Hallazgo: eventos duplicados pilates (pendiente US-10). |
| 10 jul 2026 | Reunión: acordado US-17 (nombre/apellido) y US-27 (correo como identificador, 3 pasos). |
| 12 jul 2026 | US-17 Done. US-27 Done, validada en testing real (4 tipos de cita). Hallazgo pendiente: acceso desde móvil. |
| 13 jul 2026 | US-09 Done (ventana 48hrs + lock, bug real corregido). Regla de Trello flexible agregada. US-10 Done (Sheet-antes-Calendar, evento único pilates, Meet real, calendario dedicado, bug de flush() encontrado y corregido — deploy v14). Dirección física confirmada, pendiente mostrarla en Sprint 2. |
| 14 jul 2026 | **US-06 Done.** Mecánica de reagendar/cancelar por token, ventana 24hrs con asimetría intencional (confirmada con el equipo), tracker de tardías por cliente (no por cita), requiere_pago tras 2 consecutivas. Bug real encontrado y corregido: inconsistencia entre cancelBooking/rescheduleBooking ante citas sin event_id. Falso positivo de bug diagnosticado como gap de deploy (nota 25) — lección de proceso reforzada. Validado en testing real: reagendar dentro/fuera de ventana, cancelar dentro/fuera de ventana, 2 tardías consecutivas → requiere_pago=true confirmado en Sheet real, evento de Calendar movido/eliminado confirmado en Calendar real. Wrappers temporales de testing removidos tras validar. Deploy v16. **Sprint 1 100% completo — las 12 US de Sprint 1 en Done.** |
| 14 jul 2026 | Reunión de equipo: confirmada la asimetría cancelar/reagendar sin cambios. Decisión nueva: reordenar el flujo del portal a Calendario → Correo → Datos (pendiente de implementar en Sprint 2, ver sección 3). |

---

*Última actualización: 14 julio 2026 — **Sprint 1 cerrado por completo** (US-01 a US-10, US-17, US-27, todas Done y validadas en testing real). Deploy activo: v16. Próximo paso: Sprint 2 — plantillas de correo bilingües, notificaciones internas, recordatorio 48hrs, frontend de reagendar/cancelar, y reordenar el flujo del portal a Calendario → Correo → Datos. Pendientes de fondo para Sprint 3: acceso desde móvil (nota 17), horario real de Dani (nota 14), checklist de acceso de producción (sección 6).*