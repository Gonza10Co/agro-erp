import { RecargaSegura, scriptPrincipal, scriptPrincipalActual } from './service-worker';

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

  it('recarga solo con versión nueva, con red y con la tablet quieta 30 s', () => {
    let t = 0;
    let red = true;
    const recargar = jasmine.createSpy('recargar');
    const r = new RecargaSegura({ recargar, ahora: () => t, enLinea: () => red, quietudMs: 30_000 });

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
    expect(r.revisar()).toBeTrue();
    expect(recargar).toHaveBeenCalledTimes(1);
    expect(r.revisar()).toBeFalse(); // una sola vez
  });
});
