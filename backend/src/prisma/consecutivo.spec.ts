import { siguienteConsecutivo } from './consecutivo';

describe('siguienteConsecutivo', () => {
  it('consulta nextval de la secuencia correcta y devuelve number', async () => {
    const db = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ v: 42n }]) };
    const v = await siguienteConsecutivo(db, 'of');
    expect(db.$queryRawUnsafe).toHaveBeenCalledWith(
      "SELECT nextval('of_consecutivo_seq') AS v",
    );
    expect(v).toBe(42);
  });

  it('cada entidad usa su propia secuencia', async () => {
    const db = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ v: 1n }]) };
    await siguienteConsecutivo(db, 'oc');
    expect(db.$queryRawUnsafe).toHaveBeenCalledWith(
      "SELECT nextval('oc_consecutivo_seq') AS v",
    );
  });
});
