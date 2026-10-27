import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PdfService } from './pdf.service';

const getTextMock = jest.fn();
const getInfoMock = jest.fn();
const destroyMock = jest.fn();

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: getTextMock,
    getInfo: getInfoMock,
    destroy: destroyMock,
  })),
}));

describe('PdfService', () => {
  let service: PdfService;

  beforeEach(() => {
    getTextMock.mockReset();
    getInfoMock.mockReset().mockResolvedValue({ total: 1 });
    destroyMock.mockReset().mockResolvedValue(undefined);
    service = new PdfService(new ConfigService());
  });

  it('extracts and cleans text per page', async () => {
    getTextMock.mockResolvedValue({
      total: 2,
      pages: [
        { num: 1, text: 'page one contents' },
        { num: 2, text: 'page two contents' },
      ],
    });

    const pages = await service.extractPages(Buffer.from('%PDF-1.4'));

    expect(pages).toEqual([
      { pageNumber: 1, text: 'page one contents' },
      { pageNumber: 2, text: 'page two contents' },
    ]);
    expect(destroyMock).toHaveBeenCalled();
  });

  it('cleans pdf-parse artifacts and drops pages that clean down to empty', async () => {
    getTextMock.mockResolvedValue({
      total: 2,
      pages: [
        {
          num: 1,
          text: 'This is a hy-\nphenated word.\r\n\n\n\nExtra   spaces   here.\n\n\n',
        },
        { num: 2, text: '   \n  ' },
      ],
    });

    const pages = await service.extractPages(Buffer.from('%PDF-1.4'));

    expect(pages).toEqual([
      {
        pageNumber: 1,
        text: 'This is a hyphenated word.\n\nExtra spaces here.',
      },
    ]);
  });

  it('rejects a PDF with more than the maximum page count', async () => {
    getInfoMock.mockResolvedValue({ total: 12 });

    await expect(service.extractPages(Buffer.from('%PDF-1.4'))).rejects.toThrow(
      BadRequestException,
    );
    expect(getTextMock).not.toHaveBeenCalled();
    expect(destroyMock).toHaveBeenCalled();
  });

  it('rejects a file that is not a PDF', async () => {
    await expect(
      service.extractPages(Buffer.from('not a pdf')),
    ).rejects.toThrow(BadRequestException);
    expect(getTextMock).not.toHaveBeenCalled();
  });
});
