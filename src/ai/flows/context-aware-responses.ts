'use server';

import { openai } from '@/ai/genkit';
import { z } from 'zod';
import type { Run } from 'openai/resources/beta/threads/runs/runs';

// Input/output schemas (No changes needed)
const ContextAwareResponseInputSchema = z.object({
  message: z.string(),
  threadId: z.string().nullable().optional(),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'ai']),
        content: z.string(),
      })
    )
    .optional(),
  route: z.string().nullable().optional(),
});
export type ContextAwareResponseInput = z.infer<typeof ContextAwareResponseInputSchema>;

const ContextAwareResponseOutputSchema = z.object({
  response: z.string(),
  threadId: z.string().optional(),
  confidence: z.number().optional(),
});
export type ContextAwareResponseOutput = z.infer<typeof ContextAwareResponseOutputSchema>;


async function useAssistantAPI(
  assistantId: string,
  input: ContextAwareResponseInput
): Promise<ContextAwareResponseOutput> {
  let currentThreadId = input.threadId;

  try {
    if (!currentThreadId) {
      const thread = await openai.beta.threads.create();
      currentThreadId = thread.id;
      console.log('Created new thread:', currentThreadId);
    }

    const routeContext = input.route ? `\n      CURRENT CONTEXT: The user is currently on the "${input.route}" page of the POS system. Use this context to answer relevant questions.` : '';

    await openai.beta.threads.messages.create(currentThreadId, {
      role: 'user',
      content: `System Instruction: You are a helpful support agent. You MUST respond ONLY in Albanian.
      
      You are an expert on the "POS.al" system.${routeContext}
      1. If the user asks about POS.al, answer helpfully.
      2. If the user asks about UNRELATED topics (sports, politics, weather, etc.), politely REFUSE to answer. Say you only focus on POS.al. DO NOT apologize excessively.
      
      HANDOFF PHRASE:
      If you are genuinely UNSURE about a POS.al question, or if the user explicitly asks for a human agent, you MUST reply with this EXACT phrase:
      "Të them të drejtën, kërkova por nuk po gjej një përgjigje të saktë për këtë. Dëshiron të të lidh këtu në chat me një koleg tjetër që ka më shumë informacion për këtë?"

      CONFIDENCE SCORE RULES:
      At the very end of your response, you MUST append a confidence score tag: [[CONFIDENCE:score]].
      The score should be an integer between 0 and 100 representing your internal certainty about the answer provided:
      - 95-100: You are absolutely certain and have direct documentation for this.
      - 80-94: You are very confident but there might be slight nuances.
      - 60-79: You are reasonably sure but there's a possibility of error or missing detail.
      - 30-59: You are providing a "best effort" answer but are quite unsure.
      - 20-29: You are guessing or have very little information to go on.
      - 0-20: You are using the EXACT HANDOFF PHRASE because you cannot answer the POS.al question accurately.
      
      Refusing UNRELATED topics (sports, politics, etc.) should generally be around 80-90 confidence since it is a correct adherence to your core mission.

      User Message: ${input.message}`,
    });

    let run: Run = await openai.beta.threads.runs.create(currentThreadId, {
      assistant_id: assistantId,
    });
    console.log('Created run:', run.id);

    while (run.status === 'queued' || run.status === 'in_progress') {
      await new Promise(resolve => setTimeout(resolve, 500));

      run = await openai.beta.threads.runs.retrieve(
        run.id,
        { thread_id: currentThreadId }
      );
    }



    if (run.status === 'completed') {
      const messages = await openai.beta.threads.messages.list(currentThreadId, { limit: 1 });
      const assistantMessage = messages.data.find(msg => msg.role === 'assistant');

      if (assistantMessage && assistantMessage.content[0].type === 'text') {
        let response = assistantMessage.content[0].text.value;
        let confidence = 0;

        // Parse [[CONFIDENCE:xx]] tag
        const confidenceMatch = response.match(/\[\[CONFIDENCE:\s*(\d+)\s*\]\]/i);
        if (confidenceMatch) {
          confidence = parseInt(confidenceMatch[1], 10);
          // Remove all instances of the tag from the response shown to user
          response = response.replace(/\[\[CONFIDENCE:\s*\d+\s*\]\]/gi, '').trim();
        }

        return { response, threadId: currentThreadId, confidence };
      }
    }

    const errorMessage = run.last_error ? run.last_error.message : `Run ended with status: ${run.status} `;
    throw new Error(errorMessage);

  } catch (err: any) {
    console.error('Error in useAssistantAPI:', err.message);
    throw err;
  }
}

