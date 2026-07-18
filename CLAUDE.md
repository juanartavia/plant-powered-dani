# CLAUDE.md — Plant Powered by Dani
## Sistema de Agendamiento Automatizado
> Documento vivo — actualizar conforme avanza el desarrollo
> Última actualización: 17 julio 2026, noche — **US-11 (correo de confirmación) en progreso, render verificado, envío real pendiente de confirmar.** Deploy activo: v24.

---

## 0. LÉEME PRIMERO — PARA EL PRÓXIMO CHAT

Si estás retomando este proyecto en un chat nuevo, este documento es tu única fuente de verdad. Antes de generar cualquier prompt para Claude Code:

1. Lee completo este documento, especialmente las secciones 11 (estado de sprints), 13 (notas técnicas — contiene lecciones aprendidas que evitan repetir bugs ya resueltos), y 14/15 (método de trabajo y reglas de Trello).
2. **El primer demo con la dueña del producto (Dani) fue el 17 de julio y salió muy bien.** Ella pidió 4 cambios en vivo, y los 4 ya están implementados, probados y desplegados (v23) — ver sección 3 para el detalle completo de cada uno. Si hay feedback nuevo de Dani que el usuario no haya mencionado todavía en el chat, pregúntale antes de asumir que no hay nada pendiente de ese lado.
3. **Todo lo siguiente ya está Done y validado en testing real:** US-19 (reorden de pantallas), US-18 (ID flexible), la modificación cliente_nutricion/cliente_pilates, US-16 (mes actual por defecto), 3 ajustes sin número de US del día del demo (quitar dark mode, quitar footer del repo base, restringir pilates a sábados 10am), y los 4 pedidos de Dani post-demo (US-29 con edad mínima 15 años, idioma solo en Paso 1, banderas SVG reales, pilates con 12hrs de anticipación).
4. **Pendientes de fondo, deliberadamente pospuestos (ver sección 13, nota 30) — de baja urgencia, sin evidencia de bug funcional activo:**
   - Las columnas `fecha` (Nutrición) y `fecha_clase` (Pilates) tienen el mismo problema de coerción de tipos que tenía `fecha_nacimiento` (se guardan como objeto Date real de Sheets, no texto plano). El código de negocio ya tolera esto vía `normalizeSheetDateCell()`.
   - `findClientByEmail()` lee `fecha_nacimiento` con `TIME_ZONE` en vez de `UTC` — mismo patrón de bug que ya se corrigió en la escritura, pero en lectura. Bajo riesgo mientras no haya una regresión que vuelva a escribir un Date real ahí.
5. **Pendiente sin confirmar (ver sección 13, nota 17):** el acceso desde móvil nunca se terminó de validar formalmente — revisar si el usuario ya lo probó en algún punto y lo mencionó, o si sigue abierto.
6. El resto del Sprint 2 según el tablero real de Trello (ver sección 11): US-11, US-12, US-13, US-14, US-20, US-28 — todas en Backlog.
7. **Antes de tocar US-11/US-12/US-28**, el usuario tiene carpetas descargadas de Drive (branding/colores, comunicaciones/plantillas de correo, gráficos de Dani) que subirá al repo en una carpeta `design-reference/` separada de `backend/`/`frontend/` cuando lleguemos a esas tarjetas — no asumir que ya están ahí sin confirmar.
8. Sigue el mismo flujo de trabajo documentado en la sección 14: generar prompt → Claude Code ejecuta → **commit inmediato tras deploy exitoso** (nota 27) → probar en real antes de marcar cualquier checkbox → actualizar este documento.
9. **Lecciones técnicas acumuladas (15-17 jul), todas en sección 13 (notas 28-32) — vale la pena leerlas antes de tocar código de fechas, migraciones, o validaciones nuevas:**
   - (a) migraciones de schema por POSICIÓN de columna, nunca por texto de encabezado (un espacio invisible puede romper la comparación sin lanzar error).
   - (b) fechas SIN componente horario real (fecha_nacimiento) siempre se calculan/reconstruyen en `UTC`; fechas/horas de eventos reales (citas) siempre en `TIME_ZONE` — mezclarlas produce un corrimiento de ±1 día silencioso.
   - (c) reparaciones de datos reales se verifican línea por línea contra los valores originales conocidos, no solo confirmando que "no truena".
   - (d) cualquier operación de rango masivo sobre una pestaña (`insertCheckboxes`, formato, validación) se acota a `getLastRow()`/`getLastColumn()` reales, nunca a los límites por defecto del Sheet (`getMaxRows()`).
   - (e) bajo presión de tiempo (demo, entrega), preferir posponer cambios a lógica ya validada en vez de arriesgar una regresión de último momento.
   - (f) al diagnosticar bugs de datos/estado, verificar el comportamiento REAL del código, no confiar en el nombre de una variable (puede estar desactualizado tras refactors).
   - (g) validaciones de negocio nuevas (como edad mínima) que deben impedir CUALQUIER escritura en el Sheet si fallan, tienen que colocarse ANTES del primer punto de escritura en la cadena de llamadas real — revisar el orden real de las funciones (ej. `upsertClient()` se llama antes que `bookTimeslot()` en el flujo actual), no asumir que basta con validar en la función que "suena" más relevante.
   - (h) emoji Unicode (como banderas 🇪🇸/🇺🇸) no se pueden usar como única solución visual — Windows no los renderiza como imagen y muestra el código de país como texto plano; además, un `<select>`/`<option>` nativo de HTML no puede mostrar SVG/imágenes en ningún sistema operativo. Para iconografía que debe verse igual en todos los sistemas, usar SVG reales con un componente de dropdown personalizado (Popover+Command, mismo patrón que `timezone-dropdown.tsx`), no depender de fuentes de emoji del SO ni de `<option>` nativo.

   Nota sobre US-11 (plantillas de correo): el usuario mencionó que los 
formatos de correo son CAMBIANTES — varían según el cliente o el tipo de 
cita (no es un solo template fijo). Falta que el usuario explique el 
detalle exacto de esa variabilidad cuando lleguemos a esa tarjeta — no 
asumir una estructura fija de correo sin esa conversación primero.

---

## 1. CONTEXTO DEL PROYECTO

### El cliente
**Plant Powered by Dani** — estudio de nutrición y pilates en Costa Rica.
- **Dani**: nutricionista, admin principal del sistema. Ya vio el sistema en vivo (demo 17 jul) y quedó satisfecha; pidió 4 ajustes puntuales, ya implementados.
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

## 3. DECISIONES CONFIRMADAS

### Flujo del cliente (reunión 2 julio)
- **Primer contacto:** siempre humano, por WhatsApp
- **No hay landing page** — Ali y Dani distribuyen links directos por WhatsApp, un link distinto por tipo de cita
- **Confirmación:** automática al agendar, sin validación manual de Dani

### Política de cancelación y reagendamiento ✅ CONFIRMADO Y VALIDADO (US-06, 14 jul)
- **Tiempo mínimo para cancelar/reagendar: 24 horas de anticipación**
- Si el cliente cancela con menos de 24 hrs → sistema envía notificación automática a Dani y a Ali (stub implementado, correo real es Sprint 2), y se incrementa el contador de cancelaciones tardías **del cliente** (por correo, no por cita)
- Tras **2 cancelaciones consecutivas tardías** (contadas por cliente, cruzando tipos de cita distintos) → se marca `requiere_pago=true` en la pestaña "Clientes"
  - No hay integración de pagos (fuera de scope) — el flag es solo informativo para que Dani lo revise manualmente

### ⚠️ Asimetría intencional: cancelar vs. reagendar con menos de 24hrs ✅ CONFIRMADO Y VALIDADO (US-06, 14 jul)
| Acción | Con <24hrs de anticipación |
|--------|------------------------------|
| **Cancelar** | Siempre se permite. Se marca como tardía, pero la cita SÍ se cancela y el slot se libera. |
| **Reagendar** | Se BLOQUEA por completo (error `VENTANA_REAGENDAMIENTO_VENCIDA`). La cita no se mueve. |

**Por qué:** cancelar libera el horario (beneficia a todos, incluso tarde); permitir reagendar tarde podría usarse para mover la cita repetidamente sin consecuencia. Confirmado con el equipo, sin cambios solicitados.

