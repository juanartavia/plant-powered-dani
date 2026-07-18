# CLAUDE.md — Plant Powered by Dani
## Sistema de Agendamiento Automatizado
> Documento vivo — actualizar conforme avanza el desarrollo
> Última actualización: 17 julio 2026 — **4 ajustes pre-demo validados (US-16 + 3 cambios sin número de US).** Deploy activo: v21. **Demo con la dueña del producto hoy a las 3pm.**

---

## 0. LÉEME PRIMERO — PARA EL PRÓXIMO CHAT (Sprint 2)

Si estás retomando este proyecto en un chat nuevo, este documento es tu única fuente de verdad. Antes de generar cualquier prompt para Claude Code:

1. Lee completo este documento, especialmente las secciones 11 (estado de sprints), 13 (notas técnicas — contiene lecciones aprendidas que evitan repetir bugs ya resueltos), y 14/15 (método de trabajo y reglas de Trello).
2. **Si estás retomando después del demo de hoy (17 jul, 3pm) con la dueña del producto:** revisa si el usuario tiene feedback nuevo sin documentar aquí todavía — pregunta antes de asumir que no pasó nada. Este documento no incluye ningún resultado del demo en sí, solo el trabajo hecho ANTES de él.
3. **US-19, US-18, la modificación cliente_nutricion/cliente_pilates, US-16, y 3 ajustes más sin número de US ya están Done** — ver sección 3 para el detalle completo.
4. **Pendiente de fondo, deliberadamente pospuesto (ver sección 13, nota 30):** las columnas `fecha` (Nutrición) y `fecha_clase` (Pilates) tienen el mismo problema de coerción de tipos que tenía `fecha_nacimiento` (se guardan como objeto Date real, no texto plano). Sin evidencia de bug funcional activo — el código de negocio ya usa `normalizeSheetDateCell()`. Se decidió NO tocarlo el 17 jul por el riesgo de tocar lógica ya validada bajo presión de tiempo (día del demo).
5. **Otro pendiente de fondo, sin tocar (ver sección 13, nota 30):** `findClientByEmail()` lee `fecha_nacimiento` con `TIME_ZONE` en vez de UTC — mismo patrón de bug que la escritura, pero en lectura. Bajo riesgo mientras no haya regresión.
6. **Pendiente sin validar antes del demo (ver sección 13, nota 17):** el reporte de que el link de testing no cargaba bien desde móvil sigue sin confirmarse ni resolverse. Si el usuario probó esto el 17 jul antes del demo, revisar si hay nota nueva al respecto.
7. El resto del Sprint 2 según el tablero real de Trello (ver sección 11): US-11, US-12, US-13, US-14, US-20, US-28, US-29 — todas en Backlog.
8. **Antes de tocar US-11/US-12/US-28**, el usuario tiene carpetas descargadas de Drive (branding/colores, comunicaciones/plantillas de correo, gráficos de Dani) que subirá al repo en una carpeta `design-reference/` separada de `backend/`/`frontend/` cuando lleguemos a esas tarjetas — no asumir que ya están ahí sin confirmar.
9. Sigue el mismo flujo de trabajo documentado en la sección 14: generar prompt → Claude Code ejecuta → **commit inmediato tras deploy exitoso** (nota 27) → probar en real antes de marcar cualquier checkbox → actualizar este documento.
10. **Lecciones reforzadas el 15-17 jul (ver sección 13, notas 28-31):** (a) migraciones de schema por POSICIÓN de columna, nunca por texto; (b) fechas sin componente horario (fecha_nacimiento) siempre en UTC, fechas/horas de eventos reales siempre en TIME_ZONE; (c) reparaciones de datos reales se verifican línea por línea contra valores originales, no solo "no truena"; (d) cualquier operación de rango masivo sobre una pestaña se acota a `getLastRow()`/`getLastColumn()`, nunca a los límites por defecto del Sheet; (e) bajo presión de tiempo (demo), preferir posponer cambios a lógica ya validada en vez de arriesgar una regresión de último momento.

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

