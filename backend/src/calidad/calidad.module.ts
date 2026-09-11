import { Module } from '@nestjs/common';
import { CalidadController } from './calidad.controller';
import { CalidadService } from './calidad.service';
import { HashingService } from '../common/hashing.service';

@Module({
  controllers: [CalidadController],
  // HashingService: la autorización de calidad se valida como un login (sin tokens).
  providers: [CalidadService, HashingService],
  // El pistolazo de la estación lleva el daño tipificado: fabricación reusa las
  // mismas reglas (sellar segunda, dar de baja) en vez de duplicarlas.
  exports: [CalidadService],
})
export class CalidadModule {}
