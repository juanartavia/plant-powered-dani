# CLAUDE.md — Plant Powered by Dani
## Sistema de Agendamiento Automatizado
> Documento vivo — actualizar conforme avanza el desarrollo
> Última actualización: Reunión de definición 2 julio 2026 — TODAS las decisiones pendientes resueltas

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
- **No hay landing page** — la secretaria Ali (y también Dani) distribuyen links directos por WhatsApp
- **Confirmación:** automática al agendar, sin validación manual de Dani

### Política de cancelación y reagendamiento ✅ CONFIRMADO
- **Tiempo mínimo para cancelar/reagendar: 24 horas de anticipación**
- Si el cliente cancela con menos de 24 hrs → sistema envía notificación automática a Dani y a Ali
- Tras **2 cancelaciones consecutivas** fuera de la ventana → el cliente debe pagar para poder reagendar
  - Esto requiere una **"lista negra interna"** gestionada por Dani en el Sheet
  - El sistema trackea el conteo de cancelaciones tardías por cliente (identificado por correo)

### Ventana de agendamiento ✅ CONFIRMADO
- **Máximo 8 semanas (56 días) de anticipación** para agendar
- El portal solo muestra disponibilidad dentro de ese rango

### Formulario del cliente ✅ CONFIRMADO
Campos exactos requeridos:
- Nombre y apellido
- Correo electrónico
- Número de celular *(para base de datos y seguimientos futuros por WhatsApp)*
- Fecha de nacimiento

> ⚠️ **Sin campo de notas** — eliminado para mantener el proceso simple.

### Zona horaria ✅ CONFIRMADO
- El sistema debe manejar múltiples zonas horarias, incluyendo Estados Unidos
- Los horarios se muestran en la hora local del cliente (ya soportado por Someday)
- Los eventos en Calendar se crean en hora de Costa Rica

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
- Si la clase está llena (5/5), el sistema **bloquea automáticamente** nuevas inscripciones para ese horario
- Sistema construido para escalar a más horarios (ej: sábados 10 AM y 11 AM, otros días)
- Clases privadas one-on-one: **fuera de la app**, se gestionan por otro medio
- Recordatorios salen desde el **correo de la instructora**

> ⚠️ **Cambio arquitectónico importante:** Pilates grupal requiere lógica distinta. En lugar de marcar un slot como ocupado al reservarlo, se lleva un **contador de inscritos por slot** y se bloquea solo cuando llega a 5.

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
| **Dani** | Admin/nutricionista. Bloquea disponibilidad en su Calendar. Marca show/no-show en Sheet. Gestiona lista negra de cancelaciones. |
| **Ali (secretaria)** | Distribuye links correctos a cada cliente por WhatsApp. También Dani puede distribuirlos. |
| **Instructora de pilates** | Calendar y correo propios. Los recordatorios de pilates salen desde su cuenta. |
| **Cliente (ES/EN)** | Agenda, reagenda o cancela vía link. Sin cuenta de Google. Puede ser de CR o EEUU. |
| **Google Apps Script** | Motor de automatización: crea eventos, envía correos, ejecuta triggers, escribe en Sheets, valida cupos en pilates. |

---

## 7. FLUJOS COMPLETOS

### Flujo principal — Agendar cita de nutrición
```
1. Ali o Dani comparte link ?type=initial/followup/measurement por WhatsApp
2. Cliente accede → ve disponibilidad en tiempo real en su hora local
3. Selecciona fecha y hora disponible
4. Llena formulario: nombre+apellido, correo, celular, fecha de nacimiento, idioma (ES/EN), modalidad (donde aplica)
5. Apps Script verifica que el slot siga disponible (lock)
6. Crea evento en Calendar de Dani + genera Meet si es virtual
7. Escribe fila en Sheet de Nutrición con token UUID v4, estado='Agendada'
8. Envía correo de confirmación al cliente (bilingüe, con link único reagendar/cancelar, Meet si virtual)
9. Envía notificación interna a Dani
10. Trigger: 48 hrs antes → correo recordatorio al cliente (solo si estado='Agendada' o 'Reagendada')
11. Cita se realiza → Dani marca show/no-show en Sheet
```

