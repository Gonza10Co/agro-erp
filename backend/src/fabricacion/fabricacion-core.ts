import { Celula, SubPasoGuarnicion, SubPasoInyeccion } from '@prisma/client';

/** Orden físico de las células por las que viaja un par. */
export const ORDEN_CELULAS: Celula[] = [
  'CORTE',
  'GUARNICION',
  'ALMACEN',
  'INYECCION',
  'PT',
];

/** Devuelve la célula siguiente, o null si `actual` es la última (PT). */
export function siguienteCelula(actual: Celula): Celula | null {
  const i = ORDEN_CELULAS.indexOf(actual);
  if (i < 0) throw new Error(`Célula desconocida: "${actual}"`);
  if (i >= ORDEN_CELULAS.length - 1) return null;
  return ORDEN_CELULAS[i + 1];
}

/** True si la célula es la última del flujo (PT). */
export function esUltimaCelula(c: Celula): boolean {
  return siguienteCelula(c) === null;
}

/**
 * Sub-paso inicial al arrancar en una célula. Solo Guarnición arranca dentro de
 * un sub-paso (PREPARACION); cualquier otro punto de entrada (CORTE, PT…) es null.
 */
export function subPasoInicial(
  celula: Celula,
  nacimiento?: SubPasoGuarnicion | null,
): SubPasoGuarnicion | null {
  if (celula !== 'GUARNICION') return null;
  // `nacimiento` es el punto de conversión lote→par que fija la línea. La planta
  // lo decidió el 2026-09-09: la etiqueta se pega en la LENGUA, en Preparación,
  // así que sin configuración explícita el par nace ahí.
  return nacimiento ?? 'PREPARACION';
}

/**
 * Ídem para Inyección: un par que arranca ahí (la línea Feroz, que entra a que le
 * inyecten la suela) empieza en MONTAJE.
 */
export function subPasoInyeccionInicial(celula: Celula): SubPasoInyeccion | null {
  return celula === 'INYECCION' ? 'MONTAJE' : null;
}

/** Línea de producción pendiente de la OP (lo que hay que fabricar). */
export interface LineaProduccion {
  productoConfiguradoId: number;
  tallaId: number;
  cantAProducir: number;
  /** Célula donde arranca la línea. Default CORTE; la línea Feroz entra en INYECCION. */
  celulaInicial?: Celula;
  /**
   * Sub-paso de guarnición donde NACE el par: el punto de conversión lote→par.
   * Null = comportamiento histórico (entra por AREA). Se llena el día que el
   * par deje de nacer en corte; cuál sub-paso exacto lo decide la planta.
   */
  subPasoInicial?: SubPasoGuarnicion | null;
  /** Id de la línea de negocio (denormalizado en el par para reportes). Null si la marca no tiene línea. */
  lineaId?: number | null;
}

/** Par a materializar (lo que va a la tabla Par, sin ofId). */
export interface ParData {
  codigo: string;
  productoConfiguradoId: number;
  tallaId: number;
  celulaInicial: Celula;
  subPasoInicial: SubPasoGuarnicion | null;
  subPasoInyeccionInicial: SubPasoInyeccion | null;
  lineaId: number | null;
}

/**
 * Orden físico completo de guarnición. PREPARACION va primero: es donde queda lista
 * la lengua y se le pega el QR — ahí NACE el par (Mauricio Sierra, visita 2026-09-09).
 */
export const ORDEN_SUBPASOS: SubPasoGuarnicion[] =
  ['PREPARACION', 'AREA', 'ARMADO', 'VISTAS', 'CIERRE', 'PREFORMADO', 'PERFORADO', 'REVISION', 'STROBEL', 'AMARRE'];

/**
 * Inyección tampoco es una sola estación (JP, 2026-07-30): montaje → inyección
 * propiamente dicha → finizaje (el acabado: crayola, gama, gardenia, lija) →
 * impacto. La salida real de la célula es el último, igual que AMARRE lo es en
 * Guarnición.
 */
export const ORDEN_SUBPASOS_INYECCION: SubPasoInyeccion[] =
  ['MONTAJE', 'INYECCION', 'FINIZAJE', 'IMPACTO'];

/** Sub-paso con el que se considera terminada la célula (el que cuenta como producción). */
export const SUBPASO_SALIDA_GUARNICION: SubPasoGuarnicion = 'AMARRE';
export const SUBPASO_SALIDA_INYECCION: SubPasoInyeccion = 'IMPACTO';

