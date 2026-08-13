# AVANCE — agro-erp (Botas Agroindustrial · ERP + MES)

> **Única fuente de verdad del avance.** Foto de "hecho vs. falta" de un vistazo.
> Se actualiza al cierre de cada demo. El **git log** manda sobre el detalle fino
> (los commits `feat(...)` son el handoff real); este doc es el mapa ejecutivo.
>
> Última actualización: **2026-08-12** · Stack: Angular 19 + signals · NestJS + Prisma · PostgreSQL
> Deploy: front → Vercel · back → Railway (ver memoria `urls-produccion`).
>
> **🔓 SISTEMA COMPLETO LIBERADO AL CLIENTE — 2026-08-12.** `NIVEL_MODULO` y `NIVEL_SECCION`
> quedan **todos en ENTREGADO**: no hay nada oculto al rol CLIENTE. Suben de una vez `despachos`,
> `cartera`, `inventario`, `proveedores`, `calidad`, `indicadores`, `inicio` y la sección
> `operar-produccion`. El disparador no fue que estuvieran "listos" (lo estaban hace demos), sino
> que mantenerlos INTERNOS **le abría huecos a lo que sí tenía**: veía la factura sin el despacho
> que la origina, pedía segundas sin poder consultar el saldo, y la regla de cartera le bloqueaba
> un despacho que no podía ir a mirar.
>
> Dos consecuencias que NO son cosméticas:
> 1. **`operar-produccion` deja de ser consulta**: el cliente genera OFs y despacha de verdad.
>    El gate siempre fue de UI — el backend nunca bloqueó esos endpoints —, así que lo que
>    cambia es quién ve el botón, no qué permite el servidor.
> 2. **`rutaInicial` manda a todos a `/inicio`**: con `inicio` liberado, cliente y stage aterrizan
>    en el dashboard en vez de `/pedidos/oc`. Correcto, porque ya no enlaza a módulos cerrados.
>
> El escalafón ENTREGADO/EN_STAGE/INTERNO **sigue vivo** para la próxima entrega, que nace en
> `EN_STAGE` como siempre. Como ya no queda ningún ejemplo real de módulo oculto, los specs del
> guard **simulan uno** (mutan el mapa y lo restauran): así prueban el mecanismo y no el estado
> del tablero. Front 357 tests en verde.
>
> **Entrega 6 desplegada a prod el 2026-08-04** (merge `--no-ff` `4bc4237` + tag `entrega-6`).
> Las 3 migraciones son aditivas (`MovimientoInventario.ofId`, enum `SubPasoInyeccion` + 2
> columnas nullable, tablas `CalendarioLaboral`/`DiaNoHabil`) y las aplicó `migrate deploy` sola.
> Contenido: **consumo real de MP por OF** (cierra el ciclo del material: hasta hoy el sistema
> reservaba y nunca descontaba), **sub-pasos de inyección** (montaje·inyección·finizaje·impacto;
> cuenta solo IMPACTO) y **meta diaria contra días hábiles**. Corrido `seed:calendario` en prod:
> 36 festivos (2026-2027) y config **lun-sáb** — confirmado por Gonza que **sí trabajan sábados**,
> así que el default quedó correcto y agosto da **24 días hábiles**.
>
> **Gates para la demo del 2026-08-04:** `fabricacion` y `reportes` subieron de INTERNO a
> **EN_STAGE**. Sin eso, 4 de las 7 cosas a mostrar no las veía ni el perfil STAGE y tocaba
> demostrar como ADMIN (que le enseña al cliente el menú entero). El rol CLIENTE sigue sin verlos.
> Se agregó el ítem de menú **"Órdenes de fabricación"** (`/fabricacion`): la pantalla del
> almacenista cuelga de ahí y solo se alcanzaba tecleando la URL.
>
> ⚠️ **Bug de datos corregido el mismo día** (`fix(seed)`): `PRODUCCION_DIA` y `VENTAS_D14` traían
> los días fijos (2,3,4,5,6,9,…) elegidos para julio. En agosto caían en domingo y en fechas
> futuras, así que el reporte comparaba 14 días de producción contra 3 de meta y mostraba
> **711% de cumplimiento**. Ahora los días salen del calendario y se cortan en hoy.
>
> **Estado de prod tras la siembra** (verificado vivo): agosto con producción los días 1, 3 y 4;
> CORTE 1.944 reales vs 2.520 esperados = **77,1% a hoy** (contra 9,6% si se mide al mes entero);
> factura de servicio **FV-14** de maquila Feroz por $1.079.568. Backup previo en
> `Agro/backups/prod-20260804-antes-seeddemo.sql`.
>
> **Entrega 5 desplegada a prod el 2026-07-25** (merge `--no-ff` `3c4111b`, CI verde 481+339).
> Las 5 migraciones aplicadas por `migrate deploy`, verificadas contra la base real: el reporte
> trae las 5 células, las 21 filas de PT exponen su grado y **el backfill de `Factura.clienteId`
> dejó 0 facturas sin cliente** (era el riesgo del bloque de servicios). Cartera sigue viva tras
> el refactor. Sin tag todavía. `venta-segundas` y `factura-servicio` quedan `EN_STAGE`; el
> catálogo de servicios va vacío en prod hasta correr `seed:demo`/cargarlo a mano.
>
> **Entrega 4 desplegada a prod el 2026-07-25** (merge `--no-ff` develop→master `61eeb06`, CI verde,
> las 4 migraciones aditivas aplicadas solas por `migrate deploy`) y **liberada al cliente el mismo
> día**: el amarre de insumos ya le corría al generar la OP (le reservaba stock de su bodega), así
> que ocultarle el resultado era peor que mostrárselo. Pasaron a `ENTREGADO`: `amarre-insumos`,
> `recalcular-requerimiento`, `ocp-manual`, `ocp-anular`, `costo-ocp`. Siguen en `EN_STAGE`:
> `linea-pedido` (titular de la demo) y `operar-produccion` (generar OF / despachar escriben hacia
> módulos INTERNOS que el cliente no puede abrir). Sin tag todavía. Falta `seed:basarili` en prod
> (libera los ejes de variantes de una).

---

## 📊 Foto del avance

```
   FUNCIONALIDAD (núcleo)        ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░  ~90%
   ALCANCE DEL EXCEL DEL DUEÑO   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░  ~78%
   DEPLOY / PRODUCCIÓN           ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░  ~45%
   GIT HIGIENE (merges + tags)   ▓▓▓▓▓░░░░░░░░░░░░░░░  ~25%
```

**Tests:** 481 backend (53 suites) + 339 frontend, verdes 🟢 · ambos builds limpios.

---

## ✅ HECHO (verificado E2E)

Cada demo está implementada con TDD y verificada de punta a punta (API + browser).

| Demo | Módulo / Entrega | Estado funcional |
|------|------------------|------------------|
| 1 | **Flujo de pedidos** — auth/roles, clientes, wizard "Nueva OC" (4 pasos), OP automática, amarre de inventario por talla/bodega, anular | ✅ |
| 2 | **Catálogos + BOM** — referencias, marcas, tallas, materiales, productos, resolvedor BOM multinivel | ✅ |
| 5–6 | **MES / trazabilidad** — código por par, escaneo por célula (Corte→Guarnición→Almacén→Inyección→PT), timeline | ✅ |
| 7 | **Detalle fino de Guarnición** — 9 sub-pasos (Área…Strobel…Amarre), kanban | ✅ |
| 7 | **Calidad** — daños/reprocesos tipificados, imputación a centro de costo | ✅ |
| 8 | **Indicadores de eficiencia** — tiempo por etapa, operario/máquina, alertas de demora | ✅ |
| 9 | **Facturación** — factura sobre despacho, precio pactado en OC + IVA | ✅ |
| 10 | **Cartera / CxC** — vencimientos, pagos, estadoCartera dinámico, bloqueo de despacho | ✅ |
| 11 | **Dashboard gerencial** — KPIs agregados de todo el sistema | ✅ |
| 12 | **Inventario consolidado + kardex MP** — movimientos, kardex, hooks en producción/despacho | ✅ |
| 13 | **Compras lado proveedor** — OCP por proveedor, recepción parcial (backorder), devolución a proveedor | ✅ |
| 14 | **Reporte Diario Gerencial** — replica el Excel del dueño: producción por célula/día, acumulado, metas vs. real con %, kardex PT | ✅ |

### 🏭 Bloque "Núcleo Real" (2026-06-17) — de demo a producto usable con data real

Paquete para que el cliente **opere con su catálogo real**. Todo en `develop`, TDD, 7 commits.

