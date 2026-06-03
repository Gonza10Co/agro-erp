import { Module } from '@nestjs/common';
import { OpController } from './op.controller';
import { OpService } from './op.service';

@Module({
  controllers: [OpController],
  providers: [OpService],
  exports: [OpService],
})
export class OpModule {}