### Ventana de agendamiento — NUTRICIÓN vs PILATES son DISTINTAS desde el 17 jul
| | Nutrición (initial/followup/measurement) | Pilates |
|---|---|---|
| **Ventana mínima** | 48 horas | **12 horas** ✅ cambiado 17 jul, pedido por Dani |
| **Ventana máxima** | 8 semanas (56 días) | 8 semanas (56 días) — sin cambios |

La ventana mínima se calcula por hora exacta, no por día calendario completo (ej. si son las 2pm del lunes con ventana de 48hrs, el corte es miércoles 2pm exacto). Implementado con `PILATES_MIN_BOOKING_HOURS = 12` separado de `MIN_BOOKING_HOURS = 48`, aplicado específicamente donde el código evalúa `type === "pilates"` (ver sección 10). Esta ventana es **distinta** de la de cancelación/reagendamiento (24hrs), que no cambió.

### Formulario del cliente ✅ CONFIRMADO (última actualización 17 jul)
Nombre y apellido en campos **separados**. Campos exactos (en orden): Nombre, Apellido, Correo, Teléfono, Tipo de identificación (dropdown) + Número de identificación (texto), Fecha de nacimiento (con restricción de edad mínima, ver abajo), Modalidad (solo initial/followup).

> ⚠️ **Sin campo de notas** — eliminado para mantener el proceso simple.
> ⚠️ **El selector de idioma YA NO aparece aquí** — se movió exclusivamente a la pantalla principal (Paso 1). Ver "Idioma" más abajo.

### Campo de ID flexible ✅ IMPLEMENTADO Y VALIDADO (US-18, 15 jul)
Dropdown de 4 opciones fijas, traducido, con valor interno consistente sin importar idioma:

| Se muestra ES | Se muestra EN | Valor guardado (fijo) |
|----------------|-----------------|--------------------------|
| Cédula | ID Card | `cedula` |
| Pasaporte | Passport | `pasaporte` |
| Licencia de conducir | Driver's License | `licencia` |
| Otro | Other | `otro` |

Más "Número de identificación" — texto libre alfanumérico. Schema: `cedula` → `tipo_id` + `numero_id` en Nutrición, Pilates y Clientes.

### Edad mínima: 15 años ✅ IMPLEMENTADO Y VALIDADO (US-29 revisada, 17 jul)
Dani pidió en el demo cambiar la regla original de la tarjeta (menores de 13) a **menores de 15 años** — bloqueado en TODOS los tipos de cita.

**Doble capa de protección:**
1. **Frontend (UX, no la barrera real):** el `input type="date"` de fecha de nacimiento tiene un atributo `max` calculado como "hoy menos 15 años" en hora de Costa Rica — el selector nativo del navegador ya no deja elegir visualmente una fecha que dé menos de 15 años. Si el campo permite escribir la fecha a mano, hay validación adicional en `onChange`/`onBlur`/`onSubmit` con mensaje bilingüe inline.
2. **Backend (la barrera real, nunca confiar solo en frontend):** función `calculateAge()`/`assertMinimumAge()` con aritmética PURA de componentes de fecha (año/mes/día como números extraídos de strings `yyyy-MM-dd`) — **sin objetos Date ni conversión de zona horaria**, siguiendo la lección de la nota #29. La validación es el **primer paso** dentro de `upsertClient()`, ANTES de cualquier lectura/escritura — si es menor a 15, lanza `EDAD_MINIMA_NO_CUMPLIDA` y no toca ningún Sheet. También se valida al inicio de `bookTimeslot()` como defensa en profundidad.

**Por qué la validación vive en `upsertClient()` y no solo en `bookTimeslot()`:** el flujo real del Paso 3 llama PRIMERO a `upsertClient()` (que ya escribe en "Clientes") y DESPUÉS a `bookTimeslot()`. El checklist real de Trello exige explícitamente que "no se almacene ningún dato en la Sheet si el registro es bloqueado por edad" — si la validación solo viviera en `bookTimeslot()`, un menor de 15 quedaría guardado en "Clientes" aunque la cita se rechazara. Ver nota técnica #32.

**Regla de borde exacta, validada con test:** alguien que cumple 15 años HOY puede registrarse; alguien que los cumple MAÑANA no puede.

**Validado en testing real:** confirmado que un intento de menor de 15 no deja ningún rastro en Clientes, Nutrición, Pilates ni Cupos_Pilates, en los 4 tipos de cita. Test-harness: 48/48 (incluye tests nuevos específicos para el gate de edad y el caso de pilates).

### Idioma ✅ ACTUALIZADO 17 jul — selector solo en la pantalla principal
- El selector de idioma vive ÚNICAMENTE en el Paso 1 (Calendario) — se eliminó el `<select>` duplicado que existía dentro del formulario de Datos (Paso 3), a pedido de Dani.
- El valor de idioma que se guarda en el cliente/cita sigue viniendo del selector global (`uiLanguage`), sin ningún cambio en esa lógica — solo se quitó el campo redundante.
- El comportamiento de "cliente existente con idioma guardado distinto al actual" (auto-override desde `handleEmailSubmit`, documentado en US-19) sigue funcionando igual.
- **Banderas reales (17 jul):** el selector ahora muestra banderas SVG reales — España 🇪🇸 para español, Estados Unidos 🇺🇸 para inglés — en vez de emoji Unicode. Los emoji de bandera no se renderizaban en Windows (mostraban el código de país como texto: "CR"/"US"), y además un `<select>`/`<option>` nativo de HTML no puede mostrar SVG/imágenes en ningún sistema operativo. Se construyó un dropdown personalizado (Popover + Command, mismo patrón que `timezone-dropdown.tsx`) con los SVG embebidos. Verificado visualmente con Playwright (capturas reales confirmando que ambas banderas se ven como íconos, no texto ni cuadros rotos) antes de dar el cambio por bueno.
- **Corrección de bandera:** originalmente se puso Costa Rica para español; se corrigió a España, ya que el selector representa el idioma, no un país específico del negocio.

### Flujo del formulario en 3 pasos ✅ REORDENADO Y VALIDADO (US-19, 15 jul)
**Calendario → Correo → Datos.** Paso 1: elige fecha/hora (idioma con banderas, zona horaria, mes actual por defecto). Paso 2: correo, busca en "Clientes". Paso 3: datos precargados o vacíos + resumen fijo del horario, lock/conflict-check real al confirmar. Si el slot se ocupa a mitad de flujo: regresa al Paso 1 con calendario refrescado y correo/datos preservados.

### Calendario abre en el mes actual por defecto ✅ IMPLEMENTADO Y VALIDADO (US-16, 17 jul)
**Causa raíz encontrada:** un `useEffect` en `calendar-picker.tsx` hacía `setCurrentMonth(firstTimeslot)`, pero la variable `firstTimeslot` (pese a su nombre) se construía con `.sort().reverse()[0]` — que en realidad toma el ÚLTIMO elemento del arreglo ordenado, no el primero. Esto saltaba el calendario a meses lejanos (visto en producción: abría septiembre estando en julio). **Fix:** se eliminó el efecto por completo; `currentMonth` se inicializa una sola vez en `new Date()` (hoy) y solo cambia por navegación manual o selección explícita de fecha. Ver nota técnica #31 sobre la lección de no confiar en nombres de variables.

### Servicios del cliente en pestaña "Clientes" ✅ IMPLEMENTADO Y VALIDADO (modificación sin número de US, 17 jul)
Columnas `cliente_nutricion`/`cliente_pilates` (checkbox real, posiciones K/L en "Clientes"). Lógica OR-acumulativa: al agendar, se marca TRUE solo la columna del servicio correspondiente; la otra NUNCA se pone en FALSE si ya estaba en TRUE.

**Tres bugs reales encontrados y corregidos en el camino** (ver sección 13, notas 28-30 para el detalle técnico completo): (1) migración con `getMaxRows()` en vez de `getLastRow()` corrompió la inserción de clientes nuevos vía `appendRow()`; (2) datos corrompidos reparados con función de un solo uso; (3) corrimiento de fecha ±1 día por mezclar TIME_ZONE con UTC, reparado y validado línea por línea.

### Ajustes de UI pre y post-demo ✅ IMPLEMENTADOS Y VALIDADOS (17 jul)
Además de US-16, US-29 y la ventana de pilates ya descritas arriba, se hicieron estos 2 cambios de UI puros, sin número de US:
1. **Dark mode eliminado — solo light mode.** Se quitaron los `<ModeToggle>` y `theme-provider.tsx` se simplificó para no leer `localStorage` ni `prefers-color-scheme` — el tema queda fijo en `"light"`, aplicado explícitamente vía `classList.add("light")`, sin ninguna rama condicional de sistema.
2. **Pie de página "made by @rbbydotdev" eliminado** — remanente del repo base (Someday) del que se hizo fork.