### Flujo pilates — Inscripción a clase grupal
```
1. Ali o Dani comparte link ?type=pilates
2. Cliente ve el slot de sábado 10 AM con disponibilidad (ej: "3/5 lugares disponibles")
3. Si hay cupo: cliente llena formulario con los mismos campos
4. Apps Script verifica cupo actual en Sheet de Pilates para ese slot
5. Si cupo < 5: inscribe al cliente, incrementa contador, crea evento en Calendar instructora
6. Si cupo = 5: muestra mensaje "clase llena" y no permite inscribir
7. Envía correo de confirmación al cliente (desde cuenta instructora)
8. Envía notificación interna a instructora
9. Trigger: 48 hrs antes → correo recordatorio (desde cuenta instructora)
10. Clase se realiza → instructora marca show/no-show en Sheet de Pilates
```

### Flujo reagendamiento (nutrición)
```
1. Cliente clic en link de reagendamiento (token en URL)
2. Sistema valida token + valida que faltan más de 24 hrs para la cita actual
3. Si < 24 hrs: muestra mensaje de política, bloquea reagendamiento, notifica a Dani/Ali, incrementa contador cancelaciones tardías
4. Si ≥ 24 hrs: muestra disponibilidad actualizada
5. Cliente selecciona nuevo slot
6. Evento se actualiza en Calendar, Sheet se actualiza: nueva fecha/hora, estado='Reagendada'
7. Correo confirmación de reagendamiento + notificación interna a Dani
```

### Flujo cancelación
```
1. Cliente clic en link de cancelación (token en URL)
2. Sistema valida token + valida 24 hrs de anticipación
3. Si < 24 hrs: notificación automática a Dani y Ali, se registra cancelación tardía
   → Si es la 2da cancelación tardía consecutiva: se activa flag en Sheet (requiere pago para reagendar)
4. Si ≥ 24 hrs: confirmación de cancelación
5. Evento eliminado de Calendar (slot queda libre)
6. Sheet actualizado: estado='Cancelada'
7. Correo confirmación de cancelación al cliente + notificación interna
```

---

## 8. SCHEMA DE GOOGLE SHEETS

### Sheet de Nutrición (pestana "Nutrición")
```
token | nombre_apellido | correo | celular | fecha_nacimiento | tipo_cita |
fecha | hora | zona_horaria_cliente | modalidad | idioma | meet_link |
estado | fecha_creacion | recordatorio_enviado | show_no_show |
cancelaciones_tardias | requiere_pago
```

### Sheet de Pilates (pestaña "Pilates")
```
token | nombre_apellido | correo | celular | fecha_nacimiento |
fecha_clase | hora_clase | zona_horaria_cliente | idioma |
estado | fecha_inscripcion | recordatorio_enviado | show_no_show
```

### Sheet de Cupos Pilates (pestaña "Cupos_Pilates")
```
fecha_clase | hora_clase | inscritos | max_participantes(5)
```
Esta pestaña es la fuente de verdad para validar disponibilidad en clases grupales.

**Estados posibles:** `Agendada` → `Reagendada` → `Cancelada`

---

## 9. REQUERIMIENTOS FUNCIONALES (actualizados post-reunión)