### ⚠️ Asimetría intencional: cancelar vs. reagendar con menos de 24hrs ✅ CONFIRMADO Y VALIDADO (US-06, 14 jul)
| Acción | Con <24hrs de anticipación |
|--------|------------------------------|
| **Cancelar** | Siempre se permite. Se marca como tardía, pero la cita SÍ se cancela y el slot se libera. |
| **Reagendar** | Se BLOQUEA por completo (error `VENTANA_REAGENDAMIENTO_VENCIDA`). La cita no se mueve. |

**Por qué:** cancelar libera el horario (beneficia a todos, incluso tarde); permitir reagendar tarde podría usarse para mover la cita repetidamente sin consecuencia. Confirmado con el equipo, sin cambios solicitados.

### Ventana de agendamiento ✅ CONFIRMADO
- **Máximo 8 semanas (56 días)** de anticipación para agendar
- **Mínimo 48 horas** de anticipación — la ventana se calcula por hora exacta, no por día calendario completo.

### Formulario del cliente ✅ CONFIRMADO (actualizado 15 jul — US-17, US-27, US-18)
Nombre y apellido en campos **separados**. Campos exactos (en orden): Nombre, Apellido, Correo, Teléfono, Tipo de identificación (dropdown) + Número de identificación (texto), Fecha de nacimiento, Idioma (ES/EN), Modalidad (solo initial/followup).

> ⚠️ **Sin campo de notas** — eliminado para mantener el proceso simple.

### Campo de ID flexible ✅ IMPLEMENTADO Y VALIDADO (US-18, 15 jul)
Dropdown de 4 opciones fijas, traducido, con valor interno consistente sin importar idioma:

| Se muestra ES | Se muestra EN | Valor guardado (fijo) |
|----------------|-----------------|--------------------------|
| Cédula | ID Card | `cedula` |
| Pasaporte | Passport | `pasaporte` |
| Licencia de conducir | Driver's License | `licencia` |
| Otro | Other | `otro` |

Más "Número de identificación" — texto libre alfanumérico. Schema: `cedula` → `tipo_id` + `numero_id` en Nutrición, Pilates y Clientes.

### Flujo del formulario en 3 pasos ✅ REORDENADO Y VALIDADO (US-19, 15 jul)
**Calendario → Correo → Datos.** Paso 1: elige fecha/hora (idioma/zona horaria aquí). Paso 2: correo, busca en "Clientes". Paso 3: datos precargados o vacíos + resumen fijo del horario, lock/conflict-check real al confirmar. Si el slot se ocupa a mitad de flujo: regresa al Paso 1 con calendario refrescado y correo/datos preservados.

### Servicios del cliente en pestaña "Clientes" ✅ IMPLEMENTADO Y VALIDADO (modificación sin número de US, 17 jul)
Columnas `cliente_nutricion`/`cliente_pilates` (checkbox real, posiciones K/L en "Clientes"). Lógica OR-acumulativa: al agendar, se marca TRUE solo la columna del servicio correspondiente; la otra NUNCA se pone en FALSE si ya estaba en TRUE. Deploy v20.

**Tres bugs reales encontrados y corregidos en el camino** (ver sección 13, notas 28-30 para el detalle técnico): (1) migración con `getMaxRows()` en vez de `getLastRow()` corrompió la inserción de clientes nuevos vía `appendRow()`; (2) datos corrompidos reparados con función de un solo uso; (3) corrimiento de fecha ±1 día por mezclar TIME_ZONE con UTC, reparado y validado línea por línea.

### Ajustes pre-demo ✅ IMPLEMENTADOS Y VALIDADOS (17 jul, deploy v21)
Cuatro cambios hechos el mismo día del primer demo con la dueña del producto, con precaución reforzada dado el poco margen de tiempo para probar:

**1. US-16 — Calendario abre en el mes actual, no saltado a meses futuros.** Causa raíz: un `useEffect` en `calendar-picker.tsx` hacía `setCurrentMonth(firstTimeslot)` tomando el slot con `.sort().reverse()[0]` — que pese al nombre de la variable (`firstTimeslot`) tomaba el ÚLTIMO slot del arreglo, no el primero, saltando el calendario a meses lejanos (visto en producción: abría septiembre estando en julio). No era un problema de `fetchAvailability` devolviendo datos mal — era la lógica de selección de mes en el frontend. **Fix:** se eliminó el efecto por completo; `currentMonth` se inicializa una sola vez en `new Date()` (hoy) y solo cambia por navegación manual o selección explícita de fecha.

