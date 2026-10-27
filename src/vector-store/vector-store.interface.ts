export interface VectorRecord {
  documentId: string;
  name: string;
  chunkIndex: number;
  pageNumber?: number;
  text: string;
  embedding: number[];
}

export interface VectorSearchResult {
  documentId: string;
  name: string;
  chunkIndex: number;
  pageNumber?: number;
  text: string;
  score: number;
}

export interface StoredDocument {
  documentId: string;
  name: string;
  chunkCount: number;
}

export interface VectorSearchOptions {
  topK?: number;
  minScore?: number;
  documentId?: string;
}

export interface VectorStore {
  upsert(records: VectorRecord[]): void | Promise<void>;
  deleteByDocumentId(documentId: string): void | Promise<void>;
  renameDocument(documentId: string, name: string): void | Promise<void>;
  isEmpty(): boolean | Promise<boolean>;
  listDocuments(): StoredDocument[] | Promise<StoredDocument[]>;
  hasDocument(documentId: string): boolean | Promise<boolean>;
  search(
    queryEmbedding: number[],
    options?: VectorSearchOptions,
  ): VectorSearchResult[] | Promise<VectorSearchResult[]>;
}

export const VECTOR_STORE = Symbol('VECTOR_STORE');
