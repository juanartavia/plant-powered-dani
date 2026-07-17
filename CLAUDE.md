# CLAUDE.md — Plant Powered by Dani
## Sistema de Agendamiento Automatizado
> Documento vivo — actualizar conforme avanza el desarrollo
> Última actualización: 17 julio 2026 — **Modificación cliente_nutricion/cliente_pilates cerrada y validada en testing real (3 bugs reales encontrados y corregidos en el camino).** Deploy activo: v20. **Primer demo con la dueña del producto hoy.** Pendientes de fondo documentados para después del demo (ver sección 3 y 13).

---

## 0. LÉEME PRIMERO — PARA EL PRÓXIMO CHAT (Sprint 2)

Si estás retomando este proyecto en un chat nuevo, este documento es tu única fuente de verdad. Antes de generar cualquier prompt para Claude Code:

1. Lee completo este documento, especialmente las secciones 11 (estado de sprints), 13 (notas técnicas — contiene lecciones aprendidas que evitan repetir bugs ya resueltos), y 14/15 (método de trabajo y reglas de Trello).
2. **US-19, US-18, y la modificación cliente_nutricion/cliente_pilates ya están Done** — ver sección 3 para el diseño final implementado y validado de las tres.
3. **HOY (17 jul) es el primer demo con la dueña del producto.** Si estás retomando después del demo, revisa si hay notas nuevas de feedback que el usuario no haya documentado aún aquí — pregunta antes de asumir que no pasó nada.
4. **Pendiente de fondo, deliberadamente pospuesto para después del demo (ver sección 13, nota 30):** las columnas `fecha` (Nutrición) y `fecha_clase` (Pilates) tienen el mismo problema de coerción de tipos que tenía `fecha_nacimiento` en "Clientes" (se guardan como objeto Date real de Sheets, editable con selector de calendario, en vez de texto plano). A diferencia de `fecha_nacimiento`, este caso NO tiene evidencia de estar rompiendo nada — el código de negocio ya usa `normalizeSheetDateCell()` en varios puntos, diseñado justamente para tolerar esta coerción. Se decidió NO tocarlo antes del demo por el riesgo de romper lógica ya validada (ventanas de 48h/24h, conflict-check, cupos de pilates) bajo presión de tiempo. Evaluar con calma cuándo retomarlo.
5. **Otro pendiente de fondo, también sin tocar (ver sección 13, nota 30):** `findClientByEmail()` lee `fecha_nacimiento` con `normalizeSheetDateCell(..., "yyyy-MM-dd")`, que internamente usa `TIME_ZONE` (Costa Rica) en vez de UTC — mismo patrón de bug que se corrigió en la escritura, pero en el lado de LECTURA. No se tocó porque, tras las reparaciones de hoy, todas las celdas de "Clientes" quedaron en texto plano — el bug de lectura solo se activaría si en el futuro algo vuelve a escribir un `Date` real ahí sin forzar texto (regresión). Bajo riesgo mientras no haya regresión, pero anotado para revisar.
6. El resto del Sprint 2 según el tablero real de Trello (ver sección 11): US-16, US-11, US-12, US-13, US-14, US-20, US-28, US-29 — todas en Backlog.
7. **Antes de tocar US-11/US-12/US-28**, el usuario tiene carpetas descargadas de Drive (branding/colores, comunicaciones/plantillas de correo, gráficos de Dani) que subirá al repo en una carpeta `design-reference/` separada de `backend/`/`frontend/` cuando lleguemos a esas tarjetas — no asumir que ya están ahí sin confirmar.
8. Sigue el mismo flujo de trabajo documentado en la sección 14: generar prompt → Claude Code ejecuta → **commit inmediato tras deploy exitoso** (nota 27) → probar en real antes de marcar cualquier checkbox → actualizar este documento.
9. **Lecciones reforzadas hoy (ver sección 13, notas 28-30):** (a) migraciones de schema por POSICIÓN de columna, nunca por texto de encabezado; (b) cualquier función que reconstruya una fecha desde un objeto `Date` de Sheets debe decidir conscientemente si usa `TIME_ZONE` (para fecha/hora de eventos reales, que sí dependen de dónde está Dani) o `UTC` (para fechas sin componente horario real, como fecha de nacimiento) — mezclarlas produce un corrimiento de ±1 día silencioso; (c) cuando una migración toca datos reales (no solo estructura), verificar el resultado línea por línea contra los valores originales antes de dar por buena la reparación, no solo confirmar que "no truena".

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

| Acción | Con <24hrs de anticipación |
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

### Formulario del cliente ✅ CONFIRMADO (actualizado 15 jul — US-17, US-27, US-18)
Nombre y apellido van en campos **separados**.
Campos exactos requeridos (en este orden):
1. Nombre
2. Apellido
3. Correo electrónico
4. Número de teléfono
5. Tipo de identificación (dropdown) + Número de identificación (texto)
6. Fecha de nacimiento
7. Idioma (ES/EN) *(sincronizado con el selector global de idioma)*
8. Modalidad *(solo para initial y followup — automático para los demás)*

> ⚠️ **Sin campo de notas** — eliminado para mantener el proceso simple.

### Campo de ID flexible ✅ IMPLEMENTADO Y VALIDADO (US-18, 15 jul)
El campo único "Cédula" se reemplazó por dos campos:
1. **"Tipo de identificación"** — DROPDOWN con 4 opciones fijas, traducido según idioma, pero el **valor interno guardado en el Sheet es siempre el mismo** sin importar el idioma elegido por el cliente:

   | Se muestra ES | Se muestra EN | Valor guardado (fijo) |
   |----------------|-----------------|--------------------------|
   | Cédula | ID Card | `cedula` |
   | Pasaporte | Passport | `pasaporte` |
   | Licencia de conducir | Driver's License | `licencia` |
   | Otro | Other | `otro` |

   Mismo patrón que ya existe para el campo "idioma" (se guarda "es"/"en" internamente, no el texto traducido).

2. **"Número de identificación"** — campo de texto libre que acepta letras y números (alfanumérico), para cubrir formatos de licencias de conducir de EE.UU. que no son solo dígitos.

