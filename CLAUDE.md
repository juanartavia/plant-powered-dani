# CLAUDE.md — Plant Powered by Dani
## Sistema de Agendamiento Automatizado
> Documento vivo — actualizar conforme avanza el desarrollo
> Última actualización: 8 julio 2026 — Sprint 1 en progreso

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

### Política de cancelación y reagendamiento ✅ CONFIRMADO
- **Tiempo mínimo para cancelar/reagendar: 24 horas de anticipación**
- Si el cliente cancela con menos de 24 hrs → sistema envía notificación automática a Dani y a Ali
- Tras **2 cancelaciones consecutivas** fuera de la ventana → el cliente debe pagar para poder reagendar
  - Requiere una **"lista negra interna"** gestionada por Dani en el Sheet
  - El sistema trackea el conteo de cancelaciones tardías por cliente (identificado por correo)

### Ventana de agendamiento ✅ CONFIRMADO
- **Máximo 8 semanas (56 días) de anticipación** para agendar
- El portal solo muestra disponibilidad dentro de ese rango

### Formulario del cliente ✅ CONFIRMADO
Campos exactos requeridos (en este orden):
1. Nombre y apellido
2. Correo electrónico
3. Número de teléfono
4. Cédula *(identificador único del cliente)*
5. Fecha de nacimiento
6. Idioma (ES/EN) *(sincronizado con el selector global de idioma)*
7. Modalidad *(solo para initial y followup — automático para los demás)*

> ⚠️ **Sin campo de notas** — eliminado para mantener el proceso simple.

### Zona horaria ✅ CONFIRMADO
- El sistema debe manejar múltiples zonas horarias, incluyendo Estados Unidos
- Los horarios se muestran en la hora local del cliente
- Los eventos en Calendar se crean en hora de Costa Rica

### Idioma ✅ IMPLEMENTADO
- Selector de idioma (ES/EN) visible desde la primera pantalla, al lado del selector de zona horaria
- Al cambiar idioma, TODA la interfaz cambia (títulos, labels, botones, fechas)
- El idioma seleccionado se guarda en el Sheet → los correos automáticos se envían en el idioma del cliente

---

## 4. TIPOS DE CITA — TODOS CONFIRMADOS

### Nutrición (flujo Dani)
| Tipo | ?type= | Duración | Modalidad |
|------|--------|----------|-----------|
| Consulta inicial | `initial` | 60 min | Presencial o virtual |
| Cita de seguimiento | `followup` | 45 min | Presencial o virtual |
| Solo medición | `measurement` | 15 min | Solo presencial |

### Pilates (flujo instructora — completamente independiente) ✅ CONFIRMADO
| Tipo | ?type= | Duración | Modalidad | Formato | Horario | Máx. participantes |
|------|--------|----------|-----------|---------|---------|-------------------|
| Clase de pilates | `pilates` | 60 min | Virtual únicamente | **Grupal** | Sábados 10 AM | **5 personas** |

#### Detalles importantes de pilates:
- **Grupal** → lógica diferente a nutrición: un slot puede tener múltiples clientes hasta el límite
- Si la clase está llena (5/5), el sistema **bloquea automáticamente** nuevas inscripciones
- Sistema construido para escalar a más horarios en el futuro
- Clases privadas one-on-one: **fuera de la app**
- Recordatorios salen desde el **correo de la instructora**
- ⚠️ La lógica de solo sábados se implementa en Sprint 3

---

## 5. MODELO DE DISTRIBUCIÓN DE LINKS

```
?type=initial       → Consulta inicial (60 min, nutrición, Dani)
?type=followup      → Cita de seguimiento (45 min, nutrición, Dani)
?type=measurement   → Solo medición (15 min, nutrición, solo presencial, Dani)
?type=pilates       → Clase grupal (60 min, virtual, instructora, sáb 10 AM, máx 5)
```

Cada `?type=` determina automáticamente: duración, calendario destino, plantilla de correo, Sheet destino y lógica de disponibilidad.

---

## 6. ACTORES DEL SISTEMA

