import { Module } from '@nestjs/common';
import { DespachoController } from './despacho.controller';
import { DespachoService } from './despacho.service';

@Module({
  controllers: [DespachoController],
  providers: [DespachoService],
})
export class DespachoModule {}
