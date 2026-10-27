import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { ChunkerService } from '../chunker/chunker.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { VectorStore } from '../vector-store/vector-store.interface';
import { DocumentsService } from './documents.service';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let chunkerService: jest.Mocked<ChunkerService>;
  let embeddingService: jest.Mocked<EmbeddingService>;
  let vectorStore: jest.Mocked<VectorStore>;
  let configService: ConfigService;

  beforeEach(() => {
    chunkerService = {
      chunk: jest.fn(),
    } as unknown as jest.Mocked<ChunkerService>;

    embeddingService = {
      embedBatch: jest.fn(),
    } as unknown as jest.Mocked<EmbeddingService>;

    vectorStore = {
      upsert: jest.fn(),
      deleteByDocumentId: jest.fn(),
      renameDocument: jest.fn(),
      isEmpty: jest.fn().mockReturnValue(true),
      listDocuments: jest.fn(),
      hasDocument: jest.fn(),
      search: jest.fn(),
    } as unknown as jest.Mocked<VectorStore>;

    configService = { get: () => undefined } as unknown as ConfigService;

    service = new DocumentsService(
      chunkerService,
      embeddingService,
      vectorStore,
      configService,
    );
  });

  it('chunks and embeds a document, generating a documentId and upserting it into the vector store', async () => {
    chunkerService.chunk.mockReturnValue(['chunk a', 'chunk b']);
    embeddingService.embedBatch.mockResolvedValue([
      [1, 0],
      [0, 1],
    ]);

    const result = await service.create({
      name: 'my doc',
      text: 'chunk a chunk b',
    });

    expect(result.name).toBe('my doc');
    expect(result.chunkCount).toBe(2);
    expect(typeof result.documentId).toBe('string');
    expect(result.documentId).not.toBe('');

    expect(vectorStore.upsert).toHaveBeenCalledWith([
      {
        documentId: result.documentId,
        name: 'my doc',
        chunkIndex: 0,
        text: 'chunk a',
        embedding: [1, 0],
      },
      {
        documentId: result.documentId,
        name: 'my doc',
        chunkIndex: 1,
        text: 'chunk b',
        embedding: [0, 1],
      },
    ]);
  });

  it('generates a different documentId on each call', async () => {
    chunkerService.chunk.mockReturnValue(['a']);
    embeddingService.embedBatch.mockResolvedValue([[1, 0]]);

    const first = await service.create({ name: 'doc', text: 'a' });
    const second = await service.create({ name: 'doc', text: 'a' });

    expect(first.documentId).not.toBe(second.documentId);
  });

  it('rejects a document with no chunks without embedding or upserting', async () => {
    chunkerService.chunk.mockReturnValue([]);

    await expect(
      service.create({ name: 'empty doc', text: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(embeddingService.embedBatch).not.toHaveBeenCalled();
    expect(vectorStore.upsert).not.toHaveBeenCalled();
  });

  it('cleans pasted text before chunking', async () => {
    chunkerService.chunk.mockReturnValue([]);

    await service
      .create({ name: 'd', text: 'a  b\r\n\r\n\r\n\r\nc' })
      .catch(() => undefined);

    expect(chunkerService.chunk).toHaveBeenCalledWith('a b\n\nc');
  });

  it('rejects documents that exceed MAX_CHUNKS before embedding', async () => {
    const limited = new DocumentsService(
      chunkerService,
      embeddingService,
      vectorStore,
      {
        get: (k: string) => (k === 'MAX_CHUNKS' ? '2' : undefined),
      } as unknown as ConfigService,
    );
    chunkerService.chunk.mockReturnValue(['a', 'b', 'c']);

    await expect(
      limited.create({ name: 'big', text: 'abc' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(embeddingService.embedBatch).not.toHaveBeenCalled();
  });

  it('createFromPages chunks each page independently and tags chunks with pageNumber', async () => {
    chunkerService.chunk.mockImplementation((text) =>
      text === 'page one' ? ['p1 chunk a', 'p1 chunk b'] : ['p2 chunk a'],
    );
    embeddingService.embedBatch.mockResolvedValue([
      [1, 0],
      [0, 1],
      [1, 1],
    ]);

    const result = await service.createFromPages('my doc', [
      { pageNumber: 1, text: 'page one' },
      { pageNumber: 2, text: 'page two' },
    ]);

    expect(result.name).toBe('my doc');
    expect(result.chunkCount).toBe(3);
    expect(embeddingService.embedBatch).toHaveBeenCalledWith([
      'p1 chunk a',
      'p1 chunk b',
      'p2 chunk a',
    ]);
    expect(vectorStore.upsert).toHaveBeenCalledWith([
      {
        documentId: result.documentId,
        name: 'my doc',
        chunkIndex: 0,
        pageNumber: 1,
        text: 'p1 chunk a',
        embedding: [1, 0],
      },
      {
        documentId: result.documentId,
        name: 'my doc',
        chunkIndex: 1,
        pageNumber: 1,
        text: 'p1 chunk b',
        embedding: [0, 1],
      },
      {
        documentId: result.documentId,
        name: 'my doc',
        chunkIndex: 2,
        pageNumber: 2,
        text: 'p2 chunk a',
        embedding: [1, 1],
      },
    ]);
  });

  it('createFromPages rejects when no page yields chunks', async () => {
    chunkerService.chunk.mockReturnValue([]);

    await expect(
      service.createFromPages('empty doc', [{ pageNumber: 1, text: '   ' }]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(embeddingService.embedBatch).not.toHaveBeenCalled();
    expect(vectorStore.upsert).not.toHaveBeenCalled();
  });

  it('removeDocument delegates to the vector store when the document exists', async () => {
    vectorStore.hasDocument.mockResolvedValue(true);

    await service.removeDocument('doc-1');

    expect(vectorStore.deleteByDocumentId).toHaveBeenCalledWith('doc-1');
  });

  it('removeDocument throws NotFoundException when the document does not exist', async () => {
    vectorStore.hasDocument.mockResolvedValue(false);

    await expect(service.removeDocument('missing-doc')).rejects.toThrow(
      NotFoundException,
    );
    expect(vectorStore.deleteByDocumentId).not.toHaveBeenCalled();
  });

  it('renameDocument delegates to the vector store when the document exists', async () => {
    vectorStore.hasDocument.mockResolvedValue(true);

    await service.renameDocument('doc-1', 'renamed');

    expect(vectorStore.renameDocument).toHaveBeenCalledWith('doc-1', 'renamed');
  });

  it('renameDocument throws NotFoundException when the document does not exist', async () => {
    vectorStore.hasDocument.mockResolvedValue(false);

    await expect(
      service.renameDocument('missing-doc', 'renamed'),
    ).rejects.toThrow(NotFoundException);
    expect(vectorStore.renameDocument).not.toHaveBeenCalled();
  });

  it('list returns the per-document summaries from the vector store', async () => {
    const summaries = [
      { documentId: 'doc-1', name: 'doc one', chunkCount: 2 },
      { documentId: 'doc-2', name: 'doc two', chunkCount: 1 },
    ];
    vectorStore.listDocuments.mockResolvedValue(summaries);

    expect(await service.list()).toEqual(summaries);
  });

  it('returns an empty array when the vector store is empty, without embedding the query', async () => {
    vectorStore.isEmpty.mockReturnValue(true);

    const results = await service.search('anything');

    expect(results).toEqual([]);
    expect(embeddingService.embedBatch).not.toHaveBeenCalled();
  });

  it('embeds the query and delegates ranking to the vector store', async () => {
    vectorStore.isEmpty.mockReturnValue(false);
    embeddingService.embedBatch.mockResolvedValue([[1, 0]]);
    vectorStore.search.mockReturnValue([
      {
        documentId: 'doc-1',
        name: 'doc one',
        chunkIndex: 0,
        text: 'cats',
        score: 1,
      },
    ]);

    const results = await service.search('cats', { topK: 5, minScore: 0.5 });

    expect(embeddingService.embedBatch).toHaveBeenCalledWith(['cats']);
    expect(vectorStore.search).toHaveBeenCalledWith([1, 0], {
      topK: 5,
      minScore: 0.5,
    });
    expect(results).toEqual([
      {
        documentId: 'doc-1',
        name: 'doc one',
        chunkIndex: 0,
        text: 'cats',
        score: 1,
      },
    ]);
  });
});
