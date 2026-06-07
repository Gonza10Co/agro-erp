import { Module } from '@nestjs/common';
import { FabricacionController } from './fabricacion.controller';
import { FabricacionService } from './fabricacion.service';

@Module({
  controllers: [FabricacionController],
  providers: [FabricacionService],
})
export class FabricacionModule {}
