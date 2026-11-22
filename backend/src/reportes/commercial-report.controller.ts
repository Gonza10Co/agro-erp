import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { COMMERCIAL_DIMENSIONS, CommercialDimension, ORDER_STATUSES, OrderStatus } from './commercial-report-core';
import { CommercialReportService, ROLES_COMMERCIAL_REPORT } from './commercial-report.service';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** '1,2,3' → [1,2,3]; vacío → undefined. */
export function parseIds(v?: string): number[] | undefined {
  if (!v) return undefined;
  const ids = v.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 0);
  return ids.length ? ids : undefined;
}

/** Por defecto: los últimos 12 meses hasta hoy (hora Colombia). */
export function defaultRange(now = new Date()): { from: string; to: string } {
  const today = new Date(now.getTime() - 5 * 3_600_000);
  const to = today.toISOString().slice(0, 10);
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));
  return { from: first.toISOString().slice(0, 10), to };
}

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class CommercialReportController {
  constructor(private readonly service: CommercialReportService) {}

  @UseGuards(RolesGuard)
  @Roles(...ROLES_COMMERCIAL_REPORT)
  @Get('commercial')
  commercial(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('rows') rows?: string,
    @Query('clientIds') clientIds?: string,
    @Query('brandIds') brandIds?: string,
    @Query('referenceIds') referenceIds?: string,
    @Query('lineIds') lineIds?: string,
    @Query('statuses') statuses?: string,
    @Query('includeStock') includeStock?: string,
  ) {
    const def = defaultRange();
    const f = from || def.from;
    const t = to || def.to;
    if (!DAY_RE.test(f) || !DAY_RE.test(t)) throw new BadRequestException('Las fechas van como AAAA-MM-DD');
    if (f > t) throw new BadRequestException('La fecha inicial no puede ser posterior a la final');
    const dim = (rows || 'client') as CommercialDimension;
    if (!COMMERCIAL_DIMENSIONS.includes(dim)) throw new BadRequestException(`Filas no válidas: ${rows}`);
    const st = statuses ? statuses.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    if (st?.some((s) => !ORDER_STATUSES.includes(s as OrderStatus))) throw new BadRequestException(`Estado no válido: ${statuses}`);
    return this.service.report({
      from: f,
      to: t,
      rows: dim,
      filters: {
        clientIds: parseIds(clientIds),
        brandIds: parseIds(brandIds),
        referenceIds: parseIds(referenceIds),
        lineIds: parseIds(lineIds),
        statuses: st as OrderStatus[] | undefined,
        includeStock: includeStock === 'true',
      },
    });
  }
}
