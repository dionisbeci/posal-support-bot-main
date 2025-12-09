// /src/app/api/ai/respond/route.ts

import { NextResponse } from 'next/server';
import { getContextAwareResponse } from '@/ai/flows/context-aware-responses';
import { classifyUserIntent } from '@/lib/classification';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // We only need the user's message and the current threadId (if it exists)
    const { message, threadId, conversationId } = body;

    if (!message) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }

    // Check if we are in a "handoff confirmation" state
    if (conversationId) {
      const { admin, db } = await import('@/lib/firebase-admin');
      const convoRef = db.collection('conversations').doc(conversationId);
      const convoSnap = await convoRef.get();

      if (convoSnap.exists) {
        const convoData = convoSnap.data();

        if (convoData?.handoffConfirmationPending) {
          // CLASSIFY USER INTENT
          const intent = await classifyUserIntent(message);

          if (intent === 'POSITIVE') {
            // User wants support -> Connect them
            await convoRef.update({
              status: 'pending', // Or 'active' if you want immediate join, but 'pending' usually means waiting for agent
              handoffConfirmationPending: admin.firestore.FieldValue.delete(),
              lastMessage: 'Po lidheni me një agjent...', // System message
              lastMessageAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return NextResponse.json({
              response: "Në rregull, po ju lidh me një nga agjentët tanë. Ju lutem prisni pak.",
              threadId // Keep same thread
            });
          } else if (intent === 'NEGATIVE') {
            // User declined -> Remove pending flag and continue normal AI chat
            await convoRef.update({
              handoffConfirmationPending: admin.firestore.FieldValue.delete()
            });
            // Proceed to generate normal AI response below...
          } else {
            // OTHER -> User ignored the question or asked something else.
            // Remove pending flag and treat as normal message.
            await convoRef.update({
              handoffConfirmationPending: admin.firestore.FieldValue.delete()
            });
            // Proceed to generate normal AI response below...
          }
        }
      }
    }

    // This is the most important line.
    // It calls your real AI logic with the necessary information.
    const result = await getContextAwareResponse({ message, threadId });

    if (!result || typeof result.response !== 'string') {
      return NextResponse.json({ error: 'AI did not return a valid response' }, { status: 500 });
    }

    // Check for "unsure" response to trigger handoff
    const handoffPhrase = "Të them të drejtën, kërkova nëpër letra por nuk gjeta ndonjë gjë fiks për këtë që po kërkon. Dëshiron të të lidh këtu në chat me çunat dhe gocat e suportit?";

    if (result.response.includes(handoffPhrase)) {
      // Handoff logic: Update conversation to 'handoffConfirmationPending'
      // We need conversationId for this.
      if (conversationId) {
        const { admin, db } = await import('@/lib/firebase-admin');
        await db.collection('conversations').doc(conversationId).update({
          handoffConfirmationPending: true,
          // status: 'pending', // DO NOT change status yet!
          lastMessage: result.response,
          lastMessageAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }

    // START: Generate Title Logic
    if (conversationId) {
      const { admin, db } = await import('@/lib/firebase-admin');
      const convoRef = db.collection('conversations').doc(conversationId);
      const convoSnap = await convoRef.get();
      const convoData = convoSnap.data();

      if (convoSnap.exists && !convoData?.title) {
        // Fetch recent history for context
        // The user message is already in Firestore (added by client).
        // The AI response is NOT yet in Firestore (client adds it after this API returns).
        const previousMessagesSnap = await db.collection('messages')
          .where('conversationId', '==', conversationId)
          .orderBy('timestamp', 'desc')
          .limit(5)
          .get();

        const previousMessages = previousMessagesSnap.docs
          .map((d) => ({ role: d.data().role, content: d.data().content }))
          .reverse();

        let history = previousMessages.map((m) => `${m.role}: ${m.content}`).join('\n');
        // Add the current AI response to history context
        history += `\nai: ${result.response}`;

        const { generateTitle } = await import('@/ai/flows/generate-title');
        const { title } = await generateTitle({ conversationHistory: history });

        if (title) {
          await convoRef.update({ title });
        }
      }
    }
    // END: Generate Title Logic

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