| Fase | Entrega | Estado |
|------|---------|--------|
| 0 | **Seguridad backend** — `RolesGuard` activo; escritura de maestros solo ADMIN/GERENTE (el gating dejó de ser solo de UI) | ✅ |
| 1 | **Versionado de BOM** — índice único parcial (un BOM activo por ref) + editor de BOM con curva de tallas y drawer | ✅ |
| 2 | **ABM de catálogo** — marcas, materiales (+alias), referencias, grupos/opciones (back + 4 pantallas, menú Maestros) | ✅ |
| 3 | **Clientes editable + Proveedores** — PATCH/desactivar clientes; módulo Proveedores nuevo | ✅ |
| 4 | **ProductoConfigurado real** — crear producto desde el configurador (valida ejes/marca), habilita OCs reales | ✅ |
| 5 | **Carga de data real del Drive** — cargador `seed-basarili` + ETL del Drive: 110 marcas · 319 materiales · 5 referencias · 5 BOMs | ✅ |
| 6 | **Editar OC en BORRADOR** — ajustar cantidades/precios antes de confirmar (inline en oc-detalle) | ✅ |

> ~~⚠️ Consumos de BOM placeholder~~ **RESUELTO 2026-07-09:** consumos reales con curva por
> talla y despiece por pieza, cargados de la hoja `CONSUMOSXREFERENCIA` (ver Entrega 2).

### 🧵 Bloque "Líneas de producción" (2026-07-01) — 4 líneas independientes

Don Gabriel (dueño) decidió NO unificar Basarili+Agro y mantener **4 líneas independientes**:
Basarili · Agro · Alta (costura alta, nueva) · Externa (capellada de Bogotá, se inyecta acá;
**reemplazada por Feroz el 2026-07-06**, ver actualización abajo).
"Independiente" = **solo separar reportes** (misma empresa; inventario/cartera/facturación
compartidos → sin multi-tenancy). Todo en `develop`, TDD, 4 commits desde `05b881a`.

> 🔑 **Decisión de modelado:** la "línea" NO es `Marca`. El catálogo real tiene ~110 marcas
> (nombres comerciales: AGRO, PODEROSA…) y una línea agrupa varias. Se creó la entidad
> **`Linea`** (1→N marcas) con `celulaInicial`; `Marca.lineaId` es nullable.

| Fase | Entrega | Estado |
|------|---------|--------|
| A1+0 | **Entidad `Linea`** (codigo, nombre, celulaInicial, activo) + `Marca.lineaId?` + migración; seed de las 4 líneas (Externa → INYECCION) | ✅ |
| A2 | **Arranque de par configurable** — el par toma su célula inicial de la línea; la Externa entra directo en INYECCIÓN. Fix: el 1er escaneo activa la OF en cualquier célula (antes solo CORTE → OF Externa quedaba ABIERTA). Reposición re-arranca en la célula de la línea | ✅ |
| B1 | **`Par.lineaId` denormalizado** (+ backfill) + `inventario/consolidado?lineaId` e `indicadores?lineaId` filtran producción por línea | ✅ |
| A3/B2 | **CRUD `catalog/lineas`** + ABM `/catalog/lineas` (menú Maestros) + dropdown de línea en ABM Marca + selector de línea en Inventario/Indicadores + aviso de reposición con célula real | ✅ |

> ⚠️ ~~Pendiente del cliente: falta el mapeo marca→línea~~ **ANULADO (JP, 2026-07-06):**
> el mapeo marca→línea **NO es fijo** — la marquilla es la marca del cliente y esa misma
> marca puede fabricarla Agro, Alta o Basarili **según el pedido**. La línea debe
> capturarse a nivel de **OC/OP** (la marca a lo sumo da un default) y `Par.lineaId`
> heredarse de la OP. **Pendiente de diseñar/implementar** ("línea por pedido").

#### Actualización 2026-07-06 — Externa muere, nace Feroz (audios de JP)

- Eran dos cosas: unos "cortes aparte" (la Externa del kickoff) y Feroz. Los cortes aparte
  **no vuelven** → JP: "no es necesario montarle toda la infraestructura". La línea
  **EXTERNA quedó desactivada** en el seed y nació **FEROZ** (celulaInicial=INYECCION).
- Feroz hoy: llega la **capellada completa** de Bogotá y la fábrica **presta el servicio de
  inyección** (maquila → conecta con el pendiente SERVICIOS). Posible futuro: Bogotá manda
  el despiece y acá se guarnece+inyecta → solo cambiar `celulaInicial` a GUARNICION en el ABM.
- Líneas de bota vivas: **Basarili · Agro · Alta · Feroz**. Además existen las líneas de
  insumo con doble rol (Marquillas · Punteras · Plantillas), que producen por lote y venden
  a terceros — aún sin modelar (ver backlog).

---

### 📦 Entrega 2 — quincenal, fecha comprometida **viernes 2026-07-17** (2026-07-08/09)

Ritmo nuevo acordado con Juan José: **entregas pequeñas cada 15 días**. Todo en `develop`
(commits `8a62428`…`15b3b33`), verificado **E2E con los 3 perfiles** en navegador local.

| # | Entrega | Estado |
|---|---------|--------|
| 1 | **Semáforo de demoras en OC** — `fechaConfirmacion`, umbral único (amarillo 20d/rojo 30d), badge neutro `· cartera` para cliente VENCIDO (esos días no son demora nuestra), filtro "solo demoradas" | ✅ |
| 2 | **Costo + utilidad de la OC** — explota el BOM real × costo del material (solo materiales); bloque gateado: CLIENTE no lo ve, STAGE/ADMIN sí. 296 materiales costeados (plantillas EVA $282/par; 5 muestras sin costo, JP 07-09) | ✅ |
| 3 | **Compras con costo / kardex valorizado** — `costoUnitario` en OCP/recepción, promedio móvil en Material | ✅ |
| 4 | **Sedes por cliente (1→N)** — `SedeCliente` + única principal (índice parcial), selector de sede en OC con snapshot congelado de dirección, remito la sella; **importador masivo** `seed:sedes` + plantilla xlsx/PDF para la comercial | ✅ |
| 5 | **Despiece del BOM** — catálogo `Pieza` (15) + `BomLinea.piezaId`; el resolver identifica líneas por (material, pieza): micropiel en capellada/lateral/talón conviven con curvas propias; editor con columna Pieza + ABM en Maestros | ✅ |
| 6 | **Datos reales del despiece** — `tools/generar-despiece.py` desde la hoja `CONSUMOSXREFERENCIA`: **celda GRIS = prueba industrial (se carga), BLANCA = cero** (regla de JP 07-09). Refs 101-106 (106=RESORTADA), 114 bloques validados, curva 13 tallas | ✅ |
| 7 | **Perfil STAGE** — niveles ENTREGADO/EN_STAGE/INTERNO por módulo; **Maestros liberado al CLIENTE** (07-09, tras feedback de JP que no encontraba Marcas) | ✅ |

> 🐛 **Bug cazado por el E2E (07-09):** el BOM traía hilo en METROS pero se costea por CONO
> (5000/7500 m) y el cordón "1" era una GRUESA (144 uds) → costo $148M/40 pares, margen
> −4.254%. Corregido (`FIJOS_CORREGIDOS` en el generador): $37.076/par, margen 56,4%.
> **Regla nueva: cruzar SIEMPRE la unidad del consumo del BOM contra la unidad de compra.**

---

## 🔨 EN CURSO

### 📦 Entrega 6 (quincena 2026-07-30 → ~08-13) — plan en `docs/superpowers/PLAN-ENTREGA-6.md`

Alcance acordado: **consumo real por OF** · **sub-pasos de inyección** · **meta diaria contra días
hábiles**. Fuera: la cuenta de cobro de materiales de Feroz a costo de importación, bloqueada
hasta que JP mande la ficha de costos que prometió el 30-jul.

- [x] **Consumo real de materiales por OF** ✅ 2026-07-30 (`9d15972`) — el ciclo del material
  estaba cortado a la mitad: la OP reservaba insumos y el requerimiento los amarraba, pero
  **nada los descontaba nunca** (`CONSUMO_PRODUCCION` existía en el enum y ningún servicio lo
  emitía), así que al despachar se liberaba la reserva como si no se hubiera gastado nada.
  El almacenista registra **a mano** lo que entregó (cliente, 29-jul: no hay backflush), y el
  registro es **acumulativo** porque entrega varias veces durante la corrida.
  - `GET /fabricacion/of/:id/consumo` → teórico (BOM × pares) vs entregado vs diferencia.
  - `POST /fabricacion/of/:id/consumo` → baja stock, descuenta reserva, escribe el kardex.
  - ⚠️ Lo delicado: **lo consumido baja de la reserva al mismo tiempo que del stock**. Sin eso
    el neto disponible queda subestimado (se compra de más) y `liberarReservasDeOp` devuelve al
    cerrar una reserva ya gastada, dejando el agregado negativo. Consumir más de lo reservado es
    normal y no la vuelve negativa: el excedente sale del stock libre. Todo en
    `consumo-of-core.ts`, puro y con specs.
  - `MovimientoInventario.ofId` es FK, no el texto de `referencia`: el consumo se consulta
    agrupado por OF y parsear `"OF-31"` para eso es pedir un bug.
  - **Verificado E2E vivo** contra la base local con la OF-95 (1992 pares, 40 materiales del BOM
    real): el POST bajó el stock, acumuló dos entregas del mismo material, dejó el movimiento
    valorizado y atado a la OF, y rechazó con mensaje claro una entrega mayor al stock.
