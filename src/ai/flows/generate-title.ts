'use server';

import { openai } from '@/ai/genkit';
import { z } from 'zod';

const GenerateTitleInputSchema = z.object({
    conversationHistory: z.string().describe('The conversation history to analyze.'),
});

export type GenerateTitleInput = z.infer<typeof GenerateTitleInputSchema>;

const GenerateTitleOutputSchema = z.object({
    title: z.string().describe('The generated title for the conversation, or empty string if not enough info.'),
});

export type GenerateTitleOutput = z.infer<typeof GenerateTitleOutputSchema>;

export async function generateTitle(input: GenerateTitleInput): Promise<GenerateTitleOutput> {
    try {
        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are an AI assistant helping to label support conversations.
          Generate a short, descriptive title (3-6 words) for this conversation based on the user's issue or main topic.
          If there is not enough context to determine a specific topic (e.g. just greetings like "Hi", "Hello", or unclear messages), return an empty string.
          Do not include quotes in the output.
          Examples:
          - "Login Issue on Mobile"
          - "Refund Request for Order #123"
          - "" (for "Hello")`
                },
                {
                    role: 'user',
                    content: `Conversation History:\n${input.conversationHistory}`
                }
            ],
            temperature: 0.5,
        });

        const title = completion.choices[0]?.message?.content?.trim() || '';
        return { title: title === '""' ? '' : title }; // Clean up if it returned quotes
    } catch (error) {
        console.error('Error generating title:', error);
        return { title: '' };
    }
}