export interface EstadoPar {
  celula: Celula;
  subPaso: SubPasoGuarnicion | null;
  /** Solo en INYECCION. undefined/null en pares anteriores a los sub-pasos. */
  subPasoInyeccion?: SubPasoInyeccion | null;
}

/** Siguiente elemento de una cadena de sub-pasos, o null si `actual` es el último. */
function siguienteEnCadena<T>(orden: readonly T[], actual: T): T | null {
  const i = orden.indexOf(actual);
  if (i < 0) throw new Error(`Sub-paso desconocido: "${actual}"`);
  return i < orden.length - 1 ? orden[i + 1] : null;
}

/** Única fuente de verdad de la transición (celula, subPaso). null = terminado (sale de PT). */
export function siguienteEstado(e: EstadoPar): EstadoPar | null {
  if (e.celula === 'GUARNICION') {
    const sig = siguienteEnCadena(ORDEN_SUBPASOS, e.subPaso!);
    if (sig) return { celula: 'GUARNICION', subPaso: sig, subPasoInyeccion: null };
    return { celula: 'ALMACEN', subPaso: null, subPasoInyeccion: null }; // desde AMARRE: sale la capellada
  }
  if (e.celula === 'INYECCION' && e.subPasoInyeccion != null) {
    const sig = siguienteEnCadena(ORDEN_SUBPASOS_INYECCION, e.subPasoInyeccion);
    if (sig) return { celula: 'INYECCION', subPaso: null, subPasoInyeccion: sig };
    return { celula: 'PT', subPaso: null, subPasoInyeccion: null }; // desde IMPACTO
  }
  // INYECCION sin sub-paso = par que entró antes de que existieran: sale a PT en
  // un solo escaneo, como venía haciéndolo. No se lo devuelve al principio de la
  // cadena, que sería hacerle repetir trabajo ya hecho en el piso.
  const sig = siguienteCelula(e.celula); // reusa la cadena célula existente (lanza ante célula desconocida)
  if (sig === null) return null;
  if (sig === 'GUARNICION')
    return { celula: 'GUARNICION', subPaso: ORDEN_SUBPASOS[0], subPasoInyeccion: null };
  if (sig === 'INYECCION')
    return { celula: 'INYECCION', subPaso: null, subPasoInyeccion: 'MONTAJE' };
  return { celula: sig, subPaso: null, subPasoInyeccion: null };
}

/**
 * Materializa un Par por cada unidad de `cantAProducir`.
 * Código: `OF{consecutivo}-{seq}` con seq incremental global (4 dígitos) desde
 * `seqInicial + 1`: los pares de una OF nacen en tandas (una etiqueta por lengua),
 * así que la numeración continúa donde iba. Ignora líneas con cantAProducir <= 0.
 */
export function generarPares(
  consecutivoOF: number,
  lineas: LineaProduccion[],
  seqInicial = 0,
): ParData[] {
  const out: ParData[] = [];
  let seq = seqInicial;
  for (const l of lineas) {
    const celulaInicial = l.celulaInicial ?? 'CORTE';
    const subPaso = subPasoInicial(celulaInicial, l.subPasoInicial);
    const subPasoIny = subPasoInyeccionInicial(celulaInicial);
    for (let i = 0; i < l.cantAProducir; i++) {
      seq++;
      out.push({
        codigo: `OF${consecutivoOF}-${String(seq).padStart(4, '0')}`,
        productoConfiguradoId: l.productoConfiguradoId,
        tallaId: l.tallaId,
        celulaInicial,
        subPasoInicial: subPaso,
        subPasoInyeccionInicial: subPasoIny,
        lineaId: l.lineaId ?? null,
      });
    }
  }
  return out;
}

// ───────────────────────── Estaciones (piloto 2026-09-09) ─────────────────────────
// Un "pistolazo" no ocurre en cada uno de los 14 procesos de la planta sino en unos
// pocos puntos de control (Mauricio Sierra: "medir las áreas grandes"). Cada punto
// es una Estación: una posición (célula + sub-paso) del flujo físico. Se pueden
// apagar y prender sin tocar código: Cierre lo pidió JP y Mauricio no lo ve
// necesario, así que se modela pero arranca desactivado.

export interface EstacionDef {
  codigo: string;
  nombre: string;
  orden: number;
  celula: Celula;
  subPaso: SubPasoGuarnicion | null;
  subPasoInyeccion: SubPasoInyeccion | null;
  activa: boolean;
}

