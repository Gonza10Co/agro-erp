# Guion de Demo — Demos 1 y 2 (Botas Agroindustrial · ERP + MES)

> **Propósito:** base para armar la presentación al cliente de esta semana.
> Cubre las dos entregas: **Demo 1 — Flujo de pedidos** y **Demo 2 — Catálogos + BOM**.
> Es el guion del flujo en vivo + la narrativa de negocio. La presentación visual
> ("Acero") se genera aparte con la skill `demo-presentation` usando este documento como insumo.
>
> ⚠️ **Antes de presentar:** verificar contra el seed los datos puntuales marcados con `[verificar]`
> (nombres de clientes, códigos de producto, OCs sembradas). Correr el flujo completo una vez en local/prod.

> ## 🎯 Encuadre decidido (2026-06-23)
>
> **Esta semana = recorrido guiado** de Demos 1 y 2 (nosotros manejamos en vivo) + anunciar el piloto.
> **Próxima fase = piloto usable acotado** con el rol CLIENTE ampliado (ver §9).
> El usuario `admin` es **interno**; vamos más avanzados de lo que el cliente sabe →
> **la demo se hace SIEMPRE con el rol CLIENTE**, que solo ve `clientes`, `pedidos`, `catalogo`.
> No mostrar ni mencionar módulos de fabricación, compras, cartera, facturas, etc.

---

## 1. Qué le mostramos al cliente

Las Demos 1 y 2 son **la columna vertebral del pedido**: cómo entra un pedido del cliente
y cómo el sistema sabe qué fabricar, con qué materiales y qué tiene ya en bodega.

```
   DEMO 2 (cimientos)                    DEMO 1 (operación)
   ┌─────────────────────┐              ┌──────────────────────────────┐
   │  Catálogos + BOM     │   habilita   │  Pedido OC → OP → Amarre     │
   │  (qué se fabrica y   │ ───────────► │  (qué pide el cliente y      │
   │   con qué materiales)│              │   qué hay que producir)      │
   └─────────────────────┘              └──────────────────────────────┘
```

**Mensaje central:** "El sistema ya conoce su catálogo real, y con eso convierte un pedido
en una orden de producción que sabe qué amarrar de stock y qué falta fabricar — sin captura manual."

**Audiencia:** dueño / gerencia. Hablar en lenguaje de negocio, no técnico.

---

## 2. Orden sugerido de la demo

Aunque numeradas 1 y 2, **se presenta primero la Demo 2** (los cimientos) y luego la Demo 1
(la operación que se apoya en ellos). Así la narrativa fluye de "qué tenemos cargado" → "qué hacemos con eso".

```
  1) Catálogos cargados (Demo 2)  →  "este es SU catálogo real, no datos de prueba"
  2) BOM de una referencia (Demo 2) →  "el sistema sabe qué materiales lleva cada bota"
  3) Crear un pedido / OC (Demo 1)  →  wizard de 4 pasos
  4) Confirmar OC y generar OP (Demo 1) → amarre automático de inventario
  5) Revisar el amarre por talla y bodega (Demo 1)
  6) (Opcional) Anular OP → muestra reversa segura
```

---

## 3. DEMO 2 — Catálogos + BOM (cimientos)

### 3.1 Maestros / Catálogo cargado con data real del Drive

Punto fuerte a recalcar: **no es data inventada, es el catálogo del cliente migrado del Drive.**

| Dato | Volumen cargado |
|------|-----------------|
| Marcas | 110 `[verificar]` |
| Materiales | 319 `[verificar]` |
| Referencias (modelos de bota) | 5 `[verificar]` |
| BOMs (uno por referencia) | 5 `[verificar]` |

**Pantallas a mostrar (menú "Catálogo" / "Maestros"):**

| Ruta | Qué se muestra |
|------|----------------|
| `/catalog/referencias` | Tabla de referencias: código, nombre, marca, rango de tallas, acciones (editar · BOM) |
| `/catalog/materiales` | Listado de materiales (componentes) |
| `/catalog/marcas` | Listado de marcas |
| `/catalog/grupos-opcion` | Ejes de configuración (color de suela, punta, etc.) |
| `/catalog/configurador` | Configurador de productos (crear un SKU vendible) |

**Guion:** abrir `/catalog/referencias`, mostrar que están las referencias reales del cliente,
y que cada una tiene su marca y su rango de tallas (ej. 34–46).

### 3.2 Editor de BOM — "el sistema sabe qué lleva cada bota"

Ruta: `/catalog/bom/:referenciaId/editar`

**Qué mostrar:**
- Grid de **curva de tallas** × materiales: el consumo de cada material por talla.
- **Versionado:** solo hay **un BOM activo por referencia**. Al guardar cambios se crea una
  nueva versión y la anterior queda como histórico → trazabilidad de cambios de fórmula.
- Drawer lateral para agregar/editar un material del BOM.

