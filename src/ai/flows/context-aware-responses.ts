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
});
export type ContextAwareResponseInput = z.infer<typeof ContextAwareResponseInputSchema>;

const ContextAwareResponseOutputSchema = z.object({
  response: z.string(),
  threadId: z.string().optional(),
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

    await openai.beta.threads.messages.create(currentThreadId, {
      role: 'user',
      content: `System Instruction: You are a helpful support agent. You MUST respond ONLY in Albanian. If you are really unsure of the answer or have nothing to reply with, or if the user asks for a human, reply EXACTLY with: "Të them të drejtën, kërkova por nuk po gjej një përgjigje të saktë për këtë. Dëshiron të të lidh këtu në chat me një koleg tjetër që ka më shumë informacion për këtë?" and nothing else. DO NOT reply with this message if it is something unrelated with the POS program. In this case let the conversation continue normally.
      
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
        const response = assistantMessage.content[0].text.value;
        return { response, threadId: currentThreadId };
      }
    }

    const errorMessage = run.last_error ? run.last_error.message : `Run ended with status: ${run.status}`;
    throw new Error(errorMessage);

  } catch (err: any) {
    console.error('Error in useAssistantAPI:', err.message);
    throw err;
  }
}

/**
 * Uses OpenAI Chat Completions API (for regular models) - No changes needed
 */
async function useChatCompletions(
  model: string,
  input: ContextAwareResponseInput
): Promise<ContextAwareResponseOutput> {
  try {
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
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
    const response = completion.choices?.[0]?.message?.content;
    if (!response) {
      return { response: 'Sorry, I could not generate a response.' };
    }
    return { response, threadId: input.threadId ?? undefined };
  } catch (err: any) {
    console.error('Error in useChatCompletions:', err);
    throw err;
  }
}

/**
 * Generates a context-aware AI response. - No changes needed
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