| Actor | Rol |
|-------|-----|
| **Dani** | Admin/nutricionista. Bloquea disponibilidad en su Calendar. Marca show/no-show en Sheet. |
| **Ali (secretaria)** | Distribuye links correctos a cada cliente por WhatsApp. También Dani puede distribuirlos. |
| **Instructora de pilates** | Calendar y correo propios. Los recordatorios de pilates salen desde su cuenta. |
| **Cliente (ES/EN)** | Agenda, reagenda o cancela vía link. Sin cuenta de Google. Puede ser de CR o EEUU. |
| **Google Apps Script** | Motor de automatización: crea eventos, envía correos, ejecuta triggers, escribe en Sheets. |

---

## 7. FLUJOS COMPLETOS

### Flujo principal — Agendar cita de nutrición
```
1. Ali o Dani comparte link ?type=initial/followup/measurement por WhatsApp
2. Cliente accede → selecciona idioma (ES/EN) → ve disponibilidad en tiempo real en su hora local
3. Selecciona fecha y hora disponible
4. Llena formulario: nombre+apellido, correo, teléfono, cédula, fecha de nacimiento, idioma, modalidad
5. Apps Script verifica que el slot siga disponible (lock)
6. Crea evento en Calendar de Dani + genera Meet si es virtual
7. Escribe fila en Sheet de Nutrición con token UUID v4, estado='Agendada'
8. Envía correo de confirmación al cliente (en su idioma, con link único reagendar/cancelar)
9. Envía notificación interna a Dani
10. Trigger: 48 hrs antes → correo recordatorio al cliente (en su idioma)
11. Cita se realiza → Dani marca show/no-show en Sheet
```

### Flujo pilates — Inscripción a clase grupal
```
1. Ali o Dani comparte link ?type=pilates
2. Cliente selecciona idioma → ve disponibilidad de sábados con cupos
3. Si hay cupo: cliente llena formulario
4. Apps Script verifica cupo en Sheet Cupos_Pilates
5. Si cupo < 5: inscribe, incrementa contador, crea evento en Calendar instructora
6. Si cupo = 5: muestra "clase llena", no permite inscribir
7. Envía correo de confirmación (desde cuenta instructora, en idioma del cliente)
8. Notificación interna a instructora
9. Trigger: 48 hrs antes → recordatorio (desde cuenta instructora)
10. Clase se realiza → instructora marca show/no-show
```

### Flujo reagendamiento
```
1. Cliente clic en link de reagendamiento (token en URL)
2. Sistema valida token + valida que faltan más de 24 hrs
3. Si < 24 hrs: bloquea, notifica a Dani/Ali, incrementa contador cancelaciones tardías
4. Si ≥ 24 hrs: muestra disponibilidad actualizada
5. Cliente selecciona nuevo slot
6. Evento se actualiza en Calendar, Sheet actualizado: estado='Reagendada'
7. Correo confirmación de reagendamiento + notificación interna
```

### Flujo cancelación
```
1. Cliente clic en link de cancelación (token en URL)
2. Sistema valida token + valida 24 hrs de anticipación
3. Si < 24 hrs: notificación a Dani y Ali, registra cancelación tardía
   → Si es la 2da consecutiva: flag requiere_pago=true en Sheet
4. Si ≥ 24 hrs: confirmación de cancelación
5. Evento eliminado de Calendar (slot queda libre)
6. Sheet actualizado: estado='Cancelada'
7. Correo confirmación al cliente + notificación interna
```

---

## 8. SCHEMA DE GOOGLE SHEETS

### Spreadsheet de testing
- **Nombre:** PlantPoweredDani - Base de Datos (Testing)
- **ID:** 16M6WUqMAK9XkVoIutIn9UkJojlS5biT5o470GySs5gw
- **URL:** https://docs.google.com/spreadsheets/d/16M6WUqMAK9XkVoIutIn9UkJojlS5biT5o470GySs5gw/edit
- **SPREADSHEET_ID** guardado en Script Properties del proyecto

### Pestaña "Nutrición"
```
token | nombre_apellido | correo | telefono | cedula | fecha_nacimiento |
tipo_cita | fecha | hora | zona_horaria_cliente | modalidad | idioma |
meet_link | estado | fecha_creacion | recordatorio_enviado | show_no_show |
cancelaciones_tardias | requiere_pago
```

### Pestaña "Pilates"
```
token | nombre_apellido | correo | telefono | cedula | fecha_nacimiento |
fecha_clase | hora_clase | zona_horaria_cliente | idioma |
estado | fecha_inscripcion | recordatorio_enviado | show_no_show
```

### Pestaña "Cupos_Pilates"
```
fecha_clase | hora_clase | inscritos | max_participantes
```

