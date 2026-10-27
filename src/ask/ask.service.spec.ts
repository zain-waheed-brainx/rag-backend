import { ConfigService } from '@nestjs/config';
import { DocumentsService } from '../documents/documents.service';
import { AskService } from './ask.service';

const createMock = jest.fn();

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: createMock } },
  }));
});

const fakeStream = (chunks: Array<string | undefined>) => ({
  [Symbol.asyncIterator]: () =>
    (async function* () {
      for (const content of chunks) {
        yield { choices: [{ delta: { content } }] };
      }
    })(),
});

describe('AskService', () => {
  let service: AskService;
  let documentsService: jest.Mocked<DocumentsService>;

  const buildConfigService = (
    values: Record<string, string | undefined>,
  ): ConfigService =>
    ({
      get: (key: string) => values[key],
    }) as unknown as ConfigService;

  beforeEach(() => {
    createMock.mockReset();

    documentsService = {
      search: jest.fn(),
    } as unknown as jest.Mocked<DocumentsService>;

    service = new AskService(
      documentsService,
      buildConfigService({
        API_KEY: 'test-key',
        MODEL: 'gpt-4o-mini',
        RAG_MIN_SCORE: '0.3',
      }),
    );
    service.onModuleInit();
  });

  it('throws on init when API_KEY is missing', () => {
    const missingKeyService = new AskService(
      documentsService,
      buildConfigService({}),
    );
    expect(() => missingKeyService.onModuleInit()).toThrow(
      'API_KEY is not configured',
    );
  });

  it('retrieves context, asks the model, and returns the answer with sources', async () => {
    documentsService.search.mockResolvedValue([
      {
        documentId: 'doc-1',
        name: 'weather facts',
        chunkIndex: 0,
        text: 'The sky is blue.',
        score: 0.9,
      },
    ]);
    createMock.mockResolvedValue(fakeStream(['The sky is blue.']));

    const result = await service.ask({ question: 'What color is the sky?' });

    expect(documentsService.search).toHaveBeenCalledWith(
      'What color is the sky?',
      { topK: undefined, documentId: undefined, minScore: 0 },
    );
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini',
        stream: true,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('The sky is blue.'),
          }),
        ]),
      }),
    );
    expect(result).toEqual({
      answer: 'The sky is blue.',
      sources: [
        {
          documentId: 'doc-1',
          name: 'weather facts',
          chunkIndex: 0,
          text: 'The sky is blue.',
          score: 0.9,
        },
      ],
    });
  });

  it('includes prior history as text inside the single user message', async () => {
    documentsService.search.mockResolvedValue([
      {
        documentId: 'doc-1',
        name: 'n',
        chunkIndex: 0,
        text: 'ctx',
        score: 0.9,
      },
    ]);
    createMock
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'What color is the sky at night?' } }],
      })
      .mockResolvedValueOnce(fakeStream(['ok']));

    await service.ask({
      question: 'And at night?',
      history: [
        { role: 'user', content: 'What color is the sky?' },
        { role: 'assistant', content: 'Blue.' },
      ],
    });

    expect(documentsService.search).toHaveBeenCalledWith(
      'What color is the sky at night?',
      expect.any(Object),
    );
    const { messages } = createMock.mock.calls[1][0];
    expect(messages.map((m: { role: string }) => m.role)).toEqual([
      'system',
      'user',
    ]);
    expect(messages[1].content).toContain(
      'User: What color is the sky?\nAssistant: Blue.',
    );
    expect(messages[1].content).toContain('Question: And at night?');
  });

  it('falls back to the original question when the rewrite is empty or too long', async () => {
    documentsService.search.mockResolvedValue([]);
    const history = [{ role: 'user' as const, content: 'hi' }];

    for (const bad of ['', 'x'.repeat(501)]) {
      documentsService.search.mockClear();
      createMock.mockResolvedValueOnce({
        choices: [{ message: { content: bad } }],
      });
      await service.ask({ question: 'And at night?', history });
      expect(documentsService.search).toHaveBeenCalledWith(
        'And at night?',
        expect.any(Object),
      );
    }
  });

  it('answers without calling the model when there are no sources', async () => {
    documentsService.search.mockResolvedValue([]);

    const result = await service.ask({ question: 'Unanswerable question' });

    expect(createMock).not.toHaveBeenCalled();
    expect(result.sources).toEqual([]);
    expect(result.answer).toBe(
      "I don't have enough information in the provided documents to answer that question.",
    );
  });

  it('drops results scoring below RAG_MIN_SCORE before asking the model', async () => {
    documentsService.search.mockResolvedValue([
      {
        documentId: 'doc-1',
        name: 'doc one',
        chunkIndex: 0,
        text: 'barely relevant',
        score: 0.1,
      },
    ]);

    const result = await service.ask({ question: 'question' });

    expect(createMock).not.toHaveBeenCalled();
    expect(result.sources).toEqual([]);
  });

  it('forwards topK and documentId to the documents service', async () => {
    documentsService.search.mockResolvedValue([]);

    await service.ask({
      question: 'question',
      topK: 1,
      documentId: '11111111-1111-1111-1111-111111111111',
    });

    expect(documentsService.search).toHaveBeenCalledWith('question', {
      topK: 1,
      documentId: '11111111-1111-1111-1111-111111111111',
      minScore: 0,
    });
  });

  describe('askStream', () => {
    it('yields sources, then token events, then done', async () => {
      documentsService.search.mockResolvedValue([
        {
          documentId: 'doc-1',
          name: 'weather facts',
          chunkIndex: 0,
          text: 'The sky is blue.',
          score: 0.9,
        },
      ]);
      createMock.mockResolvedValue(
        fakeStream(['The ', 'sky ', undefined, 'is blue.']),
      );

      const events = [];
      for await (const event of service.askStream({
        question: 'What color is the sky?',
      })) {
        events.push(event);
      }

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4o-mini', stream: true }),
      );
      expect(events).toEqual([
        {
          type: 'sources',
          sources: [
            {
              documentId: 'doc-1',
              name: 'weather facts',
              chunkIndex: 0,
              text: 'The sky is blue.',
              score: 0.9,
            },
          ],
        },
        { type: 'token', content: 'The ' },
        { type: 'token', content: 'sky ' },
        { type: 'token', content: 'is blue.' },
        { type: 'done' },
      ]);
    });

    it('yields a no-context answer without calling the model when there are no sources', async () => {
      documentsService.search.mockResolvedValue([]);

      const events = [];
      for await (const event of service.askStream({ question: 'question' })) {
        events.push(event);
      }

      expect(createMock).not.toHaveBeenCalled();
      expect(events).toEqual([
        { type: 'sources', sources: [] },
        {
          type: 'token',
          content:
            "I don't have enough information in the provided documents to answer that question.",
        },
        { type: 'done' },
      ]);
    });
  });
});