**2. Dark mode eliminado — solo light mode.** Se quitaron los 2 `<ModeToggle>` de `calendar-picker.tsx`, y `theme-provider.tsx` se simplificó para no leer `localStorage` ni `prefers-color-scheme` del sistema operativo — el tema queda fijo en `"light"` (pasado como `defaultTheme` desde `App.tsx`), aplicado explícitamente vía `classList.add("light")` en un `useEffect` simple, sin ninguna rama condicional de sistema. Confirmado que esto NO depende de que el sistema operativo del cliente esté en modo claro — se fuerza sin importar esa preferencia.

**3. Pie de página "made by @rbbydotdev" eliminado.** Vivía en `App.tsx` (no era un componente Footer separado) — remanente del repo base (Someday) del que se hizo fork. Eliminado del todo.

**4. Pilates restringido a sábados 10:00 AM únicamente.** Confirmado en negocio desde `Preguntas_Reunion_02-07-2026` (P16/P21) y la minuta del 2 jul: horario actual de pilates es solo sábados 10am (con posibilidad de agregar más horarios en el futuro, no implementado todavía). **Implementación:** en `backend/src/app.ts`, dentro de `fetchAvailability()`, se agregó una restricción específica al branch `type === "pilates"` (nuevas constantes `PILATES_DAY_OF_WEEK=6`, `PILATES_START_HOUR=10`) que descarta cualquier slot que no sea sábado a las 10:00 exactas. **Importante:** NO se tocaron las constantes globales `WORKDAYS`/`WORKHOURS` (siguen aplicando igual a nutrición) — la restricción es específica del tipo de cita, dentro del loop, no un cambio de configuración global. El frontend no tiene lógica propia de filtrado de día/hora — confía 100% en lo que devuelve el backend, así que no hizo falta duplicar la restricción ahí.

**Validado en testing real, los 4 cambios, contra deploy v21:** calendario abre en mes actual en los 4 tipos de cita; sin botón de tema en ninguna pantalla; sin pie de página; en `?type=pilates` solo sábados son clicables y el único horario es 10:00 AM; los demás 3 tipos de cita (initial/followup/measurement) siguen funcionando sin restricción de día. Test-harness: 37/37 sin regresiones tras el cambio de `fetchAvailability`.

### Zona horaria ✅ CONFIRMADO
Sistema maneja múltiples zonas horarias (incluye EEUU). Horarios en hora local del cliente; eventos en Calendar se crean en hora de Costa Rica.

### Idioma ✅ IMPLEMENTADO
Selector ES/EN desde la primera pantalla (Paso 1 tras US-19). Al cambiar, toda la interfaz cambia. Se guarda en el Sheet → determina idioma de correos automáticos.

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
| Tipo | ?type= | Duración | Modalidad | Formato | Horario | Máx. participantes |
|------|--------|----------|-----------|---------|---------|-------------------|
| Clase de pilates | `pilates` | 60 min | Virtual únicamente | **Grupal** | Sábados 10 AM | **5 personas** |

#### Detalles importantes de pilates:
- **Grupal** → un slot puede tener múltiples clientes hasta el límite
- Si la clase está llena (5/5), el sistema **bloquea automáticamente** nuevas inscripciones ✅
- Clases privadas one-on-one: **fuera de la app**
- Recordatorios salen desde el **correo de la instructora**
- ✅ **Resuelto el 17 jul:** restricción real de sábados 10am implementada directamente en `fetchAvailability` (ver sección 3, "Ajustes pre-demo").
- ⚠️ **Pendiente para Sprint 3:** `WORKDAYS`/`WORKHOURS` genéricos siguen sin reflejar el horario real completo de Dani para nutrición (martes–sábado, 7–19 entre semana / 7–14 sábado, cerrado domingo-lunes, no último sábado del mes). Este pendiente es distinto y separado del de pilates, que ya quedó resuelto. Ver sección 13, nota 14.
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
   idioma/zona horaria ahí), selecciona fecha y hora dentro de la ventana 
   permitida (48hrs-8sem)
