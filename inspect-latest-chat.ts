
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';

// Try to use existing lib if possible, or fallback
// Assuming environment is set for tsx
import { db } from './src/lib/firebase-admin';

async function checkLatestChat() {
    try {
        console.log("Fetching latest conversation...");
        const snapshot = await db.collection('conversations')
            .orderBy('lastMessageAt', 'desc')
            .limit(1)
            .get();

        if (snapshot.empty) {
            console.log("No conversations found.");
            return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();

        const result = {
            id: doc.id,
            status: data.status,
            endedBy: data.endedBy || "UNKNOWN (Zombie?)",
            lastMessageAt: data.lastMessageAt?.toDate?.()?.toISOString() || data.lastMessageAt,
            timestamp: new Date().toISOString()
        };

        console.log(JSON.stringify(result, null, 2));
        require('fs').writeFileSync('results.json', JSON.stringify(result, null, 2));

    } catch (error) {
        console.error("Error:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        require('fs').writeFileSync('results.json', JSON.stringify({ error: errorMessage }));
    }
}

checkLatestChat();
