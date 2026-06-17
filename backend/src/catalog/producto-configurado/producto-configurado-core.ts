// Lógica pura para construir un ProductoConfigurado a partir de la configuración
// de una referencia y una selección (marca + opciones). Sin Prisma: testeable sin BD.

export interface OpcionConfig { id: number; codigo: string; nombre: string; }
export interface EjeConfig {
  grupo: { id: number; codigo: string; nombre: string; obligatorio: boolean };
  opciones: OpcionConfig[];
}
export interface MarcaConfig { id: number; codigo: string; nombre: string; }
export interface ReferenciaConfigData {
  referencia: { id: number; codigo: string; nombreInterno: string };
  marcas: MarcaConfig[];
  ejes: EjeConfig[];
}

export interface SeleccionProducto { marcaId: number; opcionIds: number[]; }

export interface ProductoArmado {
  codigo: string;
  nombreComercial: string;
  marcaId: number;
  opcionIds: number[];
}

export class ConfiguracionInvalida extends Error {}

/**
 * Valida la selección contra la configuración de la referencia y arma el código y
 * nombre comercial determinísticos del producto. Reglas:
 *  - la marca debe estar habilitada para la referencia;
 *  - cada opción elegida debe pertenecer a un eje de la referencia;
 *  - a lo sumo una opción por grupo;
 *  - todos los ejes obligatorios deben tener una opción elegida.
 */
export function armarProducto(
  config: ReferenciaConfigData,
  sel: SeleccionProducto,
): ProductoArmado {
  const marca = config.marcas.find((m) => m.id === sel.marcaId);
  if (!marca) {
    throw new ConfiguracionInvalida(
      `La marca ${sel.marcaId} no está habilitada para la referencia ${config.referencia.codigo}`,
    );
  }

  // Índice opcionId -> {grupo, opcion}
  const porOpcion = new Map<number, { eje: EjeConfig; opcion: OpcionConfig }>();
  for (const eje of config.ejes) {
    for (const op of eje.opciones) porOpcion.set(op.id, { eje, opcion: op });
  }

  const gruposCubiertos = new Set<number>();
  const elegidas: { eje: EjeConfig; opcion: OpcionConfig }[] = [];
  for (const opId of sel.opcionIds) {
    const hit = porOpcion.get(opId);
    if (!hit) {
      throw new ConfiguracionInvalida(
        `La opción ${opId} no pertenece a ningún eje de la referencia ${config.referencia.codigo}`,
      );
    }
    if (gruposCubiertos.has(hit.eje.grupo.id)) {
      throw new ConfiguracionInvalida(
        `Hay más de una opción para el grupo ${hit.eje.grupo.nombre}`,
      );
    }
    gruposCubiertos.add(hit.eje.grupo.id);
    elegidas.push(hit);
  }

  for (const eje of config.ejes) {
    if (eje.grupo.obligatorio && !gruposCubiertos.has(eje.grupo.id)) {
      throw new ConfiguracionInvalida(`Falta elegir ${eje.grupo.nombre} (obligatorio)`);
    }
  }

  // Orden estable por código de grupo para que el código sea determinístico.
  const ordenadas = elegidas
    .slice()
    .sort((a, b) => a.eje.grupo.codigo.localeCompare(b.eje.grupo.codigo));
  const sufijoOpciones = ordenadas.map((e) => e.opcion.codigo);

  const codigo = [config.referencia.codigo, marca.codigo, ...sufijoOpciones].join('-');
  const nombreComercial = [
    config.referencia.nombreInterno,
    marca.nombre,
    ...ordenadas.map((e) => e.opcion.nombre),
  ].join(' · ');

  return {
    codigo,
    nombreComercial,
    marcaId: marca.id,
    opcionIds: ordenadas.map((e) => e.opcion.id),
  };
}
