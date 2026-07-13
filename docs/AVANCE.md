# AVANCE — agro-erp (Botas Agroindustrial · ERP + MES)

> **Única fuente de verdad del avance.** Foto de "hecho vs. falta" de un vistazo.
> Se actualiza al cierre de cada demo. El **git log** manda sobre el detalle fino
> (los commits `feat(...)` son el handoff real); este doc es el mapa ejecutivo.
>
> Última actualización: **2026-07-09** · Stack: Angular 19 + signals · NestJS + Prisma · PostgreSQL
> Deploy: front → Vercel · back → Railway (ver memoria `urls-produccion`).

---

## 📊 Foto del avance

```
   FUNCIONALIDAD (núcleo)        ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░  ~90%
   ALCANCE DEL EXCEL DEL DUEÑO   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░  ~78%
   DEPLOY / PRODUCCIÓN           ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░  ~45%
   GIT HIGIENE (merges + tags)   ▓▓▓▓▓░░░░░░░░░░░░░░░  ~25%
```

**Tests:** 409 backend + 287 frontend (+13 e2e), verdes 🟢 · ambos builds limpios.

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
- **Esperando de JP:** Excel de sedes diligenciado (plantilla enviada 07-09) · lista de
  materiales FIJOS de la 106 (hilos/marquilla/caja) · **datos de emisor de Basarili/Agro/Alta**
  (razón social, NIT, cuenta) para que sus proformas salgan con membrete propio.
  ~~¿La GRUESA cuenta cordones o pares?~~ **Respondido 07-10: 144 PARES por gruesa**
  (consumo corregido a 1/144 = 0.0069; muestras en $0 confirmadas sin costear).

---

## ⏳ FALTA (backlog priorizado)

### 1) Modelado de negocio — conceptos del Excel aún sin modelar
- [x] **EXTERNO / tercerización** ✅ 2026-07-01 — modelado como línea con `celulaInicial=INYECCION`; desde 2026-07-06 esa línea es **Feroz** (la Externa original quedó desactivada; JP confirmó que esos cortes no vuelven).
- [x] **Línea por pedido** ✅ 2026-07-12 (EN_STAGE) — `OrdenCompra.lineaId` (+`OrdenProduccion.lineaId`, migración `linea_por_pedido`): el wizard de OC pide la línea (selector gateado EN_STAGE, obligatorio para quien lo ve), la OP la hereda al generarse y cada Par nace con la línea del pedido (célula inicial incluida — Feroz arranca en INYECCIÓN); la reposición de calidad hereda la línea del par dado de baja. `Marca.lineaId` queda solo como fallback histórico. Verificado E2E local por API (OC Feroz → OP → OF → 3 pares en INYECCIÓN con `lineaId`). Backend valida línea activa; OCs viejas sin línea siguen funcionando igual.
- [x] **Reporte Diario Gerencial POR LÍNEA** ✅ 2026-07-12 (EN_STAGE) — `GET /reportes/diario?lineaId` filtra producción vía `par.lineaId` y facturación vía `despacho.op.lineaId`; selector "Todas las líneas / …" en la pantalla. **Metas por línea**: `Meta.lineaId` (NULL = meta global, migración `metas_por_linea`); el drawer de metas edita las de la línea filtrada. Honesto: el **kardex de bodega PT no se segmenta** (el stock PT no conoce la línea) — con filtro activo la sección lo dice y va vacía. Verificado E2E local (evento Feroz cuenta solo en Feroz; global agrega todo). ⚠️ Depende de que los pedidos nuevos traigan línea; los históricos (lineaId NULL) solo aparecen en "Todas las líneas". **Seed demo por línea ✅ 2026-07-13**: `seed-demo` asigna línea a todas sus OCs (resueltas por `codigo`, nunca por id) y reparte la producción D14 en 4 cadenas — 9014 Basarili 45% · 9018 Agro 30% · 9019 Alta 15% · 9020 Feroz 10% (Feroz solo eventos INYECCIÓN→PT) — con metas por línea (Feroz sin guarnición ni facturación: el servicio de inyección se factura aparte, sin modelar). De paso: el upsert de metas estaba roto (el unique `anio_mes_tipo` murió con la migración `metas_por_linea` → upsert manual) y el reset de máquinas/operarios ya no borra global (upsert idempotente: había eventos de OPs no-demo que los referencian por FK).
- [ ] **SEGUNDAS** — categoría de calidad vendible; no existe en el modelo. Dato real: Feroz ya maneja "SEGUNDAS FEROZ" como inventario aparte (336 segundas vs 263 primeras al 03-jul-2026).
- [ ] **SERVICIOS / MANTENIMIENTO** — línea de ingreso aparte, no modelada. Caso real: Feroz = servicio de inyección a la capellada de Bogotá (maquila).
- [ ] **Líneas de insumo (Marquillas/Punteras/Plantillas)** — producción **por lote** (no par/QR): transformación MP→PT con rendimiento/merma (plantillas: lámina→preforma→troquel por talla, hoy NO se registra ese eslabón), venta a terceros (catálogo de clientes externos ya visto en los Excel) y doble rol como `Material` de las líneas de bota.
- [ ] **Metas por célula** — el Reporte usa metas mensuales por tipo; falta el desglose por célula.
- [ ] **Variantes ECONOMICA y S/P (sin puntera)** ⚠️ NUEVO 07-09 — JP confirmó: variantes de la misma referencia elegidas AL PEDIR (ECONOMICA: micropiel lateral/botella → microfibra; S/P: contrafuerte preformado en vez de puntera). Requiere **overrides por (material, pieza)** — hoy apuntan solo a material. Los datos ya están identificados en la hoja del cliente. → **candidata a Entrega 3**.
- [ ] **Amarre por CÉLULA (corte/guarnición/PT)** ⚠️ pedido de JP 07-09 — hoy la OP amarra solo PT por bodega geográfica; falta WIP reservable por etapa (es el comportamiento real de la fábrica). Va de la mano con el **amarre de INSUMOS** (Fase B original). Ojo: juntas desbordan una quincena.
- [ ] **Materiales FIJOS de la 106 (RESORTADA)** — solo tiene las 19 líneas del despiece; su lista de hilos/marquilla/cordón/caja no existe en ningún histórico. Pedirla a JP o derivarla de una referencia hermana.

