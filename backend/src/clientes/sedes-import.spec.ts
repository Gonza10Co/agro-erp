import { parsearFilasSedes, parsearLineaCSV } from './sedes-import';

const HEADER = 'nit,cliente,sede,ciudad,direccion,telefono,principal';

describe('parsearLineaCSV', () => {
  it('parte por comas', () => {
    expect(parsearLineaCSV('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('respeta las comas dentro de comillas (direcciones)', () => {
    expect(parsearLineaCSV('900,"Cra 5 # 10-20, Apto 3",Ibagué')).toEqual([
      '900',
      'Cra 5 # 10-20, Apto 3',
      'Ibagué',
    ]);
  });

  it('entiende la comilla doblada como literal', () => {
    expect(parsearLineaCSV('"Bodega ""La 14""",Cali')).toEqual(['Bodega "La 14"', 'Cali']);
  });

  it('deja vacíos los campos ausentes', () => {
    expect(parsearLineaCSV('a,,c')).toEqual(['a', '', 'c']);
  });
});

describe('parsearFilasSedes', () => {
  it('acepta un archivo bien formado', () => {
    const { sedes, errores } = parsearFilasSedes(
      `${HEADER}\n900,ACME,Principal,Ibagué,Cra 5,3001112222,SI`,
    );
    expect(errores).toEqual([]);
    expect(sedes).toEqual([
      {
        nit: '900',
        nombre: 'Principal',
        ciudad: 'Ibagué',
        direccion: 'Cra 5',
        telefono: '3001112222',
        esPrincipal: true,
      },
    ]);
  });

  it('un cliente con varias sedes y una sola principal', () => {
    const { sedes, errores } = parsearFilasSedes(
      `${HEADER}\n900,ACME,Principal,Ibagué,Cra 5,,SI\n900,ACME,Norte,Bogotá,Cl 80,,NO`,
    );
    expect(errores).toEqual([]);
    expect(sedes.map((s) => s.esPrincipal)).toEqual([true, false]);
    expect(sedes[1].telefono).toBeUndefined();
  });

  it('exige exactamente una sede principal por NIT', () => {
    const sinPrincipal = parsearFilasSedes(`${HEADER}\n900,ACME,Norte,Bogotá,Cl 80,,NO`);
    expect(sinPrincipal.errores).toContain('NIT 900: ninguna sede marcada como principal');

    const dos = parsearFilasSedes(
      `${HEADER}\n900,ACME,Principal,Ibagué,Cra 5,,SI\n900,ACME,Norte,Bogotá,Cl 80,,SI`,
    );
    expect(dos.errores).toContain('NIT 900: 2 sedes marcadas como principal, debe ser una sola');
  });

  it('rechaza sedes repetidas del mismo cliente', () => {
    const { errores } = parsearFilasSedes(
      `${HEADER}\n900,ACME,Norte,Ibagué,Cra 5,,SI\n900,ACME,norte,Bogotá,Cl 80,,NO`,
    );
    expect(errores).toContain('NIT 900: la sede "norte" está repetida');
  });

  it('detecta el NIT arruinado por Excel en notación científica', () => {
    const { errores } = parsearFilasSedes(
      `${HEADER}\n"9,00123E+11",ACME,Principal,Ibagué,Cra 5,,SI`,
    );
    expect(errores.some((e) => e.includes('notación científica'))).toBe(true);
  });

  it('reporta la fila con el número que ve el usuario en Excel', () => {
    const { errores } = parsearFilasSedes(`${HEADER}\n900,ACME,,Ibagué,Cra 5,,SI`);
    expect(errores).toContain('Fila 2: falta el nombre de la sede');
  });

  it('reclama las columnas que falten', () => {
    const { errores } = parsearFilasSedes('nit,cliente\n900,ACME');
    expect(errores[0]).toContain('Faltan columnas');
  });

  it('un archivo sin filas de datos no es válido', () => {
    expect(parsearFilasSedes(HEADER).errores).toEqual(['El archivo está vacío']);
  });

  it('acepta variantes de SI (x, true, 1, sí)', () => {
    const { sedes } = parsearFilasSedes(
      `${HEADER}\n900,ACME,Principal,Ibagué,Cra 5,,x\n901,OTRO,Principal,Cali,Cl 1,,sí`,
    );
    expect(sedes.every((s) => s.esPrincipal)).toBe(true);
  });
});
