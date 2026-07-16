# CLAUDE.md — Plant Powered by Dani
## Sistema de Agendamiento Automatizado
> Documento vivo — actualizar conforme avanza el desarrollo
> Última actualización: 15 julio 2026 — **US-18 Done (campo de ID flexible: tipo_id + numero_id), validada en testing real.** Deploy activo: v18. Sprint 2 en curso — siguiente: modificación extra (columnas cliente_nutricion/cliente_pilates en "Clientes", sin número de US), luego resto del backlog de Sprint 2.

---

## 0. LÉEME PRIMERO — PARA EL PRÓXIMO CHAT (Sprint 2)

Si estás retomando este proyecto en un chat nuevo, este documento es tu única fuente de verdad. Antes de generar cualquier prompt para Claude Code:

1. Lee completo este documento, especialmente las secciones 11 (estado de sprints), 13 (notas técnicas — contiene lecciones aprendidas que evitan repetir bugs ya resueltos), y 14/15 (método de trabajo y reglas de Trello).
2. **US-19 (reorden de pantallas) y US-18 (campo de ID flexible) ya están Done** — ver sección 3 para el diseño final implementado y validado de ambas.
3. **Siguiente paso: modificación extra sin número de US** — agregar columnas `cliente_nutricion`/`cliente_pilates` (booleanas, checkbox real de Sheets) a la pestaña "Clientes", para identificar a qué servicio(s) pertenece cada cliente (un cliente puede ir a ambos). Ver sección 3 para el diseño acordado. Se decidió hacerla como modificación aparte, no como US de Trello, aprovechando que ya se está tocando la pestaña "Clientes".
4. El resto del Sprint 2 según el tablero real de Trello (ver sección 11): US-16, US-11, US-12, US-13, US-14, US-20, US-28, US-29 — todas en Backlog.
5. **Antes de tocar US-11/US-12/US-28**, el usuario tiene carpetas descargadas de Drive (branding/colores, comunicaciones/plantillas de correo, gráficos de Dani) que subirá al repo en una carpeta `design-reference/` separada de `backend/`/`frontend/` cuando lleguemos a esas tarjetas — no asumir que ya están ahí sin confirmar.
6. Sigue el mismo flujo de trabajo documentado en la sección 14: generar prompt → Claude Code ejecuta → **commit inmediato tras deploy exitoso** (lección nueva, ver sección 13 nota 27) → probar en real antes de marcar cualquier checkbox → actualizar este documento.
7. **Lección de US-18 (ver sección 13, nota 28):** cuando una función de migración de schema busca columnas por TEXTO en la fila 1, verificar primero con el usuario (captura de pantalla del Sheet real) si el texto coincide exactamente — un espacio en blanco invisible o una tilde puede hacer fallar la comparación sin lanzar ningún error visible. Preferir migrar por POSICIÓN de columna (la misma que el resto del código ya usa) en vez de por texto, siempre que sea posible.

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

**Validado en testing real (15 jul):** confirmado que un cliente seleccionando en español guarda el mismo valor interno que uno seleccionando en inglés (ej. "Licencia de conducir" y "Driver's License" ambos guardan `licencia`); probado en los 4 tipos de cita; cliente existente precarga correctamente el dropdown con su tipo guardado.

**Deploy:** v18 (15 jul), mismo `deploymentId` de siempre.

**Nota técnica sobre la migración (ver sección 13, nota 28):** la primera versión de la función de migración buscaba la columna `cedula` por texto exacto en la fila 1, y falló silenciosamente en Nutrición/Pilates por un espacio en blanco invisible en el encabezado real ("cedula " con espacio, confirmado en el log de ejecución). Se corrigió migrando por POSICIÓN de columna en vez de texto — ver la función `migrateCedulaToTipoNumeroId()` en el stack técnico (sección 10).

### Flujo del formulario en 3 pasos ✅ REORDENADO Y VALIDADO (US-19, 15 jul)
Nuevo orden implementado: **Calendario → Correo → Datos**.
1. **Paso 1 — Calendario:** cliente ve disponibilidad y elige fecha/hora (con regla de 48hrs mínimo). Selector de idioma y zona horaria vive aquí ahora. Selección tentativa, sin lock todavía.
2. **Paso 2 — Correo:** cliente ingresa su correo, sistema busca en "Clientes" (`findClientByEmail`).
3. **Paso 3 — Datos:** si el correo existe, formulario precargado (todos los campos editables excepto correo) + resumen FIJO del horario elegido en el Paso 1 (no editable ahí — para cambiar de horario hay que reiniciar el flujo); si es cliente nuevo, formulario vacío. Al hacer clic en Enviar, se ejecuta el lock/conflict-check real (`bookTimeslot`) — igual que antes, solo cambió el paso donde vive (ahora es el último paso en vez del Paso 3 viejo).