> ⚠️ Segundas, servicios y metas-por-célula hay que **definirlos con el cliente** antes de modelar.

### 2) Deploy a producción
- [x] **Conectar el servicio `backend` de Railway a GitHub (branch `master`)** ✅ 2026-06-16 — backend auto-despliega desde `master` e igual que Vercel; el primer deploy aplicó las 13 migraciones pendientes (DB al día).
- [ ] **Re-desplegar el frontend (Vercel)** — quedó atrás del backend (commit setup inicial). Redeploy en Vercel o push a `master`.
- [x] **Datos de prod definidos** ✅ 2026-06-17 — catálogo real del cliente cargado en local vía `seed:basarili` (CSVs del Drive). En prod se corre el seed **una vez** contra Railway.
- [x] **Capturar consumos de BOM** ✅ 2026-07-09 — cargados los consumos REALES con curva por talla y despiece (refs 101-106) desde `CONSUMOSXREFERENCIA`; los 16 bloques sin prueba industrial (celda blanca) quedaron en cero a la espera del cliente.
- [ ] **ABM de usuarios** (diferido) — hoy operan con usuarios sembrados; falta pantalla para que el cliente cree sus operarios/gerentes.

### 3) Git — higiene de tags y merges
- [x] **Tags al día** ✅ 2026-07-12 — creados `demo-9` (ed05bb2), `demo-10` (f7af48d), `demo-11` (40a4ab6), `demo-12` (9ff9fad) sobre el commit de cierre de cada demo en `develop` (entraron a `master` en bloque con la 13, sin merge propio) y `demo-14` (a97b4b9, el merge que la llevó a `master`, mismo patrón que `demo-13`). Ya existían: `demo-1`, `demo-13`, `nucleo-real`, `entrega-1`, `entrega-1.1`, `entrega-2`.
- [x] **Merges verificados** ✅ 2026-07-12 — `master` contiene todo `develop` (las demos 2-12 entraron en los merges en bloque; no hay nada sin mergear). Regla vigente: cada entrega/demo nueva sí lleva su merge `--no-ff` + tag.

### 4) Deudas técnicas menores (anotadas, no bloquean)
- [ ] `op-detalle` muestra flash de skeleton al recargar tras Anular.
- [ ] Anular OP es destructivo y no pide confirmación (validar con cliente).
- [ ] `ui-drawer` focus-trap → ✅ resuelto · `InventarioApi` tipado → ✅ resuelto.
- [ ] Futuros anotados: precio en línea de OCP (costos de compra), nota crédito proveedor (Gálago), anulación de OCP, abonos a cuenta no ligados a factura, cron de recálculo de cartera, retenciones (reteFuente/IVA/ICA).

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

# Frontend (:4200)
cd agro-erp/frontend
npm start
# login: admin / admin123
```

Más comandos y convenciones en `agro-erp/CLAUDE.md`. Planes por demo en `agro-erp/docs/plans/`.
