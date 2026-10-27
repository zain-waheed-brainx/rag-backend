import { ConfigService } from '@nestjs/config';
import { ChunkerService } from './chunker.service';

describe('ChunkerService', () => {
  let service: ChunkerService;

  beforeEach(() => {
    const configService = { get: () => undefined } as unknown as ConfigService;
    service = new ChunkerService(configService);
  });

  it('returns an empty array for empty input', () => {
    expect(service.chunk('')).toEqual([]);
    expect(service.chunk('   ')).toEqual([]);
  });

  it('returns a single chunk when text fits within chunkSize', () => {
    const text = 'hello world';
    expect(service.chunk(text, { chunkSize: 100, chunkOverlap: 0 })).toEqual([
      text,
    ]);
  });

  it('splits text into overlapping chunks', () => {
    const text = 'a'.repeat(25);
    const chunks = service.chunk(text, { chunkSize: 10, chunkOverlap: 2 });

    expect(chunks).toEqual(['a'.repeat(10), 'a'.repeat(10), 'a'.repeat(9)]);
  });

  it('throws when chunkSize is not positive', () => {
    expect(() => service.chunk('text', { chunkSize: 0 })).toThrow();
  });

  it('throws when chunkOverlap is invalid', () => {
    expect(() =>
      service.chunk('text', { chunkSize: 10, chunkOverlap: 10 }),
    ).toThrow();
    expect(() =>
      service.chunk('text', { chunkSize: 10, chunkOverlap: -1 }),
    ).toThrow();
  });

  it('recursively splits on paragraph, then sentence boundaries', () => {
    const text =
      'Paragraph one has two sentences. This is the second one.\n\n' +
      'Paragraph two is short.';

    const chunks = service.chunk(text, { chunkSize: 40, chunkOverlap: 0 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(40);
    }
    expect(chunks.join(' ')).toContain('Paragraph one has two sentences');
    expect(chunks.join(' ')).toContain('Paragraph two is short.');
  });

  it('falls back to env-provided defaults when options are omitted', () => {
    const configService = {
      get: (key: string) => ({ CHUNK_SIZE: '10', CHUNK_OVERLAP: '2' })[key],
    } as unknown as ConfigService;
    const envService = new ChunkerService(configService);

    const chunks = envService.chunk('a'.repeat(25));

    expect(chunks).toEqual(['a'.repeat(10), 'a'.repeat(10), 'a'.repeat(9)]);
  });
});
