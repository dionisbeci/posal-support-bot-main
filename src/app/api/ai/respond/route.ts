import { NextResponse } from 'next/server';
import { getContextAwareResponse } from '@/ai/flows/context-aware-responses';
import { classifyUserIntent } from '@/lib/classification';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, threadId, conversationId } = body;

    if (!message) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }

    // 1. Fetch Conversation Context (Single Read)
    let convoData: any = null;
    let convoRef = null;

    // Dynamic import to match functioning init-chat-session pattern
    const { db, admin } = await import('@/lib/firebase-admin');

    if (conversationId) {
      convoRef = db.collection('conversations').doc(conversationId);
      const convoSnap = await convoRef.get();
      if (convoSnap.exists) {
        convoData = convoSnap.data();
      }
    }

    // 2. Handle Handoff Confirmation State
    if (convoData?.handoffConfirmationPending && convoRef) {
      const intent = await classifyUserIntent(message);

      if (intent === 'POSITIVE') {
        await convoRef.update({
          status: 'pending',
          handoffConfirmationPending: admin.firestore.FieldValue.delete(),
          lastMessage: 'Po lidheni me një agjent...',
          lastMessageAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return NextResponse.json({
          response: "Në rregull, po ju lidh me një nga agjentët tanë. Ju lutem prisni pak.",
          threadId
        });
      } else {
        // NEGATIVE or OTHER -> Continue with AI
        await convoRef.update({
          handoffConfirmationPending: admin.firestore.FieldValue.delete()
        });
      }
    }

    // 3. Generate AI Response
    const result = await getContextAwareResponse({
      message,
      threadId,
      // Ensure route is string or undefined (null becomes undefined)
      route: convoData?.route || undefined
    });

    if (!result || typeof result.response !== 'string') {
      return NextResponse.json({ error: 'AI did not return a valid response' }, { status: 500 });
    }

    // 4. Update Conversation based on AI result
    if (convoRef && convoData) {
      const updates: any = {
        lastMessage: result.response,
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Handle Handoff Prompt
      const handoffPhrase = "Të them të drejtën, kërkova por nuk po gjej një përgjigje të saktë për këtë. Dëshiron të të lidh këtu në chat me një koleg tjetër që ka më shumë informacion për këtë?";
      if (result.response.includes(handoffPhrase)) {
        updates.handoffConfirmationPending = true;
      }

      // Save Confidence
      if (result.confidence !== undefined) {
        updates.confidenceScore = result.confidence;
      }

      // Update Conversation Page Title if missing
      if (!convoData.title) {
        try {
          const previousMessagesSnap = await db.collection('messages')
            .where('conversationId', '==', conversationId)
            .orderBy('timestamp', 'desc')
            .limit(5)
            .get();

          const previousMessages = previousMessagesSnap.docs
            .map((d: any) => ({ role: d.data().role, content: d.data().content }))
            .reverse();

          let history = previousMessages.map((m: any) => `${m.role}: ${m.content}`).join('\n');
          history += `\nai: ${result.response}`;

          const { generateTitle } = await import('@/ai/flows/generate-title');
          const { title } = await generateTitle({ conversationHistory: history });
          if (title) updates.title = title;
        } catch (titleError) {
          console.error('Failed to generate title:', titleError);
        }
      }

      await convoRef.update(updates);
    }

    return NextResponse.json({
      response: result.response,
      threadId: result.threadId,
      confidence: result.confidence
    });

  } catch (error: any) {
    console.error('Error in /api/ai/respond:', error);
    return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}