3. Paso 2: cliente ingresa su correo → sistema busca en pestaña "Clientes"
4. Paso 3: formulario precargado o vacío según exista el correo (incluye 
   dropdown de tipo_id + campo numero_id), con resumen fijo del horario 
   elegido en Paso 1 → upsert en "Clientes" al enviar (marca cliente_nutricion=TRUE,
   conserva cliente_pilates si ya estaba TRUE)
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
   habilitados, y el único horario visible es 10:00 AM (restricción real 
   desde el 17 jul, aplicada en fetchAvailability)
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
Busca por TOKEN. <24hrs bloquea con `VENTANA_REAGENDAMIENTO_VENCIDA` + incrementa contador de tardías. ≥24hrs valida el nuevo horario igual que `bookTimeslot`. Actualiza Sheet, mueve el evento real de Calendar. Frontend real: pendiente (RF-2.6).

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

> ⚠️ **Pendiente de fondo (nota 30):** `fecha` aquí tiene el mismo problema de coerción de tipos que tenía `fecha_nacimiento` — se guarda como objeto Date real, no texto plano. Deliberadamente NO tocado (día del demo). Sin evidencia de bug funcional activo, ya que el código de negocio usa `normalizeSheetDateCell()`.

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

`cliente_nutricion`/`cliente_pilates` (K, L) — checkbox real, lógica OR-acumulativa. **Validado y funcionando desde v20.**

`fecha_nacimiento` (G) — **✅ confirmado como texto plano, en UTC.** `upsertClient()` fuerza `setNumberFormat("@")` ANTES de escribir en ambos paths (insertar/actualizar).

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
| RF-1.4 | Sin cuenta de Google — portal público por link con token | ✅ (⚠️ nota 17 — móvil sin confirmar) |
| RF-1.5 | Datos en Sheets. Pilates: también actualizar contador en Cupos_Pilates | ✅ US-05 |
| RF-1.6 | Calendario abre en el mes actual por defecto | ✅ **Done — US-16, 17 jul** |
| RF-1.11 | Correo como identificador único — flujo de 3 pasos | ✅ US-27, orden US-19 |
| RF-1.12 | Ventana mínima de 48 horas + verificación de conflictos con lock | ✅ US-09 |
| RF-1.13 | Creación de evento de Calendar; Meet real; evento único pilates; calendario dedicado | ✅ US-10 |
| RF-1.14 | Reagendar/cancelar por token; asimetría 24hrs; tracker de tardías | ✅ US-06 — falta frontend |
| RF-1.8 | Ventana máxima: 56 días | ✅ |
| RF-1.9 | Horarios en zona horaria del cliente | ✅ US-08 |
| RF-1.10 | Selector de idioma ES/EN desde primera pantalla | ✅ |
| RF-1.15 | Campo de ID flexible, valor interno consistente | ✅ US-18 |
| RF-1.16 | cliente_nutricion/cliente_pilates, OR-acumulativo | ✅ 17 jul |
| RF-1.17 (nuevo) | Disponibilidad de pilates restringida a sábados 10am | ✅ **Done — 17 jul** |
| RF-1.18 (nuevo) | Solo light mode, sin toggle de tema | ✅ **Done — 17 jul** |
| RF-1.19 (nuevo) | Sin atribución al repo base (footer "made by @rbbydotdev") | ✅ **Done — 17 jul** |

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
DAYS_IN_ADVANCE = 56                   // 8 semanas
MIN_BOOKING_HOURS = 48                 // ✅ US-09
CANCELLATION_HOURS = 24               // ✅ US-06
MAX_PILATES_PARTICIPANTS = 5
PILATES_CALENDAR_ID                   // Script Property — calendario dedicado de pilates (US-10)
PILATES_DAY_OF_WEEK = 6                // ✅ 17 jul, sábado (0=domingo)
PILATES_START_HOUR = 10                // ✅ 17 jul, 10:00 AM exacto — único horario de pilates
TIPO_ID_VALUES = ["cedula", "pasaporte", "licencia", "otro"]  // ✅ US-18, valores internos fijos
CEDULA_COLUMN_BY_SHEET = { "Nutrición": 6, "Pilates": 6, "Clientes": 5 }  // ✅ US-18
CLIENTES_NUTRICION_COL = 11           // ✅ 17 jul, posición K
CLIENTES_PILATES_COL = 12             // ✅ 17 jul, posición L
CLIENTES_FECHA_NACIMIENTO_COL = 7     // ✅ 17 jul, posición G
```

> ⚠️ **Regla de zona horaria para fechas (nota #30):** `fecha_nacimiento` (sin componente horario real) SIEMPRE usa `UTC`. `fecha`/`hora` de citas reales usan `TIME_ZONE`. Mezclarlas produce un corrimiento de ±1 día silencioso (ver nota #29).

> ⚠️ **Restricción de pilates es específica del `type`, no una constante global** — `WORKDAYS`/`WORKHOURS` siguen aplicando igual a nutrición; `PILATES_DAY_OF_WEEK`/`PILATES_START_HOUR` solo se evalúan dentro del branch `type === "pilates"` en `fetchAvailability()`.

### Firma actual de funciones en backend (al cierre del 17 jul, deploy v21)
```typescript
getDurationForType(type: string): number
fetchAvailability(type: string): { timeslots: string[], durationMinutes: number }
// ✅ 17 jul: branch type === "pilates" ahora descarta cualquier slot que no sea 
// sábado (getDay() !== 6) o que no sea exactamente las 10:00 (getHours()/getMinutes()). 
// WORKDAYS/WORKHOURS globales no se tocaron — nutrición no se vio afectada.

