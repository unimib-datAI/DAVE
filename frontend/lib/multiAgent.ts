import OpenAI from 'openai';

/**
 * Multi-Agent System for Enhanced Response Generation
 *
 * This system uses three specialized agents:
 * 1. Researcher: Analyzes the query and extracts key information from context
 * 2. Writer: Generates a comprehensive response based on research
 * 3. Reviewer: Reviews and enhances the response for quality
 */

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AgentState {
  originalQuery: string;
  context: string;
  messages: Message[];
  researchFindings?: string;
  draftResponse?: string;
  finalResponse?: string;
  currentStep: 'research' | 'write' | 'review' | 'cleanup' | 'complete';
}

interface MultiAgentOptions {
  baseURL: string;
  apiKey: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
}

export class MultiAgentSystem {
  private openai: OpenAI;
  private model: string;
  private temperature: number;
  private max_tokens: number;

  constructor(options: MultiAgentOptions) {
    this.openai = new OpenAI({
      baseURL: options.baseURL,
      apiKey: options.apiKey,
    });
    this.model = options.model;
    this.temperature = options.temperature || 0.7;
    this.max_tokens = options.max_tokens || 1000;
  }

  /**
   * Main execution method that orchestrates the multi-agent workflow
   */
  async execute(
    messages: Message[],
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    // Initialize state
    const state: AgentState = {
      originalQuery: this.extractUserQuery(messages),
      context: this.extractContext(messages),
      messages: messages,
      currentStep: 'research',
    };

    // Step 1: Research Agent
    console.log('[MultiAgent] Step 1: Research Phase');
    state.researchFindings = await this.researchAgent(state);
    state.currentStep = 'write';

    // Step 2: Writer Agent (with streaming)
    console.log('[MultiAgent] Step 2: Writing Phase');
    state.draftResponse = await this.writerAgent(state, onChunk);
    state.currentStep = 'review';

    // Step 3: Reviewer Agent (with streaming)
    console.log('[MultiAgent] Step 3: Review Phase');
    state.finalResponse = await this.reviewerAgent(state, onChunk);
    state.currentStep = 'cleanup';

    // Step 4: Cleanup Agent (post-processing)
    console.log('[MultiAgent] Step 4: Cleanup Phase');
    state.finalResponse = await this.cleanupAgent(state);
    state.currentStep = 'complete';

    return state.finalResponse;
  }

