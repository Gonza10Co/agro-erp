import { Module } from '@nestjs/common';
import { PtReassignmentController } from './pt-reassignment.controller';
import { PtReassignmentService } from './pt-reassignment.service';

@Module({
  controllers: [PtReassignmentController],
  providers: [PtReassignmentService],
})
export class PtReassignmentModule {}