**Schema:** en Nutrición, Pilates y Clientes, la columna `cedula` se renombró a `tipo_id` y se insertó una columna nueva `numero_id` justo después (ver sección 8).

**Deploy:** confirmado funcionando desde v18.

### Flujo del formulario en 3 pasos ✅ REORDENADO Y VALIDADO (US-19, 15 jul)
Nuevo orden implementado: **Calendario → Correo → Datos**.
1. **Paso 1 — Calendario:** cliente ve disponibilidad y elige fecha/hora (con regla de 48hrs mínimo). Selector de idioma y zona horaria vive aquí ahora. Selección tentativa, sin lock todavía.
2. **Paso 2 — Correo:** cliente ingresa su correo, sistema busca en "Clientes" (`findClientByEmail`).
3. **Paso 3 — Datos:** si el correo existe, formulario precargado (todos los campos editables excepto correo) + resumen FIJO del horario elegido en el Paso 1 (no editable ahí — para cambiar de horario hay que reiniciar el flujo); si es cliente nuevo, formulario vacío. Al hacer clic en Enviar, se ejecuta el lock/conflict-check real (`bookTimeslot`) — igual que antes, solo cambió el paso donde vive (ahora es el último paso en vez del Paso 3 viejo).

**Manejo de slot ocupado a mitad de flujo:** si el slot se ocupa mientras el cliente llena correo/datos, al confirmar falla con error claro y el cliente es devuelto al **Paso 1** con el calendario refrescado — el correo y los datos ya ingresados quedan **preservados**.

**Aplica a los 4 tipos de cita:** Inicial, Seguimiento, Medición y Pilates.

### Servicios del cliente en pestaña "Clientes" ✅ IMPLEMENTADO Y VALIDADO (modificación sin número de US, 17 jul)
Dos columnas nuevas en "Clientes" (posiciones K y L): `cliente_nutricion` y `cliente_pilates`, checkbox real de Google Sheets (booleano TRUE/FALSE), para identificar a qué servicio(s) pertenece cada cliente. Un cliente puede pertenecer a ambos.

**Lógica de escritura — OR acumulativo:** al hacer `upsertClient` durante un agendamiento, se marca `TRUE` solo la columna correspondiente al tipo de cita agendada (nutrición para initial/followup/measurement, pilates para pilates). La columna del otro servicio **nunca se pone en FALSE** si ya estaba en TRUE — no se toca. Así un cliente que agenda primero nutrición y después pilates termina con ambas columnas en TRUE.

**Validado en testing real (17 jul, con cliente nuevo desde cero, no reutilizando datos viejos):** cliente nuevo agenda nutrición → aparece en la fila correcta, `cliente_nutricion` TRUE; mismo cliente agenda pilates después → `cliente_pilates` también TRUE, `cliente_nutricion` se conserva TRUE.

**Deploy:** v20 (17 jul), mismo `deploymentId` de siempre.

#### Tres bugs reales encontrados y corregidos durante esta modificación (ver sección 13, notas 28-30 para el detalle técnico completo):
1. **Migración por texto falló silenciosamente** (mismo patrón que ya había pasado en US-18) — `addServicioColumnsToClientes()` usaba `getMaxRows()` (≈1000 filas por defecto de un Sheet nuevo) en vez de `getLastRow()` para acotar `insertCheckboxes()`, sembrando `FALSE` en ~1000 filas y rompiendo `appendRow()` para clientes nuevos (los insertaba en la fila ~1001, invisibles). Corregido: `upsertClient()` ya no usa `appendRow()`/`getLastRow()` ciego — busca explícitamente la primera fila con columna A (correo) vacía.
2. **Corrupción de datos por el bug anterior** — 2 clientes nuevos de prueba quedaron "perdidos" cerca de la fila 1000. Reparado con `cleanupCorruptedClientesSheet()` (función de un solo uso, ejecutada y validada manualmente).
3. **Corrimiento de fecha de ±1 día** — al reconstruir `fecha_nacimiento` desde un objeto Date real (durante la limpieza del punto 2), se usó `TIME_ZONE` (Costa Rica, UTC-6) en vez de `UTC`, corriendo todas las fechas de nacimiento un día hacia atrás. Reparado con `correctOffByOneDayBirthdates()` (función de un solo uso, protegida contra doble ejecución con marca en Script Properties, ejecutada y validada línea por línea contra los valores originales).

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

### Flujo principal — Agendar cita de nutrición
```
1. Ali o Dani comparte link ?type=initial/followup/measurement por WhatsApp
2. Cliente accede → Paso 1: ve Calendario (con selector idioma/zona horaria ahí),
   selecciona fecha y hora dentro de la ventana permitida (48hrs-8sem)
3. Paso 2: cliente ingresa su correo → sistema busca en pestaña "Clientes"
4. Paso 3: formulario precargado o vacío según exista el correo (incluye 
   dropdown de tipo_id + campo numero_id), con resumen fijo del horario 
   elegido en Paso 1 → upsert en "Clientes" al enviar (marca cliente_nutricion=TRUE,
   conserva cliente_pilates si ya estaba TRUE)
5. Apps Script re-verifica ventana 48hrs + LockService (protege contra colisiones
   entre tipos de cita) justo antes de confirmar
6. Si el slot ya no está disponible: error claro + regreso automático al Paso 1
   con calendario recargado y correo/datos preservados
7. Escribe fila en Sheet de Nutrición (con flush()) PRIMERO
8. Solo si tuvo éxito: crea evento en Calendar de Dani + Meet real si es virtual
9. Si el evento falla después de un Sheet exitoso: fila queda 'Error_Calendar' (no se borra)
10. Envía correo de confirmación (dirección física o Meet según modalidad) — pendiente Sprint 2
11. Envía notificación interna a Dani — pendiente Sprint 2
12. Trigger 48hrs antes → recordatorio — pendiente Sprint 2
13. Cita se realiza → Dani marca show/no-show en Sheet
```

