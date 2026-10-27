import { Module } from '@nestjs/common';
import { ChunkerModule } from '../chunker/chunker.module';
import { EmbeddingModule } from '../embedding/embedding.module';
import { PdfModule } from '../pdf/pdf.module';
import { VectorStoreModule } from '../vector-store/vector-store.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [ChunkerModule, EmbeddingModule, VectorStoreModule, PdfModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