- [x] **Pantalla del almacenista** ✅ 2026-07-30 — `/fabricacion/of/:id/consumo`, tabla
  teórico/entregado/diferencia con la columna "Entregar ahora" sobre la misma fila (en bodega se
  mira la fila y se anota lo que salió). Repinta con lo que devuelve el backend, no optimista.
  Vive bajo el módulo `fabricacion`, que es **INTERNO**: no necesita gate de sección propio, pero
  por eso mismo **hoy no la ve ni el perfil STAGE** — decidir el día de la demo.
- [x] **Sub-pasos de INYECCIÓN** ✅ 2026-07-30 — JP (nota de voz del 30-jul): *"finizaje no es una
  célula aparte, el proceso de inyección lleva montaje, lleva inyección como tal, lleva finizaje y
  lleva el impacto"*. Se replicó el patrón de `SubPasoGuarnicion`: enum `SubPasoInyeccion`,
  `Par.subPasoInyeccion` y `EventoTrazabilidad.subPasoInyeccion`, avance forward-only en
  `fabricacion-core.ts`. La línea **Feroz** ahora arranca en `INYECCION · MONTAJE`.
  - ⚠️ **El riesgo era el reporte, no el modelo**: si un par pasa a generar 4 eventos de
    INYECCION, la producción de la célula se cuadruplica. Cuenta solo el **último sub-paso
    (IMPACTO)**, igual que Guarnición cuenta solo AMARRE. Cubierto con 4 specs.
  - ⚠️ **Compatibilidad, en dos frentes**: (1) los eventos históricos no traen sub-paso y
    **siguen contando** como el escaneo único que fueron — descartarlos habría puesto en cero la
    producción de inyección de meses que el cliente ya vio; (2) un par que ya estaba en
    INYECCION sale a PT en **un solo escaneo**, no se lo devuelve al principio de la cadena a
    repetir trabajo que en el piso ya está hecho.
  - ❓ **Preguntar en la demo del martes:** si el dueño cuenta la inyección en el **impacto** (lo
    implementado) o en la **máquina inyectora**; con lo segundo el número no le va a cuadrar con
    su Excel. Es una pregunta de 30 segundos con la pantalla al frente.
- [x] **Meta diaria contra calendario de días hábiles** ✅ 2026-07-30 — JP (29-jul) pidió metas
  **mensuales con seguimiento diario**. El reporte comparaba el acumulado contra el mes entero:
  el día 3 todo se veía en 10% aunque la planta fuera perfecta.
  - `CalendarioLaboral` (fila única: qué días de la semana se trabaja) + `DiaNoHabil` (festivos y
    paradas). `GET/PUT /reportes/calendario` para configurarlo.
  - **La pregunta de si trabajan sábados dejó de ser bloqueante**: es un clic. Verificado vivo —
    apagar el sábado movió julio de **26 a 22 días hábiles** y la meta diaria de CORTE de
    **775,38 a 916,36 pares**, sin desplegar nada.
  - `npm run seed:calendario` siembra los **18 festivos colombianos** calculados (Pascua por
    algoritmo de Butcher + **Ley Emiliani**, que corre 10 de ellos al lunes siguiente), del año
    pedido y el siguiente. Idempotente; no pisa la config si el cliente ya la cambió.
  - El reporte ahora trae, por cada meta, `esperado` (prorrateado a los hábiles transcurridos),
    `pctEsperado` y `diaria`; y cada fila dice si el día era hábil. La tarjeta muestra el % contra
    **lo esperado a hoy**, que es el número que dice si se va al día o atrasado.
  - ⚠️ **Sin calendario configurado el reporte se comporta igual que antes** (meta contra el mes
    entero): desplegar esto no le cambia los números al cliente hasta que alguien lo configure.
  - ⚠️ El front lee `metas.habiles?` con opcional a propósito: mientras Vercel y Railway terminan
    de desplegar, el front nuevo puede estar hablando con el backend viejo, y sin eso se caía la
    pantalla entera del reporte.

### Entregas anteriores

- **Entrega 2 (vie 2026-07-17):** funcionalidad completa y E2E ✅ — **desplegada a prod
  2026-07-09** (tag `entrega-2`): migraciones aplicadas, seeds corridos (rol STAGE, 15 piezas,
  BOM ×6 con despiece, 296 costos, 3 sedes) y `fechaConfirmacion` retro-sellada en 8 OCs
  (semáforo verificado vivo: 2 ROJO/1 AMARILLO). Falta solo la **demo** al cliente.
- **Cotización/proforma PDF + eliminar borradores** (pedido de Juan José vía JP, 07-10) ✅
  construida, E2E local y **desplegada a prod 07-10**: OC BORRADOR = cotización → botón
  "Cotización PDF" (jsPDF, número `COT-fecha-hora`, IVA 19%, emisor por línea — hoy solo
  Feroz tiene datos) y eliminar del todo con confirmación. Gateada EN_STAGE. Seed corrido en
  prod (emisor Feroz + BOM con la gruesa corregida: margen OC-8 pasó de 21.77% a 22.18%).
- **CI de GitHub Actions reparado** ✅ 2026-07-12 — llevaba roto desde antes del 06-jul (todos
  los push mandaban correo de fallo). Dos causas: (1) el postinstall del esbuild anidado de vite
  validaba contra el binario hoisted → `npm ci --ignore-scripts` en ambos jobs; (2) el
  package-lock generado en Windows no traía el binding Linux de `unrs-resolver` (el resolver
  nativo de jest 30) → jest no resolvía ningún módulo en el runner; entrada agregada a mano al
  lock. ⚠️ Si se regenera el lock en Windows, npm borra esa entrada — re-agregarla (ver commit
  `766d318`). Ambos jobs verdes; fix mergeado a `master`.
- **Entrega 3 DESPLEGADA A PROD** ✅ 2026-07-13 (merge `af3066b`, CI verde, sin tag — deploy
  intermedio): Railway aplicó `linea_por_pedido` + `metas_por_linea` y Vercel quedó Ready.
  `seed:demo` corrido contra la DB pública: producción del mes repartida en 4 líneas
  (⚠️ en prod FEROZ=id 4, en local=12 — siempre resolver por `codigo`) y metas por línea.
  **Verificado vivo en prod** (`/reportes/diario?lineaId`): global 88.9%/98.8%/84.3%,
  Basarili facturación 59.5% (bajo meta), Alta 148.8% (sobre meta), Feroz solo inyección
  98.8% y facturación 0 (servicio aparte, sin modelar). Cero spoilers: selector de línea
  gateado EN_STAGE y `reportes`/`fabricacion` no visibles para CLIENTE. Falta: liberar el
  gate el día de la demo que lo muestre.
- **Etiquetas de código de barras por OF** ✅ 2026-07-12 (módulo fabricación = INTERNO; **sin
  entrega asignada aún**) — botón «Etiquetas» en el listado de OF: PDF hoja carta adhesiva 3×8
  (etiquetas de 66×32 mm) con Code128 + código legible + producto · talla · línea por cada par
  activo (excluye bajas/cancelados). jsPDF + jsbarcode con import dinámico (patrón proforma);
  `obtenerOF` ahora trae producto y línea por par. Verificado E2E en navegador (PDF real
  revisado: 3 pares Feroz OK). El lector físico opera en modo teclado contra la pantalla de
  operario existente (input con autofocus) — falta solo comprar lectores y decidir con el
  cliente dónde vive la etiqueta (canastilla/lote) y el código máster por caja (empaque).
- **Esperando de JP:** **datos de emisor de Basarili/Agro/Alta** (razón social, NIT, cuenta)
  para que sus proformas salgan con membrete propio · la **dirección de entrega de DOTACIONES
  RAC** (NIT 900337975), la única sede que llegó sin dirección.
  ~~Excel de sedes diligenciado~~ **Llegó 07-29** (AGRO) — cargado, ver abajo.
  ~~¿La GRUESA cuenta cordones o pares?~~ **Respondido 07-10: 144 PARES por gruesa**
  (consumo corregido a 1/144 = 0.0069; muestras en $0 confirmadas sin costear).
  ~~Materiales FIJOS de la 106~~ **Respondido 07-29** (ficha de consumo, ver backlog §1).

### 📩 Respuestas de JP — 2026-07-29 (las 4 preguntas de la Entrega 5)

