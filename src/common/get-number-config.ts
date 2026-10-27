import type { ConfigService } from '@nestjs/config';

/** Reads a numeric env var, falling back when it is unset or not a finite number. */
export function getNumberConfig(
  configService: ConfigService,
  key: string,
  fallback: number,
): number {
  const raw = configService.get<string>(key);
  const parsed = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
