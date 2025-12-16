import { NextResponse } from 'next/server';
import { db, admin } from '@/lib/firebase-admin';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
    try {
        const { id } = params;
        const body = await req.json();
        const { name, email, role, avatar } = body;

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

        // Update Firestore
        await db.collection('agents').doc(id).update({
            name,
            email,
            role,
            avatar,
        });

        // Update Firebase Auth
        await admin.auth().updateUser(id, {
            email,
            displayName: name,
        });

        // Update custom claims
        await admin.auth().setCustomUserClaims(id, { role });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error updating agent:', error);
        return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
    try {
        const { id } = params;

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

        // Delete from Firestore
        await db.collection('agents').doc(id).delete();

        // Delete from Firebase Auth
        await admin.auth().deleteUser(id);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting agent:', error);
        return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
    }
}
