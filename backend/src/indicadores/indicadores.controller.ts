import { Controller, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { IndicadoresService } from './indicadores.service';

@UseGuards(JwtAuthGuard)
@Controller('indicadores')
export class IndicadoresController {
  constructor(private readonly service: IndicadoresService) {}

  @Get()
  indicadores(
    @Query('lineaId', new ParseIntPipe({ optional: true })) lineaId?: number,
  ) {
    return this.service.indicadores(new Date(), lineaId);
  }
}
