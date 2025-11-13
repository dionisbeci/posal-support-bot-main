# OpenAI Agent Builder Integration Setup

This project has been integrated with OpenAI Agent Builder workflows using **ChatKit**. 

## Important: Workflow IDs vs Assistant IDs

- **Workflow IDs** (`wf_...`) → Must use **ChatKit** (recommended for Agent Builder)
- **Assistant IDs** (`asst_...`) → Can use Assistant API or ChatKit

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
# OpenAI API Key
# Get your API key from https://platform.openai.com/api-keys
OPENAI_API_KEY=your_openai_api_key_here

# OpenAI Workflow ID (from Agent Builder)
# This is the Workflow ID you created in OpenAI Agent Builder
# Format: wf_xxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_WORKFLOW_ID=your_workflow_id_here
```

## How to Get Your Workflow ID

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Navigate to **Agent Builder** or **Workflows**
3. Select your agent/workflow
4. Copy the Workflow ID (starts with `wf_`)

## How It Works

**ChatKit Integration** (Recommended for Workflows):
1. Uses OpenAI's official ChatKit API
2. Creates a session with your workflow ID
3. Returns a client_secret for the frontend
4. ChatKit handles all the UI and backend communication

## Testing ChatKit

1. Make sure your `.env.local` file is configured with `OPENAI_WORKFLOW_ID`
2. Start the development server: `npm run dev`
3. Test ChatKit integration:
   - **React version**: Open `http://localhost:8000/chatkit-test`
   - **HTML version**: Open `http://localhost:8000/test-chatkit.html`
4. Send a message - your OpenAI workflow should respond!

## Legacy Custom Chat Widget

The old custom chat widget at `/public/test-chat.html` will show an error if you only have a workflow ID. To use it, you need an Assistant ID (`asst_...`) instead, or use ChatKit for workflows.

## Troubleshooting

- **"AI assistant is not configured properly"**: Check that `OPENAI_ASSISTANT_ID` is set in `.env.local`
- **API errors**: Verify your `OPENAI_API_KEY` is valid and has sufficient credits
- **No response**: Check the browser console and server logs for error messages