### Pilates restringido a sábados 10:00 AM únicamente ✅ IMPLEMENTADO Y VALIDADO (17 jul)
Confirmado en negocio desde `Preguntas_Reunion_02-07-2026` (P16/P21) y la minuta del 2 jul. Implementado en `fetchAvailability()` con constantes específicas (`PILATES_DAY_OF_WEEK=6`, `PILATES_START_HOUR=10`), sin tocar las constantes globales `WORKDAYS`/`WORKHOURS` que siguen aplicando igual a nutrición.

### Zona horaria ✅ CONFIRMADO
Sistema maneja múltiples zonas horarias (incluye EEUU). Horarios en hora local del cliente; eventos en Calendar se crean en hora de Costa Rica.

### Creación de evento y Meet ✅ CONFIRMADO Y VALIDADO (US-10, 13 jul)
Evento de Calendar se crea después de escritura exitosa en Sheet. Virtual → Meet real. Presencial → sin Meet, pendiente mostrar dirección física (Sprint 2). Pilates: calendario dedicado (`PILATES_CALENDAR_ID`), evento único con múltiples invitados.

### Reagendar y cancelar ✅ CONFIRMADO Y VALIDADO (US-06, 14 jul)
Identificación por token único (nunca correo). Nunca se borran filas del historial. Evento real de Calendar se mueve/elimina consistente con el Sheet.

---

## 4. TIPOS DE CITA — TODOS CONFIRMADOS

### Nutrición (flujo Dani)
| Tipo | ?type= | Duración | Modalidad |
|------|--------|----------|-----------|
| Consulta inicial | `initial` | 60 min | Presencial o virtual |
| Cita de seguimiento | `followup` | 45 min | Presencial o virtual |
| Solo medición | `measurement` | 15 min | Solo presencial |

> **Nota (US-09):** `initial`/`followup`/`measurement` comparten el mismo Google Calendar de Dani. Lock/conflict-check protege el Calendar real, no cada tipo por separado.

### Pilates (flujo instructora — completamente independiente) ✅ CONFIRMADO
| Tipo | ?type= | Duración | Modalidad | Formato | Horario | Ventana mínima | Máx. participantes |
|------|--------|----------|-----------|---------|---------|----------------|-------------------|
| Clase de pilates | `pilates` | 60 min | Virtual únicamente | **Grupal** | Sábados 10 AM | **12 horas** ✅ 17 jul | **5 personas** |

#### Detalles importantes de pilates:
- **Grupal** → un slot puede tener múltiples clientes hasta el límite
- Si la clase está llena (5/5), el sistema **bloquea automáticamente** nuevas inscripciones ✅
- Clases privadas one-on-one: **fuera de la app**
- Recordatorios salen desde el **correo de la instructora**
- ✅ **Resuelto el 17 jul:** restricción real de sábados 10am, implementada directamente en `fetchAvailability`.
- ✅ **Resuelto el 17 jul:** ventana mínima de 12hrs (en vez de las 48hrs de nutrición), pedida por Dani en el demo.
- ⚠️ **Pendiente para Sprint 3:** `WORKDAYS`/`WORKHOURS` genéricos siguen sin reflejar el horario real completo de Dani para NUTRICIÓN (martes–sábado, 7–19 entre semana / 7–14 sábado, cerrado domingo-lunes, no último sábado del mes). Este pendiente es distinto y separado del de pilates, que ya quedó resuelto. Ver sección 13, nota 14.
- ✅ **Resuelto en US-10:** eventos de Calendar duplicados por inscripción — ahora 1 solo evento por slot con múltiples invitados, calendario dedicado (`PILATES_CALENDAR_ID`).

---

## 5. MODELO DE DISTRIBUCIÓN DE LINKS

```
?type=initial       → Consulta inicial (60 min, nutrición, Dani)
?type=followup      → Cita de seguimiento (45 min, nutrición, Dani)
?type=measurement   → Solo medición (15 min, nutrición, solo presencial, Dani)
?type=pilates       → Clase grupal (60 min, virtual, instructora, sáb 10 AM, máx 5, 12hrs mín)
```

---

## 6. ACTORES DEL SISTEMA

| Actor | Rol |
|-------|-----|
| **Dani** | Admin/nutricionista. Bloquea disponibilidad en su Calendar. Marca show/no-show en Sheet. Ya vio el sistema en demo (17 jul). |
| **Ali (secretaria)** | Distribuye links correctos a cada cliente por WhatsApp. También Dani puede distribuirlos. |
| **Instructora de pilates** | Calendar y correo propios. Los recordatorios de pilates salen desde su cuenta. |
| **Cliente (ES/EN)** | Agenda, reagenda o cancela vía link. Sin cuenta de Google. Puede ser de CR o EEUU. Debe ser mayor de 15 años. |
| **Google Apps Script** | Motor de automatización: crea eventos, envía correos, ejecuta triggers, escribe en Sheets. |

### Checklist de acceso necesario para producción
**De la instructora de pilates:**
1. Compartir su Google Calendar real con la cuenta de deploy, permiso **"Realizar cambios y administrar el uso compartido"**.
2. (Pendiente decidir) "Enviar correo como" vs Reply-To — evaluar en Sprint 2 al construir plantillas de correo.

**De Dani:** deploy final bajo su cuenta (Sprint 3).

**Variable técnica:** `PILATES_CALENDAR_ID` en Script Properties — testing apunta a "Pilates - Testing"; producción debe usar el ID real.

---

## 7. FLUJOS COMPLETOS

### Flujo principal — Agendar cita de nutrición
```
1. Ali o Dani comparte link ?type=initial/followup/measurement por WhatsApp
2. Cliente accede → Paso 1: ve Calendario (abre en el MES ACTUAL, con selector 
   idioma [con bandera SVG]/zona horaria ahí), selecciona fecha y hora dentro 
   de la ventana permitida (48hrs-8sem)
3. Paso 2: cliente ingresa su correo → sistema busca en pestaña "Clientes"
4. Paso 3: formulario precargado o vacío según exista el correo (incluye 
   dropdown de tipo_id + campo numero_id; fecha de nacimiento con selector 
   restringido a mayores de 15 años; YA NO incluye selector de idioma), con 
   resumen fijo del horario elegido en Paso 1 → upsert en "Clientes" al 
   enviar (valida edad PRIMERO, antes de escribir nada; marca 
   cliente_nutricion=TRUE, conserva cliente_pilates si ya estaba TRUE)
5. Apps Script re-verifica ventana 48hrs + LockService justo antes de confirmar
6. Si el slot ya no está disponible: error claro + regreso automático al Paso 1
   con calendario recargado y correo/datos preservados
7. Escribe fila en Sheet de Nutrición (con flush()) PRIMERO
8. Solo si tuvo éxito: crea evento en Calendar de Dani + Meet real si es virtual
9. Si el evento falla después de un Sheet exitoso: fila queda 'Error_Calendar' (no se borra)
10. Envía correo de confirmación — pendiente Sprint 2
11. Envía notificación interna a Dani — pendiente Sprint 2
12. Trigger 48hrs antes → recordatorio — pendiente Sprint 2
13. Cita se realiza → Dani marca show/no-show en Sheet
```

### Flujo pilates — Inscripción a clase grupal
```
1. Ali o Dani comparte link ?type=pilates
2. Cliente accede → Paso 1: ve disponibilidad, PERO SOLO sábados aparecen 
   habilitados, el único horario visible es 10:00 AM, y se puede reservar 
   con solo 12hrs de anticipación (no 48 como nutrición)
3. Paso 2: correo → busca en "Clientes" (compartida con nutrición)
4. Paso 3: formulario precargado o vacío (incluye dropdown de tipo_id + 
   numero_id; fecha de nacimiento restringida a 15+ años) → upsert (valida 
   edad primero; marca cliente_pilates=TRUE, conserva cliente_nutricion si 
   ya estaba TRUE), resumen fijo del horario elegido
5. Si hay cupo: verifica en Cupos_Pilates (LockService) al confirmar
6. Escribe fila en Pilates PRIMERO (flush()), incrementa contador
7. Si es la primera inscripción del slot: crea evento en calendario dedicado con Meet, guarda event_id/meet_link
8. Si ya existe event_id: agrega al cliente como invitado (no crea evento nuevo)
9. Si cupo = 5: "clase llena"
10-12. Correos y notificaciones — pendiente Sprint 2
13. Clase se realiza → instructora marca show/no-show
```

