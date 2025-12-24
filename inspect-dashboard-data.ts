
import { db } from './src/lib/firebase-admin';

async function inspectConversations() {
    try {
        console.log("Fetching 5 latest conversations...");
        const snapshot = await db.collection('conversations')
            .orderBy('lastMessageAt', 'desc')
            .limit(5)
            .get();

        if (snapshot.empty) {
            console.log("No conversations found.");
            return;
        }

        const results = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                status: data.status,
                humanInvolved: data.humanInvolved,
                lastMessageAt: data.lastMessageAt?.toDate?.()?.toISOString() || data.lastMessageAt,
                title: data.title
            };
        });

        console.log(JSON.stringify(results, null, 2));
    } catch (error) {
        console.error("Error:", error);
    }
}

inspectConversations();
