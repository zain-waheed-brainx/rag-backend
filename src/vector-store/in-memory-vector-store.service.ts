import { Injectable } from '@nestjs/common';
import {
  StoredDocument,
  VectorRecord,
  VectorSearchOptions,
  VectorSearchResult,
  VectorStore,
} from './vector-store.interface';

/** In-memory vector store, keyed by document id, searched by cosine similarity. */
@Injectable()
export class InMemoryVectorStore implements VectorStore {
  private readonly records: VectorRecord[] = [];

  upsert(records: VectorRecord[]): void {
    this.records.push(...records);
  }

  deleteByDocumentId(documentId: string): void {
    for (let i = this.records.length - 1; i >= 0; i -= 1) {
      if (this.records[i].documentId === documentId) {
        this.records.splice(i, 1);
      }
    }
  }

  renameDocument(documentId: string, name: string): void {
    for (const record of this.records) {
      if (record.documentId === documentId) {
        record.name = name;
      }
    }
  }

  isEmpty(): boolean {
    return this.records.length === 0;
  }

  list(): VectorRecord[] {
    return [...this.records];
  }

  listDocuments(): StoredDocument[] {
    const documents = new Map<string, StoredDocument>();
    for (const record of this.records) {
      const document = documents.get(record.documentId);
      if (document) {
        document.chunkCount += 1;
      } else {
        documents.set(record.documentId, {
          documentId: record.documentId,
          name: record.name,
          chunkCount: 1,
        });
      }
    }
    return [...documents.values()];
  }

  hasDocument(documentId: string): boolean {
    return this.records.some((record) => record.documentId === documentId);
  }

  search(
    queryEmbedding: number[],
    options: VectorSearchOptions = {},
  ): VectorSearchResult[] {
    const topK = options.topK ?? 3;
    const minScore = options.minScore ?? 0;

    return this.records
      .filter(
        (record) =>
          !options.documentId || record.documentId === options.documentId,
      )
      .map((record) => ({
        documentId: record.documentId,
        name: record.name,
        chunkIndex: record.chunkIndex,
        pageNumber: record.pageNumber,
        text: record.text,
        score: cosineSimilarity(queryEmbedding, record.embedding),
      }))
      .filter((result) => result.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
