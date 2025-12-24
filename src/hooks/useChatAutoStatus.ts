import { useEffect } from 'react';
import { Conversation } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, updateDoc, addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';

/**
 * Custom hook to handle automatic chat status updates.
 * - 5 minutes inactivity -> 'inactive'
 * - 3 hours inactivity -> 'ended'
 * 
 * Optimized for Firebase quota: verified locally, minimal writes.
 */
export function useChatAutoStatus(conversation: Conversation | null | undefined, conversationId: string | null | undefined) {
    useEffect(() => {
        if (!conversation || !conversationId) return;
        if (conversation.status === 'ended' || conversation.status === 'archived') return;

        const checkStatus = async () => {
            // 1. Robust Date Parsing (Read-only from passed object)
            let lastActivityTime = 0;
            const lma = conversation.lastMessageAt;

            if (lma instanceof Date) {
                lastActivityTime = lma.getTime();
            } else if (lma instanceof Timestamp) {
                lastActivityTime = lma.toDate().getTime();
            } else if (lma && (lma as any).seconds) {
                lastActivityTime = (lma as any).seconds * 1000;
            } else if (typeof lma === 'string' || typeof lma === 'number') {
                lastActivityTime = new Date(lma).getTime();
            }

            // If we can't determine time, assume it's fresh to avoid accidental close
            if (!lastActivityTime || isNaN(lastActivityTime)) {
                return;
            }

            const now = Date.now();
            const diff = now - lastActivityTime;
            const fiveMinutes = 5 * 60 * 1000;
            const threeHours = 3 * 60 * 60 * 1000;

            // DEBUG: Log calculation
            console.log(`[AutoStatus] ID: ${conversationId}, Status: ${conversation.status}, Diff: ${diff}, LastAct: ${lastActivityTime}`);

            // 2. Logic Implementation

            // Case A: Mark as 'inactive' (Active -> Inactive)
            // Only triggered if currently 'active' or 'ai'
            if (['active', 'ai'].includes(conversation.status) && diff > fiveMinutes) {
                console.log(`[AutoStatus] Marking inactive: ${conversationId} (Diff: ${diff}ms)`);
                try {
                    await updateDoc(doc(db, 'conversations', conversationId), {
                        status: 'inactive'
                    });
                } catch (e) {
                    console.error("[AutoStatus] Error marking inactive:", e);
                }
                return; // Exit to avoid double-write
            }

            // Case B: Auto-end (Any -> Ended)
            // Triggered if > 3 hours
            if (diff > threeHours) {
                // Double check we haven't already ended it (though status check above covers most)
                if (conversation.lastMessage === 'Biseda përfundoi.') return;

                console.log(`[AutoStatus] Auto-ending: ${conversationId} (Diff: ${diff}ms)`);
                try {
                    await updateDoc(doc(db, 'conversations', conversationId), {
                        status: 'ended',
                        lastMessage: 'Biseda përfundoi.',
                        lastMessageAt: serverTimestamp(),
                        endedBy: 'v2-client-hook'
                    });

                    await addDoc(collection(db, 'messages'), {
                        role: 'system',
                        content: 'Biseda përfundoi.',
                        conversationId: conversationId,
                        timestamp: serverTimestamp()
                    });
                } catch (e) {
                    console.error("[AutoStatus] Error auto-ending:", e);
                }
            }
        };

        // Run check every 30 seconds
        const interval = setInterval(checkStatus, 30 * 1000);
        // Initial check
        checkStatus();

        return () => clearInterval(interval);
    }, [conversation, conversationId]);
}