### Flujo pilates — Inscripción a clase grupal
```
1. Ali o Dani comparte link ?type=pilates
2. Cliente accede → Paso 1: ve disponibilidad de sábados con cupos, selecciona
3. Paso 2: correo → busca en "Clientes" (compartida con nutrición)
4. Paso 3: formulario precargado o vacío (incluye dropdown de tipo_id + 
   numero_id) → upsert (marca cliente_pilates=TRUE, conserva 
   cliente_nutricion si ya estaba TRUE), resumen fijo del horario elegido
5. Si hay cupo: verifica en Cupos_Pilates (LockService) al confirmar
6. Escribe fila en Pilates PRIMERO (flush()), incrementa contador
7. Si es la primera inscripción del slot: crea evento en calendario dedicado con Meet, guarda event_id/meet_link
8. Si ya existe event_id: agrega al cliente como invitado (no crea evento nuevo)
9. Si cupo = 5: "clase llena"
10-12. Correos y notificaciones — pendiente Sprint 2
13. Clase se realiza → instructora marca show/no-show
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

### Pestaña "Nutrición" (schema tras US-18, verificado 15 jul)
```
token | nombre | apellido | correo | telefono | tipo_id | numero_id | fecha_nacimiento |
tipo_cita | fecha | hora | zona_horaria_cliente | modalidad | idioma |
meet_link | estado | fecha_creacion | recordatorio_enviado | show_no_show |
cancelaciones_tardias (legacy, sin usar) | requiere_pago (legacy, sin usar) | event_id
```
**Estados posibles:** `Agendada` → `Reagendada` → `Cancelada`, y también `Error_Calendar`.

> ⚠️ **Pendiente de fondo (ver sección 13, nota 30):** las columnas `fecha` (aquí) y `fecha_clase` (Pilates) tienen el mismo problema de coerción de tipos que tenía `fecha_nacimiento` — se guardan como objeto Date real, no texto plano. Deliberadamente NO se tocó el 17 jul (día del primer demo) por el riesgo de tocar lógica ya validada. El código de negocio ya tolera esto vía `normalizeSheetDateCell()`, así que no hay evidencia de bug funcional activo — es deuda técnica, no una urgencia confirmada.

### Pestaña "Pilates" (schema tras US-18, verificado 15 jul)
```
token | nombre | apellido | correo | telefono | tipo_id | numero_id | fecha_nacimiento |
fecha_clase | hora_clase | zona_horaria_cliente | idioma |
estado | fecha_inscripcion | recordatorio_enviado | show_no_show
```

### Pestaña "Cupos_Pilates"
```
fecha_clase | hora_clase | inscritos | max_participantes | event_id | meet_link
```

### Pestaña "Clientes" — correo es la clave única (schema final tras la modificación del 17 jul)
```
correo | nombre | apellido | telefono | tipo_id | numero_id | fecha_nacimiento | idioma | 
cancelaciones_tardias | requiere_pago | cliente_nutricion | cliente_pilates
```
Posiciones: A=correo, B=nombre, C=apellido, D=telefono, E=tipo_id, F=numero_id, G=fecha_nacimiento, H=idioma, I=cancelaciones_tardias, J=requiere_pago, K=cliente_nutricion, L=cliente_pilates.

Las columnas `cancelaciones_tardias`/`requiere_pago` de esta pestaña son la **única fuente de verdad** para la regla de "2 tardías consecutivas → debe pagar". Las columnas del mismo nombre en Nutrición/Pilates son legacy y no se usan para la lógica de negocio.

`cliente_nutricion`/`cliente_pilates` (K, L) — checkbox real, lógica OR-acumulativa (ver sección 3). **Validado y funcionando en v20.**

`fecha_nacimiento` (G) — **✅ confirmado como texto plano en las 12 filas de testing tras la reparación del 17 jul.** `upsertClient()` fuerza `setNumberFormat("@")` ANTES de escribir (no después — ver nota técnica #29) en ambos paths (insertar/actualizar), usando `UTC` (no `TIME_ZONE`) al reconstruir desde cualquier valor Date que llegue.

> ⚠️ **Pendiente de fondo (ver sección 13, nota 30):** `findClientByEmail()` sigue leyendo `fecha_nacimiento` con `normalizeSheetDateCell(..., "yyyy-MM-dd")`, que usa `TIME_ZONE` internamente en vez de UTC — mismo patrón de bug pero en el lado de LECTURA, no escritura. Bajo riesgo mientras todas las celdas sean texto plano (ya lo son tras la reparación), pero quedaría expuesto si algo en el futuro vuelve a escribir un Date real ahí sin forzar texto.

### Valores válidos de `tipo_id` (fijos, ver sección 3 para tabla de traducción)
```
cedula | pasaporte | licencia | otro
```
Estos son los ÚNICOS 4 valores internos aceptados — el backend valida contra esta lista y rechaza cualquier otro valor (ver `TIPO_ID_VALUES` en sección 10).

---

## 9. REQUERIMIENTOS FUNCIONALES

### RF-1 — Portal de Agendamiento
| ID | Requerimiento | Estado |
|----|--------------|--------|
| RF-1.1 | Cliente accede por link ?type= y ve disponibilidad en tiempo real | ✅ |
| RF-1.2 | Duración automática por tipo. Pilates: lógica de cupos grupales (máx 5) | ✅ |
| RF-1.3 | Formulario: nombre y apellido separados, correo, teléfono, tipo/número de ID flexible, fecha de nacimiento, idioma, modalidad | ✅ US-17, US-18 |
| RF-1.4 | Sin cuenta de Google — portal público por link con token | ✅ (⚠️ nota 17 — pendiente investigar fallo reportado en acceso desde móvil) |
| RF-1.5 | Datos en Sheets. Pilates: también actualizar contador en Cupos_Pilates | ✅ US-05 |
| RF-1.11 | Correo como identificador único del cliente — flujo de 3 pasos | ✅ US-27, orden actualizado en US-19 |
| RF-1.12 | Ventana mínima de 48 horas + verificación de conflictos con lock en tiempo real | ✅ US-09, sigue viviendo en el paso final tras US-19 |
| RF-1.13 | Creación de evento de Calendar tras escritura exitosa en Sheet; Meet real; evento único con múltiples invitados en pilates; calendario dedicado | ✅ US-10 |
| RF-1.14 | Reagendar/cancelar por token; política 24hrs con asimetría intencional; tracker de tardías por cliente; requiere_pago tras 2 consecutivas; Calendar consistente | ✅ US-06 — **falta frontend** (hoy solo probado vía backend/wrappers manuales, ya removidos) |
| RF-1.8 | Ventana máxima de agendamiento: 56 días (8 semanas) | ✅ |
| RF-1.9 | Horarios en zona horaria del cliente. Evento creado en hora CR. | ✅ US-08 |
| RF-1.10 | Selector de idioma ES/EN desde primera pantalla | ✅ (ahora en Paso 1 tras US-19) |
| RF-1.15 | Campo de ID flexible (tipo + número), valor interno consistente sin importar idioma | ✅ US-18 |
| RF-1.16 (nuevo) | Identificar a qué servicio(s) pertenece cada cliente en "Clientes" (cliente_nutricion/cliente_pilates, OR-acumulativo) | ✅ **Done — 17 jul** |

### RF-2 — Correos y Automatizaciones (SPRINT 2 — TODO PENDIENTE)
| ID | Requerimiento | Estado |
|----|--------------|--------|
| RF-2.1 | Correo de confirmación inmediato (idioma del cliente, link reagendar/cancelar, Meet si virtual **o dirección física si presencial** — Santa Ana Town Center, ver sección 1) | ⏳ Pendiente Sprint 2 |
| RF-2.2 | Correos de nutrición desde cuenta Dani. Correos de pilates desde cuenta instructora (o Reply-To, decisión pendiente — ver sección 6) | ⏳ Pendiente Sprint 2 |
| RF-2.3 | Notificación interna a Dani o instructora en cada acción (agendar/reagendar/cancelar) — el stub `notifyLateCancellation` ya existe con TODO en cancelBooking/rescheduleBooking, falta implementarlo de verdad y extenderlo a agendar | ⏳ Pendiente Sprint 2 |
| RF-2.4 | Recordatorio 48 hrs antes. Solo si estado='Agendada' o 'Reagendada'. | ⏳ Pendiente Sprint 2 |
| RF-2.5 | Notificación a Dani y Ali si cancelación/reagendamiento fuera de ventana | ⏳ Pendiente Sprint 2 (stub ya cableado, ver RF-2.3) |
| RF-2.6 (nuevo) | Frontend para que el cliente reagende/cancele desde el link único del correo (hoy solo existe el backend) | ⏳ Pendiente Sprint 2 |
| RF-2.7 | Reordenar las 3 pantallas del portal: Calendario → Correo → Datos | ✅ Done — US-19 |

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
TIME_ZONE = "America/Costa_Rica"       // Para fecha/hora de CITAS (eventos reales, dependen de Dani)
WORKDAYS = [1,2,3,4,5,6]              // ⚠️ genérico, no refleja horario real de Dani — Sprint 3
WORKHOURS = { start: 7, end: 20 }     // ⚠️ genérico — Sprint 3
DAYS_IN_ADVANCE = 56                   // 8 semanas
MIN_BOOKING_HOURS = 48                 // ✅ US-09
CANCELLATION_HOURS = 24               // ✅ US-06
MAX_PILATES_PARTICIPANTS = 5
PILATES_CALENDAR_ID                   // Script Property, no constante — calendario dedicado de pilates (US-10)
TIPO_ID_VALUES = ["cedula", "pasaporte", "licencia", "otro"]  // ✅ US-18, valores internos fijos
CEDULA_COLUMN_BY_SHEET = { "Nutrición": 6, "Pilates": 6, "Clientes": 5 }  // ✅ US-18, usado por la migración
CLIENTES_NUTRICION_COL = 11           // ✅ 17 jul, posición K
CLIENTES_PILATES_COL = 12             // ✅ 17 jul, posición L
CLIENTES_FECHA_NACIMIENTO_COL = 7     // ✅ 17 jul, posición G — usada para forzar texto plano antes de escribir
```

