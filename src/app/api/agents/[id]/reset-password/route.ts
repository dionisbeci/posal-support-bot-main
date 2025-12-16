import { NextResponse } from 'next/server';
import { db, admin } from '@/lib/firebase-admin';

export async function POST(req: Request, { params }: { params: { id: string } }) {
    try {
        const agentId = params.id;
        if (!agentId) {
            return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 });
        }

        const authHeader = req.headers.get('authorization') || '';
        if (!authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const idToken = authHeader.split(' ')[1];

        // Verify caller
        const decoded = await admin.auth().verifyIdToken(idToken);
        const callerUid = decoded.uid;

        // Check caller is an admin
        const callerDoc = await db.collection('agents').doc(callerUid).get();
        if (!callerDoc.exists || (callerDoc.data() as any).role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Verify target agent exists in Firestore
        const agentDoc = await db.collection('agents').doc(agentId).get();
        if (!agentDoc.exists) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
        }

        // Generate random password
        const newPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-2);

        // Update Firebase Auth
        await admin.auth().updateUser(agentId, {
            password: newPassword,
        });

        return NextResponse.json({ success: true, password: newPassword });
    } catch (error: any) {
        console.error('Error resetting password:', error);
        return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
    }
}
