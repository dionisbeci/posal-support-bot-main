'use client';

import { useEffect } from 'react';
import {
    collection,
    query,
    where,
    getDocs,
    writeBatch,
    Timestamp,
    serverTimestamp,
    doc,
    addDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Conversation } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export function GlobalChatCleanup() {
    const { toast } = useToast();

    useEffect(() => {
        const runCleanup = async () => {
            try {
                console.log('Running global chat cleanup check...');
                const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);

                // This query requires a Composite Index: status ASC + lastMessageAt ASC/DESC
                // If index is missing, see console for link to create it.
                const q = query(
                    collection(db, 'conversations'),
                    where('status', 'in', ['active', 'ai']),
                    where('lastMessageAt', '<', threeMinutesAgo)
                );

                const snapshot = await getDocs(q);

                if (snapshot.empty) {
                    console.log('No stale chats found.');
                    return;
                }

                console.log(`Found ${snapshot.size} stale chats to close.`);

                // Process in batches (batches can hold up to 500 ops)
                // For each chat, we need 2 ops: update convo status + add system message
                // So we can process max 250 chats per batch.

                const chunks = [];
                const docs = snapshot.docs;
                for (let i = 0; i < docs.length; i += 100) {
                    chunks.push(docs.slice(i, i + 100));
                }

                for (const chunk of chunks) {
                    const batch = writeBatch(db);
                    const messagesRef = collection(db, 'messages');

                    chunk.forEach(docSnap => {
                        const convoRef = doc(db, 'conversations', docSnap.id);

                        // 1. Update Conversation
                        batch.update(convoRef, {
                            status: 'ended',
                            lastMessage: 'Biseda përfundoi.',
                            lastMessageAt: serverTimestamp()
                        });

                        // 2. Add System Message
                        // Note: batch.set is used for new docs with auto-id if we use doc(collection(...))
                        const newMessageRef = doc(messagesRef);
                        batch.set(newMessageRef, {
                            role: 'system',
                            content: 'Biseda përfundoi.',
                            conversationId: docSnap.id,
                            timestamp: serverTimestamp()
                        });
                    });

                    await batch.commit();
                }

                if (snapshot.size > 0) {
                    toast({
                        title: "Cleanup Complete",
                        description: `Closed ${snapshot.size} inactive chats.`,
                    });
                }

            } catch (error) {
                console.error("Global chat cleanup failed:", error);
                // Only show toast if it looks like an index error to help developer
                if (error instanceof Error && error.message.includes('index')) {
                    toast({
                        title: "Cleanup Index Missing",
                        description: "Check console to create Firestore Index for cleanup.",
                        variant: "destructive"
                    });
                }
            }
        };

        // Run immediately on mount, then every 60 seconds
        runCleanup();
        const intervalId = setInterval(runCleanup, 60 * 1000);

        return () => clearInterval(intervalId);
    }, [toast]);

    return null; // Headless component
}
