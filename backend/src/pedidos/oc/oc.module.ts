import { Module } from '@nestjs/common';
import { OcController } from './oc.controller';
import { OcService } from './oc.service';

@Module({
  controllers: [OcController],
  providers: [OcService],
  exports: [OcService],
})
export class OcModule {}