### RF-1 — Portal de Agendamiento
| ID | Requerimiento | Estado |
|----|--------------|--------|
| RF-1.1 | Cliente accede por link ?type= y ve disponibilidad en tiempo real | ✅ |
| RF-1.2 | Duración automática por tipo. Pilates: lógica de cupos grupales (máx 5) | ✅ |
| RF-1.3 | Formulario: nombre+apellido, correo, celular, fecha de nacimiento, idioma, modalidad (donde aplique). Sin campo notas. | ✅ |
| RF-1.4 | Sin cuenta de Google — portal público por link con token | ✅ |
| RF-1.5 | Datos en Sheets. Pilates: también actualizar contador en Cupos_Pilates | ✅ |
| RF-1.6 | Reagendamiento: política 24 hrs. Bloqueo si < 24 hrs + notificación a Dani/Ali | ✅ |
| RF-1.7 | Cancelación: política 24 hrs. Tracker de cancelaciones tardías. Flag 'requiere_pago' tras 2 tardías consecutivas | ✅ |
| RF-1.8 | Ventana máxima de agendamiento: 56 días (8 semanas) | ✅ |
| RF-1.9 | Horarios mostrados en zona horaria del cliente. Evento creado en hora CR. | ✅ |

### RF-2 — Correos y Automatizaciones
| ID | Requerimiento | Estado |
|----|--------------|--------|
| RF-2.1 | Correo de confirmación inmediato (bilingüe, link reagendar/cancelar con token, Meet si virtual) | ✅ |
| RF-2.2 | Correos de nutrición desde cuenta Dani. Correos de pilates desde cuenta instructora. | ✅ |
| RF-2.3 | Notificación interna a Dani o instructora en cada acción (agendar/reagendar/cancelar) | ✅ |
| RF-2.4 | Recordatorio 48 hrs antes. Solo si estado='Agendada' o 'Reagendada'. Marca recordatorio_enviado. | ✅ |
| RF-2.5 | Notificación a Dani y Ali cuando cliente cancela/reagenda fuera de ventana de 24 hrs | ✅ |

### RF-3 — Pilates Grupal
| ID | Requerimiento | Estado |
|----|--------------|--------|
| RF-3.1 | Validar cupo disponible en Sheet Cupos_Pilates antes de inscribir | ✅ |
| RF-3.2 | Bloquear inscripción automáticamente si clase = 5/5 | ✅ |
| RF-3.3 | Arquitectura escalable para agregar más horarios sin reescribir lógica | ✅ |

---

## 10. STACK TÉCNICO

### Base del proyecto
- **Repo original:** https://github.com/rbbydotdev/someday.git
- **Fork del equipo:** TBD — crear antes de Sprint 1

| Capa | Tecnología |
|------|-----------|
| Frontend | React + TypeScript + Vite + Shadcn/UI + Tailwind |
| Backend | Google Apps Script (TypeScript con clasp) |
| Calendario | Google Calendar API |
| Correo | GmailApp (Apps Script) |
| Base de datos | Google Sheets (un archivo, pestañas separadas) |
| Triggers | Time-based triggers (Apps Script) |
| Deploy | clasp (CLI de Google) |
| Hosting | Apps Script Web App → URL pública → Squarespace |

### Configuración de variables (backend/src/app.ts)
```typescript
TIME_ZONE = "America/Costa_Rica"
WORKDAYS   // confirmar días exactos con Dani
WORKHOURS  // confirmar horas exactas con Dani
DAYS_IN_ADVANCE = 56  // 8 semanas
TIMESLOT_DURATION  // dinámico por ?type= (60/45/30/60)
CANCELLATION_HOURS = 24  // política confirmada
MAX_PILATES_PARTICIPANTS = 5  // confirmado
```

---

## 11. ESTRUCTURA DEL REPO (Someday)

```
someday/
├── backend/
│   └── src/
│       └── app.ts       ← Backend principal (Apps Script)
│                          fetchAvailability(), bookTimeslot()
├── frontend/
│   └── src/
│       ├── App.tsx
│       ├── components/
│       │   ├── calendar-picker.tsx
│       │   └── timezone-dropdown.tsx
│       ├── hooks/
│       │   ├── useGoogleTimeslots.tsx
│       │   └── useBookGoogleTimeslot.tsx
│       ├── models/
│       │   └── Timeslots.tsx
│       └── lib/
│           └── googlelib.ts
├── appsscript.json
├── package.json         ← Scripts: deploy, build
└── deploy.sh
```