bookTimeslot(type, timeslot, nombre, apellido, email, phone, tipoId, numeroId, birthdate, language, modalidad, clientTimezone): string

findBookingByToken(token: string): { sheet, row, data }
rescheduleBooking(token, newTimeslot, clientTimezone): string
cancelBooking(token: string): { lateCancellation: boolean }

incrementClientLateCancellation(correo) / resetClientLateCancellationCounter(correo)
getClientPaymentStatus(correo): { cancelaciones_tardias, requiere_pago }
notifyLateCancellation(...) // STUB con TODO — implementar de verdad en Sprint 2

upsertClient(data: ClientRecord, type: string): void
// Busca explícitamente la primera fila con columna A (correo) vacía para insertar — 
// ya NO usa appendRow()/getLastRow() ciego. Aplica setNumberFormat("@") a 
// fecha_nacimiento ANTES de escribir, usando UTC. Aplica OR-acumulativo a 
// cliente_nutricion/cliente_pilates según el "type" recibido.

findClientByEmail(correo: string): ClientRecord | null
// ⚠️ Lee fecha_nacimiento con TIME_ZONE (no UTC) — pendiente de fondo, nota #30.

migrateCedulaToTipoNumeroId(): void               // ✅ US-18, por posición
addServicioColumnsToClientes(): void              // ✅ 17 jul, corregida (getLastRow, no getMaxRows)
cleanupCorruptedClientesSheet(): void             // ✅ función de un solo uso, ya ejecutada
correctOffByOneDayBirthdates(): void              // ✅ función de un solo uso, ya ejecutada
fixFechaNacimientoFormatInClientes(): void        // ✅ función de un solo uso, ya ejecutada
addCancelacionesColumnsToClientes(): void         // ✅ ejecutada manualmente 13 jul
addEventIdColumnToNutricion(): void               // ✅ ejecutada manualmente 13 jul
addEventIdColumnToCuposPilates(): void            // ✅ ejecutada manualmente 13 jul
setupPilatesTestCalendar(): void                  // ✅ ejecutada manualmente 13 jul, idempotente
initializeSheets(): void                           // ✅ ejecutada, NO volver a correr
addClientesSheet(): void                           // ✅ ejecutada manualmente 12 jul
getSheet(sheetName: string): GoogleAppsScript.Spreadsheet.Sheet
getPilatesCalendarId(): string
```

### Frontend — cambios del 17 jul
```typescript
// frontend/src/components/calendar-picker.tsx
// - Eliminado el useEffect que auto-seleccionaba currentMonth desde el slot 
//   "firstTimeslot" (que en realidad tomaba el ÚLTIMO por .sort().reverse()[0]). 
//   currentMonth ahora solo se inicializa una vez en new Date() y cambia solo 
//   por navegación manual o selección explícita de fecha.
// - Eliminados ambos <ModeToggle /> (mobile y desktop) y su import.

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

