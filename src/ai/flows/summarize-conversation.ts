'use server';

/**
 * @fileOverview Summarizes the conversation history for an agent taking over a chat.
 */

import { openai } from '@/ai/genkit';
import { z } from 'zod';

const SummarizeConversationInputSchema = z.object({
  conversationHistory: z
    .string()
    .describe('The complete history of the conversation to summarize.'),
});
export type SummarizeConversationInput = z.infer<
  typeof SummarizeConversationInputSchema
>;

const SummarizeConversationOutputSchema = z.object({
  summary: z
    .string()
    .describe(
      'A concise summary of the conversation, highlighting the main issues and user needs.'
    ),
});
export type SummarizeConversationOutput = z.infer<
  typeof SummarizeConversationOutputSchema
>;

export async function summarizeConversation(
  input: SummarizeConversationInput
): Promise<SummarizeConversationOutput> {
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an AI assistant helping human agents understand past conversations with users quickly.
          Summarize the following conversation history, focusing on the user's problem, needs, and any solutions that have already been attempted.`
        },
        {
          role: 'user',
          content: `Conversation History:\n${input.conversationHistory}`
        }
      ]
    });

    const summary = completion.choices[0]?.message?.content || 'Could not generate summary.';
    return { summary };
  } catch (error) {
    console.error('Error generating summary:', error);
    throw new Error('Failed to generate summary');
  }
}
