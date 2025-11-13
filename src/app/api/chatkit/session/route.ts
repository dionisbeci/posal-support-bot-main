import { NextResponse } from 'next/server';

/**
 * Creates a ChatKit session using the official OpenAI ChatKit API
 * This endpoint creates a session and returns a client_secret for the frontend
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { currentClientSecret, deviceId } = body;

    const workflowId = process.env.OPENAI_WORKFLOW_ID;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!workflowId) {
      return NextResponse.json(
        { error: 'OPENAI_WORKFLOW_ID is not set in environment variables' },
        { status: 500 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not set in environment variables' },
        { status: 500 }
      );
    }

    // If we have an existing client secret, refresh the session
    if (currentClientSecret) {
      const refreshResponse = await fetch('https://api.openai.com/v1/chatkit/sessions/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'chatkit_beta=v1',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          client_secret: currentClientSecret,
        }),
      });

      if (!refreshResponse.ok) {
        const error = await refreshResponse.json();
        throw new Error(error.error?.message || 'Failed to refresh session');
      }

      const { client_secret } = await refreshResponse.json();
      return NextResponse.json({ client_secret });
    }

    // Create a new session
    const createResponse = await fetch('https://api.openai.com/v1/chatkit/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'chatkit_beta=v1',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        workflow: { id: workflowId },
        user: deviceId || `user_${Date.now()}`, // Use deviceId if provided, otherwise generate one
      }),
    });

    if (!createResponse.ok) {
      const error = await createResponse.json();
      console.error('ChatKit API error:', error);
      throw new Error(error.error?.message || 'Failed to create ChatKit session');
    }

    const { client_secret } = await createResponse.json();
    return NextResponse.json({ client_secret });
  } catch (error: any) {
    console.error('Error creating ChatKit session:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create chat session' },
      { status: error.status || 500 }
    );
  }
}