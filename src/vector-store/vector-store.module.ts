import { Module } from '@nestjs/common';
import { ChromaVectorStore } from './chroma-vector-store.service';
import { VECTOR_STORE } from './vector-store.interface';

@Module({
  providers: [{ provide: VECTOR_STORE, useClass: ChromaVectorStore }],
  exports: [VECTOR_STORE],
})
export class VectorStoreModule {}
