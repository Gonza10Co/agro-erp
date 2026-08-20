import { Module } from '@nestjs/common';
import { CorteController } from './corte.controller';
import { CorteService } from './corte.service';

@Module({
  controllers: [CorteController],
  providers: [CorteService],
})
export class CorteModule {}
