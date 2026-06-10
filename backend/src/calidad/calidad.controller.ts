import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CalidadService } from './calidad.service';
import { ReportarIncidenciaDto } from './dto/reportar-incidencia.dto';

@UseGuards(JwtAuthGuard)
@Controller('calidad')
export class CalidadController {
  constructor(private readonly service: CalidadService) {}

  @Get('tipos-dano')
  tiposDano() {
    return this.service.listarTiposDano();
  }

  @Post('pares/:codigo/incidencias')
  reportar(
    @Param('codigo') codigo: string,
    @Body() dto: ReportarIncidenciaDto,
    @Req() req: any,
  ) {
    return this.service.reportar(codigo, dto, req.user);
  }

  @Get('indicadores')
  indicadores() {
    return this.service.indicadores();
  }
}