> ⚠️ **Regla de zona horaria para fechas (ver nota técnica #30):** `fecha_nacimiento` (sin componente horario real) SIEMPRE usa `UTC` al reconstruirse desde un objeto Date. `fecha`/`hora` de citas reales (que sí dependen de dónde vive Dani) usan `TIME_ZONE`. Mezclar los dos produce un corrimiento de ±1 día silencioso — ya pasó una vez (ver nota 29), no repetir el error en `fecha`/`fecha_clase` cuando se aborde ese pendiente.

### Firma actual de funciones en backend (al cierre del 17 jul)
```typescript
getDurationForType(type: string): number
fetchAvailability(type: string): { timeslots: string[], durationMinutes: number }

bookTimeslot(type, timeslot, nombre, apellido, email, phone, tipoId, numeroId, birthdate, language, modalidad, clientTimezone): string
// Orden interno: 1) appendBookingToSheet (con flush) 2) solo si tuvo éxito, crea evento +
// Meet. Si Calendar falla después: markBookingRowError + rollback cupo (pilates) + flush.
// Valida tipoId contra TIPO_ID_VALUES antes de escribir.

findBookingByToken(token: string): { sheet, row, data }
// Lanza TOKEN_NO_ENCONTRADO si no existe. Busca en Nutrición y Pilates.

rescheduleBooking(token, newTimeslot, clientTimezone): string
cancelBooking(token: string): { lateCancellation: boolean }

incrementClientLateCancellation(correo) / resetClientLateCancellationCounter(correo)
// ⚠️ El failsafe de appendRow para correos sin fila existente debe tener exactamente 12 
// elementos (schema actual de Clientes tras agregar cliente_nutricion/cliente_pilates) — 
// ya verificado y correcto al cierre del 17 jul.
getClientPaymentStatus(correo): { cancelaciones_tardias, requiere_pago }
notifyLateCancellation(...) // STUB con TODO — implementar de verdad en Sprint 2

upsertClient(data: ClientRecord, type: string): void
// ✅ Corregida 17 jul: ya NO usa appendRow()/getLastRow() para decidir dónde insertar 
// un cliente nuevo — busca explícitamente la primera fila con columna A (correo) vacía, 
// iterando sobre los valores reales de esa columna. Aplica setNumberFormat("@") a 
// fecha_nacimiento ANTES de escribir (no después, ver nota #29), usando UTC si tiene 
// que reconstruir desde un Date. Aplica la lógica OR-acumulativa a cliente_nutricion/
// cliente_pilates según el "type" recibido — nunca pone en FALSE la columna del 
// servicio contrario si ya estaba en TRUE.

findClientByEmail(correo: string): ClientRecord | null
// ⚠️ Lee fecha_nacimiento con normalizeSheetDateCell(..., "yyyy-MM-dd"), que usa 
// TIME_ZONE internamente (no UTC) — pendiente de fondo, ver nota técnica #30.

migrateCedulaToTipoNumeroId(): void
// ✅ US-18. Migra por POSICIÓN de columna (CEDULA_COLUMN_BY_SHEET), NO por texto.

addServicioColumnsToClientes(): void
// ✅ 17 jul, corregida. Usa getLastRow() (no getMaxRows()) para acotar insertCheckboxes() 
// solo a filas con datos reales. Idempotente por posición.

cleanupCorruptedClientesSheet(): void
// ✅ Función de un solo uso, ejecutada y validada el 17 jul. Recuperó 3 filas perdidas 
// (test9, test10, test11) que appendRow() había insertado cerca de la fila 1000 por el 
// bug de addServicioColumnsToClientes(). Reconstruye fecha_nacimiento con UTC (no 
// TIME_ZONE) si la celda movida era un Date real.

correctOffByOneDayBirthdates(): void
// ✅ Función de un solo uso, ejecutada y validada el 17 jul contra los 11 valores 
// originales conocidos — coincidencia exacta. Protegida contra doble ejecución vía 
// Script Property "BIRTHDATE_OFFBYONE_FIX_APPLIED_2026_07_17".

fixFechaNacimientoFormatInClientes(): void
// ✅ Función de un solo uso, ejecutada y validada el 17 jul. Reconvierte cualquier 
// celda de fecha_nacimiento que siga siendo Date real a texto plano YYYY-MM-DD (con 
// UTC, no TIME_ZONE — corregido en el camino, ver nota #29), aplicando 
// setNumberFormat("@"). Idempotente (ignora celdas que ya son texto).

addCancelacionesColumnsToClientes(): void  // ✅ ejecutada manualmente 13 jul
addEventIdColumnToNutricion(): void        // ✅ ejecutada manualmente 13 jul
addEventIdColumnToCuposPilates(): void     // ✅ ejecutada manualmente 13 jul
setupPilatesTestCalendar(): void           // ✅ ejecutada manualmente 13 jul, idempotente
initializeSheets(): void                    // ✅ ejecutada, NO volver a correr
addClientesSheet(): void                    // ✅ ejecutada manualmente 12 jul
getSheet(sheetName: string): GoogleAppsScript.Spreadsheet.Sheet
getPilatesCalendarId(): string
```

> **Nota frontend:** no hay componentes de paso separados en archivos individuales — `EmailStep`, `ContactForm` y `CalendarTimeslotPicker` son funciones dentro de `frontend/src/components/calendar-picker.tsx`, junto con el orquestador `CalendarPicker`. `useUpsertClient.tsx` ahora envía `type` como segundo argumento a `upsertClient`. `googlelib.ts` tiene un mock de modo demo que también se actualizó a la firma de dos argumentos.

> **Nota test-harness:** `backend/test-harness/` (gas-mock.js y run-tests.js) — 37 aserciones, todas pasando al cierre del 17 jul. **Punto ciego conocido:** el mock no simula el comportamiento real de `insertCheckboxes()` ni de `getMaxRows()`/`appendRow()` sobre un Sheet con miles de filas — el bug #1 de la modificación de hoy no lo hubiera atrapado el harness, solo se encontró en testing real contra el Sheet real. Tenerlo presente: el harness cubre lógica de negocio pura, no comportamiento de la API real de Sheets en casos de borde de tamaño/formato.

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
| US-06 | Funciones de actualización de estado (reagendar/cancelar) | ✅ Done — Deploy v16. |
| US-07 | Formulario extendido: idioma, modalidad, cédula, fecha de nacimiento | ✅ Done |
| US-08 | Detección y ajuste de zona horaria del cliente | ✅ Done |
| US-09 | Verificación de conflictos, lock y ventana mínima de 48 hrs | ✅ Done |
| US-10 | Creación de evento en Calendar y generación de Meet | ✅ Done |
| US-17 | Separar nombre y apellido en campos independientes | ✅ Done |
| US-27 | Correo como identificador único — pestaña "Clientes" + flujo de 3 pasos | ✅ Done |

**Todas las tarjetas movidas a Done en Trello.**

### Sprint 2 (Jul 14 – Jul 20) — ESP: 30 — tablero real de Trello

| US | Título | Puntos | Checklist | Estado |
|----|--------|--------|-----------|--------|
| US-19 | Cambiar orden de pantallas (Calendario→Correo→Datos) | 2 | 5/5 | ✅ **Done (15 jul)** — Deploy v17. |
| US-18 | Campo de ID flexible: cédula, pasaporte o driver's license | 1 | 1/1 | ✅ **Done (15 jul)** — Deploy v18. |
| (sin número) | cliente_nutricion/cliente_pilates en "Clientes" | — | Validado | ✅ **Done (17 jul)** — Deploy v20. 3 bugs reales encontrados y corregidos (ver sección 3). |
| US-16 | Fix: calendario no abre en el mes actual por defecto | 2 | 0/4 | ⏳ Backlog |
| US-11 | Plantillas HTML bilingües (nutrición y pilates) | 3 | 1/7 | ⏳ Backlog — necesita carpeta "Comunicaciones" de Drive |
| US-12 | Correo de confirmación inmediato al cliente | 3 | 1/8 | ⏳ Backlog — depende de US-11 |
| US-13 | Notificación interna a Secretaria | 5 | 1/6 | ⏳ Backlog |
| US-14 | Recordatorio automático 48 horas antes de la cita | 5 | 1/6 | ⏳ Backlog |
| US-20 | Generación y validación de token único por cita | 2 | 1/8 | ⏳ Backlog — revisar solapamiento con US-05/US-06 |
| US-28 | Actualizar look & feel del portal según brandbook de Plant Powered | 4 | 0/7 | ⏳ Backlog — necesita carpeta de branding/colores de Drive |
| US-29 | Bloquear registro de datos de menores de 13 años | 5 | 0/8 | ⏳ Backlog — depende de fecha_nacimiento confiable (ya reparada en Clientes) |
| (sin número) | Fix fecha/fecha_clase en Nutrición/Pilates (mismo patrón Date-vs-texto) | — | — | ⏳ **Pospuesto deliberadamente hasta después del demo** — ver sección 13, nota 30 |
| (sin número) | Fix lectura findClientByEmail (TIME_ZONE vs UTC en fecha_nacimiento) | — | — | ⏳ Deuda técnica de bajo riesgo, ver sección 13, nota 30 |

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
| Versión actual | **v20** |
| Repo | https://github.com/juanartavia/plant-powered-dani |
| Spreadsheet testing | https://docs.google.com/spreadsheets/d/16M6WUqMAK9XkVoIutIn9UkJojlS5biT5o470GySs5gw/edit |
| Calendario pilates (testing) | "Pilates - Testing" |
| Harness de pruebas backend | `backend/test-harness/` (run-tests.js + gas-mock.js + README.md) — 37 aserciones, todas pasando |

### ⚠️ Lección crítica de proceso — deploy vs. push (ver nota técnica #25)
`clasp push` actualiza el código fuente del proyecto, pero la URL pública `/exec` de un deployment queda **congelada** a la versión del último `clasp deploy` sobre ese mismo `deploymentId`. **Siempre confirmar que se hizo `clasp deploy` antes de dar una prueba por válida usando el link público.**

### Links de testing por tipo de cita (v20)
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
| v13-v14 | 13 jul | US-10: Sheet-antes-Calendar, evento único pilates, Meet real, calendario dedicado |
| v15-v16 | 14 jul | US-06: reagendar/cancelar por token, tracker por cliente. **Sprint 1 100% cerrado.** |
| v17 | 15 jul | **US-19 Done.** Reordenado el flujo del portal a Calendario→Correo→Datos. |
| v18 | 15 jul | **US-18 Done.** Campo de ID flexible: tipo_id + numero_id. Migración corregida de texto a posición (nota #28). |
| v19 | 17 jul | **cliente_nutricion/cliente_pilates**, primera versión — contenía el bug #1 de appendRow/getMaxRows (ver sección 3), detectado en testing real antes de considerarse Done. |
| v20 | 17 jul | Fix completo de la modificación de v19: OR-acumulativo correcto, inserción de fila nueva sin appendRow/getLastRow ciego, fecha_nacimiento en texto plano + corrección de zona horaria UTC vs TIME_ZONE. **Validado en testing real con cliente nuevo desde cero (test12): ambos servicios, fecha exacta, fila correcta. Deploy activo.** |

---

## 13. NOTAS TÉCNICAS CRÍTICAS

1. **Todo en cuenta de testing primero** — nunca tocar cuenta real de Dani hasta Sprint 3.
2. **Pilates grupal es arquitectónicamente distinto** — usa contador en Cupos_Pilates, no slot individual.
3. **Pilates solo sábados** — restricción pendiente de implementar en Sprint 3.
4. **Función atómica (US-05, reforzada US-10):** si falla Sheets → no crear evento en Calendar. Si falla Calendar DESPUÉS de un Sheet exitoso → la fila NO se borra, queda `estado='Error_Calendar'`.
5. **Token UUID v4:** columna 1 del Sheet, es el único identificador válido para localizar una cita — nunca el correo.
6. **Trigger 48hrs (Sprint 2):** solo disparar si estado = 'Agendada' o 'Reagendada'. Marcar recordatorio_enviado para evitar duplicados.
7. **Cancelaciones tardías — fuente de verdad es "Clientes", no Nutrición/Pilates.**
8. **Correos pilates** salen desde cuenta de la instructora — o Reply-To, decisión pendiente Sprint 2.
9. **Idioma del cliente** guardado en Sheet → determina idioma de todos los correos automáticos (Sprint 2).
10. **Cédula** ya NO es el identificador único (reemplazada por correo desde US-27) — y desde US-18 tampoco es un campo único: se dividió en `tipo_id` + `numero_id`, con `tipo_id` restringido a 4 valores internos fijos.
11. **initializeSheets()** — UNA SOLA VEZ, ya ejecutada. NO volver a correr.
12. **Permisos en appsscript.json** — incluye spreadsheets, drive, calendar. Agregar scope si se suman integraciones nuevas.
13. **Pilates: eventos duplicados — RESUELTO en US-10.**
14. **`WORKDAYS`/`WORKHOURS` genéricos (pendiente Sprint 3).**
15. **Criterio validado varias veces: auditar y adaptar código heredado, no asumir que ya cumple las reglas del cliente.**
16. **Coerción de tipos en Google Sheets** — un string de fecha/hora puede autodetectarse como objeto `Date`, rompiendo comparaciones `===`. Mitigación general: `normalizeSheetDateCell()` + `setNumberFormat("@")`. Este es el patrón raíz detrás de las notas #28-30.
17. **Acceso desde móvil — pendiente investigar.**
18. **El lock de conflict-check protege el Calendar real, no el "tipo" de cita** (US-09).
19. **`SpreadsheetApp` cachea escrituras — requiere `flush()` explícito antes de releer en la misma ejecución.**
20. **Calendar de pilates nunca estuvo realmente separado hasta US-10.**
21. **Asimetría intencional cancelar/reagendar** (US-06) — ver tabla completa en sección 3.
22. **Ventana de 24hrs para reagendar se evalúa contra la cita ACTUAL, no la nueva.**
23. **Patrón para testing manual sin frontend (US-06)** — wrappers temporales, borrar al finalizar la US.
24. **rescheduleBooking y cancelBooking deben comportarse igual ante citas sin `event_id`.**
25. **Gap de deploy causó un falso positivo de bug (14 jul).** Regla reforzada: verificar `clasp deployments` antes de dar un resultado de prueba por "bug confirmado".
26. **Wrappers temporales de US-06 removidos (14 jul).**
27. **Trabajo funcionando en producción sin `git commit` — ocurrió dos veces antes de detectarse.** Regla reforzada: `git commit` inmediatamente después de cada `clasp deploy` exitoso — no esperar a validar en real primero, no esperar al cierre del sprint (ver paso 6.5 en sección 14).
28. **Migración de schema por texto falló silenciosamente por un espacio en blanco invisible (US-18, 15 jul).** `headers.indexOf("cedula")` falló en Nutrición/Pilates por un espacio invisible en el header real. Regla reforzada: migrar por POSICIÓN de columna, no por texto.
29. **Corrimiento de fecha ±1 día por mezclar TIME_ZONE con UTC al reconstruir fechas sin componente horario (17 jul).** Al reparar `fecha_nacimiento` desde un objeto Date, usar `TIME_ZONE` (Costa Rica, UTC-6) corrió todas las fechas un día hacia atrás, porque medianoche UTC cae en el día anterior en hora de Costa Rica. **Regla reforzada:** cualquier fecha SIN componente horario real (fecha de nacimiento) debe reconstruirse siempre en `UTC`. Cualquier fecha/hora que SÍ representa un evento real (cita, clase) debe seguir usando `TIME_ZONE` porque depende genuinamente de dónde vive Dani. Mezclar los dos produce un bug silencioso — no lanza error, solo corre el valor. Reparado con una función de un solo uso, protegida contra doble ejecución con marca en Script Properties, y validada línea por línea contra los 11 valores originales conocidos antes de darla por buena — no basta con confirmar que "no truena".
30. **`insertCheckboxes()` sobre `getMaxRows()` en vez de `getLastRow()` corrompió silenciosamente el Sheet real (17 jul).** `Range.insertCheckboxes()` fuerza `FALSE` en toda celda del rango sin valor booleano previo. Al aplicarlo sobre `getMaxRows()` (≈1000 filas por defecto en un Sheet nuevo, no el número real de filas con datos), se sembró contenido en ~1000 filas — lo que rompió `appendRow()` para inserciones posteriores (`appendRow` escribe después de la última fila con CUALQUIER contenido, así que empezó a insertar clientes nuevos cerca de la fila 1000, invisibles en el rango normal de trabajo). El bug NO afectaba clientes existentes (ese path busca la fila por contenido real de columna A, no por `getLastRow()`), lo que hizo que pareciera "funciona a veces" cuando en realidad el patrón era 100% consistente (nuevo=roto, existente=ok) — llevó una ronda extra de testing aclarar esto. **Regla reforzada:** cualquier operación de rango masivo sobre una pestaña (`insertCheckboxes`, formato, validación de datos) debe acotarse explícitamente a `getLastRow()`/`getLastColumn()` reales, nunca a los límites por defecto del Sheet (`getMaxRows()`/`getMaxColumns()`). **Punto ciego confirmado del test-harness:** el mock no simula ninguno de estos comportamientos de la API real de Sheets sobre tamaño/rango — este tipo de bug solo se encuentra en testing real contra el Sheet real, nunca en el harness. **Pendientes de fondo derivados, deliberadamente pospuestos el 17 jul (día del primer demo) por riesgo de tocar lógica ya validada bajo presión de tiempo:** (a) mismo problema de Date-vs-texto en `fecha` (Nutrición) y `fecha_clase` (Pilates) — sin evidencia de bug funcional activo, ya que ese código usa `normalizeSheetDateCell()`; (b) `findClientByEmail()` lee `fecha_nacimiento` con `TIME_ZONE` en vez de UTC (mismo patrón de la nota #29, pero en lectura) — bajo riesgo mientras no haya una regresión que vuelva a escribir un Date real sin forzar texto.

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
6.5. Inmediatamente después de un clasp deploy exitoso: git add . && git commit (no esperar
     a validar en real primero, no esperar al final del sprint — ver nota técnica 27)
7. Probar en el navegador real contra el deploy — NO se marca nada como completado solo porque el código se escribió
8. Solo si la prueba real confirma que funciona → marcar checkbox(es) en Trello
9. Cuando todos los checkboxes de la tarjeta estén marcados → mover la tarjeta a Done
10. Actualizar CLAUDE.md
```

### ⚠️ Cuándo ir al editor de Apps Script manualmente
- **Ejecutar funciones de inicialización/migración/reparación** — dropdown de funciones → Ejecutar. Son de UNA SOLA VEZ salvo que sean explícitamente idempotentes.
- **Autorizar permisos nuevos** — Revisar permisos → Avanzado → Ir a (no seguro) → Permitir.
- **Ver logs de ejecución** — Registro de ejecución, para debuggear.
- **El editor solo muestra código ya subido con `clasp push`** — si algo no aparece en el dropdown, recargar la página del editor primero.
- **Al correr una migración de schema, revisar el log con cuidado línea por línea** — un mensaje de "no se hizo ningún cambio" o "no se encontró" puede ocultar un bug real de comparación (nota #28).
- **Al correr una función de REPARACIÓN de datos (no solo estructura), comparar el resultado línea por línea contra los valores originales conocidos, no solo confirmar que la ejecución "no truena"** (lección de la nota #29 — la primera reparación de fecha_nacimiento corrió sin errores pero dejó todos los valores mal por un día).

**URL del editor:** https://script.google.com/d/1cu-HdKiAmfUYOgjwtjKcE9lCO6waLfFsL71PwP4GgcdGiQWzqygPS3fK/edit

### Reglas importantes
- Claude Code siempre lee el CLAUDE.md al inicio de cada prompt
- Cada `clasp deploy` genera una URL nueva (o actualiza la existente si se usa el mismo `--deploymentId`) — siempre documentarla aquí
- Los comandos en Windows PowerShell van uno por uno (sin &&)
- Nunca tocar la cuenta real de Dani hasta Sprint 3
- Si hay que agregar permisos nuevos → agregar scope en dist/appsscript.json Y appsscript.json (raíz)
- **Antes de aceptar un resultado de prueba como bug confirmado, verificar que se probó contra la versión de deploy correcta** (nota 25)
- **Comitear a git inmediatamente después de cada deploy exitoso, sin esperar a validar en real** (nota 27)
- **Migraciones de schema por posición, no por texto, cuando sea posible** (nota 28)
- **Fechas sin componente horario real (fecha_nacimiento) siempre en UTC; fechas/horas de eventos reales siempre en TIME_ZONE — nunca mezclar** (nota 29)
- **Cualquier operación de rango masivo sobre una pestaña debe acotarse a getLastRow()/getLastColumn(), nunca a los límites por defecto del Sheet** (nota 30)
- **Bajo presión de tiempo (ej. día de demo), preferir posponer cambios a lógica ya validada en vez de arriesgar una regresión de último momento** — criterio aplicado el 17 jul con el pendiente de fecha/fecha_clase

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
- **Ningún checkbox ni tarjeta se marca como completado/Done solo porque Claude Code terminó de escribir el código.**

### El Trello no es una fuente rígida — se ajusta a la realidad del desarrollo
Las tarjetas, descripciones y checklists de Trello reflejan la mejor comprensión del momento en que se crearon, pero **no son inmutables**.

### Modificaciones sin número de US
No todo cambio necesita pasar por una tarjeta formal de Trello — si surge una mejora pequeña y bien acotada en medio de otra tarea, se puede acordar en el chat, documentar en el CLAUDE.md, y ejecutarla directamente sin crear una tarjeta nueva — siempre que se documente igual de bien que una US formal.

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
git add .
git commit -m "descripción del cambio"               # inmediatamente después del deploy — ver nota 27
git push
```

### Notas importantes para Windows
- `&&` no funciona en PowerShell — correr comandos uno por uno
- `deploy.sh` y `build.sh` no funcionan en Windows
- El `.claspignore` está renombrado a `.claspignore.bak` — no revertir
- El `rootDir` en `.clasp.json` apunta a `dist/` — no cambiar
- Siempre `clasp push` antes de `clasp deploy`
- **Usar siempre el mismo `--deploymentId`** — el actual es `AKfycbwNUEjG8CXo2D5bk2eq1w6wBrme9XqJpCqOt-TkP0otTypiXd7GCEk7L7uFhdDOLCaJ`
- Si clasp push pide confirmación del manifest → usar `clasp push --force`
- **Comitear a git inmediatamente después del deploy** — no dejarlo pendiente (nota 27)

---

## 17. REGISTRO DE CAMBIOS (resumen — historial completo disponible en versiones anteriores de este documento)

| Fecha | Cambio |
|-------|--------|
| 07-08 jul 2026 | Duración medición 15min, selector idioma, campo cédula, US-04 (3 pestañas iniciales) |
| 09 jul 2026 | US-05 Done. US-08 Done. Bug fix pilates (bloqueo con 1 inscripción). |
| 10 jul 2026 | Reunión: acordado US-17 y US-27. |
| 12 jul 2026 | US-17 Done. US-27 Done. Hallazgo pendiente: acceso desde móvil. |
| 13 jul 2026 | US-09 Done. US-10 Done. Dirección física confirmada. |
| 14 jul 2026 | **US-06 Done. Sprint 1 100% completo.** Reunión: asimetría cancelar/reagendar confirmada, decisión de reordenar flujo (Sprint 2). |
| 15 jul 2026 | **US-19 Done** (reorden Calendario→Correo→Datos, deploy v17). **US-18 Done** (ID flexible tipo_id+numero_id, deploy v18) — bug real de migración por texto encontrado y corregido (nota #28). Acordada modificación cliente_nutricion/cliente_pilates para el siguiente paso. |
| 17 jul 2026 | **Modificación cliente_nutricion/cliente_pilates completada y validada (deploy v20).** Tres bugs reales encontrados y corregidos en el proceso: (1) `insertCheckboxes()` sobre `getMaxRows()` en vez de `getLastRow()` corrompió el Sheet, rompiendo la inserción de clientes nuevos vía `appendRow()` — corregido con búsqueda explícita de fila vacía por columna A (nota #30); (2) datos corrompidos (3 clientes de prueba "perdidos" cerca de la fila 1000) reparados con `cleanupCorruptedClientesSheet()`; (3) corrimiento de fecha ±1 día al mezclar `TIME_ZONE` con `UTC` al reconstruir `fecha_nacimiento` desde un objeto Date — reparado con `correctOffByOneDayBirthdates()`, validado línea por línea contra los 11 valores originales (nota #29). Validado en testing real con cliente nuevo desde cero (test12): ambos servicios marcados correctamente, fecha exacta, fila en la posición correcta. **Primer demo con la dueña del producto programado para hoy.** Decisión tomada bajo presión de tiempo: se pospuso deliberadamente el fix del mismo problema Date-vs-texto en `fecha`/`fecha_clase` de Nutrición/Pilates para después del demo, por el riesgo de tocar lógica de negocio ya validada (ventanas de tiempo, conflict-check, cupos) sin margen para probar con calma. Documentado como pendiente de fondo (nota #30). |

---

*Última actualización: 17 julio 2026 — **Modificación cliente_nutricion/cliente_pilates Done**, validada en testing real con cliente nuevo desde cero. Deploy activo: v20. **Primer demo con la dueña del producto hoy.** Pendientes de fondo, deliberadamente pospuestos para después del demo: fix de fecha/fecha_clase en Nutrición/Pilates (mismo patrón Date-vs-texto, sin evidencia de bug funcional activo) y fix de lectura en findClientByEmail (TIME_ZONE vs UTC, bajo riesgo). Resto del Sprint 2 pendiente según tablero real de Trello (sección 11): US-16, US-11, US-12, US-13, US-14, US-20, US-28, US-29. Pendientes de fondo para Sprint 3: acceso desde móvil (nota 17), horario real de Dani (nota 14), checklist de acceso de producción (sección 6).*