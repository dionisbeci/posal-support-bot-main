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
    // Use fallback defaults if Firestore quota is exceeded or settings don't exist
    let allowedDomains: string[] = ['*']; // Default: allow all domains
    let welcomeMessage: string = 'Hello! How can I help you today?';

    // Start fetching settings immediately
    const settingsPromise = (async () => {
      try {
        const settingsRef = db.doc('settings/widget');
        const settingsSnap = await settingsRef.get();

        if (settingsSnap.exists) {
          const settings = settingsSnap.data()!;
          return {
            allowedDomains: settings.allowedDomains || ['*'],
            welcomeMessage: settings.welcomeMessage || 'Hello! How can I help you today?'
          };
        } else {
          console.warn('Widget settings not found, using default values');
          return { allowedDomains: ['*'], welcomeMessage: 'Hello! How can I help you today?' };
        }
      } catch (settingsError: any) {
        // Handle Firestore quota errors or other read errors
        if (settingsError.code === 8 || settingsError.message?.includes('Quota exceeded')) {
          console.warn('Firestore quota exceeded, using default widget settings');
        } else {
          console.error('Error reading widget settings:', settingsError);
        }
        return { allowedDomains: ['*'], welcomeMessage: 'Hello! How can I help you today?' };
      }
    })();

    // Create anonymous user
    const auth = admin.auth();
    const userRecord = await auth.createUser({});
    const visitorId = userRecord.uid;

    // Wait for settings to verify domain before proceeding with expensive operations if possible,
    // but to optimize speed we can proceed with token creation in parallel with settings fetch if we assume success.
    // However, strictly we should check domain first. 
    // Let's await settings first to be safe about security, but run user creation in parallel with it.

    const settingsResult = await settingsPromise;
    allowedDomains = settingsResult.allowedDomains;
    welcomeMessage = settingsResult.welcomeMessage;

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

    // Check domain if not allowed (existing logic...)

    // Parse Device Info
    const uaString = req.headers.get('user-agent') || '';
    const parser = new UAParser(uaString);
    const result = parser.getResult();

    // Parse IP and Location
    const forwardedFor = req.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'Unknown';

    let locationData = { country: 'Unknown', city: 'Unknown', ip };

    // Use GPS location if provided (more accurate)
    if (gpsLocation && gpsLocation.latitude && gpsLocation.longitude) {
      try {
        const { latitude, longitude } = gpsLocation;
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
          {
            signal: AbortSignal.timeout(5000),
            headers: { 'User-Agent': 'PosalSupportBot/1.0' }
          }
        );
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (geoData.address) {
            locationData = {
              country: geoData.address.country || 'Unknown',
              city: geoData.address.city || geoData.address.town || geoData.address.village || 'Unknown',
              ip: ip
            };
          }
        }
      } catch (e) {
        console.warn('Failed to reverse geocode GPS location:', e);
      }
    }

    // Fallback to IP-based geolocation if GPS not available
    if (locationData.country === 'Unknown') {
      const isPrivateIp = (ip: string) => {
        return /^(::ffff:)?(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|127\.|::1)/.test(ip);
      };

      if (ip !== 'Unknown') {
        if (isPrivateIp(ip)) {
          locationData = { country: 'Local Network', city: 'Private IP', ip };
        } else {
          try {
            const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,city,query`, { signal: AbortSignal.timeout(3000) });
            if (geoRes.ok) {
              const geoData = await geoRes.json();
              if (geoData.status === 'success') {
                locationData = {
                  country: geoData.country,
                  city: geoData.city,
                  ip: geoData.query
                };
              }
            }
          } catch (e) {
            console.warn('Failed to fetch location data:', e);
          }
        }
      }
    }

    // Now run the rest in parallel
    const tokenPromise = auth.createCustomToken(visitorId);

    // Refine OS with Client Hints for Windows 11
    let osString = `${result.os.name || 'Unknown'} ${result.os.version || ''}`.trim();

    if (clientHints && clientHints.platform === 'Windows') {
      const majorVersion = parseInt(clientHints.platformVersion?.split('.')[0] || '0');
      // Windows 11 is version 13.0.0+ in Client Hints
      if (majorVersion >= 13) {
        osString = 'Windows 11';
      }
    }

    // Improve iOS version detection from raw UA string
    if (result.os.name === 'iOS' && uaString) {
      const iosMatch = uaString.match(/OS (\d+)[_\d]*/i);
      if (iosMatch && iosMatch[1]) {
        osString = `iOS ${iosMatch[1]}`;
      }
    }

    // Create conversation
    const conversationData: any = {
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
      location: locationData
    };

    const conversationsCollection = db.collection('conversations');
    const convoPromise = conversationsCollection.add(conversationData);

    const [token, convoRef] = await Promise.all([tokenPromise, convoPromise]);

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
