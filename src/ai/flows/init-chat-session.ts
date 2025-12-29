'use server';

/**
 * @fileOverview Initializes a chat session, performs domain verification,
 * and handles silent user authentication.
 *
 * - initChatSession - The main flow function.
 * - InitChatSessionInput - The input type for the flow.
 * - InitChatSessionOutput - The return type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { db } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';
import type { Conversation, Message } from '@/lib/types';

const InitChatSessionInputSchema = z.object({
  chatId: z.string().describe('The ID of the chat configuration.'),
  origin: z.string().url().describe('The origin domain of the host page.'),
  params: z.record(z.any()).optional().describe('Custom parameters from the host page.'),
});
export type InitChatSessionInput = z.infer<typeof InitChatSessionInputSchema>;

const InitChatSessionOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  conversationId: z.string().optional(),
  visitorId: z.string().optional(),
  token: z.string().optional(),
  welcomeMessage: z.string().optional(),
});
export type InitChatSessionOutput = z.infer<typeof InitChatSessionOutputSchema>;

/**
 * Verifies that the chat widget is being loaded from an allowed domain.
 * @param origin The origin URL from the request.
 * @returns An object with a welcome message if the domain is allowed.
 * @throws An error if the domain is not allowed or settings are missing.
 */
async function verifyDomainAndGetWelcomeMessage(origin: string): Promise<{ welcomeMessage: string }> {
  const settingsRef = db.doc('settings/widget');
  const settingsSnap = await settingsRef.get();

  if (!settingsSnap.exists) {
    throw new Error('Widget settings not configured.');
  }

  const settings = settingsSnap.data()!;
  const allowedDomains: string[] = settings.allowedDomains || [];
  const welcomeMessage: string = settings.welcomeMessage || 'Hello! How can I help you today?';
  const requestOrigin = new URL(origin).hostname;

  const isAllowed = allowedDomains.some(domain => {
    // Convert wildcard domain to a regex: *.example.com -> .*\.example\.com
    const pattern = new RegExp(`^${domain.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`);
    return pattern.test(requestOrigin);
  });

  if (!isAllowed) {
    throw new Error(`Domain ${requestOrigin} is not allowed.`);
  }

  return { welcomeMessage };
}

/**
 * Creates an anonymous user in Firebase Authentication.
 * @returns An object containing the new visitor's ID and a custom auth token.
 */
async function createAnonymousUser(): Promise<{ visitorId: string, token: string }> {
  const auth = admin.auth();
  const userRecord = await auth.createUser({});
  const visitorId = userRecord.uid;
  const token = await auth.createCustomToken(visitorId);
  return { visitorId, token };
}

/**
 * Creates a new conversation in Firestore, including the initial welcome message.
 * @param visitorId The ID of the visitor who started the conversation.
 * @param welcomeMessage The initial message from the AI.
 * @param params Optional parameters from the host page.
 * @returns The ID of the newly created conversation.
 */
async function createConversation(visitorId: string, welcomeMessage: string, params?: Record<string, any>): Promise<string> {
  const conversationData: Omit<Conversation, 'id' | 'agent' | 'lastMessageAt'> = {
    visitorId: visitorId,
    lastMessage: welcomeMessage,
    status: 'ai',
    unreadCount: 0,
    userId: params?.userId || null,
    userName: params?.userName || null,
    shopId: params?.shopId || null,
  };

  const conversationsCollection = db.collection('conversations');
  const convoRef = await conversationsCollection.add({
    ...conversationData,
    lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
    agent: null, // Initially unassigned
  });

  const welcomeMessageData: Omit<Message, 'id' | 'timestamp'> = {
    role: 'ai',
    content: welcomeMessage,
    conversationId: convoRef.id
  };

  const messagesCollection = db.collection('messages');
  await messagesCollection.add({
    ...welcomeMessageData,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });

  return convoRef.id;
}


export async function initChatSession(input: InitChatSessionInput): Promise<InitChatSessionOutput> {
  return initChatSessionFlow(input);
}

const initChatSessionFlow = ai.defineFlow(
  {
    name: 'initChatSessionFlow',
    inputSchema: InitChatSessionInputSchema,
    outputSchema: InitChatSessionOutputSchema,
  },
  async (input) => {
    try {
      const { welcomeMessage } = await verifyDomainAndGetWelcomeMessage(input.origin);
      const { visitorId, token } = await createAnonymousUser();
      const conversationId = await createConversation(visitorId, welcomeMessage, input.params);

      return {
        success: true,
        message: 'Session initialized.',
        conversationId,
        visitorId,
        token,
        welcomeMessage,
      };
    } catch (error: any) {
      console.error('Error initializing chat session:', error);
      return { success: false, message: error.message || 'An unknown error occurred.' };
    }
  }
);
