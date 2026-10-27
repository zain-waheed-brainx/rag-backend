import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFParse } from 'pdf-parse';
import { getNumberConfig } from '../common/get-number-config';
import { cleanText } from '../common/clean-text';

export interface PdfPage {
  pageNumber: number;
  text: string;
}

const PDF_MAGIC_BYTES = Buffer.from('%PDF-');
const DEFAULT_MAX_PDF_PAGES = 10;

@Injectable()
export class PdfService {
  constructor(private readonly configService: ConfigService) {}

  async extractPages(buffer: Buffer): Promise<PdfPage[]> {
    if (!buffer.subarray(0, PDF_MAGIC_BYTES.length).equals(PDF_MAGIC_BYTES)) {
      throw new BadRequestException('File is not a valid PDF.');
    }

    const maxPages = getNumberConfig(
      this.configService,
      'MAX_PDF_PAGES',
      DEFAULT_MAX_PDF_PAGES,
    );
    const parser = new PDFParse({ data: buffer });
    try {
      // Check the page count from metadata before extracting any text.
      const info = await parser.getInfo();
      if (info.total > maxPages) {
        throw new BadRequestException(
          `PDF must have at most ${maxPages} pages (got ${info.total})`,
        );
      }

      const result = await parser.getText();

      return result.pages
        .map((page) => ({
          pageNumber: page.num,
          text: cleanText(page.text),
        }))
        .filter((page) => page.text.length > 0);
    } finally {
      await parser.destroy();
    }
  }
}