### Flujo reagendamiento ✅ IMPLEMENTADO Y VALIDADO (US-06)
Busca por TOKEN. <24hrs bloquea con `VENTANA_REAGENDAMIENTO_VENCIDA` + incrementa contador de tardías. ≥24hrs valida el nuevo horario igual que `bookTimeslot` (respetando la ventana mínima correspondiente al tipo: 48hrs nutrición, 12hrs pilates). Actualiza Sheet, mueve el evento real de Calendar. Frontend real: pendiente (RF-2.6).

### Flujo cancelación ✅ IMPLEMENTADO Y VALIDADO (US-06)
Busca por TOKEN. SIEMPRE se permite. <24hrs marca tardía + incrementa contador. Actualiza Sheet (nunca borra fila). Elimina el evento real de Calendar. Frontend real: pendiente (RF-2.6).

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

> ⚠️ **Pendiente de fondo (nota 30):** `fecha` aquí tiene el mismo problema de coerción de tipos que tenía `fecha_nacimiento` — se guarda como objeto Date real, no texto plano. Deliberadamente NO tocado. Sin evidencia de bug funcional activo, ya que el código de negocio usa `normalizeSheetDateCell()`.

### Pestaña "Pilates" (schema tras US-18, verificado 15 jul)
```
token | nombre | apellido | correo | telefono | tipo_id | numero_id | fecha_nacimiento |
fecha_clase | hora_clase | zona_horaria_cliente | idioma |
estado | fecha_inscripcion | recordatorio_enviado | show_no_show
```
> ⚠️ Mismo pendiente de fondo que Nutrición, aplicado a `fecha_clase`.

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

`cliente_nutricion`/`cliente_pilates` (K, L) — checkbox real, lógica OR-acumulativa. **Validado y funcionando.**

`fecha_nacimiento` (G) — **✅ confirmado como texto plano, en UTC.** `upsertClient()` fuerza `setNumberFormat("@")` ANTES de escribir en ambos paths (insertar/actualizar). Desde el 17 jul, además, `upsertClient()` valida que la edad calculada desde este campo sea ≥15 años ANTES de cualquier escritura (ver sección 3).

> ⚠️ **Pendiente de fondo (nota 30):** `findClientByEmail()` sigue leyendo `fecha_nacimiento` con `TIME_ZONE` en vez de UTC — mismo patrón de bug pero en lectura. Bajo riesgo mientras todas las celdas sean texto plano.

### Valores válidos de `tipo_id` (fijos)
```
cedula | pasaporte | licencia | otro
```

---

## 9. REQUERIMIENTOS FUNCIONALES

### RF-1 — Portal de Agendamiento
| ID | Requerimiento | Estado |
|----|--------------|--------|
| RF-1.1 | Cliente accede por link ?type= y ve disponibilidad en tiempo real | ✅ |
| RF-1.2 | Duración automática por tipo. Pilates: lógica de cupos grupales (máx 5) | ✅ |
| RF-1.3 | Formulario completo | ✅ US-17, US-18 |
| RF-1.4 | Sin cuenta de Google — portal público por link con token | ✅ (⚠️ nota 17 — móvil sin confirmar formalmente) |
| RF-1.5 | Datos en Sheets. Pilates: también actualizar contador en Cupos_Pilates | ✅ US-05 |
| RF-1.6 | Calendario abre en el mes actual por defecto | ✅ US-16, 17 jul |
| RF-1.11 | Correo como identificador único — flujo de 3 pasos | ✅ US-27, orden US-19 |
| RF-1.12 | Ventana mínima diferenciada por tipo (48hrs nutrición / 12hrs pilates) + verificación de conflictos con lock | ✅ US-09, ventana de pilates actualizada 17 jul |
| RF-1.13 | Creación de evento de Calendar; Meet real; evento único pilates; calendario dedicado | ✅ US-10 |
| RF-1.14 | Reagendar/cancelar por token; asimetría 24hrs; tracker de tardías | ✅ US-06 — falta frontend |
| RF-1.8 | Ventana máxima: 56 días (ambos tipos) | ✅ |
| RF-1.9 | Horarios en zona horaria del cliente | ✅ US-08 |
| RF-1.10 | Selector de idioma con banderas, SOLO en Paso 1 | ✅ actualizado 17 jul |
| RF-1.15 | Campo de ID flexible, valor interno consistente | ✅ US-18 |
| RF-1.16 | cliente_nutricion/cliente_pilates, OR-acumulativo | ✅ 17 jul |
| RF-1.17 | Disponibilidad de pilates restringida a sábados 10am | ✅ 17 jul |
| RF-1.18 | Solo light mode, sin toggle de tema | ✅ 17 jul |
| RF-1.19 | Sin atribución al repo base (footer) | ✅ 17 jul |
| RF-1.20 (nuevo) | Edad mínima 15 años, sin escritura si se bloquea | ✅ **Done — US-29, 17 jul** |
| RF-1.21 (nuevo) | Pilates: ventana mínima 12hrs (distinta de nutrición) | ✅ **Done — 17 jul** |

### RF-2 — Correos y Automatizaciones (SPRINT 2 — TODO PENDIENTE)
| ID | Requerimiento | Estado |
|----|--------------|--------|
| RF-2.1 | Correo de confirmación inmediato | ⏳ Pendiente Sprint 2 |
| RF-2.2 | Correos de nutrición desde Dani, pilates desde instructora | ⏳ Pendiente Sprint 2 |
| RF-2.3 | Notificación interna en cada acción | ⏳ Pendiente Sprint 2 |
| RF-2.4 | Recordatorio 48 hrs antes | ⏳ Pendiente Sprint 2 |
| RF-2.5 | Notificación a Dani/Ali si fuera de ventana | ⏳ Pendiente Sprint 2 |
| RF-2.6 | Frontend de reagendar/cancelar | ⏳ Pendiente Sprint 2 |
| RF-2.7 | Reordenar pantallas: Calendario → Correo → Datos | ✅ Done — US-19 |

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
TIME_ZONE = "America/Costa_Rica"       // Para fecha/hora de CITAS reales (dependen de Dani)
WORKDAYS = [1,2,3,4,5,6]              // ⚠️ genérico para NUTRICIÓN — Sprint 3
WORKHOURS = { start: 7, end: 20 }     // ⚠️ genérico para NUTRICIÓN — Sprint 3
DAYS_IN_ADVANCE = 56                   // 8 semanas, ambos tipos
MIN_BOOKING_HOURS = 48                 // ✅ US-09 — SOLO nutrición (initial/followup/measurement)
PILATES_MIN_BOOKING_HOURS = 12         // ✅ 17 jul — SOLO pilates, pedido por Dani en el demo
CANCELLATION_HOURS = 24               // ✅ US-06 — ambos tipos, sin cambios
MAX_PILATES_PARTICIPANTS = 5
PILATES_CALENDAR_ID                   // Script Property — calendario dedicado de pilates (US-10)
PILATES_DAY_OF_WEEK = 6                // ✅ 17 jul, sábado (0=domingo)
PILATES_START_HOUR = 10                // ✅ 17 jul, 10:00 AM exacto — único horario de pilates
MIN_AGE_YEARS = 15                     // ✅ 17 jul, US-29 revisada (reemplazó el "13" original)
TIPO_ID_VALUES = ["cedula", "pasaporte", "licencia", "otro"]  // ✅ US-18, valores internos fijos
CEDULA_COLUMN_BY_SHEET = { "Nutrición": 6, "Pilates": 6, "Clientes": 5 }  // ✅ US-18
CLIENTES_NUTRICION_COL = 11           // ✅ 17 jul, posición K
CLIENTES_PILATES_COL = 12             // ✅ 17 jul, posición L
CLIENTES_FECHA_NACIMIENTO_COL = 7     // ✅ 17 jul, posición G
```

> ⚠️ **Regla de zona horaria para fechas (nota #30):** `fecha_nacimiento` (sin componente horario real) SIEMPRE usa `UTC`. `fecha`/`hora` de citas reales usan `TIME_ZONE`. Mezclarlas produce un corrimiento de ±1 día silencioso (ver nota #29). El cálculo de edad (`calculateAge`/`assertMinimumAge`, nota #32) sigue el mismo principio: aritmética pura de componentes, sin Date ni zona horaria.

> ⚠️ **Restricciones de pilates son específicas del `type`, no constantes globales** — `WORKDAYS`/`WORKHOURS`/`MIN_BOOKING_HOURS` siguen aplicando igual a nutrición; `PILATES_DAY_OF_WEEK`/`PILATES_START_HOUR`/`PILATES_MIN_BOOKING_HOURS` solo se evalúan dentro de branches `type === "pilates"`.

### Firma actual de funciones en backend (al cierre del 17 jul, deploy v23)
```typescript
getDurationForType(type: string): number
fetchAvailability(type: string): { timeslots: string[], durationMinutes: number }
// Branch type === "pilates": descarta slots que no sean sábado/10am exacto, y usa 
// PILATES_MIN_BOOKING_HOURS (12) en vez de MIN_BOOKING_HOURS (48) para calcular el 
// primer slot elegible. WORKDAYS/WORKHOURS/MIN_BOOKING_HOURS globales no se tocaron.

