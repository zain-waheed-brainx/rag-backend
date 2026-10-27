import { Module } from '@nestjs/common';
import { ChunkerService } from './chunker.service';

@Module({
  providers: [ChunkerService],
  exports: [ChunkerService],
})
export class ChunkerModule {}
