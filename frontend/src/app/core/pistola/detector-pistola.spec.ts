import { DetectorPistola } from './detector-pistola';

function rafaga(d: DetectorPistola, texto: string, t0 = 1000, paso = 10): string | null {
  let t = t0;
  for (const ch of texto) d.tecla(ch, (t += paso));
  return d.tecla('Enter', t + paso);
}

describe('DetectorPistola', () => {
  it('reconoce el código cuando llega en ráfaga y cierra con Enter', () => {
    expect(rafaga(new DetectorPistola(), 'OF19-0011')).toBe('OF19-0011');
  });

  it('normaliza el guion que la pistola teclea con otro idioma', () => {
    expect(rafaga(new DetectorPistola(), "of19'0011")).toBe('OF19-0011');
  });

  it('ignora a una persona tecleando despacio', () => {
    expect(rafaga(new DetectorPistola(), 'OF19-0011', 1000, 200)).toBeNull();
  });

  it('ignora una ráfaga que no es un código de par', () => {
    expect(rafaga(new DetectorPistola(), '7702004003508')).toBeNull();
  });

  it('una pausa larga descarta lo que venía antes', () => {
    const d = new DetectorPistola();
    d.tecla('x', 0);
    d.tecla('y', 10);
    expect(rafaga(d, 'OF19-0012', 5000)).toBe('OF19-0012');
  });

  it('Shift (mayúsculas de la pistola) no corta la ráfaga', () => {
    const d = new DetectorPistola();
    let t = 0;
    for (const ch of ['Shift', 'O', 'Shift', 'F', '1', '9', '-', '0', '0', '1', '3']) d.tecla(ch, (t += 5));
    expect(d.tecla('Enter', t + 5)).toBe('OF19-0013');
  });
});
