import { mantenerPantallaEncendida } from './pantalla-encendida';

describe('mantenerPantallaEncendida', () => {
  function docFalso(visible = true) {
    const oyentes: Record<string, () => void> = {};
    return {
      visibilityState: visible ? 'visible' : 'hidden',
      addEventListener: (ev: string, fn: () => void) => (oyentes[ev] = fn),
      removeEventListener: jasmine.createSpy('remove'),
      disparar: (ev: string) => oyentes[ev]?.(),
    } as any;
  }

  it('pide el candado al arrancar y lo suelta al cerrar', async () => {
    const release = jasmine.createSpy('release').and.resolveTo();
    const request = jasmine.createSpy('request').and.resolveTo({ release });
    const doc = docFalso();
    const soltar = mantenerPantallaEncendida({ wakeLock: { request } }, doc);
    await Promise.resolve(); await Promise.resolve();
    expect(request).toHaveBeenCalledWith('screen');
    soltar();
    expect(release).toHaveBeenCalled();
    expect(doc.removeEventListener).toHaveBeenCalled();
  });

  it('lo vuelve a pedir al regresar a la pestaña', async () => {
    const request = jasmine.createSpy('request').and.resolveTo({ release: () => Promise.resolve() });
    const doc = docFalso();
    mantenerPantallaEncendida({ wakeLock: { request } }, doc);
    await Promise.resolve();
    doc.disparar('visibilitychange');
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('sin soporte no hace nada ni revienta', () => {
    expect(() => mantenerPantallaEncendida({}, docFalso())()).not.toThrow();
  });

  it('si el navegador niega el candado, la estación sigue', async () => {
    const request = jasmine.createSpy('request').and.rejectWith(new Error('NotAllowed'));
    expect(() => mantenerPantallaEncendida({ wakeLock: { request } }, docFalso())).not.toThrow();
    await Promise.resolve();
  });
});
