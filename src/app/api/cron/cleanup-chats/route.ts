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

        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

        // 1. Mark 'active' or 'ai' chats as 'inactive' after 5 minutes
        const activeToInactiveQuery = query(
            collection(db, 'conversations'),
            where('status', 'in', ['active', 'ai']),
            where('lastMessageAt', '<', fiveMinutesAgo)
        );

        const inactiveSnapshot = await getDocs(activeToInactiveQuery);
        let inactiveCount = 0;

        const inactiveBatch = writeBatch(db);
        inactiveSnapshot.docs.forEach(docSnap => {
            const convoRef = doc(db, 'conversations', docSnap.id);
            inactiveBatch.update(convoRef, {
                status: 'inactive'
            });
            inactiveCount++;
        });
        if (inactiveCount > 0) {
            await inactiveBatch.commit();
        }

        // 2. Mark ANY non-ended chats as 'ended' after 3 hours
        // We can't use '!=' in Firestore queries efficiently with date range, so we query active/ai/inactive
        const toEndQuery = query(
            collection(db, 'conversations'),
            where('status', 'in', ['active', 'ai', 'inactive']),
            where('lastMessageAt', '<', threeHoursAgo)
        );

        const endSnapshot = await getDocs(toEndQuery);
        let endedCount = 0;

        if (!endSnapshot.empty) {
            const endBatch = writeBatch(db);
            const messagesRef = collection(db, 'messages');

            endSnapshot.docs.forEach(docSnap => {
                const convoRef = doc(db, 'conversations', docSnap.id);
                // Check if already ended to be safe (though query handles it)
                if (docSnap.data().status === 'ended') return;

                endBatch.update(convoRef, {
                    status: 'ended',
                    lastMessage: 'Biseda përfundoi.',
                    lastMessageAt: serverTimestamp(),
                    endedBy: 'v2-cron-job'
                });

                const newMessageRef = doc(messagesRef);
                endBatch.set(newMessageRef, {
                    role: 'system',
                    content: 'Biseda përfundoi.',
                    conversationId: docSnap.id,
                    timestamp: serverTimestamp()
                });
                endedCount++;
            });
            await endBatch.commit();
        }

        return NextResponse.json({
            success: true,
            message: `Processed chats. Inactive: ${inactiveCount}, Ended: ${endedCount}`,
            inactive: inactiveCount,
            ended: endedCount
        });

    } catch (error) {
        console.error('Cron cleanup error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
