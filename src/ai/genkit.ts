import { OpenAI } from 'openai';
import { genkit } from 'genkit';

export const ai = genkit({});

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