> ⚠️ **Notas de estado (no mencionar al cliente salvo que pregunte):**
> - Los 5 BOMs reales se cargaron con **consumo placeholder (1)** porque el MRP del Drive no traía cantidades.
>   En el piloto, el **catálogo base + BOM lo mantenemos NOSOTROS (admin)** — no el cliente (§9).
> - Con el **rol CLIENTE el editor de BOM es SOLO LECTURA** (`POST /catalog/bom/version` → 403).
>   En la demo, abrir el BOM para **mostrar la curva de tallas y los materiales**, no para guardar cambios.
> - **Importante:** el flujo que el cliente opera (OC→OP→amarre) corre contra `InventarioPT`,
>   **no depende de los consumos de BOM** (esos solo se usan aguas abajo, en compras, que el cliente no ve).

### 3.3 Configurador de productos

Ruta: `/catalog/configurador`

Flujo: **Marca → Referencia → Opciones (color suela, punta…) → vista previa (código + nombre) → Crear.**
Genera un **ProductoConfigurado** (SKU único) que queda disponible para usarse en una OC.

**Guion:** "De una referencia + opciones, sale el producto concreto que el cliente puede pedir."

> ⚠️ Hoy `POST /catalog/productos` es **ADMIN/GERENTE**; con rol CLIENTE no se puede crear.
> En el piloto (§9) se amplía el rol CLIENTE para que **sí pueda crear sus productos**.

### 3.4 Resolvedor de BOM multinivel (backend, se explica — no es pantalla)

El sistema expande recursivamente el árbol del BOM (incluye subensambles), usa siempre la
**versión activa**, multiplica los consumos por las cantidades pedidas y obtiene **el material total necesario por talla**.
Es el motor que conecta "qué se pidió" con "qué materiales hacen falta".

---

## 4. DEMO 1 — Flujo de pedidos (OC → OP → Amarre)

### 4.1 Gestión de clientes

Ruta: `/clientes`

- Tabla: NIT, Nombre, Ciudad, Tipo de crédito, Estado de cartera.
- **"Nuevo cliente"** → drawer con formulario: NIT (único), Nombre, Ciudad,
  Tipo de crédito (CONTADO / D30 / D60 / D90), Cupo.
- Editable y desactivable (un cliente inactivo no puede generar OC).

**Guion:** mostrar la lista, abrir un cliente `[verificar nombre del seed]`, mencionar el tipo de crédito
(engancha con la regla de cartera que se verá en demos posteriores).

> ⚠️ Hoy crear/editar/desactivar cliente es **ADMIN/GERENTE**; con rol CLIENTE solo se listan.
> En el piloto (§9) se amplía el rol CLIENTE para que **administre sus propios compradores**.

### 4.2 Wizard "Nueva OC" — 4 pasos

Ruta: `/pedidos/oc/nueva` (botón **"Nueva OC"** en `/pedidos/oc`)

```
 Paso 0          Paso 1            Paso 2              Paso 3
 ┌────────┐     ┌──────────┐     ┌─────────────┐     ┌──────────┐
 │ Cliente│ ──► │ Productos│ ──► │ Curva tallas│ ──► │ Revisar  │ ──► [Crear OC]
 └────────┘     └──────────┘     └─────────────┘     └──────────┘
```

| Paso | Campos / acción | Validación |
|------|-----------------|------------|
| **0 · Cliente** | Cliente (buscador NIT+nombre), OC del cliente (opcional), Observaciones | Cliente obligatorio |
| **1 · Productos** | Agregar/quitar ProductoConfigurado (buscador por nombre o código) | Mínimo 1 producto |
| **2 · Curva de tallas** | Por línea: grid de tallas (del rango de la referencia) + cantidades + **Precio por par (COP)** | Al menos 1 talla con cantidad > 0 |
| **3 · Revisar** | Resumen: cliente, líneas (pares × precio = subtotal), **total general (pares + valor COP)** | — |

Al final: botón **"Crear OC"** → la OC nace en estado **BORRADOR** (editable).

> 💡 La OC en BORRADOR permite ajustar cantidades/precios en línea antes de confirmar.

### 4.3 Confirmar OC → Generar OP (amarre automático)

En el detalle de la OC (drawer en `/pedidos/oc`):

```
  BORRADOR ──[Confirmar OC]──► CONFIRMADA ──[Generar OP]──► EN_PRODUCCION
                                                  │
                                                  └─► crea OP AMARRADA
```

1. **"Confirmar OC"** → valida cliente activo, tallas dentro del rango, cantidades > 0. OC → **CONFIRMADA**.
2. **"Generar OP"** → el sistema, **en una sola transacción**:
   - Genera el consecutivo de OP automáticamente.
   - Recorre cada línea/talla y busca el stock en `InventarioPT` (producto · talla · bodega).
   - **Amarra lo disponible** y calcula lo que falta producir (`cantAmarrada` vs `cantAProducir`).
   - Registra las reservas de inventario (qué bodega alimenta qué parte de la OP).
   - OC → **EN_PRODUCCION**.

**Mensaje clave:** "El sistema decide solo qué se cubre con stock existente y qué hay que fabricar.
Cero cálculo manual."

### 4.4 Revisar el amarre — pantalla de la OP