---

## 12. LO QUE HACE SOMEDAY vs. LO QUE HAY QUE CONSTRUIR

### ✅ Ya funciona en Someday
- Leer disponibilidad de Google Calendar en tiempo real
- Picker de fecha/hora con timezone del cliente
- Formulario base (nombre, email, teléfono, nota)
- Crear evento en Calendar + invitar al cliente
- Verificación de conflictos (slot individual)
- Soporte múltiples calendarios
- Detección de zona horaria del cliente

### 🔨 Hay que construir encima
1. **Parámetro ?type= en URL** → determina todo (duración, calendario, plantilla, Sheet)
2. **Formulario actualizado** → quitar nota, agregar fecha de nacimiento y celular
3. **Duración dinámica** → TIMESLOT_DURATION según ?type=
4. **Google Sheets** → escribir fila por cada booking con token UUID v4, estado inicial 'Agendada'
5. **Lógica de cupos pilates** → Sheet Cupos_Pilates, contador, bloqueo al llegar a 5
6. **Token UUID v4** → generado al agendar, embebido en links de correo
7. **Cancelación y reagendamiento** → validar token + validar 24 hrs + actualizar Calendar y Sheet
8. **Tracker cancelaciones tardías** → contador por cliente, flag requiere_pago al llegar a 2
9. **Notificación a Dani/Ali** → correo automático si cancelación/reagendamiento fuera de ventana
10. **Correos HTML bilingües** → confirmación, recordatorio 48hrs, notificación interna (2 identidades visuales)
11. **Trigger 48hrs** → time-based, condicional a estado, evitar duplicados con recordatorio_enviado
12. **Tracker show/no-show** → columna en Sheet que Dani/instructora edita directamente
13. **Ventana 56 días** → DAYS_IN_ADVANCE = 56

---

## 13. SPRINTS

### Sprint 1 (3–9 Jul) — Setup + Portal base
**Epics:** Setup/fork · Portal (Adaptación Someday) · Base de Datos

| US | Título | Dependencia | Notas |
|----|--------|-------------|-------|
| US-01 | Fork de Someday y setup del entorno de testing | — | clasp login con cuenta de testing |
| US-02 | Configuración de calendarios y horarios por ?type= | US-01 | DAYS_IN_ADVANCE=56, TIME_ZONE=CR |
| US-03 | Links separados por tipo de cita via ?type= en URL | US-01 | 4 valores: initial/followup/measurement/pilates |
| US-04 | Diseño e inicialización del schema de Sheets | — | 3 pestañas: Nutrición, Pilates, Cupos_Pilates |
| US-05 | Función de escritura de nueva cita en Sheet (atómica, con token UUID v4) | US-04 | Si falla Sheet, no se crea evento Calendar |
| US-06 | Funciones de actualización de estado en Sheet (reagendar/cancelar) | US-05 | Buscar por token, nunca borrar filas |
| US-07 | Formulario extendido: idioma, modalidad, fecha de nacimiento, celular | US-02 | Sin campo notas |
| US-08 | Detección y ajuste de zona horaria del cliente | US-07 | Ya en Someday — validar con CR como base |
| US-09 | Verificación de conflictos y lock antes de confirmar | US-08 | Para nutrición: slot individual. Pilates: contador ≤ 5 |
| US-10 | Creación de evento en Calendar de testing y generación de Meet | US-09 | Meet solo si modalidad=virtual |

### Sprint 2 (10–16 Jul) — Correos + Reagendamiento/Cancelación
**Epics:** Correos automáticos · Reagendamiento y cancelación autónoma