Llegaron con el Sheet **`CONSUMO POR REFERENCIAS`** (12 pestañas, solo lectura del cliente):

1. **La segunda va SIN MARQUILLA.** La `MARQUILLA LATERAL` ($250/par, DIRECTO) es la única
   diferencia de receta entre primera y segunda. Hoy el BOM **no conoce `calidad`**, así que el
   requerimiento sigue contando la marquilla igual en ambas: impacta costeo, no stock —
   el descuento honesto va en el consumo real (Fase B), no en el BOM de planeación.
2. **Maquila Feroz:** datos de facturación = los de la proforma (ya en `Linea.razonSocial/nit`;
   **falta crear el `Cliente` INDUSTRIAS FEROZ SAS, NIT 902.072.014**). Los materiales salen de
   la **bodega de insumos de Agro** y se pasa **cuenta de cobro mensual de lo consumido por par**,
   valorado a **costo de importación**, no al precio de venta. ⚠️ **Contradicción a aclarar**:
   la hoja `MATERIALES IDC FEROZ JUNIO` —que es exactamente esa cuenta de cobro— valora el P.U a
   **$14.300/kg**, mientras las fichas `FEROZ` y `102 P.N` usan **$7.594–$7.800** para el mismo
   material. Hay dos listas de precios paralelas y no está dicho cuál es la de importación.
   `Material` hoy solo tiene `costoBase` y `costoPromedio`: no existe `costoImportacion`.
3. **Metas MENSUALES con seguimiento de cumplimiento DIARIO.** El modelo `Meta` (`anio`+`mes`)
   ya es mensual ✅; falta el prorrateo diario en `reporte-diario-core.ts` (`FilaDia` no lleva
   meta ni %). ⚠️ **No existe calendario de días hábiles**: dividir la meta por días calendario
   daría un objetivo diario falso. Hay que preguntar si trabajan sábados.
4. **El almacenista registra lo que realmente entregó** ⇒ **registro manual confirmado, NO
   backflush**. Descarta la opción B1 de la Fase B (ahorro grande). El movimiento manual de MP
   ya existe (`inventario.service.movimientoMaterial`); lo que falta es atarlo a la OF/OP y que
   descuente `cantReservada`.

**Conceptos del Excel que aparecen ahí y todavía no modelamos:** la célula **`FINIZAJE`**
(crayola, gama, gardenia, lija — entre inyección y empaque) y **`MANTENIMIENTO`**; y el
**`GASTO PROMEDIO POR PAR`** (overhead fijo: $15.000 en la 106, $17.000 en Feroz, $18.000 en la
105) que el cliente suma al costo para llegar a su "precio de fabricación".

---

## ⏳ FALTA (backlog priorizado)

### 1) Modelado de negocio — conceptos del Excel aún sin modelar
- [x] **EXTERNO / tercerización** ✅ 2026-07-01 — modelado como línea con `celulaInicial=INYECCION`; desde 2026-07-06 esa línea es **Feroz** (la Externa original quedó desactivada; JP confirmó que esos cortes no vuelven).
- [x] **Línea por pedido** ✅ 2026-07-12 (EN_STAGE) — `OrdenCompra.lineaId` (+`OrdenProduccion.lineaId`, migración `linea_por_pedido`): el wizard de OC pide la línea (selector gateado EN_STAGE, obligatorio para quien lo ve), la OP la hereda al generarse y cada Par nace con la línea del pedido (célula inicial incluida — Feroz arranca en INYECCIÓN); la reposición de calidad hereda la línea del par dado de baja. `Marca.lineaId` queda solo como fallback histórico. Verificado E2E local por API (OC Feroz → OP → OF → 3 pares en INYECCIÓN con `lineaId`). Backend valida línea activa; OCs viejas sin línea siguen funcionando igual.
- [x] **Reporte Diario Gerencial POR LÍNEA** ✅ 2026-07-12 (EN_STAGE) — `GET /reportes/diario?lineaId` filtra producción vía `par.lineaId` y facturación vía `despacho.op.lineaId`; selector "Todas las líneas / …" en la pantalla. **Metas por línea**: `Meta.lineaId` (NULL = meta global, migración `metas_por_linea`); el drawer de metas edita las de la línea filtrada. Honesto: el **kardex de bodega PT no se segmenta** (el stock PT no conoce la línea) — con filtro activo la sección lo dice y va vacía. Verificado E2E local (evento Feroz cuenta solo en Feroz; global agrega todo). ⚠️ Depende de que los pedidos nuevos traigan línea; los históricos (lineaId NULL) solo aparecen en "Todas las líneas". **Seed demo por línea ✅ 2026-07-13**: `seed-demo` asigna línea a todas sus OCs (resueltas por `codigo`, nunca por id) y reparte la producción D14 en 4 cadenas — 9014 Basarili 45% · 9018 Agro 30% · 9019 Alta 15% · 9020 Feroz 10% (Feroz solo eventos INYECCIÓN→PT) — con metas por línea (Feroz sin guarnición ni facturación: el servicio de inyección se factura aparte, sin modelar). De paso: el upsert de metas estaba roto (el unique `anio_mes_tipo` murió con la migración `metas_por_linea` → upsert manual) y el reset de máquinas/operarios ya no borra global (upsert idempotente: había eventos de OPs no-demo que los referencian por FK).
- [x] **Kardex de bodega PT POR LÍNEA** ✅ 2026-07-21 (Entrega 4, arranque) — `MovimientoInventario.lineaId` (migración `kardex_pt_por_linea`, aditiva): la línea del pedido se sella en cada movimiento PT al escribirlo — producción (`par.lineaId`, `fabricacion.service`) y despacho (`op.lineaId`, `despacho.service`). El reporte diario ya no cortocircuita el kardex con filtro: `?lineaId` corta movimientos y saldo previo por la línea sellada; históricos con NULL suman solo en "Todas las líneas" (nota honesta en la UI solo cuando la línea filtrada no tiene movimientos). Seed demo: entradas de producción por día×línea (`repartoDia`), ventas y saldo inicial repartido (12.000/9.000/6.000/3.000 — Alta con colchón porque vende sobre su meta). Verificado E2E vivo local: global intacto (30.000→24.420) y las 4 líneas suman exacto al global, todas en positivo.
- [x] **METAS POR CÉLULA** ✅ 2026-07-25 (Entrega 5) — el `TipoMeta` **es** la célula: migración aditiva `metas_por_celula` (`ALTER TYPE ... ADD VALUE 'CORTE'/'ALMACEN'/'PT'`), sin columna `celula` nueva, así el unique `(anio,mes,tipo,lineaId)` sigue intacto y da gratis **meta por célula × línea**. `BloqueMetas` pasa de 4 claves fijas a `{ celulas: CumplimientoCelula[], facturacionPares, facturacionValor }` recorriendo `CELULAS` (orden de flujo), y el real de cada célula sale de la misma columna que alimenta la fila diaria — el % nunca se despega de la tabla. La whitelist del DTO se deriva de `TIPOS_META` del core (antes duplicada). Front: 7 tarjetas responsivas (`auto-fit`) y el drawer pasa de 4 campos sueltos a un `@for` sobre los tipos. Seed: las 3 células nuevas al ritmo de la cadena (20.160 global) y por línea; Feroz solo INYECCION+PT (arranca en inyección). Verificado E2E vivo local: global CORTE 17.934/20.160=89% · INYECCION 98,8% (los ~2.000 de más son Feroz, que no pasa por corte) y filtro Feroz = solo inyección 98,9% y PT 98,8%. ⚠️ Pendiente de JP: la hoja con los objetivos reales por célula (hoy sembrados al ritmo de la cadena) y confirmar si la meta es mensual o **diaria**; ojo que "producción de Guarnición" cuenta solo el sub-paso AMARRE.
- [x] **SEGUNDAS (S1: stock + captura)** ✅ 2026-07-25 (Entrega 5) — modeladas como **atributo**, no como SKU paralelo (duplicar referencias sería ×2 sobre las marcas y crear catálogo desde el piso). Dos migraciones aditivas separadas (PG no deja usar un valor de enum en la tx que lo agrega): `ClaseDano.SEGUNDA` primero, luego `enum CalidadPT` + `Par.calidad` + `InventarioPT.calidad` (default PRIMERA) con el grado dentro del unique — primeras y segundas del mismo producto+talla+bodega son saldos distintos. Flujo: una incidencia de clase SEGUNDA sella el par **sin matarlo ni reponerlo** (a diferencia de BAJA); el par sigue por las células y entra a bodega con su grado. 🚨 **El amarre filtra PRIMERA** (lock raw incluido): sin eso un pedido normal se llenaría de segundas — verificado vivo (100 primeras + 330 segundas, pedido de 200 → amarra 84 y produce 116, segundas con reserva en cero). `agruparIndicadores` cuenta cada clase explícita (antes `reprocesos` era "lo que no es baja" y SEGUNDA lo habría inflado). Reporte diario: la columna Segundas sale de los pares marcados que llegan a PT, **excluyente con Bodega** (no duplica el total) y la meta de PT se mide contra primeras; `SEGUNDAS` sale de `COLUMNAS_PENDIENTES`. Inventario: columna Calidad con badge + `registrarStock` acepta el grado (así se carga el saldo real del cliente). Seed: 3 tipos de daño SEGUNDA, 1 de cada 60 pares (330, cada uno con su incidencia) + saldo en bodega; limpieza idempotente verificada con doble corrida. Sin gate de sección: `reportes` e `inventario` son INTERNOS, el cliente no llega. ⚠️ Pendiente de JP: si la segunda conserva marquilla, si se puede reparar y volver a primera, y si marcarla exige gerente (hoy exige descripción, no rol).
- [x] **SEGUNDAS (S2: venta)** ✅ 2026-07-25 (Entrega 5) — el grado viaja por toda la cadena comercial: migración aditiva `venta_segundas` con `calidad` en `OrdenCompraLinea`, `OrdenProduccionLinea`, `DespachoLinea` y `FacturaLinea` (default PRIMERA: pedidos, remitos y facturas viejos no cambian). **El amarre respeta el grado pedido** (`op.service`: `where.calidad` + lock raw acotado) y **lo que falte de segundas NO se manda a producir** — salen de un defecto, no de una orden; ponerlas a fabricar mandaría a planta a arruinar botas a propósito. `despacho-lineas.ts` suma la calidad a la clave de agrupación (si no, 5 primeras y 3 segundas colapsaban en "8 pares" y el cliente las recibía como primeras) y `factura-core` busca el precio por `(producto, calidad)` vía `clavePrecio()` — tener precio de primera NO habilita facturar segundas, para que nunca salga al precio equivocado. Front: selector de Calidad junto al precio en el wizard (sección `venta-segundas`, EN_STAGE), badge en el resumen y en el detalle de la OC. 🐞 **Bug encontrado y corregido en la verificación viva**: faltaba `calidad` en `CrearOCLineaDto` del backend, así que el `ValidationPipe` la descartaba en silencio y toda línea llegaba como PRIMERA — los tests unitarios no lo veían porque mockean el DTO ya parseado. Verificado E2E vivo con OC mixta (20 primeras a $85.000 + 50 segundas a $55.000): amarra 20 del saldo de primeras y 50 del de segundas, remito con **dos líneas separadas**, factura $1.700.000 + $2.750.000 = **$4.450.000 exacto**; estado de inventario restaurado tras la prueba.
- [x] **SERVICIOS / MAQUILA (factura de servicio)** ✅ 2026-07-25 (Entrega 5) — cierra el **$0 de Feroz** que el cliente ya había visto en el reporte por línea. La columna vertebral lo bloqueaba: `Factura.despachoId` era `@unique NOT NULL`, o sea no había factura sin despacho. Migración aditiva `factura_servicio`: `enum TipoFactura`, `despachoId` → **nullable** (PG admite N NULLs bajo un unique), `Factura.clienteId` **denormalizado con backfill en la misma migración** (se crea nullable → se rellena navegando despacho→op→oc → recién ahí `SET NOT NULL`; si el backfill faltara, la restricción reventaría contra los datos reales), `Factura.lineaId`, `model ServicioCatalogo` y `FacturaLinea` con producto/talla nullable + `servicioId`/`descripcion`. **Refactor obligatorio de cartera**: 4 consultas navegaban `factura.despacho.op.oc` — sin esto las facturas de servicio habrían quedado fuera de la cartera del cliente (deuda invisible). `POST /facturas/servicio` reusa `siguienteConsecutivo('factura')` (no parte la numeración), `totales()` tal cual y `recalcularEstadoCartera` ⇒ los servicios entran a CxC gratis. `GET /facturas/servicio/sugerencia?lineaId&anio&mes` cuenta los pares que la línea llevó a PT: la cantidad a cobrar **no se inventa**. Reporte: la facturación de servicio va en **columna propia** (`servicios`), no suma a `valor` ni a `paresVendidos` — si no, inflaría la meta comercial y contaría pares que nunca salieron; el filtro por línea usa `OR: [{lineaId}, {despacho:{op:{lineaId}}}]`. `SERVICIOS_MANTENIMIENTO` sale de `COLUMNAS_PENDIENTES` (ya no queda ninguna salvo EXTERNO). Front: pantalla `/facturas/servicio/nueva` (sección `factura-servicio`, EN_STAGE) con sugerencia de cantidad y precio base editable, badge "Servicio" en el listado. Verificado E2E vivo: catálogo → sugerencia (1.992 pares) → factura FAC-52 sin despacho → **aparece en cartera junto a las de producto y acepta pago parcial**; reporte por línea: Basarili $430M / Agro $430M / Alta $358M de producto y **Feroz $0 producto + $8.366.400 de servicios**. ⚠️ Pendiente de JP: razón social y NIT de la empresa de Bogotá, si la tarifa es por par o por lote, **quién pone los materiales** (si los ponemos nosotros, la factura debería descargar inventario ⇒ depende de Fase B) y si lleva retenciones.
- [ ] **Líneas de insumo (Marquillas/Punteras/Plantillas)** — producción **por lote** (no par/QR): transformación MP→PT con rendimiento/merma (plantillas: lámina→preforma→troquel por talla, hoy NO se registra ese eslabón), venta a terceros (catálogo de clientes externos ya visto en los Excel) y doble rol como `Material` de las líneas de bota.
- [x] **Cumplimiento DIARIO de la meta mensual** (JP 07-29) ✅ 2026-08-04 (Entrega 6) — se
  desbloqueó con el calendario laboral (`CalendarioLaboral`/`DiaNoHabil`): Gonza confirmó que
  **sí trabajan sábados**, así que el default lun-sáb quedó correcto y `seed:calendario` cargó
  36 festivos (2026-2027) — agosto da 24 días hábiles. La meta diaria se prorratea contra días
  hábiles, no contra días calendario. Quedó sin marcar en su momento; el encabezado de la
  Entrega 6 sí lo registra.
