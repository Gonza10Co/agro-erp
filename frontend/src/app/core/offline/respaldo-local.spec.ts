import { Subject, of, throwError } from 'rxjs';
import { PREFIJO_RESPALDO, borrarRespaldos, conRespaldoLocal } from './respaldo-local';

describe('conRespaldoLocal', () => {
  afterEach(() => borrarRespaldos());

  it('guarda el último valor bueno y lo devuelve si la tablet arranca sin red', () => {
    let v: unknown;
    of([{ id: 1 }]).pipe(conRespaldoLocal('estaciones')).subscribe((x) => (v = x));
    expect(JSON.parse(localStorage.getItem(PREFIJO_RESPALDO + 'estaciones')!)).toEqual([{ id: 1 }]);

    v = undefined;
    throwError(() => ({ status: 0 })).pipe(conRespaldoLocal('estaciones')).subscribe((x) => (v = x));
    expect(v).toEqual([{ id: 1 }]);
  });

  it('sin respaldo guardado, el error de red sale como siempre', () => {
    let err: any;
    throwError(() => ({ status: 0 })).pipe(conRespaldoLocal('nada')).subscribe({ error: (e) => (err = e) });
    expect(err.status).toBe(0);
  });

  it('un error del servidor (no de red) no se tapa con el respaldo', () => {
    localStorage.setItem(PREFIJO_RESPALDO + 'operarios.ALMACEN', '[]');
    let err: any;
    let v: unknown;
    const s = new Subject<unknown>();
    s.pipe(conRespaldoLocal('operarios.ALMACEN')).subscribe({ next: (x) => (v = x), error: (e) => (err = e) });
    s.error({ status: 500 });
    expect(v).toBeUndefined();
    expect(err.status).toBe(500);
  });
});
