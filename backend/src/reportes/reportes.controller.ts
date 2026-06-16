import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ReportesService } from './reportes.service';
import { GuardarMetasDto } from './dto/guardar-metas.dto';

/** Resuelve anio/mes del query; si faltan, usa el mes calendario actual (UTC). */
function periodo(anioQ?: string, mesQ?: string) {
  const hoy = new Date();
  const anio = anioQ ? Number(anioQ) : hoy.getUTCFullYear();
  const mes = mesQ ? Number(mesQ) : hoy.getUTCMonth() + 1;
  return { anio, mes };
}

@UseGuards(JwtAuthGuard)
@Controller('reportes')
export class ReportesController {
  constructor(private readonly service: ReportesService) {}

  @Get('diario')
  diario(@Query('anio') anio?: string, @Query('mes') mes?: string) {
    const p = periodo(anio, mes);
    return this.service.diario(p.anio, p.mes);
  }

  @Get('metas')
  metas(@Query('anio') anio?: string, @Query('mes') mes?: string) {
    const p = periodo(anio, mes);
    return this.service.listarMetas(p.anio, p.mes);
  }

  @Put('metas')
  guardarMetas(@Body() dto: GuardarMetasDto, @Query('anio') anio?: string, @Query('mes') mes?: string) {
    const p = periodo(anio, mes);
    return this.service.guardarMetas(p.anio, p.mes, dto.items);
  }
}
