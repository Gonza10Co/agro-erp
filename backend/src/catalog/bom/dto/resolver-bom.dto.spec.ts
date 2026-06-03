import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ResolverBomDto } from './resolver-bom.dto';

describe('ResolverBomDto', () => {
  it('acepta opcionIds con un solo valor (string) y lo normaliza a array de números', async () => {
    const dto = plainToInstance(ResolverBomDto, {
      referenciaId: '1',
      talla: '42',
      opcionIds: '7',
    });
    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
    expect(dto.opcionIds).toEqual([7]);
    expect(dto.referenciaId).toBe(1);
    expect(dto.talla).toBe(42);
  });

  it('acepta opcionIds con múltiples valores y los convierte a números', async () => {
    const dto = plainToInstance(ResolverBomDto, {
      referenciaId: '1',
      talla: '42',
      opcionIds: ['7', '8'],
    });
    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
    expect(dto.opcionIds).toEqual([7, 8]);
  });

  it('acepta la ausencia de opcionIds (opcional)', async () => {
    const dto = plainToInstance(ResolverBomDto, {
      referenciaId: '1',
      talla: '42',
    });
    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
    expect(dto.opcionIds).toBeUndefined();
  });

  it('rechaza referenciaId faltante', async () => {
    const dto = plainToInstance(ResolverBomDto, { talla: '42' });
    const errores = await validate(dto);
    expect(errores.length).toBeGreaterThan(0);
  });
});