| US | Título | Dependencia |
|----|--------|-------------|
| US-11 | Plantillas HTML bilingües — nutrición y pilates (identidades visuales distintas) | HTMLs por Gabriela |
| US-12 | Correo de confirmación inmediato al cliente | US-11 |
| US-13 | Notificación interna a Dani o instructora | US-12 |
| US-14 | Recordatorio automático 48 hrs (trigger, condicional, evita duplicados) | US-12 |
| US-15+ | Flujo de reagendamiento: validar token, validar 24 hrs, actualizar Calendar y Sheet | Por definir |
| US-16+ | Flujo de cancelación: validar token, validar 24 hrs, tracker tardías, flag requiere_pago | Por definir |
| US-17+ | Notificación a Dani/Ali si cancelación/reagendamiento fuera de ventana | Por definir |

### Sprint 3 (17–23 Jul) — Producción + Pruebas
**Epics:** Flujos independientes nutrición y pilates · Pruebas end-to-end · Paso a producción y capacitación

| Actividad | Detalle |
|-----------|---------|
| Migrar a cuenta real de Dani | Sesión conjunta con Dani para clasp login en producción |
| Flujo nutrición en producción | Pruebas con Calendar y Gmail real de Dani |
| Flujo pilates en producción | Pruebas con Calendar y Gmail de instructora |
| Testing end-to-end | Simular todos los flujos: agendar, reagendar, cancelar, 48hrs, cupos pilates |
| Capacitación | A Dani, instructora y Ali — cómo usar el Sheet, cómo distribuir links |
| Entrega | URL final, documentación de uso, cierre |

---

## 14. ESTADO ACTUAL DEL PROYECTO

- [x] Use case y requerimientos documentados
- [x] Propuesta 1 aprobada (₡655,000)
- [x] Repo base analizado (Someday)
- [x] Sprints 1 y 2 planificados en Trello
- [x] Reunión con Dani realizada (2 jul) — todas las decisiones resueltas
- [x] Minuta de reunión documentada
- [ ] **PRÓXIMO:** Fork del repo en cuenta del equipo
- [ ] Setup clasp con cuenta de testing
- [ ] Deploy base funcionando en testing
- [ ] Sprint 1 completado
- [ ] Sprint 2 completado
- [ ] Sprint 3 completado
- [ ] Sesión de migración a producción con Dani
- [ ] Capacitación a Dani, instructora y Ali
- [ ] Entrega y cierre

---

## 15. NOTAS TÉCNICAS CRÍTICAS

1. **Todo en cuenta de testing primero** — nunca tocar cuenta real de Dani hasta Sprint 3
2. **Pilates grupal es arquitectónicamente distinto** — no usa lógica de slot individual. Usa contador en Cupos_Pilates. Esto afecta fetchAvailability() y bookTimeslot() para ?type=pilates
3. **Función atómica (US-05):** si falla la escritura en Sheets → no crear evento en Calendar (o revertirlo)
4. **Token UUID v4:** columna 1 del Sheet, embebido en todos los links de correo de confirmación
5. **Trigger 48hrs:** solo disparar si estado = 'Agendada' o 'Reagendada'. Marcar recordatorio_enviado=true para evitar duplicados
6. **Cancelaciones tardías:** identificar cliente por correo electrónico. Tracker en columna cancelaciones_tardias. Al llegar a 2 consecutivas: flag requiere_pago=true en Sheet
7. **DAYS_IN_ADVANCE = 56** (8 semanas confirmadas)
8. **Correos pilates** salen desde cuenta de la instructora — requiere que ella dé acceso a su cuenta de Google en la sesión de setup
9. **Calendarios:** se crearán nuevos para el sistema en la sesión de producción con Dani
10. **Zona horaria:** America/Costa_Rica como base. Clientes en EEUU ven horarios en su hora local (ya soportado por Someday)

---

*Última actualización: 2 julio 2026 — Post reunión con Dani. Todas las decisiones pendientes resueltas. Listo para iniciar Sprint 1.*

---

## 16. FLUJO DE TRABAJO — TRELLO

### Estados de las tarjetas
Cada historia de usuario en Trello pasa por estos estados en orden:
```
Backlog → In Progress → Done
```

