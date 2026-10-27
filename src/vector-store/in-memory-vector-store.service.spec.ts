import { InMemoryVectorStore } from './in-memory-vector-store.service';

describe('InMemoryVectorStore', () => {
  let store: InMemoryVectorStore;

  beforeEach(() => {
    store = new InMemoryVectorStore();
  });

  it('is empty by default', () => {
    expect(store.isEmpty()).toBe(true);
  });

  it('upserts records and reports non-empty', () => {
    store.upsert([
      {
        documentId: 'doc-1',
        name: 'doc one',
        chunkIndex: 0,
        text: 'a',
        embedding: [1, 0],
      },
    ]);
    expect(store.isEmpty()).toBe(false);
  });

  it('ranks results by cosine similarity, filtering by minScore', () => {
    store.upsert([
      {
        documentId: 'doc-1',
        name: 'doc one',
        chunkIndex: 0,
        text: 'cats',
        embedding: [1, 0],
      },
      {
        documentId: 'doc-1',
        name: 'doc one',
        chunkIndex: 1,
        text: 'dogs',
        embedding: [0, 1],
      },
    ]);

    const results = store.search([1, 0], { topK: 5, minScore: 0.5 });

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

  it('limits results to topK', () => {
    store.upsert([
      {
        documentId: 'doc-1',
        name: 'doc one',
        chunkIndex: 0,
        text: 'a',
        embedding: [1, 0],
      },
      {
        documentId: 'doc-1',
        name: 'doc one',
        chunkIndex: 1,
        text: 'b',
        embedding: [0.9, 0.1],
      },
      {
        documentId: 'doc-1',
        name: 'doc one',
        chunkIndex: 2,
        text: 'c',
        embedding: [0.8, 0.2],
      },
    ]);

    const results = store.search([1, 0], { topK: 2, minScore: 0 });

    expect(results).toHaveLength(2);
  });

  it('list returns a snapshot copy of all stored records', () => {
    const record = {
      documentId: 'doc-1',
      name: 'doc one',
      chunkIndex: 0,
      text: 'a',
      embedding: [1, 0],
    };
    store.upsert([record]);

    const result = store.list();

    expect(result).toEqual([record]);
    result.push({ ...record, documentId: 'doc-2' });
    expect(store.list()).toEqual([record]);
  });

  it('deleteByDocumentId removes only matching records', () => {
    store.upsert([
      {
        documentId: 'doc-1',
        name: 'doc one',
        chunkIndex: 0,
        text: 'a',
        embedding: [1, 0],
      },
      {
        documentId: 'doc-2',
        name: 'doc two',
        chunkIndex: 0,
        text: 'b',
        embedding: [0, 1],
      },
    ]);

    store.deleteByDocumentId('doc-1');
    const results = store.search([0, 1], { topK: 5, minScore: 0 });

    expect(results).toEqual([
      {
        documentId: 'doc-2',
        name: 'doc two',
        chunkIndex: 0,
        text: 'b',
        score: 1,
      },
    ]);
  });

  it('renameDocument updates the name on only matching records', () => {
    store.upsert([
      {
        documentId: 'doc-1',
        name: 'doc one',
        chunkIndex: 0,
        text: 'a',
        embedding: [1, 0],
      },
      {
        documentId: 'doc-1',
        name: 'doc one',
        chunkIndex: 1,
        text: 'b',
        embedding: [0, 1],
      },
      {
        documentId: 'doc-2',
        name: 'doc two',
        chunkIndex: 0,
        text: 'c',
        embedding: [1, 1],
      },
    ]);

    store.renameDocument('doc-1', 'renamed doc');

    expect(store.list()).toEqual([
      {
        documentId: 'doc-1',
        name: 'renamed doc',
        chunkIndex: 0,
        text: 'a',
        embedding: [1, 0],
      },
      {
        documentId: 'doc-1',
        name: 'renamed doc',
        chunkIndex: 1,
        text: 'b',
        embedding: [0, 1],
      },
      {
        documentId: 'doc-2',
        name: 'doc two',
        chunkIndex: 0,
        text: 'c',
        embedding: [1, 1],
      },
    ]);
  });
});
