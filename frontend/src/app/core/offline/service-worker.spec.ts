import {
  ControlServiceWorker, EVENTOS_ACTIVIDAD, RecargaSegura, desregistrarTodo, esRutaTablet, esTablet,
  scriptPrincipal, scriptPrincipalActual,
} from './service-worker';

describe('service worker: solo en las tablets', () => {
  it('las pantallas de planta son estación y TV', () => {
    expect(esRutaTablet('/fabricacion/estacion')).toBeTrue();
    expect(esRutaTablet('/tv?linea=1')).toBeTrue();
    expect(esRutaTablet('/fabricacion/ordenes')).toBeFalse();
    expect(esRutaTablet('/tvx')).toBeFalse();
  });

  it('tablet = rol ESTACION o pantalla de planta; en el login no se decide', () => {
    expect(esTablet('ESTACION', '/dashboard')).toBeTrue();
    expect(esTablet('ADMIN', '/fabricacion/estacion')).toBeTrue();
    expect(esTablet('ADMIN', '/pedidos/oc')).toBeFalse();
    expect(esTablet(null, '/login?expired=1')).toBeNull();
  });

  function navFalso() {
    const reg = { unregister: jasmine.createSpy('unregister').and.resolveTo(true) };
    const sw = {
      controller: null,
      getRegistrations: jasmine.createSpy('getRegistrations').and.resolveTo([reg]),
      register: jasmine.createSpy('register').and.returnValue(new Promise(() => {})),
      addEventListener: () => {},
      ready: new Promise(() => {}),
    };
    return { reg, sw, nav: { serviceWorker: sw, onLine: true } as unknown as Navigator };
  }

  it('desregistrarTodo quita los registros y SOLO las cachés agro-shell-*', async () => {
    const { reg, nav } = navFalso();
    const borradas: string[] = [];
    const cachesFalso = {
      keys: () => Promise.resolve(['agro-shell-v1', 'agro-shell-v0', 'otra-cosa']),
      delete: (k: string) => { borradas.push(k); return Promise.resolve(true); },
    } as unknown as CacheStorage;
    await desregistrarTodo(nav, cachesFalso);
    expect(reg.unregister).toHaveBeenCalled();
    expect(borradas).toEqual(['agro-shell-v1', 'agro-shell-v0']);
  });

  it('en oficina se quita el worker; en la tablet se registra una sola vez', async () => {
    const { reg, sw, nav } = navFalso();
    const win = {
      navigator: nav,
      document: { readyState: 'complete', querySelectorAll: () => [] },
      location: { pathname: '/fabricacion/estacion', reload: () => {} },
      addEventListener: () => {},
    } as unknown as Window;
    const ctl = new ControlServiceWorker(win);
    ctl.actualizar(null); // login: nada
    expect(sw.register).not.toHaveBeenCalled();
    expect(sw.getRegistrations).not.toHaveBeenCalled();
    ctl.actualizar(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(reg.unregister).toHaveBeenCalled();
    ctl.actualizar(true);
    ctl.actualizar(true);
    expect(sw.register).toHaveBeenCalledTimes(1);
    expect(sw.register).toHaveBeenCalledWith('/sw.js');
  });
});

describe('service worker: versión nueva', () => {
  it('saca el main-*.js del index publicado', () => {
    const html = '<html><head></head><body><app-root></app-root><script src="polyfills-ABCD1234.js" type="module"></script><script src="main-Z9Y8X7W6.js" type="module"></script></body></html>';
    expect(scriptPrincipal(html)).toBe('main-Z9Y8X7W6.js');
    expect(scriptPrincipal('<html>sin scripts</html>')).toBeNull();
  });

  it('lee el main-*.js con el que arrancó la pestaña', () => {
    const doc = document.implementation.createHTMLDocument('x');
    const s = doc.createElement('script');
    s.setAttribute('src', 'main-AAAA1111.js');
    doc.body.appendChild(s);
    expect(scriptPrincipalActual(doc)).toBe('main-AAAA1111.js');
  });

  it('la rueda y el scroll también cuentan como actividad', () => {
    expect(EVENTOS_ACTIVIDAD).toEqual(jasmine.arrayContaining(['keydown', 'pointerdown', 'touchstart', 'wheel', 'scroll']));
  });

  it('recarga solo con versión nueva, con red, en pantalla de planta y con la tablet quieta 30 s', () => {
    let t = 0;
    let red = true;
    let enPlanta = false;
    const recargar = jasmine.createSpy('recargar');
    const r = new RecargaSegura({ recargar, ahora: () => t, enLinea: () => red, rutaPermitida: () => enPlanta, quietudMs: 30_000 });

    t = 60_000;
    expect(r.revisar()).toBeFalse(); // no hay versión nueva
    r.versionNueva();
    r.actividad(); // pistolazo justo ahora
    t += 10_000;
    expect(r.revisar()).toBeFalse(); // en plena operación: no interrumpe
    red = false;
    t += 30_000;
    expect(r.revisar()).toBeFalse(); // sin red recargar no trae nada nuevo
    red = true;
    expect(r.revisar()).toBeFalse(); // en oficina nunca recarga sola
    enPlanta = true;
    expect(r.revisar()).toBeTrue();
    expect(recargar).toHaveBeenCalledTimes(1);
    expect(r.revisar()).toBeFalse(); // una sola vez
  });
});
