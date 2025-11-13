import { NextResponse } from 'next/server';

/**
 * ChatKit-based AI response endpoint
 * Uses ChatKit API to send messages to workflows
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, conversationHistory, clientSecret } = body;

    if (!message) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
    }

    // If we have a client secret, use it to send a message
    if (clientSecret) {
      // Send message via ChatKit
      const response = await fetch('https://api.openai.com/v1/chatkit/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'chatkit_beta=v1',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          client_secret: clientSecret,
          content: message,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to send message via ChatKit');
      }

      const data = await response.json();
      
      // Poll for the response
      // Note: ChatKit handles this differently, we may need to use events or polling
      // For now, return a placeholder that indicates we need to poll
      return NextResponse.json({
        response: 'Message sent via ChatKit. Response will be available through ChatKit events.',
        clientSecret: clientSecret,
        needsPolling: true,
      });
    }

    // If no client secret, create a new session first
    const workflowId = process.env.OPENAI_WORKFLOW_ID;
    if (!workflowId) {
      return NextResponse.json({ error: 'OPENAI_WORKFLOW_ID not configured' }, { status: 500 });
    }

    // Create session
    const sessionResponse = await fetch('https://api.openai.com/v1/chatkit/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'chatkit_beta=v1',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        workflow: { id: workflowId },
        user: `user_${Date.now()}`,
      }),
    });

    if (!sessionResponse.ok) {
      const error = await sessionResponse.json();
      throw new Error(error.error?.message || 'Failed to create ChatKit session');
    }

    const { client_secret } = await sessionResponse.json();

    // Send message with new session
    const messageResponse = await fetch('https://api.openai.com/v1/chatkit/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'chatkit_beta=v1',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        client_secret: client_secret,
        content: message,
      }),
    });

    if (!messageResponse.ok) {
      const error = await messageResponse.json();
      throw new Error(error.error?.message || 'Failed to send message');
    }

    return NextResponse.json({
      response: 'Message sent. Please use ChatKit client library for real-time responses.',
      clientSecret: client_secret,
    });
  } catch (error: any) {
    console.error('Error in /api/ai/respond-chatkit:', error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}