Ruta: `/pedidos/op/:id`

- Hero + resumen de la OP.
- **Amarre por talla:** barras visuales de stock amarrado vs. a producir.
- Pestaña **"Por bodega":** de qué bodega salió cada reserva.
  - Bodegas sembradas `[verificar]`: **IBG** (Ibagué, propia) y **BOG** (Bogotá, hermana);
    la **prioridad** define el orden de consumo al amarrar.

### 4.5 (Opcional) Anular OP — reversa segura

- Botón **"Anular OP"** (visible si OP está CREADA o AMARRADA).
- Deshace las reservas: libera el inventario reservado y borra las reservas.
- La OC vuelve a **CONFIRMADA** (se puede generar una OP nueva).

**Guion:** mostrar que el sistema no deja inventario "colgado" — la reversa es atómica y segura.

---

## 5. Estados (para apoyar la narrativa)

```
  OC:  BORRADOR → CONFIRMADA → EN_PRODUCCION → (CERRADA | ANULADA)
  OP:  CREADA   → AMARRADA   → EN_PRODUCCION → (CERRADA | ANULADA)
```

---

## 6. Gating por rol (importante para la demo en prod)

El cliente puede entrar con su propio usuario y **solo ve lo entregado (Demos 1 y 2)**:

| Rol | Ve (menú) | Puede escribir |
|-----|-----------|----------------|
| **CLIENTE** (`cliente` / `botas2026`) | Solo 3 módulos: `clientes` · `pedidos` (OC+OP) · `catalogo` | **Hoy:** crear/confirmar OC, generar/anular OP. **Solo lectura** en clientes y todo el catálogo/BOM. |
| **ADMIN / GERENTE** (`admin` / `admin123`) — **uso interno** | Todo el sistema | Todo |

> El `admin` es **nuestro** y ve el sistema completo (mucho más avanzado de lo que el cliente sabe).
> Por eso **la demo se hace con el rol CLIENTE**, que no destapa el avance. (Memoria `credenciales-demo-prod`.)
>
> **Gating en dos capas:** (1) frontend `core/auth/modulos.ts` oculta los módulos no permitidos;
> (2) backend `RolesGuard` + `@Roles()` rechaza con 403 si se intenta escribir sin rol.
> Enum de roles: `ADMIN · GERENTE · CLIENTE · OPERARIO`.

---

## 9. Piloto usable acotado — rol CLIENTE ampliado (próxima fase)

**Objetivo:** que el cliente deje de solo "mirar" y empiece a **operar con sus datos reales**,
sin destapar el avance del sistema completo.

**Reparto de responsabilidades:**

```
   ✅ El CLIENTE administra su CAPA COMERCIAL
        • ABM de sus compradores (clientes)
        • Crear/editar sus productos (configurador)
        • Crear pedidos: OC → OP → amarre (ya lo hace hoy)

   🔒 NOSOTROS (admin) mantenemos la CAPA DE INGENIERÍA
        • Referencias, marcas, materiales
        • BOM y consumos por talla  (requiere criterio técnico)
```

**Trabajo de desarrollo (estimado 1–2 días + deploy):**
- [ ] Backend: agregar `CLIENTE` a `@Roles()` en `clientes` (POST/PATCH/desactivar) y en `POST /catalog/productos`.
- [ ] Frontend: habilitar "Nuevo cliente" / "Crear producto" para CLIENTE; dejar referencias/materiales/marcas/BOM en **solo lectura** para él.
- [ ] Tests back + front (RolesGuard y gating de UI).
- [ ] Datos en prod: verificar que estén las referencias + productos base para que el cliente pueda configurar.
- [ ] Deploy (merge a `master` → auto-deploy Vercel + Railway).

**Por qué el BOM placeholder NO bloquea este piloto:** el flujo que opera el cliente
(OC→OP→amarre) corre contra `InventarioPT`, no contra los consumos de BOM (§3.2).

**Mensaje al cliente esta semana:** "Lo que ven hoy ya está funcionando; en la próxima entrega
quedan habilitados para cargar sus compradores y sus productos y empezar a registrar pedidos ustedes mismos."

---

## 7. Checklist previo a la demo

- [ ] Backend (Railway) y frontend (Vercel) al día desde `master`.
- [ ] Verificar datos sembrados reales: clientes, referencias, productos, OCs de ejemplo.
- [ ] Correr el flujo completo de punta a punta una vez (crear OC → confirmar → generar OP → ver amarre).
- [ ] Confirmar login del rol CLIENTE y que el gating del menú es correcto.
- [ ] Tener a mano una referencia con BOM para abrir el editor.
- [ ] Reemplazar todos los `[verificar]` de este documento con los datos reales del seed.

---

## 8. Insumos para construir la presentación

- Este guion (orden de escenas + mensajes clave).
- Estilo visual: tema **"Acero"** vía skill `demo-presentation`.
- Regla de la skill: **no mostrar costos ni delatar avance** de demos posteriores.
- Fuentes de verdad del avance: `agro-erp/docs/AVANCE.md` y el git log.
