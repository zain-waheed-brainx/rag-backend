import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

// Some providers cap the number of inputs per embeddings request.
const EMBEDDING_BATCH_SIZE = 100;

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private client: OpenAI;
  private model: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const apiKey = this.configService.get<string>('API_KEY');
    if (!apiKey) {
      throw new Error('API_KEY is not configured');
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: this.configService.get<string>('BASE_URL'),
    });
    this.model =
      this.configService.get<string>('EMBEDDING_MODEL') ??
      'text-embedding-3-small';
  }

  async embed(text: string): Promise<number[]> {
    const [embedding] = await this.embedBatch([text]);
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!texts.length) {
      return [];
    }

    const embeddings: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: texts.slice(i, i + EMBEDDING_BATCH_SIZE),
      });

      embeddings.push(
        ...response.data
          .sort((a, b) => a.index - b.index)
          .map((item) => item.embedding),
      );
    }

    return embeddings;
  }
}
