// /src/app/api/ai/respond/route.ts

import { NextResponse } from 'next/server';
import { getContextAwareResponse } from '@/ai/flows/context-aware-responses';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // We only need the user's message and the current threadId (if it exists)
    const { message, threadId } = body;

    if (!message) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }

    // This is the most important line.
    // It calls your real AI logic with the necessary information.
    const result = await getContextAwareResponse({ message, threadId });

    if (!result || typeof result.response !== 'string') {
      return NextResponse.json({ error: 'AI did not return a valid response' }, { status: 500 });
    }

    // Send the AI's response AND the threadId back to the frontend.
    // The frontend needs the threadId to continue the conversation.
    return NextResponse.json({ 
      response: result.response,
      threadId: result.threadId 
    });

  } catch (error: any) {
    console.error('Error in /api/ai/respond:', error);
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}