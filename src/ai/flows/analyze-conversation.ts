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

  const systemInstruction = `You are an expert sentiment analysis assistant. Analyze the following conversation transcript (likely in Albanian) and return a JSON object summarizing the emotional state.

Keys required:
- "tone": A capitalized string describing the overall tone. Examples: "Friendly", "Neutral", "Professional", "Frustrated", "Angry", "Confused", "Urgent".
- "anger": A number from 0 to 10 significantly representing the customer's anger level.
  - 0-2: Calm / Happy
  - 3-5: Annoyed / Irritated
  - 6-7: Angry
  - 8-10: Furious / Hostile
- "frustration": An object with "customer" and "agent" keys, each a number from 0-10.
  - "customer": How frustrated the customer seems (0-10).
  - "agent": How frustrated the agent seems (0-10).
- "resolutionStatus": One of ["waiting from customer","waiting from agent","waiting from a coworker","not resolvable","redirected"].

IMPORTANT:
- If the customer is complaining, using strong language, or expressing dissatisfaction with the software, score "anger" and "frustration.customer" appropriately high (e.g., > 4).
- Do NOT default to "Neutral" or 0 if there are signs of conflict.
- Return ONLY valid JSON. No markdown formatting.`;

  const userContent = `Conversation:\n${input.conversationHistory}`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
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