**Manejo de slot ocupado a mitad de flujo:** si el slot se ocupa mientras el cliente llena correo/datos, al confirmar falla con error claro y el cliente es devuelto al **Paso 1** con el calendario refrescado — el correo y los datos ya ingresados quedan **preservados** (no se pierden, no hay que reescribirlos). Validado en testing real quitándole el slot a un cliente nuevo desde otra pestaña a mitad de flujo — confirmado que los datos persisten y no se duplica el registro.

**Aplica a los 4 tipos de cita:** Inicial, Seguimiento, Medición y Pilates — probado end-to-end en los 4, incluyendo cliente nuevo y cliente existente.

**Hallazgo real de Code durante la implementación:** los selectores de idioma/zona horaria vivían solo en el header del paso "correo" (antes el primero). Al mover el calendario al Paso 1, si no se movían también los selectores, un cliente de EEUU habría elegido horario antes de poder fijar su zona horaria — se corrigió moviéndolos al nuevo Paso 1, requerido por RNF-5, no opcional.

### Modificación pendiente — Servicios del cliente en pestaña "Clientes" ⏳ ACORDADA, NO IMPLEMENTADA
Se identificó que la pestaña "Clientes" no distingue a qué servicio(s) pertenece cada cliente (puede ir solo a nutrición, solo a pilates, o a ambos). Diseño acordado:
- Dos columnas nuevas en "Clientes": `cliente_nutricion` y `cliente_pilates`, tipo **checkbox real de Google Sheets** (booleano TRUE/FALSE), no texto libre "Sí"/"No" — evita inconsistencias de escritura y permite filtrar directamente en el Sheet.
- **Lógica de escritura:** al hacer `upsertClient` durante un agendamiento, se marca `TRUE` en la columna correspondiente al tipo de cita agendada (nutrición para `initial`/`followup`/`measurement`, pilates para `pilates`). **Nunca se pone en `FALSE`** si ya estaba en `TRUE` por una cita anterior de otro tipo — es un OR acumulativo, no un reemplazo. Así un cliente que agenda primero nutrición y después pilates termina con ambas columnas en `TRUE`, sin que se pisen entre sí.
- Se decidió implementar esto como una **modificación aparte, sin número de US de Trello**, aprovechando que ya se estaba tocando el schema de "Clientes" en US-18. Pendiente de generar el prompt.

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

### Flujo principal — Agendar cita de nutrición (orden reordenado en US-19, campos de ID actualizados en US-18)
```
1. Ali o Dani comparte link ?type=initial/followup/measurement por WhatsApp
2. Cliente accede → Paso 1: ve Calendario (con selector idioma/zona horaria ahí),
   selecciona fecha y hora dentro de la ventana permitida (48hrs-8sem)
3. Paso 2: cliente ingresa su correo → sistema busca en pestaña "Clientes"
4. Paso 3: formulario precargado o vacío según exista el correo (incluye 
   dropdown de tipo_id + campo numero_id), con resumen fijo del horario 
   elegido en Paso 1 → upsert en "Clientes" al enviar
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

### Flujo pilates — Inscripción a clase grupal (orden reordenado en US-19, campos de ID actualizados en US-18)
```
1. Ali o Dani comparte link ?type=pilates
2. Cliente accede → Paso 1: ve disponibilidad de sábados con cupos, selecciona
3. Paso 2: correo → busca en "Clientes" (compartida con nutrición)
4. Paso 3: formulario precargado o vacío (incluye dropdown de tipo_id + 
   numero_id) → upsert, resumen fijo del horario elegido
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

### Pestaña "Nutrición" (schema actualizado tras US-18, verificado 15 jul)
```
token | nombre | apellido | correo | telefono | tipo_id | numero_id | fecha_nacimiento |
tipo_cita | fecha | hora | zona_horaria_cliente | modalidad | idioma |
meet_link | estado | fecha_creacion | recordatorio_enviado | show_no_show |
cancelaciones_tardias (legacy, sin usar) | requiere_pago (legacy, sin usar) | event_id
```
**Estados posibles:** `Agendada` → `Reagendada` → `Cancelada`, y también `Error_Calendar`.