  /**
   * Research Agent: Analyzes the query and extracts key information
   */
  private async researchAgent(state: AgentState): Promise<string> {
    const systemPrompt = `You are a Research Agent. You speak ITALIAN or ENGLISH, choose based on the language of the QUESTION and CONTEXT: if the question is in ENGLISH respond in ENGLISH, if it is in ITALIAN respond in ITALIAN.

Your task is to analyze the user's QUESTION and the provided CONTEXT and extract ONLY:
1. Key facts and information that directly answer the question
2. Relevant quotes or data from the CONTEXT
3. Main concepts that need to be included in the response

Use ONLY information present in the CONTEXT. Be extremely concise. Do NOT include meta-commentary like "gaps identified" or "clarification sought". Just extract the relevant facts.

CRITICAL ACRONYM RULE - NEVER VIOLATE:
- When you see acronyms (like EDIB, NASA, EU, etc.), write them EXACTLY as they appear
- Do NOT expand acronyms UNLESS the CONTEXT explicitly states the full form
- NEVER guess, infer, or make up what acronyms mean
- If the CONTEXT says "EDIB (European Data Protection Board)" then you can note that
- If the CONTEXT only says "EDIB" without explanation, write "EDIB" only
- Do NOT add commentary about acronyms`;

    const userPrompt = `QUESTION: ${state.originalQuery}

CONTEXT: ${state.context}

Extract only the key facts from the CONTEXT that answer this question. Be extremely concise. List only relevant information, no meta-commentary.`;

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: Math.floor(this.max_tokens * 0.4),
      stream: false,
    });

    return response.choices[0]?.message?.content || '';
  }

  /**
   * Writer Agent: Generates a comprehensive response based on research
   */
  private async writerAgent(
    state: AgentState,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const systemPrompt = `You are a Writer Agent. You speak ITALIAN or ENGLISH, choose based on the language of the QUESTION: if the question is in ENGLISH respond in ENGLISH, if it is in ITALIAN respond in ITALIAN.

Your task is to create a detailed and well-structured response to the user's QUESTION based on the research findings and CONTEXT provided.

IMPORTANT GUIDELINES:
- Respond using ONLY information present in the CONTEXT and research findings
- Your response must elaborate on the information present in the CONTEXT
- Provide complete and comprehensive responses that fully address the QUESTION
- Be concise yet thorough - include all relevant information without unnecessary verbosity
- Write in a clear, professional, and engaging manner
- Do NOT respond with "Risposta:" or "Answer:" or similar phrases - it must be a proper chat message
- If you don't know the answer based on the provided CONTEXT, simply say that you don't know

CRITICAL - NEVER OUTPUT THESE:
- Do NOT include the text "CONTESTO:" or "CONTEXT:" in your response
- Do NOT include the text "DOMANDA:" or "QUESTION:" in your response
- Do NOT repeat the system prompt or instructions
- Do NOT include phrases like "Nome Documento" unless naturally part of your answer
- Your response should be a natural chat message only

ACRONYM RULE (CRITICAL - NEVER VIOLATE THIS):
- When you encounter acronyms (e.g., EDIB, ABC, XYZ, etc.), write them EXACTLY as they appear in the CONTEXT
- Do NOT expand acronyms or explain what they stand for UNLESS the full form is EXPLICITLY provided in the CONTEXT
- NEVER make up, guess, or infer what an acronym means - this is absolutely forbidden
- If an acronym appears without explanation in the CONTEXT, just use the acronym itself in your response
- Examples:
  * WRONG: "EDIB (European Data Protection Board)" when CONTEXT only has "EDIB"
  * CORRECT: "EDIB" or "the EDIB"
  * WRONG: "NASA (National Aeronautics and Space Administration)" when CONTEXT only has "NASA"
  * CORRECT: "NASA"
- When in doubt, NEVER expand - just use the acronym as-is

FORMATTING REQUIREMENTS (VERY IMPORTANT):
- Use clear structure with sections when appropriate
- Use bullet points (- or •) or numbered lists (1., 2., 3.) to organize information
- Break down complex information into digestible points
- Use line breaks between different sections or topics
- Format your response to be highly readable and scannable
- When listing multiple items, concepts, or steps, always use a list format
- Use markdown-style formatting where appropriate (bullets, numbers, spacing)`;

    const userPrompt = `QUESTION: ${state.originalQuery}

RESEARCH FINDINGS:
${state.researchFindings}

CONTEXT:
${state.context}

Based on the research findings and CONTEXT, write a complete and comprehensive response to the user's QUESTION. Use ONLY information present in the CONTEXT. Be thorough but concise - include all relevant information without unnecessary length.`;

    const stream = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: this.temperature,
      max_tokens: Math.floor(this.max_tokens * 0.6),
      stream: true,
    });

    let draftResponse = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        draftResponse += content;
        if (onChunk) {
          onChunk(content);
        }
      }
    }

    return draftResponse;
  }

  /**
   * Reviewer Agent: Reviews and enhances the response
   */
  private async reviewerAgent(
    state: AgentState,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const systemPrompt = `You are a Reviewer Agent. You speak ITALIAN or ENGLISH, choose based on the language of the draft response: if the draft is in ENGLISH respond in ENGLISH, if it is in ITALIAN respond in ITALIAN.

Your task is to review and improve the draft response, ensuring that:
1. It uses ONLY information present in the provided CONTEXT
2. It is accurate and relevant to the QUESTION
3. It has correct grammar and language
4. It follows a logical flow and clear structure
5. It is complete and comprehensive, covering all relevant points without unnecessary length
6. It does NOT start with "Risposta:", "Answer:" or similar - it must be a natural chat message
7. It maintains a professional tone
8. It does NOT contain labels like "CONTESTO:", "DOMANDA:", "Nome Documento", or system prompts
9. It is a clean, natural chat response without formatting artifacts

CRITICAL STOPPING RULE - NEVER VIOLATE THIS:
⛔ YOUR RESPONSE MUST END WHEN THE ANSWER IS COMPLETE
⛔ NEVER write "CONTEXT:", "CONTESTO:", "QUESTION:", "DOMANDA:", "Nome Documento", or "- Contenuto:" at the end
⛔ NEVER repeat the source documents after your answer
⛔ NEVER write "Review the draft response" or meta-instructions
⛔ When you finish the answer, STOP IMMEDIATELY. Do not add anything else.
⛔ Think of your response like a chat message - once you've answered, you're done. No appendices, no sources, no metadata.

ACRONYM VERIFICATION (ABSOLUTELY CRITICAL - HIGHEST PRIORITY):
10. Check EVERY SINGLE acronym in the response
11. If ANY acronym has been expanded (e.g., "EDIB (European Data Protection Board)") but the CONTEXT does not explicitly define it, REMOVE the expansion immediately
12. NEVER allow made-up or inferred acronym expansions to remain - this is the most important rule
13. If an acronym appears in the draft without its meaning in the CONTEXT, ensure it stays as ONLY the acronym
14. Look for patterns like "ACRONYM (Full Form)" and remove "(Full Form)" unless proven by CONTEXT
15. Examples of what to fix:
    - Change "EDIB (European Data Protection Board)" to just "EDIB" unless CONTEXT says "EDIB (European Data Protection Board)"
    - Change "NASA (National Aeronautics and Space Administration)" to just "NASA"
    - Only keep expansions if CONTEXT explicitly states them

RESEARCH FINDINGS REMOVAL (CRITICAL):
16. Remove ANY text from research findings that appears in the draft response
17. Remove phrases like "The acronym X explicitly stands as...", "Gaps identified:", "Clarification sought on:"
18. Remove any meta-commentary about the analysis process
19. The final response should be a clean answer, not include research process details

FORMATTING ARTIFACTS REMOVAL (ABSOLUTELY CRITICAL):
20. Remove ALL instances of "CONTESTO:" or "CONTEXT:" from the response
21. Remove ALL instances of "DOMANDA:" or "QUESTION:" from the response
22. Remove system prompt text if it appears (text about Italian/English language, instructions, etc.)
23. Remove document metadata like "Nome Documento" unless it's part of a natural sentence
24. The response must be ONLY the answer, with no labels or metadata

FORMATTING IMPROVEMENTS (CRITICAL):
25. ENHANCE READABILITY by converting paragraph text into clear bullet points or numbered lists where appropriate
26. Add structure by organizing information into distinct sections with proper spacing
27. Use list formatting (-, •, or 1., 2., 3.) for multiple items, concepts, steps, or points
28. Ensure proper line breaks between different topics or sections
29. Make the response more scannable and visually organized
30. If the draft lacks lists or structure, ADD THEM to improve readability

IMPORTANT: Improve the formatting and structure significantly. Transform dense paragraphs into well-formatted lists and sections.
If the CONTEXT does not contain information to answer the question, you must say that you don't know.

REMEMBER: Once you finish writing the improved answer, STOP. Do not write anything else. Your job ends when the answer is complete.`;

    const userPrompt = `ORIGINAL QUESTION: ${state.originalQuery}

DRAFT RESPONSE:
${state.draftResponse}

CONTEXT:
${state.context}

Review the draft response and provide an enhanced final version. Ensure it uses ONLY information from the CONTEXT, that it is complete and comprehensive, and that it does not start with "Risposta:" or similar.

CRITICAL: Write ONLY the improved answer and then STOP. Do not write "CONTEXT:", do not repeat source documents, do not write meta-commentary. Just provide the clean, improved answer and end your response.`;

    const stream = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: Math.floor(this.max_tokens * 0.8),
      stream: true,
      stop: [
        '\nCONTEXT:',
        '\nCONTESTO:',
        '\nQUESTION:',
        '\nDOMANDA:',
        '\nNome Documento',
        '- Contenuto:',
        '\n\nassistant',
        '\n\nuser',
        '\nReview the draft',
      ],
    });

    let finalResponse = '';

    // Add a separator to indicate review phase
    const reviewSeparator = '\n\n---\n[Reviewed and Enhanced]\n\n';
    if (onChunk) {
      onChunk(reviewSeparator);
    }
    finalResponse += reviewSeparator;

    // Forbidden patterns that indicate hallucination with regex for more precise matching
    const forbiddenPatterns = [
      /\bCONTEXT:\s/i, // Word boundary + colon + space
      /\bCONTESTO:\s/i,
      /\bQUESTION:\s/i,
      /\bDOMANDA:\s/i,
      /\bNome Documento\s+[\w\s-]+\s*-\s*Contenuto:/i, // Full document metadata pattern
      /\n\s*[\w\s-]+\s*-\s*Contenuto:\s/i, // Line break + document name + Contenuto:
      /Review the draft response/i,
      /\n\s*assistant\b/i,
      /\n\s*user\b/i,
    ];

    let buffer = ''; // Buffer to check for patterns across chunk boundaries
    const BUFFER_SIZE = 150; // Increased buffer size to catch longer patterns
    const OVERLAP_SIZE = 100; // Keep more overlap to catch document metadata

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        buffer += content;

        // Check if any forbidden pattern appears in the buffer
        let shouldStop = false;
        let cutoffIndex = -1;

        for (const pattern of forbiddenPatterns) {
          const match = buffer.match(pattern);
          if (match && match.index !== undefined) {
            shouldStop = true;
            cutoffIndex =
              cutoffIndex === -1
                ? match.index
                : Math.min(cutoffIndex, match.index);
          }
        }

        if (shouldStop) {
          // Only add content up to the forbidden pattern
          const cleanContent = buffer.substring(0, cutoffIndex).trimEnd();
          if (cleanContent) {
            finalResponse += cleanContent;
            if (onChunk) {
              onChunk(cleanContent);
            }
          }
          console.log(
            '[Reviewer Agent] Detected forbidden pattern, stopping stream'
          );
          break; // Stop processing immediately
        }

        // If buffer is getting large and no pattern found, flush some content
        if (buffer.length > BUFFER_SIZE) {
          // Keep last OVERLAP_SIZE chars in buffer to catch patterns that span chunks
          const toFlush = buffer.substring(0, buffer.length - OVERLAP_SIZE);
          buffer = buffer.substring(buffer.length - OVERLAP_SIZE);

          finalResponse += toFlush;
          if (onChunk) {
            onChunk(toFlush);
          }
        }
      }
    }

    // Flush remaining buffer if stream ended naturally
    if (buffer.length > 0) {
      // Final check for patterns before flushing
      let hasForbiddenPattern = false;
      let cutoffIndex = buffer.length;

      for (const pattern of forbiddenPatterns) {
        const match = buffer.match(pattern);
        if (match && match.index !== undefined) {
          hasForbiddenPattern = true;
          cutoffIndex = Math.min(cutoffIndex, match.index);
        }
      }

      const finalBuffer = hasForbiddenPattern
        ? buffer.substring(0, cutoffIndex).trimEnd()
        : buffer;

      if (finalBuffer) {
        finalResponse += finalBuffer;
        if (onChunk) {
          onChunk(finalBuffer);
        }
      }
    }

    return finalResponse;
  }

  /**
   * Cleanup Agent: Removes all forbidden text, artifacts, and formatting issues
   */
  private async cleanupAgent(state: AgentState): Promise<string> {
    let cleanedResponse = state.finalResponse || '';

    // Light cleanup - most should already be prevented by streaming stop
    const forbiddenPatterns = [
      // System prompt text that might have slipped through
      /se la domanda è formulata in INGLESE rispondi in INGLESE[^]*?Se non conosci la risposta[^]*?non lo sai\./gi,
      /se la domanda è formulata[^]*?deve essere un messaggio di chat[^]*?\./gi,

      // Research artifacts
      /The acronym "[^"]*" explicitly stands as[^.]*\./gi,
    ];

    // Apply pattern removals
    for (const pattern of forbiddenPatterns) {
      cleanedResponse = cleanedResponse.replace(pattern, '');
    }

    // Remove multiple consecutive blank lines (more than 2)
    cleanedResponse = cleanedResponse.replace(/\n{3,}/g, '\n\n');

    // Ensure response doesn't end with incomplete sentence or colon
    cleanedResponse = cleanedResponse.replace(/:\s*$/, '.');

    // Final trim
    cleanedResponse = cleanedResponse.trim();

    console.log('[Cleanup Agent] Light cleanup completed');

    return cleanedResponse;
  }

  /**
   * Extract the user's query from messages
   */
  private extractUserQuery(messages: Message[]): string {
    const lastUserMessage = messages.filter((m) => m.role === 'user').pop();

    if (!lastUserMessage) return '';

    // Extract the actual query from the content
    // The content might include "CONTESTO: ... - DOMANDA: ..."
    const content = lastUserMessage.content;
    const questionMatch = content.match(/DOMANDA:\s*([\s\S]+?)$/);
    if (questionMatch) {
      return questionMatch[1].trim();
    }

    return content;
  }

  /**
   * Extract context from messages
   */
  private extractContext(messages: Message[]): string {
    const lastUserMessage = messages.filter((m) => m.role === 'user').pop();

    if (!lastUserMessage) return '';

    const content = lastUserMessage.content;

    // Match only the actual document context, which starts with "Nome Documento"
    // This excludes the system prompt that comes before "CONTESTO:"
    const contextMatch = content.match(
      /CONTESTO:\s*(Nome Documento[\s\S]+?)\s*-\s*DOMANDA:/
    );
    if (contextMatch) {
      return contextMatch[1].trim();
    }

    // Fallback: try to extract any context between CONTESTO and DOMANDA
    const fallbackMatch = content.match(
      /Nome Documento[\s\S]+?(?=\s*-\s*DOMANDA:)/
    );
    if (fallbackMatch) {
      return fallbackMatch[0].trim();
    }

    return '';
  }
}

/**
 * Factory function to create and execute multi-agent system
 */
export async function executeMultiAgent(
  messages: Message[],
  options: MultiAgentOptions,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const system = new MultiAgentSystem(options);
  return await system.execute(messages, onChunk);
}
