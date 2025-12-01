'use server';

import { openai } from '@/ai/genkit';
import { z } from 'zod';

const analyzeConversationOutputSchema = z.object({
  tone: z.string(),
  anger: z.number().min(0).max(10),
  frustration: z.object({
    customer: z.number().min(0).max(10),
    agent: z.number().min(0).max(10),
  }),
  resolutionStatus: z.enum([
    'waiting from customer',
    'waiting from agent',
    'waiting from a coworker',
    'not resolvable',
    'redirected',
  ]),
});

const AnalyzeConversationInputSchema = z.object({
  conversationHistory: z.string(),
});

export type AnalyzeConversationInput = z.infer<typeof AnalyzeConversationInputSchema>;

/**
 * Analyze a conversation and return structured metadata.
 */
export async function analyzeConversation(input: AnalyzeConversationInput) {
  AnalyzeConversationInputSchema.parse(input);

  const systemInstruction = `You are an assistant that analyzes conversation transcripts and returns a JSON object with the following keys:
  - tone: short string describing the overall tone (e.g., "friendly", "neutral", "formal").
  - anger: number 0-10 representing overall anger level.
  - frustration: object with 'customer' and 'agent' numbers 0-10.
  - resolutionStatus: one of ["waiting from customer","waiting from agent","waiting from a coworker","not resolvable","redirected"].

Return ONLY valid JSON that matches the described schema. Don't include extra commentary.`;

  const userContent = `Conversation:\n${input.conversationHistory}`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_WORKFLOW_ID || '',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userContent },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content ?? '';

    // Attempt to extract JSON from the model output
    let jsonText = raw.trim();
    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonText = jsonText.slice(firstBrace, lastBrace + 1);
    }

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseErr) {
      console.error('Failed to parse JSON from model output in analyzeConversation:', parseErr, 'raw:', raw);
      // Fallback: return a safe default
      return analyzeConversationOutputSchema.parse({
        tone: 'neutral',
        anger: 0,
        frustration: { customer: 0, agent: 0 },
        resolutionStatus: 'waiting from agent',
      });
    }

    // Validate and return
    return analyzeConversationOutputSchema.parse(parsed);
  } catch (err: any) {
    console.error('Error in analyzeConversation:', err);
    return analyzeConversationOutputSchema.parse({
      tone: 'neutral',
      anger: 0,
      frustration: { customer: 0, agent: 0 },
      resolutionStatus: 'waiting from agent',
    });
  }
}