/** Las 6 estaciones acordadas en planta. La tabla `Estacion` nace con estas filas. */
export const ESTACIONES_PILOTO: readonly EstacionDef[] = [
  { codigo: 'PREPARACION', nombre: 'Preparación', orden: 1, celula: 'GUARNICION', subPaso: 'PREPARACION', subPasoInyeccion: null, activa: true },
  { codigo: 'CIERRE', nombre: 'Cierre', orden: 2, celula: 'GUARNICION', subPaso: 'CIERRE', subPasoInyeccion: null, activa: false },
  { codigo: 'BODEGA_CORTE', nombre: 'Bodega de corte', orden: 3, celula: 'ALMACEN', subPaso: null, subPasoInyeccion: null, activa: true },
  { codigo: 'MONTAJE', nombre: 'Inyección · Montaje', orden: 4, celula: 'INYECCION', subPaso: null, subPasoInyeccion: 'MONTAJE', activa: true },
  { codigo: 'FINIZAJE', nombre: 'Inyección · Finizaje', orden: 5, celula: 'INYECCION', subPaso: null, subPasoInyeccion: 'FINIZAJE', activa: true },
  { codigo: 'PT', nombre: 'Producto terminado', orden: 6, celula: 'PT', subPaso: null, subPasoInyeccion: null, activa: true },
];

/**
 * Posición absoluta de un estado en el flujo físico (célula × 100 + sub-paso).
 * Sirve para comparar cualquier par —nacido en el piloto o antes— contra las
 * estaciones: la siguiente estación es la primera activa con rango mayor.
 * Un par en INYECCION sin sub-paso (anterior a los sub-pasos) cuenta como si ya
 * hubiera pasado por todos: sale a PT, como venía haciéndolo.
 */
export function rangoEstado(e: EstadoPar): number {
  const c = ORDEN_CELULAS.indexOf(e.celula);
  if (c < 0) throw new Error(`Célula desconocida: "${e.celula}"`);
  let sub = 0;
  if (e.celula === 'GUARNICION' && e.subPaso) {
    sub = ORDEN_SUBPASOS.indexOf(e.subPaso) + 1;
    if (sub <= 0) throw new Error(`Sub-paso desconocido: "${e.subPaso}"`);
  }
  if (e.celula === 'INYECCION') {
    if (e.subPasoInyeccion) {
      sub = ORDEN_SUBPASOS_INYECCION.indexOf(e.subPasoInyeccion) + 1;
      if (sub <= 0) throw new Error(`Sub-paso desconocido: "${e.subPasoInyeccion}"`);
    } else {
      sub = ORDEN_SUBPASOS_INYECCION.length + 1;
    }
  }
  return c * 100 + sub;
}

export function estadoDeEstacion(x: EstacionDef): EstadoPar {
  return { celula: x.celula, subPaso: x.subPaso, subPasoInyeccion: x.subPasoInyeccion };
}

function activasEnOrden(estaciones: readonly EstacionDef[]): EstacionDef[] {
  return estaciones.filter((x) => x.activa).sort((a, b) => a.orden - b.orden);
}

/** La estación en la que está parado el par ahora mismo (si su estado coincide con una). */
export function estacionDeEstado(
  e: EstadoPar,
  estaciones: readonly EstacionDef[],
): EstacionDef | undefined {
  const r = rangoEstado(e);
  return estaciones.find((x) => rangoEstado(estadoDeEstacion(x)) === r);
}

/**
 * Única fuente de verdad de la transición en el piloto: la primera estación ACTIVA
 * que queda adelante del estado actual. null = no hay ninguna (el par ya está en PT).
 */
export function siguienteEstacion(
  e: EstadoPar,
  estaciones: readonly EstacionDef[],
): EstacionDef | null {
  const r = rangoEstado(e);
  return activasEnOrden(estaciones).find((x) => rangoEstado(estadoDeEstacion(x)) > r) ?? null;
}

/** Entrar a PT es terminar: el 5º pistolazo carga la bodega e imprime el sticker de la caja. */
export function esEstacionTerminal(x: EstacionDef | null): boolean {
  return x === null || x.celula === 'PT';
}

/**
 * Dónde nace un par: la primera estación activa desde la célula de arranque de su
 * línea. Basarili (arranca en CORTE, donde el par no existe) → Preparación;
 * Feroz (capellada de Bogotá, arranca en INYECCION) → Montaje.
 */
