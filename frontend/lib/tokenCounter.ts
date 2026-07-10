// Token counting for the RAG token-budget checks (see vectorSearch.ts),
// ported from qavectorizer's `AutoTokenizer.from_pretrained("microsoft/Phi-3.5-mini-instruct")`.

type Tokenizer = { encode: (text: string) => number[] };

let tokenizerPromise: Promise<Tokenizer> | null = null;

function getTokenizer(): Promise<Tokenizer> {
  if (!tokenizerPromise) {
    tokenizerPromise = (async () => {
      const { AutoTokenizer } = await import('@xenova/transformers');
      return (await AutoTokenizer.from_pretrained(
        'microsoft/Phi-3.5-mini-instruct'
      )) as unknown as Tokenizer;
    })();
  }
  return tokenizerPromise;
}

export async function countTokens(text: string): Promise<number> {
  const tokenizer = await getTokenizer();
  return tokenizer.encode(text).length;
}