**Estados posibles:** `Agendada` → `Reagendada` → `Cancelada`

---

## 9. REQUERIMIENTOS FUNCIONALES

### RF-1 — Portal de Agendamiento
| ID | Requerimiento | Estado |
|----|--------------|--------|
| RF-1.1 | Cliente accede por link ?type= y ve disponibilidad en tiempo real | ✅ |
| RF-1.2 | Duración automática por tipo. Pilates: lógica de cupos grupales (máx 5) | ✅ |
| RF-1.3 | Formulario: nombre+apellido, correo, teléfono, cédula, fecha de nacimiento, idioma, modalidad | ✅ |
| RF-1.4 | Sin cuenta de Google — portal público por link con token | ✅ |
| RF-1.5 | Datos en Sheets. Pilates: también actualizar contador en Cupos_Pilates | ⏳ Pendiente US-05 |
| RF-1.6 | Reagendamiento: política 24 hrs. Bloqueo + notificación a Dani/Ali | ⏳ Pendiente US-06 |
| RF-1.7 | Cancelación: política 24 hrs. Tracker tardías. Flag requiere_pago tras 2 tardías | ⏳ Pendiente US-06 |
| RF-1.8 | Ventana máxima de agendamiento: 56 días (8 semanas) | ✅ |
| RF-1.9 | Horarios en zona horaria del cliente. Evento creado en hora CR. | ✅ |
| RF-1.10 | Selector de idioma ES/EN desde primera pantalla — cambia toda la interfaz | ✅ |

### RF-2 — Correos y Automatizaciones
| ID | Requerimiento | Estado |
|----|--------------|--------|
| RF-2.1 | Correo de confirmación inmediato (en idioma del cliente, link reagendar/cancelar, Meet si virtual) | ⏳ Pendiente Sprint 2 |
| RF-2.2 | Correos de nutrición desde cuenta Dani. Correos de pilates desde cuenta instructora. | ⏳ Pendiente Sprint 2 |
| RF-2.3 | Notificación interna a Dani o instructora en cada acción | ⏳ Pendiente Sprint 2 |
| RF-2.4 | Recordatorio 48 hrs antes. Solo si estado='Agendada' o 'Reagendada'. | ⏳ Pendiente Sprint 2 |
| RF-2.5 | Notificación a Dani y Ali si cancelación/reagendamiento fuera de ventana | ⏳ Pendiente Sprint 2 |

---

## 10. STACK TÉCNICO

### Base del proyecto
- **Repo:** https://github.com/juanartavia/plant-powered-dani
- **Repo original (Someday):** https://github.com/rbbydotdev/someday.git

| Capa | Tecnología |
|------|-----------|
| Frontend | React + TypeScript + Vite + Shadcn/UI + Tailwind |
| Backend | Google Apps Script (TypeScript con clasp) |
| Calendario | Google Calendar API |
| Correo | GmailApp (Apps Script) |
| Base de datos | Google Sheets (un archivo, pestañas separadas) |
| Triggers | Time-based triggers (Apps Script) |
| Deploy | clasp (CLI de Google) |

### Variables en `backend/src/app.ts`
```typescript
TIME_ZONE = "America/Costa_Rica"       // ✅ configurado
WORKDAYS = [1,2,3,4,5,6]              // ✅ lunes a sábado
WORKHOURS = { start: 7, end: 20 }     // ✅ horario amplio
DAYS_IN_ADVANCE = 56                   // ✅ 8 semanas
CANCELLATION_HOURS = 24               // ⏳ pendiente implementar
MAX_PILATES_PARTICIPANTS = 5          // ⏳ pendiente implementar
```

### Firma actual de funciones en backend
```typescript
getDurationForType(type: string): number
fetchAvailability(type: string): { timeslots: string[], durationMinutes: number }
bookTimeslot(type, timeslot, name, email, phone, cedula, birthdate, language, modalidad): string
initializeSheets(): void                    // ✅ ejecutar manualmente en Apps Script
getSheet(sheetName: string): GoogleAppsScript.Spreadsheet.Sheet
```

---

## 11. SPRINTS Y ESTADO ACTUAL

### Sprint 1 (3–9 Jul) — Setup + Portal base

