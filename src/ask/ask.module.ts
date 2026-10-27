import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { AskController } from './ask.controller';
import { AskService } from './ask.service';

@Module({
  imports: [DocumentsModule],
  controllers: [AskController],
  providers: [AskService],
  exports: [AskService],
})
export class AskModule {}