bookTimeslot(type, timeslot, nombre, apellido, email, phone, tipoId, numeroId, birthdate, language, modalidad, clientTimezone): string
// Valida edad mínima (assertMinimumAge) como PRIMER paso, antes de cualquier lectura/
// escritura — defensa en profundidad (la validación principal vive en upsertClient, 
// que se llama antes en el flujo real). Usa PILATES_MIN_BOOKING_HOURS para pilates.

findBookingByToken(token: string): { sheet, row, data }
rescheduleBooking(token, newTimeslot, clientTimezone): string
// Valida el NUEVO horario contra la ventana mínima correspondiente al tipo (12hrs 
// pilates / 48hrs nutrición).
cancelBooking(token: string): { lateCancellation: boolean }

incrementClientLateCancellation(correo) / resetClientLateCancellationCounter(correo)
getClientPaymentStatus(correo): { cancelaciones_tardias, requiere_pago }
notifyLateCancellation(...) // STUB con TODO — implementar de verdad en Sprint 2

calculateAge(birthdateStr: string, todayStr: string): number
// ✅ 17 jul. Aritmética PURA de componentes año/mes/día extraídos de strings 
// yyyy-MM-dd — SIN Date, SIN zona horaria. Sigue el mismo principio que la nota #29.
assertMinimumAge(birthdateStr: string): void
// Usa Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd") para "hoy", compara 
// con calculateAge() contra MIN_AGE_YEARS=15. Lanza EDAD_MINIMA_NO_CUMPLIDA si no 
// cumple. Regla de borde verificada: cumple 15 HOY → permite; cumple 15 MAÑANA → 
// bloquea.

upsertClient(data: ClientRecord, type: string): void
// Llama assertMinimumAge() como EL PRIMER PASO, antes de cualquier lectura/escritura 
// — si falla, no toca el Sheet en absoluto (requisito explícito del checklist de 
// US-29). Ya NO usa appendRow()/getLastRow() ciego para insertar clientes nuevos — 
// busca explícitamente la primera fila con columna A (correo) vacía. Aplica 
// setNumberFormat("@") a fecha_nacimiento ANTES de escribir, usando UTC. Aplica OR-
// acumulativo a cliente_nutricion/cliente_pilates según el "type" recibido.

findClientByEmail(correo: string): ClientRecord | null
// ⚠️ Lee fecha_nacimiento con TIME_ZONE (no UTC) — pendiente de fondo, nota #30.

migrateCedulaToTipoNumeroId(): void               // ✅ US-18, por posición
addServicioColumnsToClientes(): void              // ✅ 17 jul, corregida (getLastRow, no getMaxRows)
cleanupCorruptedClientesSheet(): void             // ✅ función de un solo uso, ya ejecutada
correctOffByOneDayBirthdates(): void              // ✅ función de un solo uso, ya ejecutada
fixFechaNacimientoFormatInClientes(): void        // ✅ función de un solo uso, ya ejecutada
addCancelacionesColumnsToClientes(): void         // ✅ ejecutada manualmente 13 jul
addEventIdColumnToNutricion(): void               // ✅ ejecutada manualmente 13 jul
addEventIdColumnToCuposPilates(): void             // ✅ ejecutada manualmente 13 jul
setupPilatesTestCalendar(): void                  // ✅ ejecutada manualmente 13 jul, idempotente
initializeSheets(): void                           // ✅ ejecutada, NO volver a correr
addClientesSheet(): void                           // ✅ ejecutada manualmente 12 jul
getSheet(sheetName: string): GoogleAppsScript.Spreadsheet.Sheet
getPilatesCalendarId(): string
```

### Frontend — cambios acumulados del 17 jul
```typescript
// frontend/src/components/calendar-picker.tsx
// - Eliminado el useEffect que auto-seleccionaba currentMonth desde "firstTimeslot" 
//   (que en realidad tomaba el ÚLTIMO por .sort().reverse()[0]). currentMonth ahora 
//   solo se inicializa una vez en new Date() y cambia solo por navegación manual.
// - Eliminados ambos <ModeToggle /> (mobile y desktop) y su import.
// - Eliminado el <select> de idioma dentro de ContactForm (Paso 3) — el idioma 
//   guardado ahora viene directo de uiLanguage (Paso 1), sin depender de FormData 
//   del Paso 3.
// - LanguageDropdown reconstruido como Popover+Command (mismo patrón que 
//   timezone-dropdown.tsx) con banderas SVG inline reales — España para ES, 
//   Estados Unidos para EN. Emoji Unicode descartado (no se renderiza en Windows, 
//   y <option> nativo no puede mostrar SVG en ningún sistema operativo).
// - Input de fecha de nacimiento: atributo max calculado como "hoy menos 15 años" 
//   en hora de Costa Rica. Validación adicional en onChange/onBlur/onSubmit con 
//   mensaje bilingüe si se escribe una fecha inválida a mano.
// - Nuevo código de error EDAD_MINIMA_NO_CUMPLIDA mapeado a mensaje bilingüe, mismo 
//   patrón que los otros errores de booking/upsert.

// frontend/src/components/theme-provider.tsx
// - Eliminada la lectura de localStorage y la detección de prefers-color-scheme.
// - useEffect final, sin condicionales de sistema:
//   useEffect(() => {
//     const root = window.document.documentElement;
//     root.classList.remove("light", "dark");
//     root.classList.add(theme);
//   }, [theme]);