| US | Título | Estado |
|----|--------|--------|
| US-01 | Fork de Someday y setup del entorno de testing | ✅ Done |
| US-02 | Configuración de calendarios y horarios por tipo de cita | ✅ Done |
| US-03 | Links separados por tipo de cita via ?type= en URL | ✅ Done |
| US-04 | Diseño e inicialización del schema de Sheets | ✅ Done |
| US-05 | Función de escritura de nueva cita en Sheet (con token UUID v4, atómica) | ⏳ Siguiente |
| US-06 | Funciones de actualización de estado (reagendar/cancelar) en Sheet | ⏳ Backlog |
| US-07 | Formulario extendido: idioma, modalidad, cédula, fecha de nacimiento | ✅ Done |
| US-08 | Detección y ajuste de zona horaria del cliente | ✅ Done |
| US-09 | Verificación de conflictos y lock antes de confirmar | ⏳ Backlog |
| US-10 | Creación de evento en Calendar y generación de Meet | ⏳ Backlog |

### Sprint 2 (10–16 Jul) — Correos + Reagendamiento/Cancelación

| US | Título | Estado |
|----|--------|--------|
| US-11 | Plantillas HTML bilingües (nutrición y pilates) | ⏳ Backlog |
| US-12 | Correo de confirmación inmediato al cliente | ⏳ Backlog |
| US-13 | Notificación interna a Dani o instructora | ⏳ Backlog |
| US-14 | Recordatorio automático 48 horas antes de la cita | ⏳ Backlog |
| US-15+ | Flujo de reagendamiento y cancelación autónoma | ⏳ Backlog |

### Sprint 3 (17–23 Jul) — Producción + Pruebas
**Epics:** Flujos independientes nutrición y pilates · Pruebas end-to-end · Paso a producción y capacitación

---

## 12. ENTORNO DE TESTING

| Dato | Valor |
|------|-------|
| Cuenta de testing | plantpoweredani.testing@gmail.com |
| Credenciales | Guardadas en Drive: AutomáTica / Plant Powered Dani / Interno |
| URL de testing activa | https://script.google.com/macros/s/AKfycbwS8OJlmos6KIEXFD9sYk2ZcHElko9Yc3481XajayeY590GRen4pxBUTp5IIgepHW3b/exec |
| Editor Apps Script | https://script.google.com/d/1cu-HdKiAmfUYOgjwtjKcE9lCO6waLfFsL71PwP4GgcdGiQWzqygPS3fK/edit |
| Versión actual | v8 |
| Repo | https://github.com/juanartavia/plant-powered-dani |
| Spreadsheet testing | https://docs.google.com/spreadsheets/d/16M6WUqMAK9XkVoIutIn9UkJojlS5biT5o470GySs5gw/edit |

### Links de testing por tipo de cita (v8)
```
Consulta Inicial (60 min)
→ https://script.google.com/macros/s/AKfycbwS8OJlmos6KIEXFD9sYk2ZcHElko9Yc3481XajayeY590GRen4pxBUTp5IIgepHW3b/exec?type=initial

Cita de Seguimiento (45 min)
→ ...exec?type=followup

Solo Medición (15 min)
→ ...exec?type=measurement

Clase de Pilates (60 min)
→ ...exec?type=pilates

Error bilingüe (link inválido)
→ ...exec  (sin ?type=)
```

---

## 13. NOTAS TÉCNICAS CRÍTICAS

1. **Todo en cuenta de testing primero** — nunca tocar cuenta real de Dani hasta Sprint 3
2. **Pilates grupal es arquitectónicamente distinto** — usa contador en Cupos_Pilates, no slot individual
3. **Pilates solo sábados** — la restricción de solo sábados a las 10 AM se implementa en Sprint 3
4. **Función atómica (US-05):** si falla Sheets → no crear evento en Calendar
5. **Token UUID v4:** columna 1 del Sheet, embebido en todos los links de correo
6. **Trigger 48hrs:** solo disparar si estado = 'Agendada' o 'Reagendada'. Marcar recordatorio_enviado para evitar duplicados
7. **Cancelaciones tardías:** tracker en columna cancelaciones_tardias. Al llegar a 2 consecutivas: flag requiere_pago=true
8. **Correos pilates** salen desde cuenta de la instructora
9. **Idioma del cliente** guardado en Sheet → determina idioma de todos los correos automáticos
10. **Cédula** es el identificador único del cliente en el sistema
11. **initializeSheets()** — función que se ejecuta UNA SOLA VEZ manualmente desde el editor de Apps Script para crear el spreadsheet. Ya fue ejecutada en testing. NO volver a ejecutar o creará un nuevo spreadsheet duplicado.
12. **Permisos en appsscript.json** — incluye spreadsheets y drive además de calendar. Si se agregan nuevas integraciones, agregar el scope correspondiente aquí.

