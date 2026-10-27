const REQUIRED_STRING_KEYS = ['API_KEY'];

const NUMBER_KEYS = [
  'PORT',
  'CHROMA_PORT',
  'RAG_TOP_K',
  'RAG_MIN_SCORE',
  'CHUNK_SIZE',
  'CHUNK_OVERLAP',
  'MAX_CHUNKS',
  'MAX_PDF_PAGES',
];

/** Fails at boot when a required variable is missing or a numeric one is not a number. */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const errors: string[] = [];

  for (const key of REQUIRED_STRING_KEYS) {
    const value = config[key];
    if (typeof value !== 'string' || !value.trim()) {
      errors.push(`${key} is required`);
    }
  }

  for (const key of NUMBER_KEYS) {
    const value = config[key];
    if (value === undefined || value === '') {
      continue;
    }
    if (!Number.isFinite(Number(value))) {
      errors.push(`${key} must be a number (got "${String(value)}")`);
    }
  }

  if (errors.length) {
    throw new Error(`Invalid environment configuration: ${errors.join('; ')}`);
  }
  return config;
}