> **Nota frontend general:** no hay componentes de paso separados en archivos individuales — `EmailStep`, `ContactForm` y `CalendarTimeslotPicker` son funciones dentro de `calendar-picker.tsx`, junto con el orquestador `CalendarPicker`. El frontend no tiene lógica propia de filtrado de día/hora para pilates — confía 100% en lo que devuelve `fetchAvailability`.

> **Nota test-harness:** `backend/test-harness/` — 37 aserciones, todas pasando al cierre del 17 jul (incluyendo después del cambio de `fetchAvailability` para pilates). **Punto ciego conocido:** el mock no simula `insertCheckboxes()`/`getMaxRows()`/`appendRow()` sobre un Sheet con miles de filas — ese tipo de bug solo se encuentra en testing real.

---

## 11. SPRINTS Y ESTADO ACTUAL

### Sprint 1 (3–9 Jul, extendido hasta 14 Jul) — Setup + Portal base — ✅ **100% COMPLETO**
US-01 a US-10, US-17, US-27 — todas Done.

### Sprint 2 (Jul 14 – Jul 20) — ESP: 30 — tablero real de Trello

| US | Título | Puntos | Checklist | Estado |
|----|--------|--------|-----------|--------|
| US-19 | Cambiar orden de pantallas (Calendario→Correo→Datos) | 2 | 5/5 | ✅ Done (15 jul) — Deploy v17 |
| US-18 | Campo de ID flexible | 1 | 1/1 | ✅ Done (15 jul) — Deploy v18 |
| (sin número) | cliente_nutricion/cliente_pilates en "Clientes" | — | Validado | ✅ Done (17 jul) — Deploy v20 |
| US-16 | Fix: calendario no abre en el mes actual por defecto | 2 | 4/4 | ✅ **Done (17 jul)** — Deploy v21. Validado: mes actual, slots próximos visibles, prueba de borde de fin de mes pendiente de confirmar explícitamente por el usuario (revisar antes de marcar el 4to ítem si no se probó ese caso exacto). |
| (sin número) | Ajustes pre-demo: dark mode, footer, pilates sábados 10am | — | Validado | ✅ **Done (17 jul)** — Deploy v21 |
| US-11 | Plantillas HTML bilingües (nutrición y pilates) | 3 | 1/7 | ⏳ Backlog — necesita carpeta "Comunicaciones" de Drive |
| US-12 | Correo de confirmación inmediato al cliente | 3 | 1/8 | ⏳ Backlog — depende de US-11 |
| US-13 | Notificación interna a Secretaria | 5 | 1/6 | ⏳ Backlog |
| US-14 | Recordatorio automático 48 horas antes de la cita | 5 | 1/6 | ⏳ Backlog |
| US-20 | Generación y validación de token único por cita | 2 | 1/8 | ⏳ Backlog — revisar solapamiento con US-05/US-06 |
| US-28 | Actualizar look & feel según brandbook | 4 | 0/7 | ⏳ Backlog — necesita carpeta de branding de Drive |
| US-29 | Bloquear registro de menores de 13 años | 5 | 0/8 | ⏳ Backlog — depende de fecha_nacimiento confiable (ya reparada) |
| (sin número) | Fix fecha/fecha_clase en Nutrición/Pilates | — | — | ⏳ Pospuesto deliberadamente, ver nota 30 |
| (sin número) | Fix lectura findClientByEmail (TIME_ZONE vs UTC) | — | — | ⏳ Deuda técnica de bajo riesgo, ver nota 30 |

⚠️ **Pendiente de acción del usuario:** confirmar en Trello el checkbox #4 de US-16 ("prueba de borde: último día del mes") específicamente, y mover la tarjeta a Done si aplica — no asumido automáticamente aquí.

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
| Versión actual | **v21** |
| Repo | https://github.com/juanartavia/plant-powered-dani |
| Spreadsheet testing | https://docs.google.com/spreadsheets/d/16M6WUqMAK9XkVoIutIn9UkJojlS5biT5o470GySs5gw/edit |
| Calendario pilates (testing) | "Pilates - Testing" |
| Harness de pruebas backend | `backend/test-harness/` — 37 aserciones, todas pasando |