---

## 14. MÉTODO DE TRABAJO

### Cómo trabajamos en este proyecto
El desarrollo se divide entre dos herramientas de Claude:

**Este chat (Claude.ai — dentro del Proyecto):**
- Es el cerebro — analiza cada US, toma decisiones, detecta problemas
- Genera los prompts exactos para Claude Code
- Recibe y analiza los resultados de Claude Code
- Actualiza el CLAUDE.md después de cada US completada
- Maneja documentación y decisiones de Trello

**Claude Code (extensión en VS Code):**
- Es las manos — ejecuta código, edita archivos, hace builds y deploys
- Lee este CLAUDE.md al inicio de cada prompt para tener contexto
- Reporta resultados de vuelta al chat

### Flujo por cada US
```
1. Este chat analiza la US y genera el prompt
2. Dev pega el prompt en Claude Code
3. Claude Code ejecuta los cambios
4. Dev pega la respuesta de Claude Code en este chat
5. Este chat analiza, detecta problemas, genera siguiente prompt si hace falta
6. Al terminar: deploy → verificar en navegador → marcar Trello → actualizar CLAUDE.md
```

### ⚠️ Cuándo ir al editor de Apps Script manualmente
Algunas acciones NO se pueden hacer desde código — requieren ir al editor de Apps Script:
- **Ejecutar funciones de inicialización** (como initializeSheets) — se selecciona la función en el dropdown y se le da Ejecutar
- **Autorizar permisos nuevos** — cuando el sistema pide acceso a un nuevo servicio de Google (Sheets, Drive, Gmail, etc.) → Revisar permisos → Avanzado → Ir a (no seguro) → Permitir
- **Ver logs de ejecución** — para debuggear errores, abrir Registro de ejecución

**URL del editor:** https://script.google.com/d/1cu-HdKiAmfUYOgjwtjKcE9lCO6waLfFsL71PwP4GgcdGiQWzqygPS3fK/edit

### Reglas importantes
- Claude Code siempre lee el CLAUDE.md al inicio de cada prompt
- Cada `clasp deploy` genera una URL nueva — siempre documentarla aquí
- Los comandos en Windows PowerShell van uno por uno (sin &&)
- Nunca tocar la cuenta real de Dani hasta Sprint 3
- Si hay que agregar permisos nuevos → agregar scope en dist/appsscript.json Y appsscript.json (raíz)

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

---

## 16. FLUJO DE DEPLOY EN WINDOWS (PowerShell)

Para cada actualización, correr uno por uno:

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
clasp deploy         # genera nueva URL — actualizar en CLAUDE.md
```

### Notas importantes para Windows
- `&&` no funciona en PowerShell — correr comandos uno por uno
- `deploy.sh` y `build.sh` no funcionan en Windows
- El `.claspignore` está renombrado a `.claspignore.bak` — no revertir
- El `rootDir` en `.clasp.json` apunta a `dist/` — no cambiar
- Siempre `clasp push` antes de `clasp deploy`
- Cada `clasp deploy` genera una URL nueva — documentarla aquí
- Si clasp push pide confirmación del manifest → usar `clasp push --force`

---

## 17. REGISTRO DE CAMBIOS

| Fecha | Cambio |
|-------|--------|
| 07 jul 2026 | Duración de Solo medición cambiada de 30 min a **15 min** |
| 07 jul 2026 | Selector de idioma ES/EN global implementado en frontend |
| 07 jul 2026 | Campo **cédula** agregado al formulario como identificador único |
| 08 jul 2026 | bookTimeslot actualizado: agrega cedula, elimina note |
| 08 jul 2026 | Toda la interfaz traducida ES/EN con date-fns locale |
| 08 jul 2026 | US-04: Spreadsheet creado con 3 pestañas (Nutrición, Pilates, Cupos_Pilates) |
| 08 jul 2026 | Permisos de Sheets y Drive agregados a appsscript.json |

---

*Última actualización: 8 julio 2026 — US-01, US-02, US-03, US-04, US-07, US-08 completadas. Próximo: US-05 (escritura de citas en Sheet)*