# Revisión E2E — Entrega 1 al cliente (paquete rol CLIENTE)

> Fecha: 2026-07-02 · Revisión en vivo (local, DB con catálogo real Basarili) como usuario `cliente`.
> Alcance: lo que ve el rol CLIENTE = Clientes · Pedidos (OC/OP) · Catálogo (Configurador + Editor de BOM).
> Contexto: primera entrega productiva la próxima semana; el cliente empieza a usar el sistema en producción.
> Los módulos adelantados quedan ocultos bajo ADMIN/GERENTE (roles = gate de demo).

## Veredicto

**El paquete entregable funciona de punta a punta.** Suites verdes (338 back + 258 front), build de
producción OK, consola sin errores en todo el recorrido. Hay **1 fuga de gating** a resolver antes de
entregar y 3 hallazgos de pulido/datos.

## Lo verificado en vivo (como `cliente`)

| Flujo | Resultado |
|---|---|
| Login → aterrizaje en `/pedidos/oc` | ✅ |
| Menú solo con módulos entregables | ✅ (OC·OP·Clientes·Configurador) |
| Gating negativo: `/inventario`, `/catalog/marcas` | ✅ rebotan a `/pedidos/oc` |
| Configurador: ref 101 + marca + opciones + talla → BOM en vivo | ✅ 36 materiales, explosión multinivel (PLANTILLA PU→POLIOL) |
| Editor BOM (nuevo p/ cliente): anti-duplicado | ✅ "Ese material ya está en el BOM" |
| Editor BOM: merma visible en lista/preview | ✅ "0.3 M · +5% merma" |
| Editor BOM: confirmación antes de versionar | ✅ "…se desactivará la v1 vigente. ¿Continuar?" |
| Editor BOM: guardar como CLIENTE (backend `@Roles`) | ✅ v2 y v3 guardadas (v3 restaura contenido original) |
| Nueva OC: wizard 4 pasos, validaciones, COP | ✅ OC #19 Minera El Roble, 40 pares, $3.400.000 |
| Confirmar OC → Generar OP → amarre | ✅ OP-1 **Amarrada**: 30 de stock + 10 a producir (75%) |
| Detalle OP: cumplimiento por talla/bodega | ✅ |
| Clientes: listado ABM con crédito/cartera | ✅ (incluye estado VENCIDO) |
| Consola navegador | ✅ 0 errores / 0 warnings |
| Suite backend / frontend / build prod | ✅ 338/338 · 258/258 · build OK (warning CommonJS `qrcode`, inofensivo) |

## Hallazgos (priorizados)

### 🔴 1. Fuga de gating en detalle de OP — resolver ANTES de entregar
`/pedidos/op/:id` (módulo `pedidos`, visible al CLIENTE) muestra los botones **"Generar OF"**,
**"Calcular requerimientos"** y **"Anular OP"**. Los dos primeros disparan módulos NO entregados
(fabricación/compras, ocultos): si el cliente genera una OF no puede verla ni operarla → experiencia
rota y datos de producción creados por accidente. Decidir: ocultar esos botones para CLIENTE
(consistente con el gate de demo) o incluirlos en la entrega. "Anular OP" es de pedidos, puede quedarse,
pero conviene confirmación.

### 🟡 2. Voseo argentino en el copy (cliente colombiano)
Textos con voseo: "**Accedé** con tu cuenta…", "**Contactá** a TI" (login), "**Elegí** una referencia…",
"Elegí: Color, Suela" (configurador), "**Agregá** al menos un producto" (wizard OC). Cambiar a tuteo
colombiano ("Accede", "Contacta", "Elige", "Agrega"). Barrido rápido: `grep -rE "(Accedé|Contactá|Elegí|Agregá|Cargá|Buscá)" frontend/src`.

### 🟡 3. Datos BOM: consumos de hilo imposibles
BOM de ref 101: `HILO APTAN #40 → 43.02 CONO` y `#60 → 27.16 CONO` **por par**. Son consumos en
**metros** capturados con unidad CONO (5.000/7.500 mts por cono). Infla cualquier requerimiento de
compra (43 conos/par ≈ 215 km de hilo). Revisar las líneas de hilo de los 5 BOMs y convertir a
fracción de cono o cambiar unidad.

### 🟡 4. Maestro de materiales con duplicados
En el selector del editor se ven repetidos: `MARQUILLA TORO` ×3, `MICROPIEL CAFÉ` ×2, `PU CS BLANCO` ×2
(códigos distintos, mismo nombre). Confunde al elegir material y fragmenta stock/consumos. Depurar en
`materiales.csv` (fusionar con `MaterialAlias`) antes de que el cliente capture BOMs reales.

### 🔵 Observaciones menores (no bloquean)
- La OC nueva aparece al final de la lista: los datos demo usan consecutivos 9000+ y la secuencia real
  arranca en ~19. En producción (datos limpios) el orden será natural. Verificar orden `numero desc`.
- OC #19 quedó creada para "Minera El Roble" con cartera VENCIDA — correcto: la regla de cartera
  bloquea DESPACHO, no OC/OP.
- URL del detalle OP usa id interno (`/pedidos/op/99` para OP-1) — cosmético.

## Pendientes de la entrega (fuera de esta revisión)
- Depurar datos demo vs. reales en la DB de producción antes del arranque (OCs 9000+ de demo).
- Password admin de prod (Railway) — SQL pendiente de correr (ver chat 2026-07-02).
- Puente marca→SKU para cargar Producto Terminado (espera respuesta de Juan Pablo).
