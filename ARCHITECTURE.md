# Arquitectura — Insulin Diario

Documento técnico para desarrolladores. Cubre las decisiones de arquitectura, el flujo de datos, la estrategia de tests y cómo extender la aplicación.

Para la descripción funcional (qué hace la app, cómo correrla en navegador, stack) ver [README.md](./README.md).

## Visión general

Aplicación móvil híbrida (Ionic + Angular + Capacitor) para gestión de inyecciones de insulina y niveles de glucosa. Funciona 100% local — sin servidor, sin cuentas, sin telemetría.

**Principio rector:** la app es una **caja de cristal**. Toda la lógica de negocio está en servicios testeados. La UI es declarativa y delgada.

```
┌─────────────────────────────────────────────────┐
│  UI (3 pages + 3 subcomponentes presentacionales)│
│  HomePage / HistoryPage / SetupPage              │
│  <app-completion-ring> <app-summary-chips>      │
│  <app-slot-card>                                 │
└────────────────────┬────────────────────────────┘
                     │ lee signals + ejecuta mutaciones
                     ▼
┌─────────────────────────────────────────────────┐
│  Capa de servicios (singleton, providedIn:root)│
│                                                   │
│  InsulinStore  ── datos crudos + storage          │
│  DaySummary    ── computed signals puros          │
│  Notifications ── effect + permisos + scheduling   │
└────────────────────┬────────────────────────────┘
                     │ única vía hacia...
                     ▼
┌─────────────────────────────────────────────────┐
│  Capa de I/O (Capacitor)                         │
│  @capacitor/preferences   (storage clave/valor)   │
│  @capacitor/local-notifications                  │
└─────────────────────────────────────────────────┘
```

## Los tres servicios

El antiguo `InsulinService` (368 líneas, 7 responsabilidades) se dividió en tres. Cada uno tiene **una sola razón para cambiar**:

### `InsulinStore` (`src/service/insulin.store.ts`)

**Responsabilidad:** ser la única puerta de entrada/salida a la persistencia.

- Mantiene los signals con los datos: `entries`, `glucoseEntries`, `noteEntries`, `profile`, `slots`, `today`, `nowMin`.
- Expone queries (`getEntriesFor`, `getGlucose`, `getHistoryDays`, …).
- Expone mutaciones (`toggleBasal`, `addBolus`, `setGlucose`, `addNote`, `resetSlotToday`, `resetAllToday`, `undoLast`).
- En su constructor: `loadFromStorage()` (lee Capacitor Preferences) y `setInterval(tick, 60_000)` (actualiza `today` y `nowMin`).
- **No** calcula resúmenes. **No** programa notificaciones. **No** conoce `DaySummary` ni `Notifications`.

**Por qué importa:** si mañana decides cambiar Capacitor Preferences por SQLite, **solo tocas este archivo**.

### `DaySummary` (`src/service/day-summary.ts`)

**Responsabilidad:** exponer las agregaciones del día como `computed` puros.

- Inyecta `InsulinStore`.
- `daySummary()` → `{ basalExpected, basalDone, totalBolus, avgGlucose }`
- `missedBasalSlots()` → `string[]` con los ids de franjas cuya basal está vencida y sin registrar.
- **No** muta estado. **No** toca storage. **No** lanza side effects.

**Por qué importa:** la lógica de "qué slots están perdidos" es regla de negocio pura. Tenerla aislada hace que añadir un nuevo tipo de resumen sea trivial (otro `computed`).

### `Notifications` (`src/service/notifications.service.ts`)

**Responsabilidad:** orquestar las notificaciones nativas.

- Inyecta `InsulinStore` y `DaySummary`.
- En su constructor monta un `effect` que reacciona a `missedBasalSlots` y programa notificaciones con dedup por `(fecha, slotId)`.
- Expone `requestPermission()` (público, el componente decide cuándo llamarlo).
- **No** muta datos del store. **No** decide CUÁNDO pedir permiso (esa es una decisión de UX del componente).

**Por qué importa:** separa el "qué" (programar cuando hay una basal olvidada) del "cuándo" (pedir permiso, mostrar toast al usuario, …). El componente es responsable de la UX; el servicio solo ejecuta.

## Grafo de dependencias

```
                    AppComponent
                    (inyecta Notifications para mantener vivo el effect)
                          │
                          │  inyecta
                          ▼
                    Notifications
                    │          │
                    │          │
        inyecta     │          │  inyecta
                    ▼          ▼
              DaySummary    InsulinStore
                    │          ▲
                    └──────────┘
                      inyecta
```

`InsulinStore` no inyecta nada (es la raíz). `DaySummary` solo lee del store. `Notifications` lee de ambos y monta un effect.

Regla: las dependencias son **siempre hacia abajo** (el store no conoce a nadie). Esto evita ciclos y hace que cada servicio sea testeable inyectando mocks simples.

## Flujo de datos

