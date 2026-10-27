import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from './embedding.service';

const createMock = jest.fn();

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    embeddings: { create: createMock },
  }));
});

describe('EmbeddingService', () => {
  let service: EmbeddingService;

  const buildConfigService = (
    values: Record<string, string | undefined>,
  ): ConfigService =>
    ({
      get: (key: string) => values[key],
    }) as unknown as ConfigService;

  beforeEach(() => {
    createMock.mockReset();
    service = new EmbeddingService(
      buildConfigService({
        API_KEY: 'test-key',
        BASE_URL: 'https://api.openai.com/v1',
        EMBEDDING_MODEL: 'text-embedding-3-small',
      }),
    );
    service.onModuleInit();
  });

  it('throws on init when API_KEY is missing', () => {
    const missingKeyService = new EmbeddingService(buildConfigService({}));
    expect(() => missingKeyService.onModuleInit()).toThrow(
      'API_KEY is not configured',
    );
  });

  it('embeds a single string', async () => {
    createMock.mockResolvedValue({
      data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
    });

    const result = await service.embed('hello world');

    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(createMock).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: ['hello world'],
    });
  });

  it('embeds a batch and preserves input order', async () => {
    createMock.mockResolvedValue({
      data: [
        { index: 1, embedding: [1, 1] },
        { index: 0, embedding: [0, 0] },
      ],
    });

    const result = await service.embedBatch(['first', 'second']);

    expect(result).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });

  it('splits large batches into groups of 100 and keeps the order', async () => {
    createMock.mockImplementation(({ input }: { input: string[] }) =>
      Promise.resolve({
        data: input.map((text, index) => ({
          index,
          embedding: [Number(text)],
        })),
      }),
    );
    const texts = Array.from({ length: 250 }, (_, i) => String(i));

    const result = await service.embedBatch(texts);

    expect(createMock).toHaveBeenCalledTimes(3);
    expect(createMock.mock.calls.map(([arg]) => arg.input.length)).toEqual([
      100, 100, 50,
    ]);
    expect(result.map(([n]) => n)).toEqual(texts.map(Number));
  });

  it('returns an empty array for an empty batch without calling the API', async () => {
    const result = await service.embedBatch([]);

    expect(result).toEqual([]);
    expect(createMock).not.toHaveBeenCalled();
  });
});
