import { BadRequestException } from '@nestjs/common';
import { PdfService } from '../pdf/pdf.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

const buildFile = (
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File =>
  ({
    originalname: 'notes.txt',
    mimetype: 'text/plain',
    buffer: Buffer.from('file contents'),
    ...overrides,
  }) as Express.Multer.File;

describe('DocumentsController', () => {
  let controller: DocumentsController;
  let documentsService: jest.Mocked<DocumentsService>;
  let pdfService: jest.Mocked<PdfService>;

  beforeEach(() => {
    documentsService = {
      create: jest.fn(),
      createFromPages: jest.fn(),
      list: jest.fn(),
      search: jest.fn(),
      renameDocument: jest.fn(),
      removeDocument: jest.fn(),
    } as unknown as jest.Mocked<DocumentsService>;

    pdfService = {
      extractPages: jest.fn(),
    } as unknown as jest.Mocked<PdfService>;

    controller = new DocumentsController(documentsService, pdfService);
  });

  it('delegates document creation to DocumentsService.create', async () => {
    const dto = { name: 'my doc', text: 'some content' };
    const expected = { documentId: 'doc-1', name: 'my doc', chunkCount: 1 };
    documentsService.create.mockResolvedValue(expected);

    const result = await controller.create(dto);

    expect(documentsService.create).toHaveBeenCalledWith(dto);
    expect(result).toEqual(expected);
  });

  it('uploads a file, using the body name over the filename', async () => {
    const expected = {
      documentId: 'doc-1',
      name: 'custom name',
      chunkCount: 1,
    };
    documentsService.create.mockResolvedValue(expected);

    const result = await controller.upload(buildFile(), 'custom name');

    expect(documentsService.create).toHaveBeenCalledWith({
      name: 'custom name',
      text: 'file contents',
    });
    expect(result).toEqual(expected);
  });

  it('uploads a file, falling back to the original filename when no name is given', async () => {
    documentsService.create.mockResolvedValue({
      documentId: 'doc-1',
      name: 'notes.txt',
      chunkCount: 1,
    });

    await controller.upload(buildFile(), undefined);

    expect(documentsService.create).toHaveBeenCalledWith({
      name: 'notes.txt',
      text: 'file contents',
    });
  });

  it('rejects upload when no file is present', async () => {
    await expect(
      controller.upload(undefined as unknown as Express.Multer.File, 'name'),
    ).rejects.toThrow(BadRequestException);
    expect(documentsService.create).not.toHaveBeenCalled();
  });

  it('extracts a PDF via PdfService and creates it through createFromPages', async () => {
    const pages = [
      { pageNumber: 1, text: 'page one contents' },
      { pageNumber: 2, text: 'page two contents' },
    ];
    pdfService.extractPages.mockResolvedValue(pages);
    documentsService.createFromPages.mockResolvedValue({
      documentId: 'doc-1',
      name: 'report.pdf',
      chunkCount: 2,
    });

    const file = buildFile({
      originalname: 'report.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-contents'),
    });

    const result = await controller.upload(file, undefined);

    expect(pdfService.extractPages).toHaveBeenCalledWith(file.buffer);
    expect(documentsService.createFromPages).toHaveBeenCalledWith(
      'report.pdf',
      pages,
    );
    expect(documentsService.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      documentId: 'doc-1',
      name: 'report.pdf',
      chunkCount: 2,
    });
  });

  it('uses the body name over the filename for PDF uploads too', async () => {
    pdfService.extractPages.mockResolvedValue([
      { pageNumber: 1, text: 'contents' },
    ]);
    documentsService.createFromPages.mockResolvedValue({
      documentId: 'doc-1',
      name: 'custom name',
      chunkCount: 1,
    });

    const file = buildFile({
      originalname: 'report.pdf',
      mimetype: 'application/pdf',
    });

    await controller.upload(file, 'custom name');

    expect(documentsService.createFromPages).toHaveBeenCalledWith(
      'custom name',
      [{ pageNumber: 1, text: 'contents' }],
    );
  });

  it('rejects a PDF with no extractable text (e.g. scanned/image-only)', async () => {
    pdfService.extractPages.mockResolvedValue([]);

    const file = buildFile({
      originalname: 'scanned.pdf',
      mimetype: 'application/pdf',
    });

    await expect(controller.upload(file, undefined)).rejects.toThrow(
      BadRequestException,
    );
    expect(documentsService.createFromPages).not.toHaveBeenCalled();
    expect(documentsService.create).not.toHaveBeenCalled();
  });

  it('propagates a rejection from PdfService (e.g. too many pages) without calling DocumentsService', async () => {
    pdfService.extractPages.mockRejectedValue(
      new BadRequestException('PDF must have at most 10 pages (got 12)'),
    );

    const file = buildFile({
      originalname: 'long.pdf',
      mimetype: 'application/pdf',
    });

    await expect(controller.upload(file, undefined)).rejects.toThrow(
      BadRequestException,
    );
    expect(documentsService.create).not.toHaveBeenCalled();
    expect(documentsService.createFromPages).not.toHaveBeenCalled();
  });

  it('delegates listing to DocumentsService.list', async () => {
    const expected = [{ documentId: 'doc-1', name: 'my doc', chunkCount: 2 }];
    documentsService.list.mockResolvedValue(expected);

    const result = await controller.list();

    expect(documentsService.list).toHaveBeenCalled();
    expect(result).toEqual(expected);
  });

  it('delegates search to DocumentsService.search with topK/minScore options', async () => {
    const expected = [
      {
        documentId: 'doc-1',
        name: 'doc one',
        chunkIndex: 0,
        text: 'a',
        score: 0.9,
      },
    ];
    documentsService.search.mockResolvedValue(expected);

    const result = await controller.search({
      query: 'question',
      topK: 5,
      minScore: 0.5,
    });

    expect(documentsService.search).toHaveBeenCalledWith('question', {
      topK: 5,
      minScore: 0.5,
    });
    expect(result).toEqual(expected);
  });

  it('delegates renaming to DocumentsService.renameDocument', async () => {
    documentsService.renameDocument.mockResolvedValue(undefined);

    await controller.rename('doc-1', { name: 'renamed' });

    expect(documentsService.renameDocument).toHaveBeenCalledWith(
      'doc-1',
      'renamed',
    );
  });

  it('delegates deletion to DocumentsService.removeDocument', async () => {
    documentsService.removeDocument.mockResolvedValue(undefined);

    await controller.remove('doc-1');

    expect(documentsService.removeDocument).toHaveBeenCalledWith('doc-1');
  });
});