**Lectura (signal → template):**
```
Dato en Preferences
   → loadFromStorage() en constructor del store
   → signal privada `._entries.set([...])`
   → signal pública readonly `entries`
   → computed (en DaySummary) re-evalúa
   → effect (en Notifications) re-ejecuta
   → getter del componente re-evalúa
   → Angular re-renderiza
```

**Escritura (template → store):**
```
Click en el template
   → método del componente (delegación) ej. onToggleBasal(s)
   → método del HomePage (handler) ej. onToggleBasal(s)
   → mutación del store ej. store.toggleBasal(s.id)
   → signal privada se actualiza
   → saveToStorage() persiste
   → todas las signals derivadas se invalidan
   → UI se re-renderiza
```

## Capa UI

### Pages (`src/app/`)

Cada page es un **container** en el sentido container-presenter:
- Conoce el store.
- Calcula estado a partir del store.
- Maneja eventos (delegando al store o mostrando alerts).
- **No** tiene lógica visual compleja embebida.

```
HomePage       — vista principal del día
HistoryPage    — vista retrospectiva con calendario
SetupPage      — selección de marcas de insulina
```

### Componentes presentacionales

Extraídos de HomePage para reducirlo de 165 a 103 líneas:

| Componente | Input | Output | Notas |
|---|---|---|---|
| `<app-completion-ring>` | `done`, `expected` | — | Calcula el progreso internamente. `signal inputs`. |
| `<app-summary-chips>` | `totalBolus`, `avgGlucose` | — | Decide si mostrar cada chip. Aplica clase CSS por rango de glucosa. |
| `<app-slot-card>` | `slot`, `today`, `isMissed` | `toggleBasal`, `addBolus`, `removeLastBolus`, `addNote`, `reset` | "Smart-light": consulta el store por su cuenta. Encapsula la tarjeta completa. |

Los helpers puros de `<app-slot-card>` (mapeo de icono, formateo de rango, clases de glucosa, pills de bolus, trim de notas) viven en `slot-card.helpers.ts` para poder testearlos sin cargar Stencil.

## Estrategia de tests

86 tests unitarios con **Vitest** + **@analogjs/vitest-angular**. Cobertura por concern:

| Spec | Tests | Cubre |
|---|---|---|
| `insulin.store.spec.ts` | 10 | CRUD + queries + dedup de storage |
| `day-summary.spec.ts` | 6 | Computeds puros (daySummary + missedBasalSlots) |
| `notifications.service.spec.ts` | 3 | Dedup + effect reactivo + permission |
| `slot-rules.spec.ts` | 6 | Generación de franjas según insulinas elegidas |
| `date-utils.spec.ts` | 13 | Formateo de fechas (toYmdLocal, formatRange, formatRelativeTime con sus 7 ramas) |
| `slot-card.helpers.spec.ts` | 35 | Lógica pura del slot card (iconos, glucosa, pills, trim) |
| `completion-ring.component.spec.ts` | 5 | Render del SVG ring + clases reactivas |
| `summary-chips.component.spec.ts` | 8 | Visibilidad condicional + clases por rango de glucosa |

### Por qué tests antes del refactor

El primer día de trabajo escribimos 11 tests del servicio monolítico. El test #10 (`getGlucose: cuando hay varias lecturas para el mismo slot, devuelve la más reciente`) **reveló un bug real**: el código usaba `.find()` y devolvía la primera lectura en vez de la última. En una app de diabetes, mostrar la glucosa vieja en vez de la actual puede hacer que el usuario se ponga insulina de más.

Sin tests, este bug habría viajado al `InsulinStore` durante el split y nos habríamos acostumbrado a vivir con él. **El orden importa: tests primero, refactor después.**

### Lo que NO se testea unitariamente y por qué

- **El render completo de `<app-slot-card>`**: el componente importa `IonicModule` que carga Stencil (el compilador de web components de Ionic). Stencil falla al cargar en jsdom (`TypeError: Cannot convert undefined or null to object` en su `index.js:251`). La solución es testear la lógica pura por separado (los helpers) y la integración por uso manual. Si en el futuro hace falta cobertura de render, usar happy-dom o Playwright en lugar de jsdom.
- **Las pages completas**: son glus. Su lógica (toasts, alerts) se prueba mejor con e2e (Playwright, fuera del scope actual).

## Build y CI

### Build local

```bash
npm run build       # producción (carpeta dist/app/)
npm start           # ng serve con watch
npm test            # vitest en watch
npm run test:run    # vitest una pasada
```

### CI (`.github/workflows/ci.yml`)

Cada push a `main` y cada PR corre:
1. `npm ci` (instalación limpia desde lockfile)
2. `npm run test:run` (86 tests)
3. `npm run build` (verifica tipos y templates)

Si todo pasa, sube `dist/app/` como artifact (retención 7 días). El workflow cancela runs anteriores si llega un push nuevo a la misma branch.

El build de Android (Capacitor) **no** se hace en CI — es release engineering manual.

## Decisiones de diseño

### Signals sobre RxJS para estado

Angular 17 trae signals estables. Para estado de UI con reactividad simple-to-media, son más legibles que `BehaviorSubject`. `computed` reemplaza `combineLatest` + `map`. `effect` reemplaza subscripciones manuales.

