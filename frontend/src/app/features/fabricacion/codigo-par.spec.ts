import { normalizarCodigoPar } from './codigo-par';

describe('normalizarCodigoPar', () => {
  const casos: [string, string][] = [
    ['OF19-0021', 'OF19-0021'],
    ['of19-0021', 'OF19-0021'],
    ['  OF19-0021\r\n', 'OF19-0021'],
    ["OF19'0021", 'OF19-0021'],
    ['OF19?0021', 'OF19-0021'],
    ['OF19 - 21', 'OF19-0021'],
  ];
  for (const [crudo, esperado] of casos) {
    it(`${JSON.stringify(crudo)} → ${esperado}`, () => expect(normalizarCodigoPar(crudo)).toBe(esperado));
  }

  it('lo que no parece un código de par solo se limpia', () => {
    expect(normalizarCodigoPar(' agr-861 ')).toBe('AGR-861');
  });
});