export function estacionNacimiento(
  celulaInicial: Celula,
  estaciones: readonly EstacionDef[],
): EstacionDef | null {
  const base = ORDEN_CELULAS.indexOf(celulaInicial) * 100;
  if (base < 0) throw new Error(`Célula desconocida: "${celulaInicial}"`);
  return activasEnOrden(estaciones).find((x) => rangoEstado(estadoDeEstacion(x)) >= base) ?? null;
}

/**
 * El pistolazo se hace desde un dispositivo amarrado a UNA estación. Si el par no
 * viene de la estación anterior, se rechaza con un mensaje que el operario entienda.
 * Devuelve null cuando el escaneo es válido.
 */
export function validarEstacion(
  e: EstadoPar,
  declarada: string,
  estaciones: readonly EstacionDef[],
): string | null {
  const est = estaciones.find((x) => x.codigo === declarada);
  if (!est || !est.activa) return `La estación "${declarada}" no existe o está apagada`;
  const next = siguienteEstacion(e, estaciones);
  if (next === null) return 'El par ya recorrió todas las estaciones';
  if (next.codigo === declarada) return null;
  const actual = estacionDeEstado(e, estaciones);
  const desde = actual ? `viene de ${actual.nombre}` : 'todavía no ha pasado por la estación anterior';
  return `Este par ${desde}: le toca ${next.nombre}, no ${est.nombre}`;
}

/** Lo mínimo de un par para el tablero por órdenes. */
export interface ParMin extends EstadoPar {
  estado: 'EN_PROCESO' | 'TERMINADO' | 'CANCELADO' | 'DADO_DE_BAJA';
}

/**
 * Tablero por órdenes: cuántos pares de una orden ya pasaron por cada estación.
 * Como el par solo avanza, "pasó por X" = su rango es >= el de X. Los terminados
 * (en PT) cuentan en todas; los cancelados y dados de baja en ninguna.
 */
export function paresPorEstacion(
  pares: readonly ParMin[],
  estaciones: readonly EstacionDef[],
): Record<string, number> {
  const out: Record<string, number> = {};
  const activas = activasEnOrden(estaciones).map((x) => ({ x, r: rangoEstado(estadoDeEstacion(x)) }));
  for (const { x } of activas) out[x.codigo] = 0;
  for (const p of pares) {
    if (p.estado === 'CANCELADO' || p.estado === 'DADO_DE_BAJA') continue;
    const r = p.estado === 'TERMINADO' ? Number.MAX_SAFE_INTEGER : rangoEstado(p);
    for (const { x, r: rx } of activas) if (r >= rx) out[x.codigo] += 1;
  }
  return out;
}

/** Evento mínimo para la TV de planta. */
export interface EventoEstacionMin {
  estacionDestino: string | null;
  timestamp: Date;
}

/**
 * TV de planta: pares que ENTRARON hoy a cada estación (el pistolazo es de entrada)
 * y cuántos en la última hora. `inicioDia` lo fija quien llama (día de Bogotá).
 */
export function avanceHoyPorEstacion(
  eventos: readonly EventoEstacionMin[],
  estaciones: readonly EstacionDef[],
  inicioDia: Date,
  ahora: Date,
): { codigo: string; nombre: string; celula: Celula; hoy: number; ultimaHora: number }[] {
  const haceUnaHora = ahora.getTime() - 60 * 60 * 1000;
  return activasEnOrden(estaciones).map((x) => {
    let hoy = 0;
    let ultimaHora = 0;
    for (const ev of eventos) {
      if (ev.estacionDestino !== x.codigo) continue;
      const t = ev.timestamp.getTime();
      if (t < inicioDia.getTime() || t > ahora.getTime()) continue;
      hoy += 1;
      if (t >= haceUnaHora) ultimaHora += 1;
    }
    return { codigo: x.codigo, nombre: x.nombre, celula: x.celula, hoy, ultimaHora };
  });
}

/** Bogotá no tiene horario de verano: el día arranca a las 05:00 UTC. */
export const OFFSET_BOGOTA_HORAS = 5;

/** Medianoche de Bogotá del día en que cae `ahora`, como instante UTC. */
export function inicioDelDiaBogota(ahora: Date): Date {
  const local = new Date(ahora.getTime() - OFFSET_BOGOTA_HORAS * 60 * 60 * 1000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), OFFSET_BOGOTA_HORAS),
  );
}
