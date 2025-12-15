import { NextResponse } from 'next/server';
import {
    collection,
    query,
    where,
    getDocs,
    writeBatch,
    Timestamp,
    serverTimestamp,
    doc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        }

        const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);

        const q = query(
            collection(db, 'conversations'),
            where('status', 'in', ['active', 'ai']),
            where('lastMessageAt', '<', threeMinutesAgo)
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            return NextResponse.json({ success: true, message: 'No stale chats found.', closed: 0 });
        }

        const chunks = [];
        const docs = snapshot.docs;
        for (let i = 0; i < docs.length; i += 100) {
            chunks.push(docs.slice(i, i + 100));
        }

        let closedCount = 0;

        for (const chunk of chunks) {
            const batch = writeBatch(db);
            const messagesRef = collection(db, 'messages');

            chunk.forEach(docSnap => {
                const convoRef = doc(db, 'conversations', docSnap.id);

                batch.update(convoRef, {
                    status: 'ended',
                    lastMessage: 'Biseda përfundoi.',
                    lastMessageAt: serverTimestamp()
                });

                const newMessageRef = doc(messagesRef);
                batch.set(newMessageRef, {
                    role: 'system',
                    content: 'Biseda përfundoi.',
                    conversationId: docSnap.id,
                    timestamp: serverTimestamp()
                });
                closedCount++;
            });

            await batch.commit();
        }

        return NextResponse.json({ success: true, message: `Closed ${closedCount} stale chats.`, closed: closedCount });

    } catch (error) {
        console.error('Cron cleanup error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