> ⚠️ **Nota operativa (resuelta parcialmente en US-18):** los encabezados de fila 1 de Nutrición/Pilates habían quedado con inconsistencias de texto invisible (espacios en blanco) respecto al string interno que usa el código — esto causó que la primera versión de la migración de US-18 fallara silenciosamente (ver nota técnica #28, sección 13). La migración final NO depende de texto, usa posición de columna fija. Si se necesita otra migración de esquema en el futuro, preferir el mismo enfoque por posición.

### Pestaña "Pilates" (schema actualizado tras US-18, verificado 15 jul)
```
token | nombre | apellido | correo | telefono | tipo_id | numero_id | fecha_nacimiento |
fecha_clase | hora_clase | zona_horaria_cliente | idioma |
estado | fecha_inscripcion | recordatorio_enviado | show_no_show
```

### Pestaña "Cupos_Pilates"
```
fecha_clase | hora_clase | inscritos | max_participantes | event_id | meet_link
```

### Pestaña "Clientes" — correo es la clave única (fuente de verdad del tracker de cancelaciones) (schema actualizado tras US-18, verificado 15 jul)
```
correo | nombre | apellido | telefono | tipo_id | numero_id | fecha_nacimiento | idioma | cancelaciones_tardias | requiere_pago
```
Las columnas `cancelaciones_tardias`/`requiere_pago` de esta pestaña (agregadas en US-06 vía `addCancelacionesColumnsToClientes()`) son la **única fuente de verdad** para la regla de "2 tardías consecutivas → debe pagar". Las columnas del mismo nombre en Nutrición/Pilates son legacy y no se usan para la lógica de negocio.

> ⏳ **Pendiente (modificación acordada, sin número de US):** agregar columnas `cliente_nutricion`/`cliente_pilates` (checkbox booleano) a esta pestaña — ver sección 3 para el diseño acordado.

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
| RF-1.15 (nuevo) | Campo de ID flexible (tipo + número), valor interno consistente sin importar idioma | ✅ **Done — US-18, 15 jul** |

### RF-2 — Correos y Automatizaciones (SPRINT 2 — TODO PENDIENTE)
| ID | Requerimiento | Estado |
|----|--------------|--------|
| RF-2.1 | Correo de confirmación inmediato (idioma del cliente, link reagendar/cancelar, Meet si virtual **o dirección física si presencial** — Santa Ana Town Center, ver sección 1) | ⏳ Pendiente Sprint 2 |
| RF-2.2 | Correos de nutrición desde cuenta Dani. Correos de pilates desde cuenta instructora (o Reply-To, decisión pendiente — ver sección 6) | ⏳ Pendiente Sprint 2 |
| RF-2.3 | Notificación interna a Dani o instructora en cada acción (agendar/reagendar/cancelar) — el stub `notifyLateCancellation` ya existe con TODO en cancelBooking/rescheduleBooking, falta implementarlo de verdad y extenderlo a agendar | ⏳ Pendiente Sprint 2 |
| RF-2.4 | Recordatorio 48 hrs antes. Solo si estado='Agendada' o 'Reagendada'. | ⏳ Pendiente Sprint 2 |
| RF-2.5 | Notificación a Dani y Ali si cancelación/reagendamiento fuera de ventana | ⏳ Pendiente Sprint 2 (stub ya cableado, ver RF-2.3) |
| RF-2.6 (nuevo) | Frontend para que el cliente reagende/cancele desde el link único del correo (hoy solo existe el backend) | ⏳ Pendiente Sprint 2 |
| RF-2.7 | Reordenar las 3 pantallas del portal: Calendario → Correo → Datos | ✅ **Done — US-19, 15 jul** |

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
TIPO_ID_VALUES = ["cedula", "pasaporte", "licencia", "otro"]  // ✅ US-18, valores internos fijos
CEDULA_COLUMN_BY_SHEET = { "Nutrición": 6, "Pilates": 6, "Clientes": 5 }  // ✅ US-18, usado por la migración
```

### Firma actual de funciones en backend (al cierre de US-18, 15 jul)
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
// Bloquea con VENTANA_REAGENDAMIENTO_VENCIDA si faltan <24hrs para la cita ACTUAL.
// Si no hay event_id (cita vieja pre-US-06): actualiza el Sheet igual, sin error, solo loguea.
// Si hay event_id: mueve el evento real (patch nutrición / sale-y-entra pilates grupal).

cancelBooking(token: string): { lateCancellation: boolean }
// SIEMPRE permite cancelar. Si <24hrs: lateCancellation=true, incrementa contador del cliente.
// Nunca borra la fila. Elimina el evento real de Calendar (o solo el invitado, en pilates grupal).

incrementClientLateCancellation(correo) / resetClientLateCancellationCounter(correo)
// Tocan las columnas cancelaciones_tardias/requiere_pago en pestaña "Clientes" (fuente de verdad).
// ⚠️ El failsafe de appendRow para correos sin fila existente debe tener exactamente 10 
// elementos (schema actual de Clientes) — bug real encontrado y corregido en US-18 
// (tenía 9, desalineaba columnas en ese caso límite). Ver nota técnica #28.
getClientPaymentStatus(correo): { cancelaciones_tardias, requiere_pago }
notifyLateCancellation(...) // STUB con TODO — implementar de verdad en Sprint 2

migrateCedulaToTipoNumeroId(): void
// ✅ US-18, ejecutada manualmente 15 jul. Migra por POSICIÓN de columna (CEDULA_COLUMN_BY_SHEET),
// NO por texto — ver nota técnica #28 sobre por qué la primera versión (por texto) falló.
// Idempotente por pestaña individual (evalúa cada una por separado, no todo-o-nada).
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

> **Nota frontend (US-19, 15 jul):** no hay componentes de paso separados en archivos individuales — `EmailStep`, `ContactForm` y `CalendarTimeslotPicker` son funciones dentro de `frontend/src/components/calendar-picker.tsx`, junto con el orquestador `CalendarPicker`. Tenerlo en cuenta al generar prompts que toquen el frontend: todo vive en ese único archivo.

> **Nota test-harness (US-18, 15 jul):** `backend/test-harness/` (gas-mock.js y run-tests.js) también tenía referencias hardcodeadas a `cedula` (11 llamadas a `bookTimeslot` con el argumento suelto, más ~15 índices de columna) — todas actualizadas a tipoId/numeroId. Al modificar el schema de cualquier pestaña en el futuro, revisar también el harness, no solo `app.ts`.

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
| US-27 | Correo como identificador único — pestaña "Clientes" + flujo de 3 pasos | ✅ Done |

**Todas las tarjetas movidas a Done en Trello. Deploy activo: v16.**

### Sprint 2 (Jul 14 – Jul 20) — ESP: 30 — tablero real de Trello

| US | Título | Puntos | Checklist | Estado |
|----|--------|--------|-----------|--------|
| US-19 | Cambiar orden de pantallas (Calendario→Correo→Datos) | 2 | 5/5 | ✅ **Done (15 jul)** — validado en testing real, 4 tipos de cita, cliente nuevo/existente, recuperación de slot ocupado. Deploy v17. |
| US-18 | Campo de ID flexible: cédula, pasaporte o driver's license | 1 | 1/1 | ✅ **Done (15 jul)** — dropdown 4 opciones (ES/EN) con valor interno fijo, numero_id alfanumérico, validado en los 4 tipos de cita y con cliente existente. Deploy v18. |
| (sin número) | Modificación extra: columnas cliente_nutricion/cliente_pilates en "Clientes" | — | 0/? | ⏳ **Siguiente** — acordada, ver sección 3, prompt pendiente de generar |
| US-16 | Fix: calendario no abre en el mes actual por defecto | 2 | 0/4 | ⏳ Backlog |
| US-11 | Plantillas HTML bilingües (nutrición y pilates) | 3 | 1/7 | ⏳ Backlog — necesita carpeta "Comunicaciones" de Drive |
| US-12 | Correo de confirmación inmediato al cliente | 3 | 1/8 | ⏳ Backlog — depende de US-11 |
| US-13 | Notificación interna a Secretaria | 5 | 1/6 | ⏳ Backlog |
| US-14 | Recordatorio automático 48 horas antes de la cita | 5 | 1/6 | ⏳ Backlog |
| US-20 | Generación y validación de token único por cita | 2 | 1/8 | ⏳ Backlog — **revisar solapamiento**, el token UUID v4 ya se implementó en US-05/US-06; confirmar con Trello qué falta exactamente antes de generar el prompt |
| US-28 | Actualizar look & feel del portal según brandbook de Plant Powered | 4 | 0/7 | ⏳ Backlog — necesita carpeta de branding/colores de Drive |
| US-29 | Bloquear registro de datos de menores de 13 años | 5 | 0/8 | ⏳ Backlog — requerimiento nuevo, discutir validación (¿cálculo de edad desde fecha de nacimiento?) antes de generar el prompt |

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
| Versión actual | **v18** |
| Repo | https://github.com/juanartavia/plant-powered-dani |
| Spreadsheet testing | https://docs.google.com/spreadsheets/d/16M6WUqMAK9XkVoIutIn9UkJojlS5biT5o470GySs5gw/edit |
| Calendario pilates (testing) | "Pilates - Testing" |
| Harness de pruebas backend | `backend/test-harness/` (run-tests.js + gas-mock.js + README.md) — 37 aserciones, todas pasando (actualizado con tipoId/numeroId en US-18) |

### ⚠️ Lección crítica de proceso — deploy vs. push (ver nota técnica #25)
`clasp push` actualiza el código fuente del proyecto (lo que se ve en el editor), pero la URL pública `/exec` de un deployment queda **congelada** a la versión que tenía en el último `clasp deploy` sobre ese mismo `deploymentId`. Si se hace solo `push` sin `deploy`, cualquier prueba a través del link real seguirá corriendo código viejo, aunque el editor muestre el código nuevo y los wrappers manuales (que sí leen del HEAD) funcionen bien. **Siempre confirmar que se hizo `clasp deploy` antes de dar una prueba por válida usando el link público.**

### Links de testing por tipo de cita (v18)
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
| v16 | 14 jul | Wrappers temporales de testing manual removidos del código tras validar US-06 por completo. **Sprint 1 100% cerrado.** |
| v17 | 15 jul | **US-19 Done.** Reordenado el flujo del portal a Calendario→Correo→Datos. Selectores de idioma/zona horaria movidos al Paso 1. Validado en testing real: 4 tipos de cita, cliente nuevo, cliente existente, y recuperación de slot ocupado a mitad de flujo. |
| v18 | 15 jul | **US-18 Done.** Campo de ID flexible: `cedula` → `tipo_id` + `numero_id` en Nutrición/Pilates/Clientes. Dropdown de 4 opciones traducidas (ES/EN) con valor interno fijo. Migración corregida de búsqueda por texto a búsqueda por posición tras fallo real (ver nota técnica #28). Validado en testing real: consistencia de valor guardado entre idiomas, los 4 tipos de cita, precarga de cliente existente. **Deploy activo.** |

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
10. **Cédula** ya NO es el identificador único (reemplazada por correo desde US-27) — y desde US-18 tampoco es un campo único: se dividió en `tipo_id` + `numero_id`, con `tipo_id` restringido a 4 valores internos fijos.
11. **initializeSheets()** — UNA SOLA VEZ, ya ejecutada. NO volver a correr.
12. **Permisos en appsscript.json** — incluye spreadsheets, drive, calendar. Agregar scope si se suman integraciones nuevas (ej. Gmail para Sprint 2).
13. **Pilates: eventos duplicados — RESUELTO en US-10.** Un solo evento por slot con múltiples invitados vía `addGuest`/`patch`.
14. **`WORKDAYS`/`WORKHOURS` genéricos (pendiente Sprint 3)** — no reflejan el horario real de Dani (martes-sábado, 7am-7pm entre semana, 7am-2pm sábados, cerrado domingo-lunes, no último sábado del mes, sin virtuales los sábados).
15. **Criterio validado varias veces: auditar y adaptar código heredado de Someday, no asumir que ya cumple las reglas del cliente** — funcionó en US-09 (lock faltante) y US-10 (eventos duplicados, Meet nunca implementado de verdad). Aplicar el mismo criterio a cualquier código heredado restante.
16. **Coerción de tipos en Google Sheets** — un string de fecha/hora puede autodetectarse y guardarse como objeto `Date`, rompiendo comparaciones `===`. Mitigación: `normalizeSheetDateCell()` + `setNumberFormat("@")`. Ya aplicado consistentemente en US-05/US-06/US-10.
17. **Acceso desde móvil — pendiente investigar.** Reporte inicial: el link de testing no cargó desde un teléfono. No bloquea el trabajo actual, pero debe resolverse antes de Sprint 3 / producción (RNF-3, RF-1.4) — la mayoría de clientes reales van a abrir el link desde el celular (compartido por WhatsApp).
18. **El lock de conflict-check protege el Calendar real, no el "tipo" de cita** (US-09) — `initial`/`followup`/`measurement` comparten Calendar; validado con colisión cruzada entre tipos distintos.
19. **`SpreadsheetApp` cachea escrituras — requiere `flush()` explícito antes de releer en la misma ejecución** (lección de US-10, reforzada en US-06). Cualquier código que escriba y luego relea el mismo Sheet dentro de la MISMA ejecución necesita `SpreadsheetApp.flush()` entre medio — no asumir que una escritura es visible de inmediato a una lectura posterior en el mismo run. Ya aplicado en `appendBookingToSheet`, `bookPilatesCalendarEvent`, el catch de `bookTimeslot`, y en `cancelBooking`/`rescheduleBooking`.
20. **Calendar de pilates nunca estuvo realmente separado del de nutrición hasta US-10** — resuelto con `PILATES_CALENDAR_ID` dedicado, separado de `CALENDARS` (que sigue siendo específico del conflict-check de Freebusy de nutrición).
21. **Asimetría intencional cancelar/reagendar** (US-06) — ver tabla completa en sección 3. Cancelar siempre se permite (solo marca tardía); reagendar se bloquea duro con <24hrs. Confirmado con el equipo en reunión del 14 jul, sin cambios solicitados.
22. **Ventana de 24hrs para reagendar se evalúa contra la cita ACTUAL, no la nueva** — al reagendar, primero se valida si la cita que se quiere mover ya está a menos de 24hrs (se bloquea si sí); si se permite avanzar, el NUEVO horario se valida por separado con las reglas normales de `bookTimeslot` (ventana 48hrs mínima, lock, cupos).
23. **Patrón para testing manual sin frontend (US-06)** — cuando una función de backend no tiene todavía un punto de entrada en frontend, se pueden crear wrappers temporales en `app.ts` (ej. `manualTestX()`) con un valor hardcodeado (token, etc.), ejecutarlos desde el dropdown del editor de Apps Script, revisar el Registro de ejecución + Sheet + Calendar real, y **borrarlos del código antes de dar la US por Done** (o documentarlos explícitamente si se decide conservarlos). Alternativa más robusta pero con más setup: `clasp run <función> --params '[...]'`, que requiere habilitar la Apps Script API y desplegar como "API executable" — evaluar si vale la pena en Sprint 3 si se repite mucho la necesidad de probar funciones sin UI.
24. **rescheduleBooking y cancelBooking deben comportarse igual ante citas sin `event_id` (pre-migración)** — ambas deben actualizar el Sheet igual y solo loguear un aviso, sin lanzar un error duro que bloquee toda la operación. Se encontró y corrigió una inconsistencia real en US-06 donde `cancelBooking` ya era tolerante pero `rescheduleBooking` lanzaba `EVENTO_CALENDAR_NO_ENCONTRADO` y bloqueaba todo — ya unificado.
25. **Gap de deploy causó un falso positivo de bug (lección de proceso, 14 jul)** — al pedir explícitamente "solo push, sin deploy" en una iteración anterior, quedó pendiente un `clasp deploy`. Cuando se probó vía el link público, el código corrido era el de la versión desplegada anterior (v14), no el más reciente en el editor — pareciendo un bug real (`bookNutricionCalendarEvent` "no guardaba event_id") que en realidad no existía: el código en el HEAD del proyecto ya era correcto (confirmado con una prueba de harness dedicada, Test 10, 37/37 pasando). **Regla reforzada:** antes de dar cualquier resultado de prueba por "bug confirmado", verificar primero con `clasp deployments` que la URL usada para probar corresponde a la versión de código que se cree estar probando.
26. **Wrappers temporales de US-06 removidos (14 jul)** — `manualTestCancelBooking`/`manualTestRescheduleBooking` cumplieron su propósito (validar reagendar/cancelar en testing real sin frontend) y fueron eliminados del código tras confirmar los 8 checkboxes de la US. Si Sprint 2 necesita un mecanismo similar antes de que el frontend de reagendar/cancelar exista (RF-2.6), recrear wrappers análogos siguiendo el patrón de la nota 23, y volver a borrarlos al finalizar esa US.
27. **Trabajo funcionando en producción sin `git commit` — ocurrió dos veces antes de detectarse (lección de proceso, 15 jul).** El trabajo de US-10 (13 jul) y US-06 (14 jul) quedó desplegado y funcionando en producción vía `clasp push`/`clasp deploy`, pero sin comitear a git, hasta que se detectó al iniciar US-19 (~1000 líneas sin comitear en `backend/src/app.ts`). Se verificó el diff antes de comitear (no se asumió a ciegas) y coincidía con el trabajo documentado — no era código inesperado, solo faltaba el commit. **Regla reforzada:** hacer `git commit` inmediatamente después de cada `clasp deploy` exitoso, no esperar al cierre del sprint (ver paso 6.5 en sección 14).
28. **Migración de schema por texto falló silenciosamente por un espacio en blanco invisible (lección de proceso, 15 jul, US-18).** La primera versión de `migrateCedulaToTipoNumeroId()` buscaba la columna `cedula` con `headers.indexOf("cedula")` (comparación exacta de texto) en las 3 pestañas. Funcionó en "Clientes" (header escrito 100% por código, nunca tocado a mano) pero falló silenciosamente en "Nutrición" y "Pilates" — el log solo decía "no se encontró la columna, revisar manualmente", sin lanzar ningún error. Al inspeccionar el Sheet real con capturas de pantalla, se confirmó que el header real era `"cedula "` (con un espacio en blanco al final, invisible a simple vista) — consistente con la advertencia ya documentada en sección 8 sobre encabezados de esas dos pestañas editados manualmente en algún punto de Sprint 1. **Regla reforzada:** cuando una migración de schema busca columnas por texto en la fila 1, verificar primero con captura de pantalla del Sheet real si aplica, y preferir migrar por POSICIÓN de columna (usando la misma constante que el resto del código ya usa para leer/escribir esa columna) en vez de por comparación de texto — la posición es la fuente de verdad real, el texto del encabezado puede tener inconsistencias invisibles. La versión final usa `CEDULA_COLUMN_BY_SHEET` (posición fija por pestaña) y quedó validada en las 3 pestañas.
29. **Bug real en failsafe de `incrementClientLateCancellation` encontrado por el test-harness tras el cambio de schema de US-18** — el `appendRow` defensivo (para el caso hipotético de un correo sin fila en "Clientes" todavía) tenía un elemento de menos que el nuevo schema de 10 columnas, lo que habría desalineado `cancelaciones_tardias`/`requiere_pago` en ese caso límite. Se detectó porque 4 de las 37 aserciones del harness fallaron tras el cambio de schema — el harness cumplió su propósito de atrapar el bug antes de llegar a producción. Corregido (ahora 10 elementos), 37/37 pasando de nuevo.

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
     al final del sprint — ya pasó dos veces que trabajo funcionando en producción quedó
     sin comitear varios días, ver nota técnica 27)
7. Probar en el navegador real contra el deploy — NO se marca nada como completado solo porque el código se escribió
8. Solo si la prueba real confirma que funciona → marcar checkbox(es) en Trello
9. Cuando todos los checkboxes de la tarjeta estén marcados → mover la tarjeta a Done
10. Actualizar CLAUDE.md
```

### ⚠️ Cuándo ir al editor de Apps Script manualmente
- **Ejecutar funciones de inicialización/migración** (initializeSheets, addClientesSheet, setupPilatesTestCalendar, addEventIdColumnToNutricion, addEventIdColumnToCuposPilates, addCancelacionesColumnsToClientes, migrateCedulaToTipoNumeroId) — dropdown de funciones → Ejecutar. Son de UNA SOLA VEZ salvo que sean explícitamente idempotentes.
- **Autorizar permisos nuevos** — Revisar permisos → Avanzado → Ir a (no seguro) → Permitir.
- **Ver logs de ejecución** — Registro de ejecución, para debuggear.
- **El editor solo muestra código ya subido con `clasp push`** — si algo no aparece en el dropdown, recargar la página del editor primero.
- **Al correr una migración de schema, revisar el log con cuidado línea por línea** — un mensaje de "no se hizo ningún cambio" o "no se encontró" puede ocultar un bug real de comparación (ver nota técnica #28). No asumir que "se completó la ejecución" sin errores significa que hizo lo esperado en las 3 pestañas.

**URL del editor:** https://script.google.com/d/1cu-HdKiAmfUYOgjwtjKcE9lCO6waLfFsL71PwP4GgcdGiQWzqygPS3fK/edit

### Reglas importantes
- Claude Code siempre lee el CLAUDE.md al inicio de cada prompt
- Cada `clasp deploy` genera una URL nueva (o actualiza la existente si se usa el mismo `--deploymentId`) — siempre documentarla aquí
- Los comandos en Windows PowerShell van uno por uno (sin &&)
- Nunca tocar la cuenta real de Dani hasta Sprint 3
- Si hay que agregar permisos nuevos → agregar scope en dist/appsscript.json Y appsscript.json (raíz)
- **Antes de aceptar un resultado de prueba como bug confirmado, verificar que se probó contra la versión de deploy correcta** (ver nota 25)
- **Comitear a git inmediatamente después de cada deploy exitoso** (ver nota 27, paso 6.5 arriba)
- **Migraciones de schema por posición, no por texto, cuando sea posible** (ver nota 28)

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

### Modificaciones sin número de US
No todo cambio necesita pasar por una tarjeta formal de Trello — si surge una mejora pequeña y bien acotada en medio de otra tarea (como cliente_nutricion/cliente_pilates, surgida mientras se trabajaba en US-18), se puede acordar en el chat, documentar en el CLAUDE.md (sección 3 y el changelog de sección 17), y ejecutarla directamente sin crear una tarjeta nueva — siempre que se documente igual de bien que una US formal.

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
- **Usar siempre el mismo `--deploymentId`** para mantener la misma URL de testing en vez de crear deployments nuevos sueltos — el deploymentId actual es el que corresponde a la URL documentada en sección 12: `AKfycbwNUEjG8CXo2D5bk2eq1w6wBrme9XqJpCqOt-TkP0otTypiXd7GCEk7L7uFhdDOLCaJ`
- Si clasp push pide confirmación del manifest → usar `clasp push --force`
- **Comitear a git inmediatamente después del deploy** — no dejarlo pendiente (ver nota 27)

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
| 15 jul 2026 | **US-19 Done.** Flujo reordenado Calendario→Correo→Datos. Selectores de idioma/zona horaria movidos al Paso 1 (hallazgo de Code: necesario para que el cliente pueda fijar su zona horaria antes de ver horarios). Corregido bug latente: modalidad no se precargaba al rebotar al Paso 1. Validado en testing real: 4 tipos de cita, cliente existente, y recuperación de slot ocupado a mitad de flujo (probado por el usuario en vivo, quitándole el slot a un cliente nuevo desde otra pestaña). Deploy v17. Detectado y resuelto: ~1000 líneas de US-10/US-06 llevaban desde el 13-14 jul funcionando en producción sin `git commit` — verificado el diff antes de comitear (nota 27), no era código inesperado. Agregado paso 6.5 al flujo de trabajo: commit inmediato tras cada deploy exitoso. Tablero real de Trello del Sprint 2 incorporado a la sección 11 (US-16, 18, 19, 11, 12, 13, 14, 20, 28, 29 — 30 puntos totales). |
| 15 jul 2026 | **US-18 Done.** Campo de ID flexible: `cedula` → `tipo_id` (dropdown, 4 valores internos fijos: cedula/pasaporte/licencia/otro, traducidos en pantalla ES/EN) + `numero_id` (texto alfanumérico) en Nutrición, Pilates y Clientes. Datos de prueba viejos borrados manualmente por el usuario antes de la migración (no se escribió lógica de migración de datos, solo de estructura). Bug real encontrado y corregido: la primera versión de `migrateCedulaToTipoNumeroId()` buscaba la columna por texto exacto y falló silenciosamente en Nutrición/Pilates por un espacio en blanco invisible en el encabezado real — diagnosticado con capturas de pantalla del Sheet real, corregido migrando por posición de columna fija en vez de texto (nota técnica #28). Segundo bug real encontrado por el test-harness: el failsafe de `incrementClientLateCancellation` tenía un elemento de menos tras el cambio de schema de "Clientes" a 10 columnas (nota técnica #29) — detectado porque 4/37 aserciones fallaron, corregido, 37/37 de nuevo. Validado en testing real: mismo valor interno guardado sin importar idioma (ES/EN) del cliente, los 4 tipos de cita, precarga correcta en cliente existente. Deploy v18. Acordada modificación extra sin número de US: columnas `cliente_nutricion`/`cliente_pilates` (checkbox booleano, lógica OR acumulativa) en "Clientes", para el siguiente paso. |

---

*Última actualización: 15 julio 2026 — **US-18 Done**, campo de ID flexible (tipo_id + numero_id) validado en testing real (consistencia entre idiomas, 4 tipos de cita, cliente existente). Deploy activo: v18. Siguiente paso: modificación extra acordada (columnas cliente_nutricion/cliente_pilates en "Clientes", sin número de US — ver sección 3). Resto del Sprint 2 pendiente según tablero real de Trello (sección 11): US-16, US-11, US-12, US-13, US-14, US-20, US-28, US-29. Pendientes de fondo para Sprint 3: acceso desde móvil (nota 17), horario real de Dani (nota 14), checklist de acceso de producción (sección 6).*