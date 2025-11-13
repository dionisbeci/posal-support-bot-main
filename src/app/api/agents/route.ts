import { NextResponse } from 'next/server';
import { db, admin } from '@/lib/firebase-admin';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, role, avatar, password } = body;

    if (!name || !email || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const idToken = authHeader.split(' ')[1];

    // Verify caller
    const decoded = await admin.auth().verifyIdToken(idToken);
    const callerUid = decoded.uid;

    // Check caller is an admin by looking up agents/{callerUid}
    const callerDoc = await db.collection('agents').doc(callerUid).get();
    console.log('Caller doc data:', callerDoc.data());
    if (!callerDoc.exists || (callerDoc.data() as any).role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Create user in Firebase Auth
    const generatedPassword = password || Math.random().toString(36).slice(-10);
    const userRecord = await admin.auth().createUser({
      email,
      password: generatedPassword,
      displayName: name,
    });

    const uid = userRecord.uid;

    // Create agent document with uid as doc id
    await db.collection('agents').doc(uid).set({
      name,
      email,
      role,
      avatar: avatar || '',
    });

    // Set custom claim for role
    await admin.auth().setCustomUserClaims(uid, { role });

    return NextResponse.json({ success: true, uid, password: generatedPassword });
  } catch (error: any) {
    console.error('Error creating agent:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
