import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { IndicadoresService } from './indicadores.service';

@UseGuards(JwtAuthGuard)
@Controller('indicadores')
export class IndicadoresController {
  constructor(private readonly service: IndicadoresService) {}

  @Get()
  indicadores() {
    return this.service.indicadores();
  }
}
