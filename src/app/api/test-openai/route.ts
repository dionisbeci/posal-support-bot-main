import { NextResponse } from 'next/server';
import { openai } from '@/ai/genkit';

export async function GET() {
  try {
    const workflowId = process.env.OPENAI_WORKFLOW_ID;
    const apiKey = process.env.OPENAI_API_KEY;
    
    const envCheck = {
      hasWorkflowId: !!workflowId,
      workflowIdPrefix: workflowId ? workflowId.substring(0, 20) + '...' : 'MISSING',
      hasApiKey: !!apiKey,
      apiKeyPrefix: apiKey ? apiKey.substring(0, 15) + '...' : 'MISSING',
      allEnvVars: Object.keys(process.env).filter(k => k.includes('OPENAI'))
    };

    // Try a simple API call to verify connection
    let connectionTest = { success: false, error: null as string | null };
    if (workflowId && apiKey) {
      try {
        // Test with a simple completion call
        const testCompletion = await openai.chat.completions.create({
          model: workflowId,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 5
        });
        connectionTest = { 
          success: true, 
          error: null 
        };
      } catch (err: any) {
        connectionTest = { 
          success: false, 
          error: err.message || String(err) 
        };
      }
    } else {
      connectionTest.error = 'Missing environment variables';
    }

    return NextResponse.json({
      environment: envCheck,
      connectionTest,
      message: connectionTest.success 
        ? 'OpenAI workflow connection successful!' 
        : `OpenAI connection failed: ${connectionTest.error}`
    });
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message || String(error),
      message: 'Failed to test OpenAI connection'
    }, { status: 500 });
  }
}

