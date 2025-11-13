import { config } from 'dotenv';
config();

import '@/ai/flows/summarize-conversation.ts';
import '@/ai/flows/context-aware-responses.ts';
import '@/ai/flows/init-chat-session.ts';
