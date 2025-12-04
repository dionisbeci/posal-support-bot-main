import { openai } from '@/ai/genkit';

export type UserIntent = 'POSITIVE' | 'NEGATIVE' | 'OTHER';

export async function classifyUserIntent(message: string): Promise<UserIntent> {
    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a helpful assistant that classifies user responses to a specific question: "Do you want me to connect you with support?".
          
          Classify the user's response into one of three categories:
          - POSITIVE: The user wants to be connected (e.g., "Yes", "Please", "Okay", "Sure", "Po", "Po te lutem").
          - NEGATIVE: The user does NOT want to be connected (e.g., "No", "No thanks", "Jo", "Jo faleminderit").
          - OTHER: The user is saying something else, asking a new question, or the response is unrelated (e.g., "How much is it?", "What time is it?").
          
          Respond ONLY with the category name: POSITIVE, NEGATIVE, or OTHER.`
                },
                {
                    role: 'user',
                    content: message
                }
            ],
            temperature: 0,
            max_tokens: 10,
        });

        const result = completion.choices[0]?.message?.content?.trim().toUpperCase();

        if (result === 'POSITIVE' || result === 'NEGATIVE') {
            return result as UserIntent;
        }
        return 'OTHER';

    } catch (error) {
        console.error('Error classifying user intent:', error);
        return 'OTHER';
    }
}