- [x] **Variantes ECONOMICA y S/P (sin puntera)** ✅ 2026-07-21 (Entrega 4) — elegidas al pedir vía el configurador (nuevos ejes **Versión** [Estándar/Económica, solo la 105] y **Puntera** [Con/Sin puntera, refs 101-106]). Infraestructura: `ReglaOverride.piezaId` (migración `override_por_pieza`) + resolver por (material, pieza) — sin pieza sigue alcanzando todas (retrocompatible). Datos REALES del Excel (versión 14-jul, re-bajado del Drive vía gdown): `tools/generar-despiece.py` ya no descarta los bloques variante — genera `bom-variantes.csv` como **diff contra el despiece base** (ECONOMICA 105: ADD microfibra PMIC187 en BOTELLA/CAÑA + micropiel en SOPORTE_LATERAL, REMOVE micropieles de LATERAL/BOTELLA/TALON, SET_CONSUMO×1 — confirma el "19/24 idénticos" de JP; S/P: ADD `PCON44SP` **material nuevo**, curva EN CERO por bloques blancos sin prueba industrial) y `seed:basarili` crea ejes/opciones/reglas + REMOVE estructural de la puntera (PPUN256) por referencia. El re-run del despiece además actualizó el BOM base: **114 bloques grises vs 95** (el cliente validó ~19 más). Costeo y requerimiento de insumos consumen la variante gratis (via `opcionIds` del ProductoConfigurado). Verificado E2E vivo por API: resolver 105+ECONOMICA cambia micropieles/microfibra; 105+S/P quita PPUN256 y agrega PCON44SP en 0. ✅ Sembrado en prod el 2026-07-29 (`seed:basarili --sin-inventario`): 4 grupos · 6 opciones · 11 reglas REMOVE, ejes de variantes liberados al cliente. ~~106 sin puntera en su BOM~~ **resuelto 2026-07-29** con la ficha de JP: la 106 ya tiene su REMOVE de puntera.
- [x] **Compras — secundarios** ✅ 2026-07-21 (Entrega 4, cierre) — **precio en línea de OCP**: `costoUnitario` (columna que ya existía, ahora viva) se prellena al generar desde el requerimiento con el costo de referencia del material (promedio móvil → costo base → null), visible en detalle ($ unit. + total estimado) y listado (Valor est.), y la recepción lo prellena como default editable. **Anulación de OCP**: `POST /compras/ordenes/:id/anular`, enum + guarda (solo sin recepciones ni devoluciones); si era la última viva de su requerimiento, el requerimiento **reabre a CALCULADO** (se puede regenerar); recepción/devolución sobre ANULADA → 409. **OCP manual**: `POST /compras/ordenes` (proveedor + líneas material/cantidad/costo, sin requerimiento) con pantalla "Nueva orden" (`/compras/ordenes/nueva`). Botones nuevos gateados `puedeVerNivel(EN_STAGE)`; columnas de costo visibles (coherente con el costeo ya entregado). Verificado E2E vivo: OCP manual 40×$18.500 → valorEstimado $740.000 → anulada → recepción 409. Pendientes de compras que QUEDAN: nota crédito proveedor (Gálago, definir con cliente) · retenciones · abonos no ligados a factura.
- [x] **AMARRE DE INSUMOS + requerimiento automático** ✅ 2026-07-21 (Entrega 4, EN_STAGE — la promesa de Gonza en la reunión: *"apenas confirman un pedido, el sistema reserva solo los insumos que ya tienen en bodega y les dice exactamente qué falta comprar"*) — `InventarioMaterial.cantReservada` + `RequerimientoCompraLinea.cantReservada` + `RequerimientoCompra.reservaActiva` (migración `amarre_insumos`). Al **generar la OP** desde la OC se dispara solo el requerimiento (si hay `cantAProducir>0`; si falla p.ej. BOM incompleto, la OP queda creada igual): amarra `min(necesaria, disponible − reservadoPorOtros)` con lock `FOR UPDATE` (patrón del amarre PT) y `cantAComprar = necesaria − reservada`. La reserva se **libera** al anular la OP, al despacharla (el consumo real por OF sigue en Fase B) y al recalcular (el nuevo re-amarra; el viejo queda histórico con `reservaActiva=false`). UI: columna "Amarrado" en el requerimiento + sección "Insumos del pedido" en op-detalle; `puedeOperarProduccion` normalizado de lista fija ADMIN/GERENTE a `puedeVerNivel(EN_STAGE)` (de paso STAGE ya no queda ciego — gotcha del 07-16). Verificado E2E vivo local: pedido 300 pares → REQ automático con 30 materiales amarrados (POLIOL 6/8.56, PMAR145 87/214…), recálculo sin duplicar, anulación deja reservas en cero. ⚠️ Gotcha local: tras `migrate dev` correr `npx prisma generate` (no regenera solo).
- [ ] **Amarre por CÉLULA (corte/guarnición/PT)** ⚠️ pedido de JP 07-09 — hoy la OP amarra solo PT por bodega geográfica; falta WIP reservable por etapa (es el comportamiento real de la fábrica). Queda como el corazón de la **Fase B** junto con el consumo real de insumos por OF (que descargue la reserva al consumir). Ojo: desborda una quincena.
- [x] **Materiales FIJOS de la 106 (RESORTADA)** ✅ 2026-07-29 — **JP mandó la ficha** (Sheet `CONSUMO POR REFERENCIAS`, pestaña `106` = "FICHA DE CONSUMO REFERENCIA 106"). Los 20 insumos fijos coinciden **valor por valor** con los de la 105 (MILITAR), que también es resortada: reata 0,33 · resorte #8 0,33 · marquilla 1 · hilos 0,014/0,003 conos · pegante 0,002 · puntera 1 · PU e inyección (iso 0,271 / poliol 0,384 / aditivos / pigmentos / desmoldantes) · plantilla PU 1 · caja 1. Confirma que **la 106 no lleva cordón** (el resorte lo reemplaza). Cargados en `bom-fijo.csv` **y** en `bom-fijo.csv.pre-despiece` — sin lo segundo, una re-corrida de `generar-despiece.py` los borraría, porque reconstruye el fijo desde el respaldo. Transcripción de la ficha en `prisma/data/basarili/ficha-consumo-106.csv`. Efecto colateral que importa: al existir la línea de puntera, `seed:basarili` ya genera el **REMOVE de puntera de la 106** (6 refs en vez de 5) ⇒ su variante S/P por fin quita algo. Sembrado en prod el 2026-07-29 (20 fijos + 19 curvas verificados vivos).

