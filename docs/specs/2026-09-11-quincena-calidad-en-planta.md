# Quincena: lo que le falta al piloto para usarse de verdad

**Fecha:** 2026-09-11 · **Estado:** puntos 1–3 construidos el mismo día (en `develop`, gate
`calidad-en-planta` EN_STAGE); faltan las preguntas al cliente y la prueba con la gente real
**Antecedente:** el piloto de planta se entregó hoy al cliente (tag `entrega-piloto`,
`master` 2fce838). Funcionó con QR reales leídos desde el celular.

---

## El problema en una frase

La pantalla de estación **solo sabe avanzar pares**. En un día real de planta el robot
daña un par, una capellada sale mal y la operaria de PT rechaza uno — y hoy el operario
no tiene qué hacer con eso. O no registra nada (y perdemos el dato que justifica el MES),
o se sale a otra pantalla a mitad de línea (y no lo va a hacer). Peor: **un par malo entra
a inventario como bueno**.

El backend ya tiene casi todo: `CalidadPT{PRIMERA,SEGUNDA}`, `Par.calidad`,
`marcarSegunda()`, catálogo de daños tipificados con imputación a la célula que lo causó,
y reposición automática (`calidad.service.ts:180` crea el par con `reponeAParId`).
**Lo que falta es la puerta desde la pantalla del piloto.**

---

## Lo que se construye

### 1. Inspección en PT (lo que pidió Mauricio el 11-sep)

Hoy entrar a PT termina el par de inmediato (`esEstacionTerminal`), sin ventana para
inspeccionar. Mauricio lo describió así: *"la operaria inspecciona el par; si no aprueba
se va a segundas; si aprueba, lee el código y genera el sticker"*.

Como la inspección es **física y previa al escaneo**, la pantalla no debe preguntar
después: debe tener dos formas de escanear.

```
PT ─┬─ escanear (normal) ──► TERMINADO · PRIMERA · sticker de caja
    └─ [⚠ marcar segunda] ──► escanear ──► TERMINADO · SEGUNDA · sin sticker de cliente
```

### 2. "Algo pasó con este par" — en toda estación, no solo en PT

Un botón secundario en la pantalla de estación: escanear → elegir tipo de daño del
catálogo → decide el destino (baja + reposición, o segunda). Es el mismo gesto para las
tres situaciones, y es lo que alimenta la imputación de daños por célula.

⚠️ `marcarSegunda()` hoy exige `par.estado === 'EN_PROCESO'` (`calidad.service.ts:50`),
y PT termina el par en la misma transacción: hay que integrarlo al pistolazo, no dejarlo
como un reporte aparte.

### 3. Cerrar el sticker

Ya lleva talla, referencia, color, marca, cliente y día de empaque (`cc6ba80`).
Falta decidir qué imprime una **segunda**: JP dijo el 29-jul que va **sin marquilla**, y
el sticker lleva nombre de cliente — pero una segunda ya no va para ese cliente, va a saldos.

---

## Lo que NO entra en esta quincena

El puente lote↔par (`Par.ordenCorteId`), el control de corte conectado y el consumo real
de material por OF. Todo eso se monta mejor **con el piloto ya andando** y viendo datos
reales. `programacion-corte` se queda en `EN_STAGE`.

---

## Respuestas de Juan Pablo (2026-09-11, WhatsApp + audio) y qué se hizo con cada una

1. **Se debe reponer.** Hoy programan 1-2 pares de más por talla por si sale una segunda;
   con el sistema la orden sale exacta y cada par que sale de segunda pide su reposición.
   → Hecho: marcar SEGUNDA pare la reposición en Preparación (igual que la BAJA) y el
   tablero cuenta por cupo (`7507a70`).
2. **Sticker: no es necesario, pero como lo que se empaca pasa por lector, mejor que lleve.**
   → Se queda como estaba: sticker sin cliente y con banda SEGUNDA.