Trade-off: signals no tienen operadores de RxJS (debounce, switchMap, …). Si necesitamos eso, volvemos a RxJS para ese concern puntual.

### Container-Presenter pragmático

`<app-completion-ring>` y `<app-summary-chips>` son **puros** (solo inputs, sin inyectar nada).

`<app-slot-card>` es **smart-light** (inyecta el store, recibe 3 inputs, emite 5 eventos). La opción "dumb pura" requeriría 8+ inputs por card. Pragmático: el smart-light evita plomería sin perder claridad.

### Un único `providedIn: 'root'` por servicio

Los tres servicios son singletons. Cualquiera que inyecte a uno obtiene la misma instancia. Esto hace que el `effect` de `Notifications` se ejecute una sola vez al boot.

`AppComponent` inyecta `Notifications` **solo para mantener el effect vivo** desde el arranque. Es un patrón "ensure instantiated" sin `APP_INITIALIZER`. Si en el futuro el equipo decide limpiar esto, mover a `main.ts` con `APP_INITIALIZER`.

### Constructor del store con side effects

`InsulinStore.loadFromStorage()` y `setInterval` se llaman en el constructor. Esto significa que **inyectar el store dispara carga de datos y timers**. Para tests, cada test usa `TestBed.resetTestingModule()` en `afterEach` para limpiar el interval.

Trade-off: el constructor no es "puro" pero la app no necesita boot explícito. Si en el futuro hace falta control fino, mover a un `init()` público llamado desde `main.ts`.

## Cómo extender

### Añadir un nuevo campo a una entrada

1. Añadir el campo a la interfaz en `src/models/models.ts`.
2. Añadir la mutación al store (validar + persistir).
3. Actualizar el template que muestra la entrada.
4. Añadir tests para la mutación y la query.

### Añadir un nuevo resumen del día

1. Añadir un `computed` en `DaySummary` que lea los signals del store.
2. (Opcional) Crear un subcomponente presentacional si el visual es complejo.
3. Añadir tests al spec de `DaySummary`.

### Cambiar el storage a SQLite

1. Crear un nuevo `InsulinStore` con la misma API pero backed por SQLite.
2. Si la API difiere, ajustar las llamadas en `HomePage`, `HistoryPage`, `SetupPage`.
3. `DaySummary` y `Notifications` no se tocan (leen signals, no saben del storage).
4. `loadFromStorage` y `saveToStorage` se reemplazan por queries SQL.

### Añadir un nuevo tipo de notificación

1. Añadir el `effect` adicional en `Notifications` o crear un nuevo servicio.
2. Si es nuevo servicio: declararlo en `AppComponent` si necesita correr desde el arranque.
3. Pedir el permiso apropiado en el momento UX adecuado (probablemente `SetupPage.save`).

## Estructura de archivos

```
src/
├── app/
│   ├── app.component.ts          # root, inyecta Notifications
│   ├── app.routes.ts
│   ├── home/
│   │   ├── home.page.ts          # container
│   │   ├── home.page.html
│   │   ├── home.page.scss
│   │   ├── completion-ring/      # presentacional dumb
│   │   ├── summary-chips/        # presentacional dumb
│   │   └── slot-card/            # presentacional smart-light
│   │       ├── slot-card.component.ts
│   │       ├── slot-card.component.html
│   │       ├── slot-card.component.scss
│   │       ├── slot-card.helpers.ts          # funciones puras
│   │       └── slot-card.helpers.spec.ts     # 35 tests
│   ├── history/
│   └── setup/
├── models/                       # tipos de dominio
├── service/
│   ├── insulin.store.ts          # datos + CRUD + storage
│   ├── insulin.store.spec.ts
│   ├── day-summary.ts            # computeds
│   ├── day-summary.spec.ts
│   ├── notifications.service.ts  # effect + permission
│   ├── notifications.service.spec.ts
│   └── insulin-catalog.ts        # catálogo estático
├── utils/
│   ├── date-utils.ts
│   ├── date-utils.spec.ts
│   ├── slot-rules.ts
│   └── slot-rules.spec.ts
├── test-setup.ts                 # setup de Vitest (zone, TestBed, compiler)
├── main.ts
├── global.scss
└── index.html

.vitest.config.ts                 # config de Vitest
.github/workflows/ci.yml          # CI
patches/                          # patch-package: fix de @analogjs/vite-plugin-angular
```

## Glosario

- **Slot / franja**: bloque horario de un día (Mañana 6-12h, Tarde 12-18h, Noche 18-24h). Configurable según el perfil de insulinas.
- **Basal**: insulina de acción larga/prolongada. Una aplicación al día (o dos si es NPH intermedia).
- **Bolus**: insulina de acción rápida para comidas. Varias aplicaciones al día.
- **Missed basal slot**: slot cuya franja ya pasó y no se marcó como aplicada.
- **Profile**: selección de marcas de insulina que el usuario usa. Determina los slots.
