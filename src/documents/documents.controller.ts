import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { PdfService } from '../pdf/pdf.service';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { SearchDocumentsDto } from './dto/search-documents.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_MIME_TYPES = ['application/pdf'];

// Embedding is the costly part, so indexing gets a stricter limit than the
// global default.
const INDEXING_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly pdfService: PdfService,
  ) {}

  @Post()
  @Throttle(INDEXING_THROTTLE)
  create(@Body() createDocumentDto: CreateDocumentDto) {
    return this.documentsService.create(createDocumentDto);
  }

  @Post('upload')
  @Throttle(INDEXING_THROTTLE)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        callback(null, ALLOWED_UPLOAD_MIME_TYPES.includes(file.mimetype));
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name?: string,
  ) {
    if (!file) {
      throw new BadRequestException('file is required and must be a PDF');
    }

    const resolvedName = name?.trim() || file.originalname;

    const pages = await this.pdfService.extractPages(file.buffer);
    if (!pages.length) {
      throw new BadRequestException(
        'No extractable text found in PDF. Scanned/image-only PDFs are not supported.',
      );
    }
    return this.documentsService.createFromPages(resolvedName, pages);
  }

  @Get()
  list() {
    return this.documentsService.list();
  }

  @Get('search')
  search(@Query() { query, topK, minScore }: SearchDocumentsDto) {
    return this.documentsService.search(query, { topK, minScore });
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  rename(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() { name }: UpdateDocumentDto,
  ) {
    return this.documentsService.renameDocument(id, name);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.removeDocument(id);
  }
}