3. **Lo autoriza la persona de calidad.** → Hecho: rol `CALIDAD`; la firma viaja en el mismo
   escaneo (usuario y clave de quien autoriza) porque el celular queda logueado con la
   operaria. Usuario `calidad` creado en prod (ver memoria `credenciales-demo-prod`).
4. **Sí, catalogar la segunda** (indicadores y mejoras). → Ya era así: tipo obligatorio, nota
   opcional.
5. **El color se elige por pedido** ("cuando la bota es café la marca suele ser Alpaca Café, o
   Alpaca Suela Azul"). → Es una opción del configurador (el grupo `COLOR` existe en prod con
   solo "Café"); faltan las opciones reales. Los nombres de marca en prod traen CAFÉ, AZUL,
   NEGRO, NARANJA, BLANCO, GRIS y AMARILLO, y a veces es color de la bota y a veces de la
   suela: hay que confirmar la lista con JP antes de cargarla.

## Preguntas que bloqueaban el diseño (para Mauricio y Juan Pablo) — respondidas arriba

1. **¿La segunda sale del pedido?** Si la OF tenía 20 pares de talla 36 y uno se va a
   segundas quedan 19: ¿se repone automáticamente o el pedido se despacha corto?
2. **¿La segunda lleva sticker?** Si va sin marquilla y ya no es para ese cliente,
   ¿sticker sin cliente, o ninguno?
3. **¿La operaria decide sola?** Mandar un par a segundas mueve inventario y plata.
4. **¿Hay que tipificar el defecto?** Si no, se pierde el "por qué" y la imputación a la
   célula que lo causó — que es medio objetivo del MES.
5. **¿De dónde sale el COLOR?** El grupo de opción `COLOR` no existe en el catálogo real
   (solo `PUNTERA` y `VERSION`): ¿es una opción del producto que hay que cargar, o es
   parte de la referencia?

---

## Lo que no es software y bloquea igual

- **Impresora térmica** de 50×30 (lengua) y 60×40 (caja). La hoja carta no sirve.
- **Lectores**: hoy no hay ninguno en planta. El celular funciona, pero no para 8 horas.
- **TVs** para el número del día.
- **Datos maestros**: operarios reales (hoy son de demo — sin eso no hay "quién hizo qué"),
  y la referencia 107 sigue sin nombre ni tallas (paquete de JP del 07-sep).
- **Quién crea las órdenes reales**: hoy el piloto corre sobre `seed:piloto`. Y mientras no
  exista el puente lote↔par, **alguien traduce a mano** la orden de corte del día a las
  tandas que Gloria pare en Preparación. Hay que decidir quién y aceptarlo explícitamente.
- **Plan de caída**: si se cae el wifi o el celular se queda sin batería, la línea no para.
  Aunque la respuesta sea "se anota en papel y se digita al final del turno", hay que tenerla.

---

## Criterio de "listo para implementar"

- [x] Un par se puede marcar como segunda o dar de baja **desde la pantalla de estación**,
      con su tipo de daño, sin salir de la línea. ✅ 2026-09-11 (`b5fc4d8` + `8d676dc`):
      el daño viaja en el pistolazo; una lectura por reporte; la reposición de una baja nace en
      Preparación con evento y la estación ofrece imprimirle la lengua.
- [x] Lo rechazado en PT **no entra** al inventario de primera. ✅ verificado E2E en local
      (OF1-0002 terminó en el saldo de SEGUNDAS con su incidencia en la estación de entrada).
      Decisiones tomadas mientras el cliente responde: una segunda **no exige nota** (el tipo
      dice el porqué) y su sticker sale **sin cliente y con banda SEGUNDA**.
- [x] Las cinco preguntas de arriba, respondidas por el cliente. ✅ JP, 2026-09-11 (ver arriba);
      falta solo la lista de colores.
- [ ] Impresora térmica probada con las dos etiquetas reales.
- [ ] **Un día completo, una sola estación, con la gente real.** Probamos con 20 pares y
      una persona; un día son 1.206 pares y ~8 operarios. Lo que se rompe a esa escala no
      es el software, es el hábito.