> ⚠️ Segundas, servicios y metas-por-célula hay que **definirlos con el cliente** antes de modelar.

### 2) Deploy a producción
- [x] **Conectar el servicio `backend` de Railway a GitHub (branch `master`)** ✅ 2026-06-16 — backend auto-despliega desde `master` e igual que Vercel; el primer deploy aplicó las 13 migraciones pendientes (DB al día).
- [x] **Re-desplegar el frontend (Vercel)** ✅ 2026-08-13 — el front llevaba **9 días atrasado**
  (último deploy 04-ago) porque el push del 12-ago no disparó nada. Dos causas independientes:
  **(a)** el **webhook de la GitHub App no llega** — la config está impecable (`productionBranch:
  master`, repo conectado, sin `ignoreCommand`, sin pausa), y ya había pasado en jun-2026, así
  que es reincidente; **(b)** `npm install` **rompe todo build limpio**
  (`vite/node_modules/esbuild`: `Expected "0.25.12" but got "0.28.0"`) — los deploys
  anteriores sobrevivían por la caché de build. Fix en `vercel.json` (`df0c695`): se adopta la
  receta del CI. ⚠️ **El `vercel.json` de la raíz MANDA sobre el dashboard/API**: cambiar el
  Install Command por API no tuvo ningún efecto. Deploy verificado: 225s, prod 200 con el bundle
  nuevo. ✅ **Webhook arreglado** el mismo día con `vercel git disconnect && vercel git connect`,
  y **probado con un commit sonda** (`--allow-empty`): a los 15s ya estaba construyendo solo. En
  jun-2026 se dio por arreglado sin probar y se volvió a caer sin que nadie se enterara — de ahí
  la sonda.
  ⚠️ **CORRECCIÓN sobre la causa de (b)** (mismo día, tras medirlo): el commit `df0c695` culpó al
  "lock podado por Windows". **Es falso.** El lock está COMPLETO: trae los binarios `@esbuild` en
  0.25.12 (52 plataformas) *y* en 0.28.0 (26), y un lock regenerado desde cero con
  `npm install --package-lock-only` da los mismos 1812 paquetes y los mismos 22 bindings de
  `@unrs`. **Regenerar el lock NO arregla nada — no gasten tiempo ahí.** La causa real es la
  coexistencia de dos versiones de esbuild (`vite` pide `^0.25`; `tsx` y `@angular/build`, `0.28`):
  `node_modules/.bin/esbuild` queda dedupeado al de la raíz, y el `install.js` del esbuild anidado
  lo ejecuta para validarse y ve la versión que no es. Cualquier `npm install` limpio lo reproduce
  en cualquier SO ⇒ **`--ignore-scripts` es la solución correcta**, no un paliativo, y es lo que el
  CI lleva semanas haciendo. Corolario: **`tools/fix-lock-bindings.mjs` quedó inerte** — sale por
  su early-return de la línea 19 porque el binding que repone ya está en el lock.
- [x] **Datos de prod definidos** ✅ 2026-06-17 — catálogo real del cliente cargado en local vía `seed:basarili` (CSVs del Drive). En prod se corre el seed **una vez** contra Railway.
- [x] **Capturar consumos de BOM** ✅ 2026-07-09 — cargados los consumos REALES con curva por talla y despiece (refs 101-106) desde `CONSUMOSXREFERENCIA`; los 16 bloques sin prueba industrial (celda blanca) quedaron en cero a la espera del cliente.
- [x] **ABM de usuarios Y operarios** ✅ 2026-08-13 (EN_STAGE) — módulo `administracion`.
  Al construirlo salió que **eran dos entidades distintas y ninguna tenía ABM**: `User` (login al
  sistema) y `Operario` (gente de planta, **sin login**, que queda firmada en cada escaneo del
  MES). Ambas se sembraban por seed ⇒ cada persona que entraba o salía exigía tocar la base a
  mano. **Ninguna se borra**: `User` firma despachos, incidencias, movimientos de inventario y
  recepciones; `Operario`, eventos de trazabilidad e incidencias — un DELETE rompería la
  trazabilidad, que es el corazón del MES. Ambas ya traían su bandera (`isActive`/`activo`).
  Guardarraíles de usuarios, todos con test: el `passwordHash` **nunca sale por la API**; nadie
  puede desactivarse ni cambiarse el rol a sí mismo; **no se puede desactivar NI degradar al
  último ADMIN activo** (dejaría el sistema sin quién lo administre, y el ABM es lo único que lo
  revertiría); y **desactivar o resetear contraseña revocan los refresh tokens** — sin eso
  desactivar no servía de nada, quien se va seguía entrando con su sesión viva hasta que
  expirara, que era justo el hueco a cerrar. El actor sale del token (`req.user.sub`), nunca del
  body. En operarios el nombre no se repite dentro de una célula (dos "Juan Pérez" en CORTE harían
  imposible saber quién escaneó) y el listado de administración incluye a los retirados, para
  poder reactivarlos. 568 tests backend + 372 frontend en verde.
  **✅ Verificado E2E vivo local (2026-08-13)**, base restaurada al terminar: el `passwordHash`
  no viaja en el listado (campos: id/username/isActive/createdAt/role) · crear → **entrar con el
  usuario nuevo** → desactivar ⇒ sus refresh tokens en la base pasan de **1 a 0** y el login
  responde **401** · auto-desactivarse **400**, auto-degradarse **400**, username repetido **409**
  · desactivar a un ADMIN habiendo otro activo **200** (no bloquea de más) · operario duplicado en
  la misma célula **409**, mismo nombre en otra célula **201**, y al retirarlo **sale del selector
  del piso** (`?soloActivos`) pero **sigue en administración**.
  🔎 **Dos hallazgos de la verificación, ninguno introducido por este cambio:**
  1. **No existe `POST /auth/refresh`.** El login emite y **persiste** un `refreshToken`, pero no
     hay endpoint para canjearlo — el token se guarda y nunca se usa. La revocación que este ABM
     agrega cubre por adelantado ese vector, pero hoy la sesión larga sencillamente no existe.
  2. El **access token dura 15 min** y el JWT es stateless ⇒ un usuario recién desactivado
     **sigue operando hasta 15 minutos** con el token que ya tenía en la mano. Es el estándar y no
     se arregla desde el ABM (haría falta una lista de revocación o validar `isActive` en el
     guard), pero conviene saberlo antes de prometerle al cliente "corte inmediato".
  ⚠️ El guardarraíl del **último ADMIN** quedó como red defensiva, no como camino alcanzable:
  siendo `/usuarios` solo-ADMIN y estando prohibido tocarse a sí mismo, el actor siempre es otro
  ADMIN activo, así que el conteo nunca llega a cero. Protege si algún día el servicio se llama
  sin actor (seed, script). Está cubierto por tests unitarios, no por la E2E.
  **Falta:** liberar el gate a ENTREGADO el día de la demo.

