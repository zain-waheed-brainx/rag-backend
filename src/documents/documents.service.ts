import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getNumberConfig } from '../common/get-number-config';
import { cleanText } from '../common/clean-text';
import { ChunkerService } from '../chunker/chunker.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { VECTOR_STORE } from '../vector-store/vector-store.interface';
import type {
  VectorSearchResult,
  VectorStore,
} from '../vector-store/vector-store.interface';
import type { PdfPage } from '../pdf/pdf.service';
import { CreateDocumentDto } from './dto/create-document.dto';

const DEFAULT_MAX_CHUNKS = 500;

export interface SearchOptions {
  topK?: number;
  minScore?: number;
  documentId?: string;
}

export type SearchResult = VectorSearchResult;

export interface AddDocumentResult {
  documentId: string;
  name: string;
  chunkCount: number;
}

export interface DocumentSummary {
  documentId: string;
  name: string;
  chunkCount: number;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly chunkerService: ChunkerService,
    private readonly embeddingService: EmbeddingService,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore,
    private readonly configService: ConfigService,
  ) {}

  async create({ name, text }: CreateDocumentDto): Promise<AddDocumentResult> {
    const chunks = this.chunkerService
      .chunk(cleanText(text))
      .map((text) => ({ text }));
    return this.embedAndStore(name, chunks);
  }

  async createFromPages(
    name: string,
    pages: PdfPage[],
  ): Promise<AddDocumentResult> {
    const chunks = pages.flatMap((page) =>
      this.chunkerService
        .chunk(page.text)
        .map((text) => ({ text, pageNumber: page.pageNumber })),
    );
    return this.embedAndStore(name, chunks);
  }

  private async embedAndStore(
    name: string,
    chunks: Array<{ text: string; pageNumber?: number }>,
  ): Promise<AddDocumentResult> {
    // Generated here until a DB assigns real ids; the id a caller gets back
    // is what removeDocument/search results key off of.
    const documentId = randomUUID();

    if (!chunks.length) {
      throw new BadRequestException('No text content to index.');
    }

    const maxChunks = getNumberConfig(
      this.configService,
      'MAX_CHUNKS',
      DEFAULT_MAX_CHUNKS,
    );
    if (chunks.length > maxChunks) {
      throw new BadRequestException(
        `Document is too large: it produces ${chunks.length} chunks, but the maximum is ${maxChunks}. Shorten the text or split it into several documents.`,
      );
    }

    const embeddings = await this.embeddingService.embedBatch(
      chunks.map((chunk) => chunk.text),
    );

    await this.vectorStore.upsert(
      chunks.map((chunk, chunkIndex) => ({
        documentId,
        name,
        chunkIndex,
        pageNumber: chunk.pageNumber,
        text: chunk.text,
        embedding: embeddings[chunkIndex],
      })),
    );

    return { documentId, name, chunkCount: chunks.length };
  }

  async removeDocument(documentId: string): Promise<void> {
    if (!(await this.vectorStore.hasDocument(documentId))) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    await this.vectorStore.deleteByDocumentId(documentId);
  }

  async renameDocument(documentId: string, name: string): Promise<void> {
    if (!(await this.vectorStore.hasDocument(documentId))) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    await this.vectorStore.renameDocument(documentId, name);
  }

  list(): Promise<DocumentSummary[]> {
    return Promise.resolve(this.vectorStore.listDocuments());
  }

  async search(
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    if (await this.vectorStore.isEmpty()) {
      return [];
    }

    const topK =
      options.topK ?? getNumberConfig(this.configService, 'RAG_TOP_K', 3);
    const minScore =
      options.minScore ??
      getNumberConfig(this.configService, 'RAG_MIN_SCORE', 0);

    const [queryEmbedding] = await this.embeddingService.embedBatch([query]);

    return this.vectorStore.search(queryEmbedding, {
      topK,
      minScore,
      documentId: options.documentId,
    });
  }
}
