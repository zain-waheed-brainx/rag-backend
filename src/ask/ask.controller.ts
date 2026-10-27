import { Body, Controller, Logger, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AskService } from './ask.service';
import { AskDto } from './dto/ask.dto';

@Controller('ask')
export class AskController {
  private readonly logger = new Logger(AskController.name);

  constructor(private readonly askService: AskService) {}

  @Post()
  ask(@Body() dto: AskDto) {
    return this.askService.ask(dto);
  }

  @Post('stream')
  async stream(
    @Body() dto: AskDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const controller = new AbortController();
    res.on('close', () => controller.abort());

    try {
      for await (const event of this.askService.askStream(
        dto,
        controller.signal,
      )) {
        if (res.writableEnded) break;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error) {
      this.logger.error(
        'Ask stream failed',
        error instanceof Error ? error.stack : error,
      );
      if (!controller.signal.aborted && !res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({ type: 'error', message: 'Something went wrong while answering. Please try again.' })}\n\n`,
        );
      }
    } finally {
      if (!res.writableEnded) res.end();
    }
  }
}