### 2.b) Tablero de la demo de la Entrega 5 (2026-07-29 → viernes 2026-07-31)

- [x] **Gates volteados en `develop`** ✅ 2026-07-29 (commit `2b122df`, **sin mergear a propósito**):
  `linea-pedido` y `venta-segundas` → `ENTREGADO`; el **MÓDULO `facturas`** de `INTERNO` a
  `EN_STAGE`. Lo último es lo que no era obvio: la factura de servicio de Feroz solo se alcanza
  desde `/facturas`, así que con el módulo en INTERNO **ni el perfil STAGE podía abrirla** y
  gatear solo la sección era inerte. `operar-produccion` **se queda EN_STAGE a propósito**: el
  gating es de UI y el POST sí corre, así que liberarlo dejaría al cliente creando OFs de verdad
  frente a una pantalla que lo rebota a `/pedidos/oc` (`fabricacion` y `despachos` siguen INTERNO).
  ⚠️ **El merge a `master` queda para el día de la demo**: mergear antes despliega los gates y el
  cliente ve la entrega dos días antes (la regla de `CLAUDE.md`).
- [x] **Catálogo de servicios sembrado en prod** ✅ 2026-07-29 — `INY-CAPELLADA` y
  `MANT-INYECTORA`, vía el nuevo `npm run seed:servicios`. Se hizo script aparte porque
  **`seed:demo` no sirve para prod**: además de rehacer pedidos, despachos y producción, borra
  **todas** las facturas de tipo SERVICIO sin filtrar por sus propios datos de demo.
- [x] **`seed:basarili` corrido en prod** ✅ 2026-07-29 con el flag nuevo **`--sin-inventario`**.
  El paso 8 pisa `InventarioMaterial.cantDisponible` con el snapshot del CSV: en prod ya había
  recepciones de compra (303 materiales con stock contra 301 en el CSV), así que correrlo entero
  le habría devuelto el inventario al día en que se exportó el archivo. Backup previo de la base
  en `Agro/backups/prod-20260729-antes-entrega5.sql` (6,6 MB, 61 tablas; prod es **PostgreSQL
  18.4**, así que el dump necesita un `pg_dump` 18 — el del contenedor local es 16 y no sirve).
  Verificado vivo después: BOM 106 con 20 fijos, 11 reglas REMOVE, inventario y 25 OC intactos.

### 2.c) Cartera real de clientes (AGRO) — 2026-07-29

- [x] **Plantilla de sedes diligenciada, limpiada y cargada** ✅ 2026-07-29 —
  `docs/PLANTILLA-SEDES-CLIENTES.xlsx` volvió con **92 filas / 91 NITs** (AGRO). No cargaba tal
  cual: `parsearFilasSedes` **rechaza el archivo entero** ante cualquier error, y tenía cuatro.
  Correcciones aplicadas (todas anotadas en el commit):
  - **3 filas de ejemplo ficticias** que JP no borró (NITs `800987654-2` y `900123456-1`;
    quedaron intercaladas al ordenar alfabéticamente, por eso se le pasaron) → eliminadas.
    De paso se van las únicas ciudades con tilde (`Ibagué`, `Bogotá`), así que no hizo falta
    normalizar nada.
  - **2 filas sin `sede` y sin `principal`** (CALZADO POSADA, CALZATODO SA) → `Principal` + `SI`.
  - **2 filas con `sede` pero sin `principal`** (DANIEL CASTRO BARRAGAN, DAS SAFETY) → `SI`.
  - **1 fila sin dirección** (DOTACIONES RAC, NIT 900337975) → **omitida**: no se inventa una
    dirección de entrega. El cliente sí se crea; su sede queda **pendiente de JP**.
  Resultado: **88 sedes / 88 NITs, 0 errores** contra el validador del proyecto.
- [x] **`npm run seed:clientes`** ✅ nuevo — `seed:sedes` **nunca inventa un cliente** (omite las
  filas huérfanas), y en prod había 7 clientes contra 91 NITs de la plantilla: sin este paso
  previo no cargaba casi nada. Los 89 entran **CONTADO y sin cupo** (la plantilla no trae
  condición comercial; dar crédito no autorizado haría que la regla de cartera dejara pasar
  despachos que debía frenar). Si el NIT ya existe actualiza nombre y ciudad pero **no** su
  condición comercial, para no pisar un cupo ya asignado. Idempotencia verificada con doble
  corrida. CSV al `.gitignore` (NIT + razón social reales) con su `.example.csv`.
- **Cargado en prod** ✅ 2026-07-29 (backup previo en `Agro/backups/prod-20260729-antes-clientes.sql`):
  96 clientes · 91 sedes · 90 principales · **25 OC intactas**. Sin sede quedan solo los 6 de
  demo, Feroz (cliente de servicio, no se le despacha producto) y DOTACIONES RAC.
- ⚠️ **Dato para hablar con JP:** de los 88 clientes reales, **ninguno tiene más de una sede** —
  el único multi-sede del archivo era la fila de ejemplo. Todos quedaron con una sola "Principal".
  Parece que volcó su lista de clientes en vez de desglosar bodegas, y el valor de la
  funcionalidad (despachar a la bodega correcta) está justo ahí. Vale preguntarle.
  → **Respondido por los hechos el 2026-07-30**: la plantilla de BASARILI sí trae multi-sede
  (16 clientes, PROVECOL con 5). Era cosa de la lista de AGRO, no del formato.
- [ ] **Falta la plantilla de ALTA** (la de AGRO llegó el 29-jul, la de BASARILI el 30-jul).

### 2.d) Cartera real de clientes (BASARILI) — 2026-07-30

- [x] **Segunda plantilla cargada y fusionada con la de AGRO** ✅ 2026-07-30 —
  `docs/PLANTILLA-SEDES-CLIENTES-BASARILI.xlsx`, **113 filas / 93 NITs**, de los cuales **14 ya
  estaban** por AGRO: es el mismo cliente comprándole a las dos marcas, **un solo `Cliente`** con
  las sedes de ambas. Las plantillas quedaron renombradas por marca (`-AGRO`, `-BASARILI`).
