import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const conversationId = url.searchParams.get('conversationId');
    if (!conversationId) {
      return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 });
    }

    const messagesRef = db.collection('messages');
    const snap = await messagesRef.where('conversationId', '==', conversationId).orderBy('timestamp', 'asc').get();
    const msgs: any[] = [];
    snap.forEach((doc) => {
      msgs.push({ id: doc.id, ...doc.data() });
    });

    return NextResponse.json({ messages: msgs });
  } catch (err: any) {
    console.error('Error in /api/messages:', err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