### ⚠️ Lección crítica de proceso — deploy vs. push (nota #25)
`clasp push` actualiza el código fuente, pero la URL pública `/exec` queda **congelada** a la versión del último `clasp deploy` sobre ese `deploymentId`. Siempre confirmar `clasp deploy` antes de dar una prueba por válida.

### Links de testing por tipo de cita (v21)
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
| v8-v16 | ≤14 jul | Sprint 1 completo (US-05, US-08, US-09, US-10, US-17, US-27, US-06) |
| v17 | 15 jul | US-19: reordenado el flujo del portal a Calendario→Correo→Datos |
| v18 | 15 jul | US-18: campo de ID flexible tipo_id + numero_id |
| v19 | 17 jul | cliente_nutricion/cliente_pilates, primera versión — contenía bug de appendRow/getMaxRows, detectado en testing real |
| v20 | 17 jul | Fix completo de v19: OR-acumulativo correcto, inserción sin appendRow ciego, fecha_nacimiento texto plano UTC |
| v21 | 17 jul | **US-16 Done** (fix mes actual). Dark mode y footer eliminados. Pilates restringido a sábados 10am. **Validado en testing real, deploy activo antes del demo con la dueña del producto (3pm).** |

---

## 13. NOTAS TÉCNICAS CRÍTICAS

1. **Todo en cuenta de testing primero** — nunca tocar cuenta real de Dani hasta Sprint 3.
2. **Pilates grupal es arquitectónicamente distinto** — usa contador en Cupos_Pilates, no slot individual.
3. **Pilates solo sábados 10am — ✅ RESUELTO el 17 jul** en `fetchAvailability` (antes era una restricción pendiente para Sprint 3).
4. **Función atómica (US-05, reforzada US-10):** si falla Sheets → no crear evento en Calendar. Si falla Calendar DESPUÉS de un Sheet exitoso → la fila NO se borra, queda `estado='Error_Calendar'`.
5. **Token UUID v4:** único identificador válido para localizar una cita — nunca el correo.
6. **Trigger 48hrs (Sprint 2):** solo disparar si estado = 'Agendada' o 'Reagendada'.
7. **Cancelaciones tardías — fuente de verdad es "Clientes", no Nutrición/Pilates.**
8. **Correos pilates** salen desde cuenta de la instructora — o Reply-To, decisión pendiente Sprint 2.
9. **Idioma del cliente** guardado en Sheet → determina idioma de correos automáticos.
10. **Cédula** ya NO es el identificador único, y desde US-18 tampoco es un campo único: `tipo_id` + `numero_id`.
11. **initializeSheets()** — UNA SOLA VEZ, ya ejecutada. NO volver a correr.
12. **Permisos en appsscript.json** — incluye spreadsheets, drive, calendar.
13. **Pilates: eventos duplicados — RESUELTO en US-10.**
14. **`WORKDAYS`/`WORKHOURS` genéricos para NUTRICIÓN (pendiente Sprint 3)** — no reflejan el horario real completo de Dani. La restricción de pilates (sábados 10am) YA quedó resuelta el 17 jul de forma independiente — esta nota ahora aplica solo a nutrición.
15. **Auditar y adaptar código heredado, no asumir que ya cumple las reglas del cliente.**
16. **Coerción de tipos en Google Sheets** — mitigación general: `normalizeSheetDateCell()` + `setNumberFormat("@")`. Patrón raíz detrás de las notas #28-30.
17. **Acceso desde móvil — pendiente investigar.** No confirmado ni resuelto al cierre del 17 jul; revisar si el usuario lo probó antes del demo de las 3pm.
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
30. **`insertCheckboxes()` sobre `getMaxRows()` en vez de `getLastRow()` corrompió silenciosamente el Sheet real (17 jul).** Regla: cualquier operación de rango masivo se acota a `getLastRow()`/`getLastColumn()` reales, nunca a los límites por defecto del Sheet. Punto ciego confirmado del test-harness: no simula estos comportamientos de la API real de Sheets sobre tamaño/rango. Pendientes de fondo derivados, pospuestos el 17 jul por presión de tiempo (día del demo): (a) mismo problema Date-vs-texto en `fecha`/`fecha_clase` de Nutrición/Pilates, sin evidencia de bug funcional activo; (b) `findClientByEmail()` lee `fecha_nacimiento` con TIME_ZONE en vez de UTC, bajo riesgo.
31. **Bug de selección de mes con nombre de variable engañoso (US-16, 17 jul).** El efecto que rompía `currentMonth` usaba una variable llamada `firstTimeslot` pero construida con `[...availableSlots.timeslots].sort().reverse()[0]` — que en realidad devuelve el ÚLTIMO elemento del arreglo ordenado, no el primero. El nombre de la variable sugería lo contrario de lo que hacía, lo que retrasó el diagnóstico hasta que se leyó la lógica real línea por línea en vez de confiar en el nombre. **Regla reforzada:** al diagnosticar un bug de datos/estado, verificar el comportamiento real del código (qué hace, no cómo se llama la variable) — nombres de variables pueden estar desactualizados o ser engañosos tras refactors sucesivos.

