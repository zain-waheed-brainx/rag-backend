import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getNumberConfig } from '../common/get-number-config';
import { ChromaClient, type Collection, type Metadata } from 'chromadb';
import {
  StoredDocument,
  VectorRecord,
  VectorSearchOptions,
  VectorSearchResult,
  VectorStore,
} from './vector-store.interface';

const LIST_PAGE_SIZE = 1000;

/** Vector store backed by a Chroma server, searched by cosine similarity. */
@Injectable()
export class ChromaVectorStore implements VectorStore, OnModuleInit {
  private client: ChromaClient;
  private collection: Collection;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const host = this.configService.get<string>('CHROMA_HOST') ?? 'localhost';
    const port = getNumberConfig(this.configService, 'CHROMA_PORT', 8000);

    this.client = new ChromaClient({ host, port, ssl: false });

    this.collection = await this.client.getOrCreateCollection({
      name: this.configService.get<string>('CHROMA_COLLECTION') ?? 'rag_chunks',
      embeddingFunction: null,
      configuration: { hnsw: { space: 'cosine' } },
    });
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    if (!records.length) {
      return;
    }

    await this.collection.upsert({
      ids: records.map(recordId),
      embeddings: records.map((record) => record.embedding),
      documents: records.map((record) => record.text),
      metadatas: records.map(toMetadata),
    });
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    await this.collection.delete({ where: { documentId } });
  }

  async renameDocument(documentId: string, name: string): Promise<void> {
    const result = await this.collection.get({
      where: { documentId },
      include: ['metadatas'],
    });

    if (!result.ids.length) {
      return;
    }

    const metadatas = result.ids.map((_, index) => ({
      ...(result.metadatas?.[index] as Metadata),
      name,
    }));

    await this.collection.update({ ids: result.ids, metadatas });
  }

  async isEmpty(): Promise<boolean> {
    return (await this.collection.count()) === 0;
  }

  async listDocuments(): Promise<StoredDocument[]> {
    const documents = new Map<string, StoredDocument>();

    // Metadata only (no embeddings/text), fetched page by page.
    for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
      const page = await this.collection.get({
        include: ['metadatas'],
        limit: LIST_PAGE_SIZE,
        offset,
      });

      for (const metadata of page.metadatas as Metadata[]) {
        const documentId = metadata.documentId as string;
        const document = documents.get(documentId);
        if (document) {
          document.chunkCount += 1;
        } else {
          documents.set(documentId, {
            documentId,
            name: metadata.name as string,
            chunkCount: 1,
          });
        }
      }

      if (page.ids.length < LIST_PAGE_SIZE) {
        break;
      }
    }

    return [...documents.values()];
  }

  async hasDocument(documentId: string): Promise<boolean> {
    const result = await this.collection.get({
      where: { documentId },
      include: [],
      limit: 1,
    });
    return result.ids.length > 0;
  }

  async search(
    queryEmbedding: number[],
    options: VectorSearchOptions = {},
  ): Promise<VectorSearchResult[]> {
    const topK = options.topK ?? 3;
    const minScore = options.minScore ?? 0;

    const result = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
      where: options.documentId
        ? { documentId: options.documentId }
        : undefined,
      include: ['documents', 'metadatas', 'distances'],
    });

    const ids = result.ids[0] ?? [];
    const documents = result.documents[0] ?? [];
    const metadatas = result.metadatas[0] ?? [];
    const distances = result.distances?.[0] ?? [];

    return ids
      .map((_, index) => {
        const metadata = metadatas[index] as Metadata;
        const score = 1 - (distances[index] ?? 0);
        return {
          documentId: metadata.documentId as string,
          name: metadata.name as string,
          chunkIndex: Number(metadata.chunkIndex),
          pageNumber:
            metadata.pageNumber === undefined || metadata.pageNumber === null
              ? undefined
              : Number(metadata.pageNumber),
          text: documents[index] ?? '',
          score,
        };
      })
      .filter((result) => result.score >= minScore);
  }
}

function recordId(record: VectorRecord): string {
  return `${record.documentId}:${record.chunkIndex}`;
}

function toMetadata(record: VectorRecord): Metadata {
  return {
    documentId: record.documentId,
    name: record.name,
    chunkIndex: record.chunkIndex,
    ...(record.pageNumber === undefined
      ? {}
      : { pageNumber: record.pageNumber }),
  };
}