### Reglas
- Al **iniciar** una US → moverla a **In Progress**
- Al **completar todos los checkboxes** de una US → moverla a **Done**
- Los checkboxes se marcan conforme se va completando cada criterio de aceptación
- Si una US bloquea a otra, no se mueve la dependiente a In Progress hasta que la anterior esté en Done

### US del Sprint 1 y su estado inicial
| US | Título | Estado |
|----|--------|--------|
| US-01 | Fork de Someday y setup del entorno de testing | ⬜ Backlog |
| US-02 | Configuración de calendarios y horarios por tipo de cita | ⬜ Backlog |
| US-03 | Links separados por tipo de cita via ?type= en URL | ⬜ Backlog |
| US-04 | Diseño e inicialización del schema de Sheets | ⬜ Backlog |
| US-05 | Función de escritura de nueva cita en Sheet | ⬜ Backlog |
| US-06 | Funciones de actualización de estado (reagendar/cancelar) | ⬜ Backlog |
| US-07 | Formulario extendido: idioma, modalidad, fecha nacimiento, celular | ⬜ Backlog |
| US-08 | Detección y ajuste de zona horaria del cliente | ⬜ Backlog |
| US-09 | Verificación de conflictos y lock antes de confirmar | ⬜ Backlog |
| US-10 | Creación de evento en Calendar y generación de Meet | ⬜ Backlog |

### Notas adicionales
- Disponibilidad de Dani: manejada 100% por Google Calendar. No hay WORKDAYS/WORKHOURS fijos en código.
- Sábados: solo presencial para nutrición (ocultar opción virtual si día = sábado)
- Pilates lleno: no mostrar slot lleno, mostrar directamente el próximo sábado con cupo

---

## 17. REGISTRO DE CAMBIOS

| Fecha | Cambio |
|-------|--------|
| 07 jul 2026 | Duración de Solo medición cambiada de 30 min a **15 min** |

---

## 18. ENTORNO DE TESTING

| Dato | Valor |
|------|-------|
| Cuenta de testing | plantpoweredani.testing@gmail.com |
| Credenciales | Guardadas en Drive: AutomáTica / Plant Powered Dani / Interno |
URL de testing: https://script.google.com/macros/s/AKfycbyWnGFlr3iv3Z0SDGSoBwjcYEBjYkRYf5yDs2t_T8CDw_t-DYJiBTIi_WrPMupeYBli/exec
Versión actual: v4
| Editor Apps Script | https://script.google.com/d/1cu-HdKiAmfUYOgjwtjKcE9lCO6waLfFsL71PwP4GgcdGiQWzqygPS3fK/edit |
| Versión actual | v3 |
| Repo | https://github.com/juanartavia/plant-powered-dani |

### Notas de setup (Windows) — para futuros proyectos
- `&&` no funciona en PowerShell — correr comandos uno por uno
- `deploy.sh` y `build.sh` no funcionan en Windows — ejecutar los pasos manualmente
- El `.claspignore` de la raíz interfiere con clasp en Windows — renombrarlo a `.claspignore.bak` antes de hacer `clasp push`
- El `rootDir` en `.clasp.json` debe apuntar a `dist/` después del setup inicial
- Agregar `"runtimeVersion": "V8"` al `appsscript.json` es obligatorio
- La función `doGet()` debe usar `"index"` no `"dist/index"` como nombre del archivo HTML
- Siempre hacer `clasp push` antes de `clasp deploy`
- Cada `clasp deploy` genera una URL nueva — documentar la URL activa

### Flujo de deploy en Windows (para cada actualización)
```
1. cd backend && npm run build && cd ..        (en pasos separados en PowerShell)
2. Copy-Item backend/dist/* dist/
3. Copy-Item frontend/dist/* dist/             (solo si hubo cambios en frontend)
4. clasp push
5. clasp deploy                                (genera nueva URL — documentarla)
```
