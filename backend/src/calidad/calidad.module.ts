import { Module } from '@nestjs/common';
import { CalidadController } from './calidad.controller';
import { CalidadService } from './calidad.service';

@Module({
  controllers: [CalidadController],
  providers: [CalidadService],
  // El pistolazo de la estación lleva el daño tipificado: fabricación reusa las
  // mismas reglas (sellar segunda, dar de baja) en vez de duplicarlas.
  exports: [CalidadService],
})
export class CalidadModule {}
