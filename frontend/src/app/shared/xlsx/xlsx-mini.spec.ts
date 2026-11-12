import { strFromU8, unzipSync } from 'fflate';
import { crearXlsx, escaparXml, letraColumna, xmlHoja } from './xlsx-mini';

describe('xlsx-mini', () => {
  it('nombra las columnas como Excel', () => {
    expect([0, 25, 26, 27, 701, 702].map(letraColumna)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });

  it('escapa lo que rompería el XML', () => {
    expect(escaparXml('IVAN & JAIRO <"SAS">')).toBe('IVAN &amp; JAIRO &lt;&quot;SAS&quot;&gt;');
  });

  it('escribe números como números y texto como texto, con su estilo', () => {
    const xml = xmlHoja({ nombre: 'x', filas: [['Cliente', 12, null, { v: 70, estilo: 'atrasado' }, { v: null, estilo: 'libre' }]] });
    expect(xml).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">Cliente</t></is></c>');
    expect(xml).toContain('<c r="B1"><v>12</v></c>');
    expect(xml).not.toContain('r="C1"');
    expect(xml).toContain('<c r="D1" s="6"><v>70</v></c>');
    expect(xml).toContain('<c r="E1" s="8"/>');
  });

  it('congela filas y columnas', () => {
    const xml = xmlHoja({ nombre: 'x', filas: [['a']], congelar: { filas: 2, columnas: 3 } });
    expect(xml).toContain('xSplit="3" ySplit="2" topLeftCell="D3" activePane="bottomRight" state="frozen"');
  });

  it('arma un zip con todas las partes que Excel exige', () => {
    const zip = unzipSync(crearXlsx([
      { nombre: 'Proyección', filas: [['a']] },
      { nombre: 'Pedidos/talla: [x]', filas: [['b']] },
    ]));
    expect(Object.keys(zip).sort()).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
      'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml',
    ]);
    const wb = strFromU8(zip['xl/workbook.xml']);
    expect(wb).toContain('name="Proyección"');
    expect(wb).toContain('name="Pedidos talla   x"');
    // Cada parte tiene que ser XML bien formado o Excel dice que el archivo está dañado.
    for (const [ruta, bytes] of Object.entries(zip)) {
      const doc = new DOMParser().parseFromString(strFromU8(bytes), 'application/xml');
      expect(doc.getElementsByTagName('parsererror').length).withContext(ruta).toBe(0);
    }
  });
});
