/**
 * Normalizes raw text before chunking/embedding: unifies line endings,
 * re-joins words hyphenated across line breaks, and collapses runs of
 * spaces and blank lines. Shared by the PDF and pasted-text paths.
 *
 * pdf-parse emits a newline per PDF layout line (not per paragraph) and
 * breaks words that wrapped across lines, which fragments the chunker's
 * separator-based splitting.
 */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/-\n(?=\w)/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
