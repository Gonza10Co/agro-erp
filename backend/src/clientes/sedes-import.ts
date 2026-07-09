/**
 * Parseo y validación de la plantilla de sedes que llena el área comercial del cliente.
 * Lógica pura: sin Prisma, sin filesystem.
 */

export interface SedeImportada {
  nit: string;
  nombre: string;
  ciudad: string;
  direccion: string;
  telefono?: string;
  esPrincipal: boolean;
}

const COLUMNAS = ['nit', 'cliente', 'sede', 'ciudad', 'direccion', 'telefono', 'principal'];

/**
 * Parte una línea CSV respetando las comillas: las direcciones traen comas
 * ("Cra 5 # 10-20, Apto 3") y un split(',') pelado las partiría en dos columnas.
 */
export function parsearLineaCSV(linea: string): string[] {
  const campos: string[] = [];
  let actual = '';
  let enComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      // Comilla doblada dentro de un campo entrecomillado: "" es un literal ".
      if (enComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        enComillas = !enComillas;
      }
    } else if (c === ',' && !enComillas) {
      campos.push(actual);
      actual = '';
    } else {
      actual += c;
    }
  }
  campos.push(actual);
  return campos.map((c) => c.trim());
}

function esSi(valor: string): boolean {
  return ['si', 'sí', 'x', 'true', '1'].includes(valor.trim().toLowerCase());
}

/**
 * Valida el archivo entero antes de tocar la BD: es preferible rechazarlo completo y
 * pedir corrección, a dejar la mitad de los clientes con sedes y la otra mitad sin.
 */
export function parsearFilasSedes(csv: string): {
  sedes: SedeImportada[];
  errores: string[];
} {
  const errores: string[] = [];
  const lineas = csv.trim().split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lineas.length < 2) return { sedes: [], errores: ['El archivo está vacío'] };

  const header = parsearLineaCSV(lineas[0]).map((h) => h.toLowerCase());
  const faltantes = COLUMNAS.filter((c) => !header.includes(c));
  if (faltantes.length)
    return { sedes: [], errores: [`Faltan columnas: ${faltantes.join(', ')}`] };

  const idx = Object.fromEntries(COLUMNAS.map((c) => [c, header.indexOf(c)]));
  const sedes: SedeImportada[] = [];

  lineas.slice(1).forEach((linea, i) => {
    const fila = i + 2; // +1 por el header, +1 porque Excel cuenta desde 1
    const campos = parsearLineaCSV(linea);
    const nit = campos[idx.nit] ?? '';
    const nombre = campos[idx.sede] ?? '';
    const ciudad = campos[idx.ciudad] ?? '';
    const direccion = campos[idx.direccion] ?? '';

    if (!nit) errores.push(`Fila ${fila}: falta el NIT`);
    if (!nombre) errores.push(`Fila ${fila}: falta el nombre de la sede`);
    if (!ciudad) errores.push(`Fila ${fila}: falta la ciudad`);
    if (!direccion) errores.push(`Fila ${fila}: falta la dirección`);
    if (nit.includes('E+'))
      errores.push(`Fila ${fila}: el NIT "${nit}" quedó en notación científica; formatea la columna como Texto`);
    if (!nit || !nombre || !ciudad || !direccion) return;

    sedes.push({
      nit,
      nombre,
      ciudad,
      direccion,
      telefono: campos[idx.telefono]?.trim() || undefined,
      esPrincipal: esSi(campos[idx.principal] ?? ''),
    });
  });

  // Reglas por cliente: exactamente una principal y sin sedes repetidas.
  const porNit = new Map<string, SedeImportada[]>();
  for (const s of sedes) porNit.set(s.nit, [...(porNit.get(s.nit) ?? []), s]);

  for (const [nit, delCliente] of porNit) {
    const principales = delCliente.filter((s) => s.esPrincipal).length;
    if (principales === 0) errores.push(`NIT ${nit}: ninguna sede marcada como principal`);
    if (principales > 1) errores.push(`NIT ${nit}: ${principales} sedes marcadas como principal, debe ser una sola`);

    const nombres = delCliente.map((s) => s.nombre.toLowerCase());
    const repetidos = nombres.filter((n, i) => nombres.indexOf(n) !== i);
    for (const r of new Set(repetidos)) errores.push(`NIT ${nit}: la sede "${r}" está repetida`);
  }

  return { sedes, errores };
}