// frontend/src/App.tsx
// - <ThemeProvider defaultTheme="light"> (antes "system")
// - Eliminado el <div> con "made by @rbbydotdev"
```

> **Nota frontend general:** no hay componentes de paso separados en archivos individuales — `EmailStep`, `ContactForm` y `CalendarTimeslotPicker` son funciones dentro de `calendar-picker.tsx`, junto con el orquestador `CalendarPicker`. El frontend no tiene lógica propia de filtrado de día/hora para pilates — confía 100% en lo que devuelve `fetchAvailability`. El proyecto ya tenía el patrón Popover+Command disponible (usado en `timezone-dropdown.tsx`) antes de reutilizarlo para el nuevo selector de idioma con banderas.

> **Nota test-harness:** `backend/test-harness/` — **48 aserciones, todas pasando** al cierre del 17 jul (incluye tests nuevos para: gate de edad con borde exacto, defensa en profundidad en bookTimeslot, no-escritura en Clientes/Nutrición/Pilates/Cupos_Pilates cuando se bloquea por edad, y ventana de 12hrs de pilates vs 48hrs de nutrición). **Punto ciego conocido:** el mock (`gas-mock.js`) no simulaba originalmente `insertCheckboxes()`/`clearContent()`/`clearFormat()`/`clearDataValidations()` en `MockRange` — se encontró y corrigió esto al escribir los tests de edad mínima (el nuevo path de inserción de cliente los usa). Este tipo de hueco solo se encuentra escribiendo tests reales contra funcionalidad nueva, no de antemano.

---

## 11. SPRINTS Y ESTADO ACTUAL

### Sprint 1 (3–9 Jul, extendido hasta 14 Jul) — Setup + Portal base — ✅ **100% COMPLETO**
US-01 a US-10, US-17, US-27 — todas Done.

### Sprint 2 (Jul 14 – Jul 20) — ESP: 32 — tablero real de Trello

| US | Título | Puntos | Checklist | Estado |
|----|--------|--------|-----------|--------|
| US-19 | Cambiar orden de pantallas (Calendario→Correo→Datos) | 2 | 5/5 | ✅ Done (15 jul) — Deploy v17 |
| US-18 | Campo de ID flexible | 1 | 1/1 | ✅ Done (15 jul) — Deploy v18 |
| (sin número) | cliente_nutricion/cliente_pilates en "Clientes" | — | Validado | ✅ Done (17 jul) — Deploy v20 |
| US-16 | Fix: calendario no abre en el mes actual por defecto | 2 | 4/4* | ✅ Done (17 jul) — Deploy v21. *Ítem de "prueba de borde de fin de mes" no confirmado explícitamente por el usuario — verificar si hace falta antes de dar el checklist 100% cerrado en Trello. |
| (sin número) | Ajustes pre-demo: dark mode, footer, pilates sábados 10am | — | Validado | ✅ Done (17 jul) — Deploy v21 |
| US-29 | Bloquear registro de menores de 15 años (revisada de 13→15 en el demo) | 3 | Validado | ✅ **Done (17 jul)** — Deploy v22. Confirmar en Trello: el ítem de "prueba de borde: cumple 13 años" del checklist original tenía un desfase de redacción (decía 13, la tarjeta ya dice 15) — verificar que el texto del checklist en Trello se haya actualizado a 15 también. |
| (sin número) | Idioma solo en Paso 1 (quitar de Paso 3) | — | Validado | ✅ **Done (17 jul)** — Deploy v22 |
| (sin número) | Banderas reales SVG en selector de idioma (España/EEUU) | — | Validado | ✅ **Done (17 jul)** — Deploy v23 |
| (sin número) | Pilates: ventana mínima 12hrs (no 48) | — | Validado | ✅ **Done (17 jul)** — Deploy v22 |
| US-11 | Plantillas HTML bilingües (nutrición y pilates) — SOLO correo de confirmación | 3 | 3/7 parcial | 🔶 **En progreso (17 jul, noche)** — Deploy v24. Ver nota abajo. |
| US-12 | Correo de confirmación inmediato al cliente | 3 | 1/8 | ⏳ Backlog — depende de US-11 |
| US-13 | Notificación interna a Secretaria | 5 | 1/6 | ⏳ Backlog |
| US-14 | Recordatorio automático 48 horas antes de la cita | 5 | 1/6 | ⏳ Backlog |
| US-20 | Generación y validación de token único por cita | 2 | 1/8 | ⏳ Backlog — revisar solapamiento con US-05/US-06 |
| US-28 | Actualizar look & feel según brandbook | 4 | 0/7 | ⏳ Backlog — necesita carpeta de branding de Drive |
| (sin número) | Fix fecha/fecha_clase en Nutrición/Pilates | — | — | ⏳ Pospuesto deliberadamente, ver nota 30 |
| (sin número) | Fix lectura findClientByEmail (TIME_ZONE vs UTC) | — | — | ⏳ Deuda técnica de bajo riesgo, ver nota 30 |

⚠️ **Pendientes de acción del usuario en Trello:** (1) confirmar el checkbox de "prueba de borde fin de mes" de US-16 si se probó; (2) actualizar el texto del checklist de US-29 de "13 años" a "15 años" para que quede consistente con el título de la tarjeta; (3) mover US-29 a Done si todo lo anterior está conforme.

**Nota sobre US-11 (17 jul, noche) — alcance de esta pasada: SOLO el correo de confirmación.**
Gabriela ya entregó los 4 HTML de confirmación (`design-reference/Comunicaciones/`), copiados sin
rediseño a `backend/templates/correo_confirmacion_{nutricion,pilates}_{es,en}.html` (el logo, la
flor y el kettlebell ya vienen embebidos en base64 dentro de cada archivo). Se agregó
`renderConfirmationEmail()` en `backend/src/app.ts` (elige plantilla por tipo de cita + idioma,
usa `HtmlService.createTemplateFromFile()`), más `formatFechaDisplay()`/`formatHoraDisplay()`
(fecha/hora de CITA REAL → siempre `TIME_ZONE`, nunca UTC, mismo criterio de la nota #29; los
nombres de día/mes se arman a mano con arreglos ES/EN a partir de números, porque
`Utilities.formatDate` no acepta un locale por llamada — un solo locale de Script no sirve para
ES y EN a la vez). `build.sh` ahora copia `backend/templates/*.html` a `dist/` además de
`backend/dist/*`/`frontend/dist/*`. Se agregó el scope `gmail.send` a `appsscript.json` (root y
`dist/`) — GmailApp no estaba autorizado todavía. **Deploy v24 ya hecho** (mismo `deploymentId` de
siempre) con este código.

**5 textos de copy quedaron como BORRADOR, pendientes de aprobación de Gabriela** (siguen el mismo
patrón/tono que los ya aprobados) — pasarle este texto tal cual para su visto bueno:
- ES título seguimiento: "¡Tu cita de seguimiento está confirmada!"
- ES título medición: "¡Tu cita de medición está confirmada!"
- EN título inicial: "Your initial appointment is confirmed!"
- EN título seguimiento: "Your follow-up appointment is confirmed!"
- EN título medición: "Your measurement appointment is confirmed!"
- ES subject pilates: "Tu clase de pilates está confirmada"
- EN subject pilates: "Your pilates class is confirmed"

**Checklist ítems cubiertos en esta pasada:** render correcto de las 4 combinaciones verificado
localmente (variables dinámicas, bloque Meet vs. dirección/Maps/Waze condicional en nutrición,
pilates sin ese bloque) — ver artifact de vista previa generado en la sesión. **Pendiente real,
sin marcar como Done todavía:** correr `testSendConfirmationEmails()` manualmente desde el editor
de Apps Script para confirmar el correo tal cual llega a Gmail (esta sesión no tenía `clasp run`
autenticado para dispararlo en remoto — solo se verificó el HTML renderizado, no el envío real).
No se conecta todavía a `bookTimeslot()` (eso es US-12, siguiente tarjeta) ni se tocaron
plantillas de recordatorio/notificación interna (no existen todavía, US-13/US-14/US-30).

### Sprint 3 (pendiente) — Producción + Pruebas
- Resolver acceso desde móvil (nota 17) antes de dar por completo RNF-3/RF-1.4.
- Checklist de acceso de producción (sección 6).
- Auditar `WORKDAYS`/`WORKHOURS` reales de Dani para NUTRICIÓN (pilates ya resuelto el 17 jul).

---

## 12. ENTORNO DE TESTING

| Dato | Valor |
|------|-------|
| Cuenta de testing | plantpoweredani.testing@gmail.com |
| Credenciales | Guardadas en Drive: AutomáTica / Plant Powered Dani / Interno |
| URL de testing activa | https://script.google.com/macros/s/AKfycbwNUEjG8CXo2D5bk2eq1w6wBrme9XqJpCqOt-TkP0otTypiXd7GCEk7L7uFhdDOLCaJ/exec |
| Editor Apps Script | https://script.google.com/d/1cu-HdKiAmfUYOgjwtjKcE9lCO6waLfFsL71PwP4GgcdGiQWzqygPS3fK/edit |
| Versión actual | **v23** |
| Repo | https://github.com/juanartavia/plant-powered-dani |
| Spreadsheet testing | https://docs.google.com/spreadsheets/d/16M6WUqMAK9XkVoIutIn9UkJojlS5biT5o470GySs5gw/edit |
| Calendario pilates (testing) | "Pilates - Testing" |
| Harness de pruebas backend | `backend/test-harness/` — 48 aserciones, todas pasando |

### ⚠️ Lección crítica de proceso — deploy vs. push (nota #25)
`clasp push` actualiza el código fuente, pero la URL pública `/exec` queda **congelada** a la versión del último `clasp deploy` sobre ese `deploymentId`. Siempre confirmar `clasp deploy` antes de dar una prueba por válida.

### Links de testing por tipo de cita (v23)
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
| v8-v16 | ≤14 jul | Sprint 1 completo |
| v17 | 15 jul | US-19: reordenado el flujo del portal a Calendario→Correo→Datos |
| v18 | 15 jul | US-18: campo de ID flexible tipo_id + numero_id |
| v19 | 17 jul | cliente_nutricion/cliente_pilates, primera versión — contenía bug de appendRow/getMaxRows, detectado en testing real |
| v20 | 17 jul | Fix completo de v19: OR-acumulativo correcto, inserción sin appendRow ciego, fecha_nacimiento texto plano UTC |
| v21 | 17 jul | **US-16 Done** (fix mes actual). Dark mode y footer eliminados. Pilates restringido a sábados 10am. Validado antes del demo con la dueña del producto (3pm). |
| v22 | 17 jul (tras el demo) | **US-29 revisada** (edad mínima 15 años en vez de 13, con doble capa frontend+backend, sin escritura si se bloquea). Idioma eliminado del Paso 3 (solo Paso 1). Banderas de idioma agregadas (primera versión, emoji). Pilates: ventana mínima cambiada de 48hrs a 12hrs. 4 pedidos de Dani en el demo, todos implementados. |
| v23 | 17 jul (noche) | **Fix de banderas:** reemplazadas de emoji Unicode (no se renderizaban en Windows) a SVG reales con dropdown personalizado. Corregido Costa Rica → España para el idioma español. Verificado visualmente con Playwright antes de deployar. |
| v24 | 17 jul (noche) | **US-11 en progreso** (solo correo de confirmación): `renderConfirmationEmail()` + helpers de fecha/hora + 4 plantillas de Gabriela copiadas a `backend/templates/`. Scope `gmail.send` agregado al manifest. Render verificado localmente (visor con las 4 combinaciones); **envío real por GmailApp aún sin confirmar** — falta correr `testSendConfirmationEmails()` desde el editor. **Deploy activo.** |

---

## 13. NOTAS TÉCNICAS CRÍTICAS

1. **Todo en cuenta de testing primero** — nunca tocar cuenta real de Dani hasta Sprint 3.
2. **Pilates grupal es arquitectónicamente distinto** — usa contador en Cupos_Pilates, no slot individual.
3. **Pilates solo sábados 10am — ✅ RESUELTO el 17 jul** en `fetchAvailability`.
4. **Función atómica (US-05, reforzada US-10):** si falla Sheets → no crear evento en Calendar. Si falla Calendar DESPUÉS de un Sheet exitoso → la fila NO se borra, queda `estado='Error_Calendar'`.
5. **Token UUID v4:** único identificador válido para localizar una cita — nunca el correo.
6. **Trigger 48hrs (Sprint 2):** solo disparar si estado = 'Agendada' o 'Reagendada'.
7. **Cancelaciones tardías — fuente de verdad es "Clientes", no Nutrición/Pilates.**
8. **Correos pilates** salen desde cuenta de la instructora — o Reply-To, decisión pendiente Sprint 2.
9. **Idioma del cliente** guardado en Sheet → determina idioma de correos automáticos. Selector vive solo en Paso 1 desde el 17 jul.
10. **Cédula** ya NO es el identificador único, y desde US-18 tampoco es un campo único: `tipo_id` + `numero_id`.
11. **initializeSheets()** — UNA SOLA VEZ, ya ejecutada. NO volver a correr.
12. **Permisos en appsscript.json** — incluye spreadsheets, drive, calendar.
13. **Pilates: eventos duplicados — RESUELTO en US-10.**
14. **`WORKDAYS`/`WORKHOURS` genéricos para NUTRICIÓN (pendiente Sprint 3)** — no reflejan el horario real completo de Dani. La restricción de pilates (sábados 10am, 12hrs mín) YA quedó resuelta el 17 jul de forma independiente.
15. **Auditar y adaptar código heredado, no asumir que ya cumple las reglas del cliente.**
16. **Coerción de tipos en Google Sheets** — mitigación general: `normalizeSheetDateCell()` + `setNumberFormat("@")`. Patrón raíz detrás de las notas #28-30, #32.
17. **Acceso desde móvil — pendiente investigar/confirmar formalmente.**
18. **El lock de conflict-check protege el Calendar real, no el "tipo" de cita.**
19. **`SpreadsheetApp` cachea escrituras — requiere `flush()` explícito antes de releer en la misma ejecución.**
20. **Calendar de pilates nunca estuvo realmente separado hasta US-10.**
21. **Asimetría intencional cancelar/reagendar** (US-06) — ver tabla en sección 3.
22. **Ventana de 24hrs para reagendar se evalúa contra la cita ACTUAL, no la nueva.**
23. **Patrón para testing manual sin frontend (US-06)** — wrappers temporales, borrar al finalizar.
24. **rescheduleBooking y cancelBooking deben comportarse igual ante citas sin `event_id`.**
25. **Gap de deploy causó un falso positivo de bug (14 jul).** Verificar `clasp deployments` antes de dar un resultado de prueba por "bug confirmado".
26. **Wrappers temporales de US-06 removidos (14 jul).**
27. **Trabajo funcionando en producción sin `git commit`.** Regla reforzada: `git commit` inmediatamente después de cada `clasp deploy` exitoso, sin esperar a validar en real.
28. **Migración de schema por texto falló silenciosamente por un espacio en blanco invisible (US-18, 15 jul).** Regla: migrar por POSICIÓN de columna, no por texto.
29. **Corrimiento de fecha ±1 día por mezclar TIME_ZONE con UTC (17 jul).** Regla: fechas sin componente horario (fecha_nacimiento) siempre en UTC; fechas/horas de eventos reales siempre en TIME_ZONE.
30. **`insertCheckboxes()` sobre `getMaxRows()` en vez de `getLastRow()` corrompió silenciosamente el Sheet real (17 jul).** Regla: cualquier operación de rango masivo se acota a `getLastRow()`/`getLastColumn()` reales, nunca a los límites por defecto del Sheet. Punto ciego confirmado del test-harness (dos veces: primero con checkboxes de servicios, después con el mismo gap al escribir tests de edad mínima — el mock no simulaba `insertCheckboxes`/`clearContent`/`clearFormat`/`clearDataValidations`, corregido ambas veces). Pendientes de fondo derivados, pospuestos por presión de tiempo: (a) mismo problema Date-vs-texto en `fecha`/`fecha_clase` de Nutrición/Pilates; (b) `findClientByEmail()` lee `fecha_nacimiento` con TIME_ZONE en vez de UTC.
31. **Bug de selección de mes con nombre de variable engañoso (US-16, 17 jul).** El efecto que rompía `currentMonth` usaba una variable llamada `firstTimeslot` pero construida con `.sort().reverse()[0]` — que en realidad devuelve el ÚLTIMO elemento, no el primero. El nombre sugería lo contrario de lo que hacía. **Regla reforzada:** al diagnosticar un bug, verificar el comportamiento real del código, no confiar en nombres de variables.
32. **Validación de negocio nueva (edad mínima) debe colocarse en el primer punto de escritura REAL de la cadena, no en la función que "suena" más relevante (17 jul, US-29).** El checklist de Trello exigía "no se almacena ningún dato si el registro es bloqueado por edad". El diseño inicial solo validaba dentro de `bookTimeslot()` — pero el flujo real del Paso 3 llama PRIMERO a `upsertClient()` (que ya escribe en "Clientes") y DESPUÉS a `bookTimeslot()`. Si la validación solo viviera en `bookTimeslot()`, un menor de 15 quedaría guardado en "Clientes" aunque la cita se rechazara. **Regla reforzada:** antes de diseñar una validación que debe bloquear TODA escritura, mapear el orden real de llamadas de la cadena completa (no asumirlo por el nombre de las funciones) y colocar la validación en el primer eslabón, con defensa en profundidad en los siguientes.
33. **Emoji Unicode no sirven como solución de iconografía multiplataforma; `<option>` nativo no soporta SVG (17 jul).** Los emoji de bandera (🇪🇸/🇺🇸) no se renderizan como imagen en Windows — se muestran como el código de país en texto plano ("ES"/"US"). Además, un `<select>`/`<option>` de HTML nativo no puede mostrar SVG ni imágenes en NINGÚN sistema operativo, así que un dropdown personalizado era necesario de todas formas, no solo como parche para Windows. **Regla reforzada:** para iconografía que debe verse igual en cualquier SO/navegador, usar SVG reales con un componente de dropdown propio (Popover+Command u otro patrón ya existente en el proyecto), y verificar visualmente el resultado (capturas reales, no solo que el build compile) antes de dar el cambio por bueno — así se detectó este problema originalmente.

---

## 14. MÉTODO DE TRABAJO

### Cómo trabajamos en este proyecto
El desarrollo se divide entre dos herramientas de Claude:

**Este chat / el chat sucesor (Claude.ai — dentro del Proyecto):** cerebro — analiza cada US, genera prompts, revisa resultados, actualiza documentación y Trello.

**Claude Code (extensión en VS Code):** manos — ejecuta código, hace builds y deploys, reporta resultados. Cuando el cambio lo amerita, también puede levantar un servidor de desarrollo y usar Playwright para verificar visualmente el resultado (ej. banderas), no solo confiar en que el build compile.

### Flujo por cada US
```
1. Este chat analiza la US (y el checklist real de Trello) y genera el prompt
2. Dev pega el prompt en Claude Code
3. Claude Code ejecuta los cambios
4. Dev pega la respuesta de Claude Code en este chat
5. Este chat analiza, detecta problemas, genera siguiente prompt si hace falta
6. clasp push → si aplica, pasos manuales en el editor → clasp deploy
6.5. Inmediatamente después de un clasp deploy exitoso: git add . && git commit 
     (sin esperar a validar en real primero — nota técnica 27)
7. Probar en el navegador real contra el deploy — NO se marca nada como completado 
   solo porque el código se escribió
8. Solo si la prueba real confirma que funciona → marcar checkbox(es) en Trello
9. Cuando todos los checkboxes de la tarjeta estén marcados → mover la tarjeta a Done
10. Actualizar CLAUDE.md
```

### ⚠️ Cuándo ir al editor de Apps Script manualmente
- Ejecutar funciones de inicialización/migración/reparación — de UNA SOLA VEZ salvo idempotentes.
- Autorizar permisos nuevos.
- Ver logs de ejecución.
- El editor solo muestra código ya subido con `clasp push` — recargar si algo no aparece.
- Al correr una migración, revisar el log línea por línea (nota #28).
- Al correr una reparación de datos, comparar línea por línea contra valores originales conocidos, no solo confirmar que "no truena" (nota #29).

**URL del editor:** https://script.google.com/d/1cu-HdKiAmfUYOgjwtjKcE9lCO6waLfFsL71PwP4GgcdGiQWzqygPS3fK/edit

### Reglas importantes
- Claude Code siempre lee el CLAUDE.md al inicio de cada prompt
- Cada `clasp deploy` genera una URL nueva (o actualiza la existente con el mismo `--deploymentId`) — siempre documentarla
- Comandos en Windows PowerShell van uno por uno (sin &&)
- Nunca tocar la cuenta real de Dani hasta Sprint 3
- Si hay que agregar permisos nuevos → scope en dist/appsscript.json Y appsscript.json (raíz)
- Verificar `clasp deployments` antes de aceptar un resultado de prueba como bug confirmado (nota 25)
- Comitear a git inmediatamente después de cada deploy exitoso (nota 27)
- Migraciones de schema por posición, no por texto (nota 28)
- Fechas sin componente horario siempre en UTC; fechas/horas de eventos reales siempre en TIME_ZONE (nota 29)
- Operaciones de rango masivo acotadas a getLastRow()/getLastColumn() reales (nota 30)
- Bajo presión de tiempo, preferir posponer cambios a lógica ya validada en vez de arriesgar una regresión de último momento
- Al diagnosticar bugs de datos/estado, verificar el comportamiento real del código, no confiar en nombres de variables (nota 31)
- Validaciones que deben bloquear TODA escritura se colocan en el primer eslabón real de la cadena de llamadas, mapeado explícitamente, no asumido (nota 32)
- Para iconografía multiplataforma, usar SVG + dropdown propio, no emoji ni `<option>` nativo — verificar visualmente el resultado antes de dar por bueno (nota 33)

---

## 15. FLUJO DE TRABAJO — TRELLO

### Estados de las tarjetas
```
Backlog → In Progress → Done
```

### Reglas
- Al **iniciar** una US → moverla a **In Progress**
- Al **completar todos los checkboxes** → moverla a **Done**
- **Ningún checkbox ni tarjeta se marca como completado/Done solo porque Claude Code terminó de escribir el código** — requiere prueba real confirmada primero.

### El Trello no es una fuente rígida — se ajusta a la realidad del desarrollo
Ejemplo reciente: US-29 cambió de "menores de 13" a "menores de 15" en vivo, durante el demo con Dani — el checklist de Trello quedó con un desfase de redacción en un ítem (todavía decía "13" en la prueba de borde) que hay que corregir manualmente.

### Modificaciones sin número de US
Cambios pequeños y acotados pueden acordarse en el chat, documentarse en el CLAUDE.md, y ejecutarse sin tarjeta nueva de Trello. Ejemplos ya hechos así: cliente_nutricion/cliente_pilates, ajustes pre-demo (dark mode, footer, pilates sábados), idioma solo en Paso 1, banderas SVG, ventana de 12hrs de pilates.

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
git commit -m "descripción del cambio"               # inmediatamente después del deploy — nota 27
git push
```

### Notas importantes para Windows
- `&&` no funciona en PowerShell — correr comandos uno por uno
- El `.claspignore` está renombrado a `.claspignore.bak` — no revertir
- El `rootDir` en `.clasp.json` apunta a `dist/` — no cambiar
- Siempre `clasp push` antes de `clasp deploy`
- **Usar siempre el mismo `--deploymentId`** — `AKfycbwNUEjG8CXo2D5bk2eq1w6wBrme9XqJpCqOt-TkP0otTypiXd7GCEk7L7uFhdDOLCaJ`
- Si clasp push pide confirmación del manifest → usar `clasp push --force`

---

## 17. REGISTRO DE CAMBIOS (resumen — historial completo disponible en versiones anteriores de este documento)

| Fecha | Cambio |
|-------|--------|
| 07-14 jul 2026 | Sprint 1 completo. |
| 15 jul 2026 | US-19 Done (reorden pantallas, deploy v17). US-18 Done (ID flexible, deploy v18) — bug de migración por texto corregido. |
| 17 jul 2026 (mañana) | Modificación cliente_nutricion/cliente_pilates completada (deploy v20) — 3 bugs reales corregidos (appendRow/getMaxRows, datos perdidos, corrimiento de fecha). |
| 17 jul 2026 (mediodía, pre-demo) | US-16 Done (fix mes actual). Dark mode y footer eliminados. Pilates restringido a sábados 10am. Deploy v21. |
| 17 jul 2026, 3pm | **Primer demo con la dueña del producto — salió muy bien.** Dani pidió 4 ajustes en vivo: edad mínima 15 años (revisión de US-29), idioma solo en pantalla principal, banderas en el selector de idioma, y pilates con 12hrs de anticipación en vez de 48. |
| 17 jul 2026 (tarde, post-demo) | Los 4 pedidos de Dani implementados: **US-29 revisada** (edad mínima 15, doble capa frontend/backend, sin escritura si bloqueado — corregido el orden real de validación tras revisar el checklist de Trello). Idioma eliminado del Paso 3. Banderas agregadas (primera versión con emoji). Pilates: ventana mínima 12hrs. Deploy v22, 48/48 tests. |
| 17 jul 2026 (noche) | **Fix de banderas:** emoji Unicode no se veían en Windows (mostraban texto "CR"/"US") — reemplazadas por SVG reales con dropdown personalizado (Popover+Command). Corregido Costa Rica → España para español. Verificado visualmente con Playwright antes de deployar. Deploy v23, validado en testing real. **Fin de la sesión de trabajo del 17 de julio — todo lo pedido por Dani en el demo quedó implementado, probado y desplegado el mismo día.** |

---

*Última actualización: 17 julio 2026, noche — **Demo con Dani exitoso. Los 4 pedidos post-demo (edad 15 años, idioma solo Paso 1, banderas reales, pilates 12hrs) implementados, probados y desplegados (v23) el mismo día.** Pendientes de fondo de baja urgencia: fecha/fecha_clase Date-vs-texto (nota 30), lectura de fecha_nacimiento en findClientByEmail (nota 30), acceso desde móvil sin confirmar formalmente (nota 17). Acciones pendientes en Trello: verificar checklist de fin de mes en US-16, corregir texto "13→15" en checklist de US-29, mover US-29 a Done. Resto del Sprint 2 según Trello: US-11, US-12, US-13, US-14, US-20, US-28.*