---

## 14. MÉTODO DE TRABAJO

### Cómo trabajamos en este proyecto
El desarrollo se divide entre dos herramientas de Claude:

**Este chat / el chat sucesor (Claude.ai — dentro del Proyecto):** cerebro — analiza cada US, genera prompts, revisa resultados, actualiza documentación y Trello.

**Claude Code (extensión en VS Code):** manos — ejecuta código, hace builds y deploys, reporta resultados.

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
- **Bajo presión de tiempo (demo, entrega), preferir posponer cambios a lógica ya validada en vez de arriesgar una regresión de último momento** — criterio aplicado el 17 jul con fecha/fecha_clase
- **Al diagnosticar bugs de datos/estado, verificar el comportamiento real del código, no confiar en nombres de variables** (nota 31)

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

### Modificaciones sin número de US
Cambios pequeños y acotados pueden acordarse en el chat, documentarse en el CLAUDE.md, y ejecutarse sin tarjeta nueva de Trello — siempre que queden igual de bien documentados que una US formal. Ejemplos ya hechos así: cliente_nutricion/cliente_pilates, ajustes pre-demo (dark mode, footer, pilates sábados).

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
| 07-14 jul 2026 | Sprint 1 completo: setup, schema, agendamiento, zona horaria, conflict-check, Meet, reagendar/cancelar. |
| 15 jul 2026 | **US-19 Done** (reorden Calendario→Correo→Datos, deploy v17). **US-18 Done** (ID flexible, deploy v18) — bug de migración por texto encontrado y corregido. |
| 17 jul 2026 (mañana) | **Modificación cliente_nutricion/cliente_pilates completada (deploy v20).** Tres bugs reales encontrados y corregidos: appendRow/getMaxRows corrompiendo inserciones, datos perdidos reparados, corrimiento de fecha ±1 día reparado y validado línea por línea. |
| 17 jul 2026 (mediodía) | **US-16 Done** (fix mes actual, causa raíz: variable mal nombrada que tomaba el último slot en vez del primero). **3 ajustes más sin número de US:** dark mode eliminado (solo light), footer "made by @rbbydotdev" eliminado, pilates restringido a sábados 10am directamente en `fetchAvailability` (sin tocar WORKDAYS/WORKHOURS globales de nutrición). Deploy v21. Validado en testing real los 4 cambios juntos. Harness 37/37 sin regresiones. **Primer demo con la dueña del producto: hoy a las 3pm.** Decisión: no abrir trabajo nuevo en las 3 horas previas al demo — usar el tiempo para ensayo del flujo completo y verificar acceso desde móvil (nota 17, aún sin confirmar). |

---

*Última actualización: 17 julio 2026 — **US-16 Done + 3 ajustes pre-demo (dark mode, footer, pilates sábados 10am), todo validado en testing real.** Deploy activo: v21. **Demo con la dueña del producto hoy a las 3pm** — sin cambios de código adicionales planeados antes de esa hora. Pendientes de fondo pospuestos deliberadamente: fecha/fecha_clase en Nutrición/Pilates (nota 30), lectura de fecha_nacimiento en findClientByEmail (nota 30), acceso desde móvil sin confirmar (nota 17). Resto del Sprint 2 pendiente según Trello: US-11, US-12, US-13, US-14, US-20, US-28, US-29.*