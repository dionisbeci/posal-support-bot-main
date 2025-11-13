import { NextResponse } from 'next/server';
import { db, admin } from '@/lib/firebase-admin';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { chatId, origin, params } = body;

    if (!chatId || !origin) {
      return NextResponse.json({ success: false, message: 'Missing chatId or origin' }, { status: 400 });
    }

    // Verify widget settings and allowed domains
    // Use fallback defaults if Firestore quota is exceeded or settings don't exist
    let allowedDomains: string[] = ['*']; // Default: allow all domains
    let welcomeMessage: string = 'Hello! How can I help you today?';
    
    try {
      const settingsRef = db.doc('settings/widget');
      const settingsSnap = await settingsRef.get();
      
      if (settingsSnap.exists) {
        const settings = settingsSnap.data()!;
        allowedDomains = settings.allowedDomains || ['*'];
        welcomeMessage = settings.welcomeMessage || 'Hello! How can I help you today?';
      } else {
        console.warn('Widget settings not found, using default values');
      }
    } catch (settingsError: any) {
      // Handle Firestore quota errors or other read errors
      if (settingsError.code === 8 || settingsError.message?.includes('Quota exceeded')) {
        console.warn('Firestore quota exceeded, using default widget settings');
        // Continue with default settings
      } else {
        console.error('Error reading widget settings:', settingsError);
        // Still continue with defaults rather than failing
      }
    }

    const requestOrigin = new URL(origin).hostname;

    // Check domain if not allowing all domains
    if (!allowedDomains.includes('*')) {
      const isAllowed = allowedDomains.some(domain => {
        const pattern = new RegExp(`^${domain.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`);
        return pattern.test(requestOrigin);
      });

      if (!isAllowed) {
        return NextResponse.json({ success: false, message: `Domain ${requestOrigin} is not allowed.` }, { status: 403 });
      }
    }

    // Create anonymous user
    const auth = admin.auth();
    const userRecord = await auth.createUser({});
    const visitorId = userRecord.uid;
    const token = await auth.createCustomToken(visitorId);

    // Note: Workflows don't use threads, but we keep threadId field for compatibility
    // No need to create a thread for workflows

    // Create conversation
    const conversationData: any = {
      visitorId: visitorId,
      lastMessage: '',
      status: 'ai',
      unreadCount: 0,
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      agent: null,
    };

    const conversationsCollection = db.collection('conversations');
    const convoRef = await conversationsCollection.add(conversationData);

    // Do not add a welcome AI message automatically. The widget will call the AI when the user sends the first message.

    return NextResponse.json({
      success: true,
      message: 'Session initialized.',
      conversationId: convoRef.id,
      visitorId,
      token,
      welcomeMessage,
    });
  } catch (error: any) {
    console.error('Error in init-chat-session API:', error);
    return NextResponse.json({ success: false, message: error.message || 'Unknown error' }, { status: 500 });
  }
}
