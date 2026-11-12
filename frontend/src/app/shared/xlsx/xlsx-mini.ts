/**
 * Escritor mínimo de .xlsx: lo justo para bajar un informe con colores, sin sumar
 * una librería de hojas de cálculo al bundle. Un .xlsx es un zip de XML; el zip lo
 * hace `fflate`, que ya venía con jsPDF.
 *
 * Soporta texto, números, anchos de columna, filas congeladas y una paleta fija de
 * estilos. Si algún día hacen falta fórmulas o gráficos nativos, ahí sí va una
 * librería de verdad.
 */
import { strToU8, zipSync } from 'fflate';

export type EstiloCelda =
  | 'titulo' | 'encabezado' | 'negrita' | 'tenue'
  | 'ok' | 'atrasado' | 'alerta' | 'libre' | 'bodega';

export type Celda = string | number | null | undefined | { v: string | number | null; estilo?: EstiloCelda };

export interface Hoja {
  nombre: string;
  filas: Celda[][];
  /** Ancho de cada columna en caracteres (las que falten quedan por defecto). */
  anchos?: number[];
  /** Filas y columnas que quedan fijas al desplazarse. */
  congelar?: { filas?: number; columnas?: number };
}

// El orden es el índice del estilo en styles.xml (0 = sin estilo).
const ESTILOS: EstiloCelda[] = ['titulo', 'encabezado', 'negrita', 'tenue', 'ok', 'atrasado', 'alerta', 'libre', 'bodega'];

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="5">' +
  '<font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="14"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
  '<font><sz val="11"/><color rgb="FF7A8594"/><name val="Calibri"/></font>' +
  '</fonts>' +
  '<fills count="8">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF2F4A6B"/></patternFill></fill>' + // encabezado
  '<fill><patternFill patternType="solid"><fgColor rgb="FFBFD4EE"/></patternFill></fill>' + // ok
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF4B6B0"/></patternFill></fill>' + // atrasado
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFBE3A4"/></patternFill></fill>' + // alerta
  '<fill><patternFill patternType="solid"><fgColor rgb="FFD9EEDB"/></patternFill></fill>' + // libre
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE9ECF0"/></patternFill></fill>' + // bodega
  '</fills>' +
  '<borders count="2">' +
  '<border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left style="thin"><color rgb="FFB8C0CC"/></left><right style="thin"><color rgb="FFB8C0CC"/></right>' +
  '<top style="thin"><color rgb="FFB8C0CC"/></top><bottom style="thin"><color rgb="FFB8C0CC"/></bottom><diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="10">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' + // titulo
  '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + // encabezado
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' + // negrita
  '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' + // tenue
  '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' + // ok
  '<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' + // atrasado
  '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' + // alerta
  '<xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' + // libre
  '<xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' + // bodega
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

export function escaparXml(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 0 → A, 25 → Z, 26 → AA. */
export function letraColumna(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Excel no admite \ / ? * [ ] : en el nombre de una hoja, ni más de 31 caracteres. */
function nombreHoja(n: string): string {
  return (n.replace(/[\\/?*[\]:]/g, ' ').trim() || 'Hoja').slice(0, 31);
}

export function xmlHoja(h: Hoja): string {
  const filas = h.filas
    .map((fila, r) => {
      const celdas = fila
        .map((c, i) => {
          const v = c !== null && typeof c === 'object' ? c.v : c;
          const estilo = c !== null && typeof c === 'object' && c.estilo ? ESTILOS.indexOf(c.estilo) + 1 : 0;
          const s = estilo ? ` s="${estilo}"` : '';
          const ref = `${letraColumna(i)}${r + 1}`;
          if (v === null || v === undefined || v === '') return estilo ? `<c r="${ref}"${s}/>` : '';
          if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
          return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escaparXml(String(v))}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${celdas}</row>`;
    })
    .join('');

  const cols = h.anchos?.length
    ? `<cols>${h.anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';

  const f = h.congelar?.filas ?? 0;
  const c = h.congelar?.columnas ?? 0;
  const panel = f || c
    ? `<sheetViews><sheetView workbookViewId="0"><pane${c ? ` xSplit="${c}"` : ''}${f ? ` ySplit="${f}"` : ''} topLeftCell="${letraColumna(c)}${f + 1}" activePane="${c && f ? 'bottomRight' : f ? 'bottomLeft' : 'topRight'}" state="frozen"/></sheetView></sheetViews>`
    : '';

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `${panel}${cols}<sheetData>${filas}</sheetData></worksheet>`
  );
}

/** Arma el archivo .xlsx completo, listo para meter en un Blob. */
export function crearXlsx(hojas: Hoja[]): Uint8Array {
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const archivos: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      `${X}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
        hojas.map((h, i) => `<sheet name="${escaparXml(nombreHoja(h.nombre))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    ),
    'xl/styles.xml': strToU8(STYLES_XML),
  };
  hojas.forEach((h, i) => { archivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xmlHoja(h)); });
  return zipSync(archivos, { level: 6 });
}

export function descargarXlsx(nombre: string, hojas: Hoja[]): void {
  const blob = new Blob([crearXlsx(hojas)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre.endsWith('.xlsx') ? nombre : `${nombre}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
