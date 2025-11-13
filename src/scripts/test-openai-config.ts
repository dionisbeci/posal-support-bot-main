import { OpenAI } from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function testOpenAIConfig() {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    console.log('Testing OpenAI configuration...');
    
    // Try to list models as a simple test
    const models = await openai.models.list();
    console.log('✅ OpenAI configuration is working!');
    console.log('Available models:', models.data.map(m => m.id).join(', '));

  } catch (error: any) {
    console.error('❌ Error testing OpenAI configuration:', error?.message || error);
  }
}

testOpenAIConfig();