/**
 * Uses OpenAI Chat Completions API (for regular models)
 */
async function useChatCompletions(
  model: string,
  input: ContextAwareResponseInput
): Promise<ContextAwareResponseOutput> {
  try {
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];

    const routeContext = input.route ? `\n      CURRENT CONTEXT: The user is currently on the "${input.route}" page of the POS system. Use this context to answer relevant questions.` : '';

    // Add system instruction for confidence
    messages.push({
      role: 'system',
      content: `You are a helpful support agent for "POS.al". You MUST respond ONLY in Albanian.
      ${routeContext}
      If you are genuinely UNSURE about a POS.al question, or if the user explicitly asks for a human agent, you MUST reply with this EXACT phrase:
      "Të them të drejtën, kërkova por nuk po gjej një përgjigje të saktë për këtë. Dëshiron të të lidh këtu në chat me një koleg tjetër që ka më shumë informacion për këtë?"

      CONFIDENCE SCORE RULES:
      At the very end of your response, you MUST append a confidence score tag: [[CONFIDENCE:score]].
      The score should be an integer between 0 and 100 representing your internal certainty about the answer provided:
      - 95-100: Very certain.
      - 80-94: Very confident.
      - 60-79: Reasonably sure.
      - 30-59: Best effort but unsure.
      - 1-29: Guessing.
      - 0: Using the handoff phrase.

      Refusing unrelated topics should be 80-90 confidence.`
    });

    if (input.conversationHistory && input.conversationHistory.length > 0) {
      for (const msg of input.conversationHistory) {
        messages.push({
          role: msg.role === 'ai' ? 'assistant' : 'user',
          content: msg.content
        });
      }
    }
    messages.push({ role: 'user', content: input.message });

    const completion = await openai.chat.completions.create({
      model: model,
      messages: messages,
    });

    let response = completion.choices?.[0]?.message?.content;
    if (!response) {
      return { response: 'Sorry, I could not generate a response.' };
    }

    let confidence = 0;
    // Parse [[CONFIDENCE:xx]] tag
    const confidenceMatch = response.match(/\[\[CONFIDENCE:\s*(\d+)\s*\]\]/i);
    if (confidenceMatch) {
      confidence = parseInt(confidenceMatch[1], 10);
      // Remove all instances of the tag from the response shown to user
      response = response.replace(/\[\[CONFIDENCE:\s*\d+\s*\]\]/gi, '').trim();
    }

    return { response, threadId: input.threadId ?? undefined, confidence };
  } catch (err: any) {
    console.error('Error in useChatCompletions:', err);
    throw err;
  }
}

/**
 * Generates a context-aware AI response.
 */
export async function getContextAwareResponse(
  input: ContextAwareResponseInput
): Promise<ContextAwareResponseOutput> {
  const validatedInput = ContextAwareResponseInputSchema.parse({
    ...input,
    threadId: input.threadId ?? undefined,
  });
  const assistantId = process.env.OPENAI_ASSISTANT_ID;
  const apiKey = process.env.OPENAI_API_KEY;
  const useAssistant = !!(assistantId);

  console.log('Environment check:', {
    hasAssistantId: !!assistantId,
    assistantIdPrefix: assistantId ? assistantId.substring(0, 15) + '...' : 'missing',
    hasApiKey: !!apiKey,
    apiKeyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'missing',
    useAssistant: useAssistant
  });

  if (!apiKey) {
    return { response: 'Sorry, the OpenAI API key is not configured.' };
  }

  try {
    if (useAssistant) {
      return await useAssistantAPI(assistantId!, validatedInput);
    }
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    return await useChatCompletions(model, validatedInput);
  } catch (err: any) {
    console.error('Error in getContextAwareResponse:', err);
    let errorMessage = 'Sorry, something went wrong while generating a response.';
    if (err.message) {
      errorMessage = err.message;
    }
    return { response: errorMessage };
  }
}