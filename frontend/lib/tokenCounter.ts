// Rough token count for the RAG token-budget check (see vectorSearch.ts).
//
// It only decides whether the retrieved full documents fit the prompt budget,
// so an estimate is enough: no tokenizer model to download or run. Typical
// tokenizers produce one token per ~4 characters of English and ~3 for
// Italian/other languages, so 3 chars/token errs on the side of over-counting.
const CHARS_PER_TOKEN = 3;

export async function countTokens(text: string): Promise<number> {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
