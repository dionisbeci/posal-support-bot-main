'use client';

import { ChatKit, useChatKit } from '@openai/chatkit-react';
import { useEffect } from 'react';

export default function ChatKitTestPage() {
  const { control } = useChatKit({
    api: {
      async getClientSecret(existing) {
        if (existing) {
          // Refresh existing session
          const res = await fetch('/api/chatkit/session', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              currentClientSecret: existing,
            }),
          });
          
          if (!res.ok) {
            throw new Error('Failed to refresh session');
          }
          
          const { client_secret } = await res.json();
          return client_secret;
        }

        // Create new session
        const res = await fetch('/api/chatkit/session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            deviceId: `device_${Date.now()}`,
          }),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Failed to create session');
        }

        const { client_secret } = await res.json();
        return client_secret;
      },
    },
  });

  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50">
      <div className="h-[600px] w-[400px] rounded-lg shadow-lg">
        <ChatKit control={control} />
      </div>
    </div>
  );
}

