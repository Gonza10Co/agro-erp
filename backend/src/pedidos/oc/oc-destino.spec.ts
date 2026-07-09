import { resolverDestinoOC } from './oc-destino';

const sede = (id: number, direccion: string, ciudad = 'Ibagué') => ({
  id,
  direccion,
  ciudad,
});

describe('resolverDestinoOC', () => {
  it('la sede elegida gana sobre todo lo demás', () => {
    expect(
      resolverDestinoOC({
        sedeElegida: sede(9, 'Bodega Norte'),
        sedePrincipal: sede(1, 'Sede Vieja'),
        direccionManual: 'A mano',
      }),
    ).toEqual({ sedeEntregaId: 9, direccionDespacho: 'Bodega Norte, Ibagué' });
  });

  it('sin sede elegida, una dirección escrita a mano gana a la principal', () => {
    expect(
      resolverDestinoOC({
        sedePrincipal: sede(1, 'Sede Vieja'),
        direccionManual: 'Obra Calle 80, Bogotá',
      }),
    ).toEqual({ sedeEntregaId: null, direccionDespacho: 'Obra Calle 80, Bogotá' });
  });

  it('ignora una dirección manual en blanco y cae en la principal', () => {
    expect(
      resolverDestinoOC({
        sedePrincipal: sede(1, 'Cra 5 # 10-20'),
        direccionManual: '   ',
      }),
    ).toEqual({ sedeEntregaId: 1, direccionDespacho: 'Cra 5 # 10-20, Ibagué' });
  });

  it('usa la sede principal cuando no hay nada más', () => {
    expect(resolverDestinoOC({ sedePrincipal: sede(3, 'Planta', 'Cali') })).toEqual({
      sedeEntregaId: 3,
      direccionDespacho: 'Planta, Cali',
    });
  });

  it('cliente sin sedes y sin dirección: OC sin destino', () => {
    expect(resolverDestinoOC({})).toEqual({
      sedeEntregaId: null,
      direccionDespacho: null,
    });
  });

  it('el snapshot no depende de la sede después: es texto plano', () => {
    const destino = resolverDestinoOC({ sedeElegida: sede(4, 'Calle 1', 'Cali') });
    expect(typeof destino.direccionDespacho).toBe('string');
    expect(destino.direccionDespacho).toBe('Calle 1, Cali');
  });
});
