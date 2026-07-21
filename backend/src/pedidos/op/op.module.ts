import { Module } from '@nestjs/common';
import { ComprasModule } from '../../compras/compras.module';
import { OpController } from './op.controller';
import { OpService } from './op.service';

@Module({
  imports: [ComprasModule],
  controllers: [OpController],
  providers: [OpService],
  exports: [OpService],
})
export class OpModule {}
