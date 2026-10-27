import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getNumberConfig } from '../common/get-number-config';

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
}

const DEFAULT_SEPARATORS = ['\n\n', '\n', '. ', ' ', ''];

@Injectable()
export class ChunkerService {
  constructor(private readonly configService: ConfigService) {}

  chunk(text: string, options: ChunkOptions = {}): string[] {
    const chunkSize =
      options.chunkSize ??
      getNumberConfig(this.configService, 'CHUNK_SIZE', 500);
    const chunkOverlap =
      options.chunkOverlap ??
      getNumberConfig(this.configService, 'CHUNK_OVERLAP', 50);
    const separators = options.separators ?? DEFAULT_SEPARATORS;

    if (chunkSize <= 0) {
      throw new Error('chunkSize must be greater than 0');
    }
    if (chunkOverlap < 0 || chunkOverlap >= chunkSize) {
      throw new Error('chunkOverlap must be >= 0 and less than chunkSize');
    }

    const normalized = text.trim();
    if (!normalized) {
      return [];
    }

    // Guarantee a character-level fallback so recursion always terminates.
    const effectiveSeparators = separators.includes('')
      ? separators
      : [...separators, ''];

    return this.splitText(
      normalized,
      effectiveSeparators,
      chunkSize,
      chunkOverlap,
    );
  }

  /** Picks the finest separator present in `text` and splits on it, recursing into any oversized part. */
  private splitText(
    text: string,
    separators: string[],
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    if (text.length <= chunkSize) {
      return [text];
    }

    const separatorIndex = separators.findIndex(
      (sep) => sep === '' || text.includes(sep),
    );
    const separator = separators[separatorIndex];
    const remainingSeparators = separators.slice(separatorIndex + 1);

    const parts = separator ? text.split(separator) : text.split('');

    return this.mergeParts(
      parts,
      separator,
      remainingSeparators,
      chunkSize,
      chunkOverlap,
    );
  }

  /** Greedily packs `parts` into chunks, recursing into any single part that's still too big on its own. */
  private mergeParts(
    parts: string[],
    separator: string,
    remainingSeparators: string[],
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    const chunks: string[] = [];
    let current: string[] = [];
    let currentLength = 0;

    for (const part of parts) {
      if (part.length > chunkSize) {
        if (current.length) {
          chunks.push(current.join(separator).trim());
          current = [];
          currentLength = 0;
        }
        chunks.push(
          ...this.splitText(part, remainingSeparators, chunkSize, chunkOverlap),
        );
        continue;
      }

      const addedLength = part.length + (current.length ? separator.length : 0);

      if (currentLength + addedLength > chunkSize && current.length) {
        chunks.push(current.join(separator).trim());
        current = this.takeOverlap(current, separator, chunkOverlap);
        currentLength = current.length ? current.join(separator).length : 0;
      }

      current.push(part);
      currentLength +=
        part.length + (current.length > 1 ? separator.length : 0);
    }

    if (current.length) {
      chunks.push(current.join(separator).trim());
    }

    return chunks.filter((chunk) => chunk.length > 0);
  }

  /** Keeps as many trailing whole parts as fit within `chunkOverlap`, so overlap never cuts a word/sentence. */
  private takeOverlap(
    parts: string[],
    separator: string,
    chunkOverlap: number,
  ): string[] {
    const kept: string[] = [];
    let length = 0;

    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const part = parts[i];
      const addedLength = part.length + (kept.length ? separator.length : 0);
      if (length + addedLength > chunkOverlap) {
        break;
      }
      kept.unshift(part);
      length += addedLength;
    }

    return kept;
  }
}
