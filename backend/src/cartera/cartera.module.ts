import { Module } from '@nestjs/common';
import { CarteraController } from './cartera.controller';
import { CarteraService } from './cartera.service';

@Module({
  controllers: [CarteraController],
  providers: [CarteraService],
})
export class CarteraModule {}
