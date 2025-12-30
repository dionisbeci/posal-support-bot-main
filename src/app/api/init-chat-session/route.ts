import { NextResponse } from 'next/server';
import { db, admin } from '@/lib/firebase-admin';
import { UAParser } from 'ua-parser-js';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { chatId, origin, params, clientHints, gpsLocation } = body;

    if (!chatId || !origin) {
      return NextResponse.json({ success: false, message: 'Missing chatId or origin' }, { status: 400 });
    }

    // Verify widget settings and allowed domains
    let allowedDomains: string[] = ['*'];
    let welcomeMessage: string = 'Hello! How can I help you today?';

    try {
      const settingsRef = db.doc('settings/widget');
      const settingsSnap = await settingsRef.get();
      if (settingsSnap.exists) {
        const settings = settingsSnap.data()!;
        allowedDomains = settings.allowedDomains || ['*'];
        welcomeMessage = settings.welcomeMessage || 'Hello! How can I help you today?';
      }
    } catch (settingsError: any) {
      console.warn('Error reading widget settings, using defaults');
    }

    const headerOrigin = req.headers.get('origin') || req.headers.get('referer');

    // Fallback to body origin for dev or if headers missing (though headers are more secure)
    // We strip the protocol (https://) for simpler comparison if needed, or just use hostname
    let requestOrigin = '';

    if (headerOrigin) {
      try {
        requestOrigin = new URL(headerOrigin).hostname;
      } catch (e) {
        requestOrigin = headerOrigin; // Fallback if not a valid URL
      }
    } else {
      try {
        requestOrigin = new URL(origin).hostname;
      } catch (e) {
        requestOrigin = origin;
      }
    }

    // Check domain if not allowing all domains
    if (!allowedDomains.includes('*')) {
      const isAllowed = allowedDomains.some(domain => {
        // Normalize domain checks
        const cleanDomain = domain.replace(/^https?:\/\//, '');
        // Allow localhost for development automatically if not strict
        if (requestOrigin === 'localhost' || requestOrigin === '127.0.0.1') return true;

        const pattern = new RegExp(`^${cleanDomain.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`);
        return pattern.test(requestOrigin);
      });

      if (!isAllowed) {
        return NextResponse.json({ success: false, message: `Domain ${requestOrigin} is not allowed.` }, { status: 403 });
      }
    }

    // Parse Device Info
    const uaString = req.headers.get('user-agent') || '';
    const parser = new UAParser(uaString);
    const result = parser.getResult();

    // OS Detection
    let osString = `${result.os.name || 'Unknown'} ${result.os.version || ''}`.trim();
    if (clientHints && clientHints.platform === 'Windows') {
      const majorVersion = parseInt(clientHints.platformVersion?.split('.')[0] || '0');
      if (majorVersion >= 13) osString = 'Windows 11';
    }
    if (result.os.name === 'iOS' && uaString) {
      const iosMatch = uaString.match(/OS (\d+)[_\d]*/i);
      if (iosMatch && iosMatch[1]) osString = `iOS ${iosMatch[1]}`;
    }

    // Parse IP and Location
    const forwardedFor = req.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'Unknown';
    let locationData = { country: 'Unknown', city: 'Unknown', ip };

    if (gpsLocation && gpsLocation.latitude && gpsLocation.longitude) {
      try {
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${gpsLocation.latitude}&lon=${gpsLocation.longitude}`,
          { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'PosalSupportBot/1.0' } }
        );
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (geoData.address) {
            locationData = {
              country: geoData.address.country || 'Unknown',
              city: geoData.address.city || geoData.address.town || 'Unknown',
              ip
            };
          }
        }
      } catch (e) {
        console.warn('GPS geocode failed');
      }
    }

    if (locationData.country === 'Unknown' && ip !== 'Unknown') {
      const isPrivateIp = (ip: string) => /^(::ffff:)?(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|127\.|::1)/.test(ip);
      if (!isPrivateIp(ip)) {
        try {
          const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,city,query`, { signal: AbortSignal.timeout(3000) });
          const geoData = await geoRes.json();
          if (geoData.status === 'success') {
            locationData = { country: geoData.country, city: geoData.city, ip: geoData.query };
          }
        } catch (e) {
          console.warn('IP-based geocode failed');
        }
      } else {
        locationData = { country: 'Local Network', city: 'Private IP', ip };
      }
    }

    // SESSION LOOKUP / CREATION
    const conversationsCollection = db.collection('conversations');

    let visitorId: string;
    let convoId: string;
    let isNewConvo = false;
    let existingConvoDoc = null;

    // 1. Try to find an existing active conversation by userId if provided
    if (params?.userId) {
      const userConvoQuery = await conversationsCollection
        .where('userId', '==', params.userId)
        .orderBy('lastMessageAt', 'desc')
        .limit(1)
        .get();

      if (!userConvoQuery.empty) {
        const doc = userConvoQuery.docs[0];
        // Only resume if not ended
        if (doc.data().status !== 'ended') {
          existingConvoDoc = doc;
        }
      }
    }
    // 2. Fallback: Lookup by externalId (chatId) ONLY if it is not 'default'
    // 'default' is a generic config ID, not a unique session ID.
    else if (chatId && chatId !== 'default') {
      const convoQuery = await conversationsCollection
        .where('externalId', '==', chatId)
        .limit(1)
        .get();

      if (!convoQuery.empty) {
        existingConvoDoc = convoQuery.docs[0];
      }
    }

    if (existingConvoDoc) {
      convoId = existingConvoDoc.id;
      visitorId = existingConvoDoc.data().visitorId;
    } else {
      isNewConvo = true;
      const auth = admin.auth();
      const userRecord = await auth.createUser({});
      visitorId = userRecord.uid;

      const conversationData: any = {
        externalId: chatId,
        visitorId: visitorId,
        lastMessage: '',
        status: 'ai',
        unreadCount: 0,
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        agent: null,
        device: {
          browser: `${result.browser.name || 'Unknown'} ${result.browser.major || ''}`.trim(),
          os: osString,
          type: result.device.type || 'Desktop'
        },
        location: locationData,
        userId: params?.userId || null,
        userName: params?.userName || null,
        shopId: params?.shopId || null,
      };

      const convoRef = await conversationsCollection.add(conversationData);
      convoId = convoRef.id;
    }

    const token = await admin.auth().createCustomToken(visitorId);

    return NextResponse.json({
      success: true,
      message: isNewConvo ? 'Session initialized.' : 'Session resumed.',
      conversationId: convoId,
      visitorId,
      token,
      welcomeMessage,
    });
  } catch (error: any) {
    console.error('Error in init-chat-session API:', error);
    return NextResponse.json({ success: false, message: error.message || 'Unknown error' }, { status: 500 });
  }
}