- [x] **`tools/consolidar-cartera.py`** ✅ nuevo — lee las dos plantillas y escribe
  `clientes.csv` + `sedes-clientes.csv` ya limpios. La limpieza a mano del 29-jul no escalaba a
  dos archivos que se pisan; ahora es reproducible y deja reporte de cada corrección. Reglas:
  - **Dedup por dirección normalizada**, no por texto: `Tv 93 #53- 32 parque empresarial el
    dorado` (AGRO) y `TRANSVERSAL 93  53 32` (BASARILI) son el mismo predio. La clave es
    *tipo de vía + los 4 primeros números*, así `LC 147` y `LC 150` del mismo centro comercial
    siguen siendo dos sedes. Fusionó 8 pares.
  - Cuando una sede ya existía en la BD **gana su nombre viejo** ("Principal"): `seed:sedes`
    busca por (cliente, nombre de sede) y renombrar habría **duplicado** en vez de actualizar.
  - **Razón social**: entre las variantes del mismo NIT gana la más larga (`ALPACA BOGOTA` →
    `ALPACA BOGOTA S.A.S.`), con dos excepciones donde el nombre largo era el de la persona de
    contacto (`BOSINCOL RUBY ANDRADE` → `BOSINCOL SAS`; `ONE SAFETY ROBINSON PARRA` → `ONE
    SAFETY SAS`). 13 clientes de AGRO quedaron con su razón social completa.
  - **NIT**: se le quita el dígito de verificación (`900123456-1` → `900123456`) y los espacios
    (`3 9 8 0 6 3 0 7` → `39806307`).
  - **Una sola principal por cliente** (lo exige `parsearFilasSedes`): 21 clientes venían con
    ninguna o con varias → manda la primera. Nombres de sede repetidos → sufijo (`CALI 2`).
  - **Descarta lo que no es cliente**: INTERRAPIDISIMO (transportadora), GABRIEL PUNTERAS (es
    proveedor) y las 3 filas de ejemplo de la plantilla, que en la de AGRO habían aparecido otra vez.
- ⚠️ **En cuarentena, pendiente de JP: dos NITs cruzados en la plantilla de BASARILI.**
  `901694036` rotula a la vez a DOTAINDUSTRIALES WORK (correcto según AGRO) y a
  **MAKRODOTACIONES**; y `901388889`, que en AGRO es de MAKRODOTACIONES, aparece como
  **DOTACIONES H SAS** con la dirección que en esa misma plantilla tiene LOTUS VT
  (`Cra 63 #21-15 sur`). Mezclarlos rompería la facturación → esas 2 filas **no se cargaron**.
- ⚠️ **También para JP:** `901424621` cambió de `INDUSTRIAL INSAFE` (AGRO) a `INDUSTRIAL ALEPH
  S.A.S` (BASARILI) con el mismo NIT y la misma dirección — ¿cambio de razón social?
  Y `INVERSIONES SURTIORIENTE SAS` (`901103498`) llegó partida en dos filas, una con el nombre y
  otra con el NIT, ambas con la misma dirección: quedó como un cliente con una sede.
- **Cargado en prod** ✅ 2026-07-30 (backup previo en `Agro/backups/prod-20260730-antes-basarili.sql`):
  **164 clientes reales · 183 sedes · 16 con más de una**, ninguno sin sede principal.

### 3) Git — higiene de tags y merges
- [x] **Tags al día** ✅ 2026-07-12 — creados `demo-9` (ed05bb2), `demo-10` (f7af48d), `demo-11` (40a4ab6), `demo-12` (9ff9fad) sobre el commit de cierre de cada demo en `develop` (entraron a `master` en bloque con la 13, sin merge propio) y `demo-14` (a97b4b9, el merge que la llevó a `master`, mismo patrón que `demo-13`). Ya existían: `demo-1`, `demo-13`, `nucleo-real`, `entrega-1`, `entrega-1.1`, `entrega-2`.
- [x] **Merges verificados** ✅ 2026-07-12 — `master` contiene todo `develop` (las demos 2-12 entraron en los merges en bloque; no hay nada sin mergear). Regla vigente: cada entrega/demo nueva sí lleva su merge `--no-ff` + tag.

### 4) Deudas técnicas menores (anotadas, no bloquean)
- [ ] `op-detalle` muestra flash de skeleton al recargar tras Anular.
- [ ] Anular OP es destructivo y no pide confirmación (validar con cliente).
- [ ] `ui-drawer` focus-trap → ✅ resuelto · `InventarioApi` tipado → ✅ resuelto.
- [ ] Futuros anotados: precio en línea de OCP (costos de compra), nota crédito proveedor (Gálago), anulación de OCP, abonos a cuenta no ligados a factura, cron de recálculo de cartera, retenciones (reteFuente/IVA/ICA).
- [ ] **`seed:demo` borra facturas de SERVICIO sin filtro** — `factura.deleteMany({ where: { tipo: 'SERVICIO' } })` (y sus líneas y pagos) no acota a los datos de demo, a diferencia del resto de su limpieza, que sí filtra por consecutivo. Hoy no hace daño (prod tiene 0), pero el día que el cliente facture maquila y alguien corra el seed, se las lleva. Acotar por los consecutivos de demo.
- [ ] **`Linea.id` no es determinista entre entornos** — Feroz es `id=4` en prod y `12` en local. Resolver siempre por `codigo` (el seed ya lo hace; vale para cualquier script nuevo).
- [ ] 🔧 **PARA MAÑANA (2026-08-05) — la observación de la entrega de materiales no se puede leer.**
  El campo "Observación (opcional): a quién se le entregó, turno…" de `/fabricacion/of/:id/consumo`
  se captura, se guarda en `MovimientoInventario.observaciones`, el backend lo devuelve en
  `GET /inventario/movimientos` y el modelo del frontend lo tipa (`MovimientoKardex.observaciones`)
  — pero **la tabla del kardex nunca lo pinta**: sus columnas son Fecha·Tipo·Motivo·Ítem·Cantidad·
  Referencia·Usuario (`inventario-consolidado.component.ts:162`). O sea se le pide un dato al
  almacenista que después nadie puede consultar desde la interfaz. **Arreglo:** agregar la columna
  al kardex (y su spec). ~10 min. Detectado el 2026-08-04 preparando la demo; no se tocó ese día
  para no meter un deploy extra a horas de la reunión, y no la afecta porque `inventario` es INTERNO.

---

## 🚀 PRODUCCIÓN

**Flujo de deploy real** (verificado 2026-06-16):

```
   merge demo-N → master
        ├──► Vercel (frontend)  ✅ AUTO-DEPLOY desde master (conectado a GitHub)
        └──► Railway (backend)  ✅ AUTO-DEPLOY desde master (conectado 2026-06-16 vía MCP)
```

| Servicio | Plataforma | Deploy | Estado |
|----------|-----------|--------|--------|
| Frontend (Angular) | Vercel | Auto desde `master` (GitHub, conectado 2026-06-16) | ✅ Al día, con gating por rol |
| Backend (NestJS) | Railway | Auto desde `master` (GitHub, conectado 2026-06-16) | ✅ Al día, DB migrada |
| DB (PostgreSQL) | Railway | Servicio `postgres-ssl:18` | ✅ Activo |

**Hito 2026-06-16 — CI/CD integrado:** ambos servicios auto-despliegan desde `master`.
- **Backend:** conectado a `Gonza10Co/agro-erp@master` vía Railway MCP (antes `source.repo=null`). El `Dockerfile` corre `migrate deploy` al arrancar → cada deploy aplica migraciones solo.
- **Frontend:** conectado a GitHub vía `vercel git connect` (antes era deploy manual por CLI). Root Directory = `frontend/`.
- **Gating por rol en prod:** usuario `cliente`/`botas2026` (rol CLIENTE) ve solo demos 1-2; `admin`/`admin123` (ADMIN) ve todo. Verificado: login de ambos responde con su rol. Credenciales en memoria `credenciales-demo-prod`.

- **URLs y logins demo:** ver memoria `urls-produccion`.
- **Backend Railway:** proyecto `agro-erp` (renombrado el 2026-06-16, antes `considerate-compassion`), servicio `backend`, dominio `backend-production-a89d.up.railway.app`. El CORS se autoriza por env var `CORS_ORIGINS` (no commiteada).
- **Migraciones:** el `Dockerfile` corre `npx prisma migrate deploy` al arrancar → cada deploy del backend aplica las migraciones pendientes (idempotente). No hay paso manual.
- **Para subir una demo a prod operable:** (1) `master` al día hasta esa demo, (2) backend conectado a `master` o `railway up` a mano, (3) el deploy aplica migraciones solo.

---

## ▶️ Cómo correr local

```bash
# DB (Docker): contenedor agro-erp-pg en localhost:5433
docker start agro-erp-pg

# Backend (:3001) — NUNCA :3000
cd agro-erp/backend
npm run start:dev
# seeds (si la DB está limpia — en ESTE orden: seed:demo necesita las líneas):
#   npm run seed          # usuario admin / admin123
#   npm run seed:catalogo
#   npm run seed:basarili # catálogo real del Drive + las 4 líneas de producción
#                         # (Basarili/Agro/Alta/Feroz; Feroz arranca en INYECCIÓN,
#                         #  EXTERNA queda desactivada si existía)
#   npm run seed:demo     # OCs demo con línea asignada + metas por línea (07-13)
#   npm run seed:calendario # días laborales + festivos colombianos (07-30)

# Frontend (:4200)
cd agro-erp/frontend
npm start
# login: admin / admin123
```

Más comandos y convenciones en `agro-erp/CLAUDE.md`. Planes por demo en `agro-erp/docs/plans/`.
