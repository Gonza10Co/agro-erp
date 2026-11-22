import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AvanzarDto } from './avanzar.dto';

describe('AvanzarDto: campos del modo sin internet', () => {
  it('acepta scannedAt ISO y clientScanId (el ValidationPipe no los descarta)', async () => {
    const dto = plainToInstance(AvanzarDto, {
      operarioId: 3,
      scannedAt: '2026-11-21T14:03:00.000Z',
      clientScanId: '6f1c2b0e-8a1d-4c4f-9a57-1b2c3d4e5f60',
    });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
    expect(dto.scannedAt).toBe('2026-11-21T14:03:00.000Z');
    expect(dto.clientScanId).toBe('6f1c2b0e-8a1d-4c4f-9a57-1b2c3d4e5f60');
  });

  it('rechaza un scannedAt que no es fecha', async () => {
    const dto = plainToInstance(AvanzarDto, { operarioId: 3, scannedAt: 'ayer' });
    const errores = await validate(dto);
    expect(errores.map((e) => e.property)).toEqual(['scannedAt']);
  });

  it('exige la zona horaria en scannedAt (Z o ±hh:mm)', async () => {
    for (const ok of ['2026-11-21T14:03:00Z', '2026-11-21T09:03:00.120-05:00']) {
      expect(await validate(plainToInstance(AvanzarDto, { operarioId: 3, scannedAt: ok }))).toHaveLength(0);
    }
    for (const mal of ['2026-11-21T14:03:00', '2026-11-21', '2026-11-21T14:03:00.000']) {
      const errores = await validate(plainToInstance(AvanzarDto, { operarioId: 3, scannedAt: mal }));
      expect(errores.map((e) => e.property)).toEqual(['scannedAt']);
    }
  });

  it('rechaza un clientScanId con caracteres raros o demasiado largo', async () => {
    for (const clientScanId of ['a b', 'x'.repeat(65), "'; drop"]) {
      const errores = await validate(plainToInstance(AvanzarDto, { operarioId: 3, clientScanId }));
      expect(errores.map((e) => e.property)).toEqual(['clientScanId']);
    }
  });
});
