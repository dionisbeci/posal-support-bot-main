'use client';
import { useState, useEffect, FormEvent, useRef, Suspense, useMemo, memo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  Timestamp,
  limit,
} from 'firebase/firestore';
import {
  getAuth,
  signInWithCustomToken,
  setPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { app, db } from '@/lib/firebase';
import type { Message } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Bot, Send, User, Loader2, XCircle, ChevronDown } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { OpenAI } from 'openai';
import ReactMarkdown from 'react-markdown';

const ChatWidget = memo(function ChatWidget() {
  const searchParams = useSearchParams();
  const chatId = searchParams.get('chatId');
  const origin = searchParams.get('origin');
  const paramsString = searchParams.get('params') || '{}';
  const params = useMemo(() => JSON.parse(paramsString), [paramsString]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const [isSending, setIsSending] = useState(false);
  const [input, setInput] = useState('');
  const [conversationStatus, setConversationStatus] = useState<string>('ai');
  const [agentTyping, setAgentTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const initialize = async () => {
      if (!chatId || !origin) return;
      try {
        let clientHints = {};
        // @ts-ignore
        if (navigator.userAgentData) {
          try {
            // @ts-ignore
            const uaData = await navigator.userAgentData.getHighEntropyValues(['platform', 'platformVersion']);
            clientHints = {
              platform: uaData.platform,
              platformVersion: uaData.platformVersion
            };
          } catch (e) {
            console.warn('Failed to get UA data', e);
          }
        }

        // Get GPS location for accurate geolocation
        let gpsLocation = null;
        if (navigator.geolocation) {
          try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                timeout: 5000,
                enableHighAccuracy: true,
                maximumAge: 0
              });
            });
            gpsLocation = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            };
          } catch (e) {
            console.warn('Failed to get GPS location, will use IP fallback', e);
          }
        }

        const res = await fetch('/api/init-chat-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, origin, params, clientHints, gpsLocation }),
        });
        const response = await res.json();
        if (response.success && response.token && response.conversationId) {
          const auth = getAuth(app);
          // Use session persistence to avoid conflicting with the Desk (Admin) session in the same browser
          await setPersistence(auth, browserSessionPersistence);
          await signInWithCustomToken(auth, response.token);
          setConversationId(response.conversationId);
        } else {
          setError(response.message || 'Failed to initialize session');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to initialize session.');
      } finally {
        setLoading(false);
      }
    };
    initialize();
  }, [chatId, origin, params]);

  useEffect(() => {
    if (!conversationId) return;

    // Listen to conversation status and typing
    const convoRef = doc(db, 'conversations', conversationId);
    const unsubscribeConvo = onSnapshot(convoRef, (docSnap) => {
      // ... existing snapshot logic ...
      if (docSnap.exists()) {
        const data = docSnap.data();
        setConversationStatus(data.status);
        // Update ref for timeout logic
        conversationDataRef.current = { ...data, id: conversationId };

        // Check if agent is typing
        if (data.typing && data.typing.agent) {
          // Check if the update is recent (e.g. within last 5 seconds)
          const lastUpdate = data.typing.lastUpdate instanceof Timestamp ? data.typing.lastUpdate.toDate() : new Date();
          const now = new Date();
          if (now.getTime() - lastUpdate.getTime() < 5000) {
            setAgentTyping(true);
          } else {
            setAgentTyping(false);
          }
        } else {
          setAgentTyping(false);
        }
      }
    });
    // ... existing message listener ...
    // ...
    const q = query(
      collection(db, 'messages'),
      where('conversationId', '==', conversationId),
      orderBy('timestamp', 'desc'),
      limit(30)
    );

    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => {
        const data = doc.data() as Message;
        if (data.timestamp instanceof Timestamp) data.timestamp = data.timestamp.toDate();
        return { ...data, id: doc.id };
      });
      setMessages(msgs.reverse());
    });
    return () => {
      unsubscribeConvo();
      unsubscribeMessages();
    };
  }, [conversationId]);

  // Refs for timeout logic
  const conversationDataRef = useRef<any>(null);
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Auto-end check on widget side (Backup if agent is offline)
  useEffect(() => {
    if (!conversationId || conversationStatus === 'ended') return;

    const checkInactivity = async () => {
      const convo = conversationDataRef.current;
      if (!convo || !['active', 'ai'].includes(convo.status)) return; // Check active and ai chats

      const now = new Date();
      let lastMessageTime: Date;

      // Robust Date Parsing logic (Shared with Desk)
      if (convo.lastMessageAt && typeof convo.lastMessageAt.toDate === 'function') {
        lastMessageTime = convo.lastMessageAt.toDate();
      } else if (convo.lastMessageAt instanceof Date) {
        lastMessageTime = convo.lastMessageAt;
      } else if (typeof convo.lastMessageAt === 'string' || typeof convo.lastMessageAt === 'number') {
        lastMessageTime = new Date(convo.lastMessageAt);
      } else {
        // Fallback to messages
        const msgs = messagesRef.current;
        // Messages are in reverse order in state (oldest first)? No, layout says `setMessages(msgs.reverse())` 
        // Wait, layout says `setMessages(msgs.reverse())` in `onSnapshot`?
        // In `page.tsx` (widget), `orderBy('timestamp', 'desc')`. `msgs` is High->Low.
        // `setMessages(msgs.reverse())` makes it Low->High (Old->New) for rendering.
        // So `messages[messages.length - 1]` is the LATEST message.

        const latestMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;

        if (latestMsg && latestMsg.timestamp) {
          lastMessageTime = latestMsg.timestamp instanceof Timestamp
            ? latestMsg.timestamp.toDate()
            : (latestMsg.timestamp instanceof Date ? latestMsg.timestamp : new Date(latestMsg.timestamp));
        } else {
          lastMessageTime = new Date(); // Fallback if absolutely no info
        }
      }

      if (isNaN(lastMessageTime.getTime())) lastMessageTime = new Date();

      const lastTypingTime = convo.typing?.lastUpdate instanceof Timestamp
        ? convo.typing.lastUpdate.toDate()
        : convo.typing?.lastUpdate && convo.typing.lastUpdate.toDate ? convo.typing.lastUpdate.toDate() : new Date(0);

      const lastActivity = Math.max(lastMessageTime.getTime(), lastTypingTime.getTime());

      if (now.getTime() - lastActivity > 3 * 60 * 1000) { // 3 minutes
        try {

          // Check if last message is already "Biseda përfundoi." in the messages list
          // This prevents infinite loops if conversation status update fails or is delayed
          const currentMsgs = messagesRef.current;
          const lastMsg = currentMsgs.length > 0 ? currentMsgs[currentMsgs.length - 1] : null;
          if (lastMsg && lastMsg.content === 'Biseda përfundoi.') return;

          if (convo.lastMessage === 'Biseda përfundoi.') return;

          await addDoc(collection(db, 'messages'), {
            role: 'system',
            content: 'Biseda përfundoi.',
            conversationId,
            timestamp: serverTimestamp()
          });

          await updateDoc(doc(db, 'conversations', conversationId), {
            status: 'ended',
            lastMessage: 'Biseda përfundoi.',
            lastMessageAt: serverTimestamp()
          });
        } catch (error) {
          console.error("Widget auto-end error:", error);
        }
      }
    };

    const intervalId = setInterval(checkInactivity, 10000); // Check every 10s
    return () => clearInterval(intervalId);
  }, [conversationId, conversationStatus]);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [messages, isSending, agentTyping]);

  const handleTyping = async () => {
    if (!conversationId) return;

    // Clear existing timeout to debounce
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Update typing status to true
    await updateDoc(doc(db, 'conversations', conversationId), {
      'typing.visitor': true,
      'typing.lastUpdate': serverTimestamp()
    });

    // Set timeout to reset typing status
    typingTimeoutRef.current = setTimeout(async () => {
      await updateDoc(doc(db, 'conversations', conversationId), {
        'typing.visitor': false,
        'typing.lastUpdate': serverTimestamp()
      });
    }, 2000);
  };

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !conversationId || isSending || conversationStatus === 'ended') return;

    const userInput = input;
    setInput('');
    setIsSending(true);

    // Reset typing status immediately
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    await updateDoc(doc(db, 'conversations', conversationId), {
      'typing.visitor': false,
      'typing.lastUpdate': serverTimestamp()
    });

    await addDoc(collection(db, 'messages'), {
      role: 'user',
      content: userInput,
      conversationId,
      timestamp: serverTimestamp()
    });

    // If status is active (human agent joined), DO NOT call AI
    if (conversationStatus === 'active') {
      setIsSending(false);
      return;
    }

    try {
      const res = await fetch('/api/ai/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userInput,
          threadId: threadId,
          conversationId // Pass conversationId for handoff logic
        }),
      });

      if (!res.ok) throw new Error('Failed to get AI response');

      const data = await res.json();

      if (data.threadId) {
        setThreadId(data.threadId);
      }

      await addDoc(collection(db, 'messages'), {
        role: 'ai',
        content: data.response,
        conversationId,
        timestamp: serverTimestamp()
      });

      await updateDoc(doc(db, 'conversations', conversationId), {
        lastMessage: data.response,
        lastMessageAt: serverTimestamp()
      });

    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleEndChat = async () => {
    if (!conversationId || conversationStatus === 'ended') return;

    try {
      await addDoc(collection(db, 'messages'), {
        role: 'system',
        content: 'Biseda përfundoi.',
        conversationId,
        timestamp: serverTimestamp()
      });

      await updateDoc(doc(db, 'conversations', conversationId), {
        status: 'ended',
        lastMessage: 'Biseda përfundoi.',
        lastMessageAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error ending chat:", error);
    }
  };

  const handleStartNewChat = () => {
    // Tell the parent window (embed.js) to clear the session and reload
    window.parent.postMessage('reset-chat-session', '*');
  };

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (error) return <div className="flex h-full items-center justify-center p-4 text-center text-red-700">{error}</div>;

  return (
    <div className="flex h-screen flex-col bg-background font-body overflow-hidden">
      <header className="flex items-center justify-between border-b p-4 shadow-sm bg-white z-10">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 ring-2 ring-primary/10">
            <AvatarFallback className="bg-primary text-primary-foreground">
              <Bot className="h-6 w-6" />
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-bold text-slate-900 leading-tight">Posal Chat</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
              Jemi këtu për t'ju ndihmuar
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {conversationStatus !== 'ended' && (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 px-2 text-xs font-semibold"
              onClick={handleEndChat}
              title="End Conversation"
            >
              <XCircle className="h-4 w-4 mr-1" />
              Mbyll chat
            </Button>
          )}
        </div>
      </header>
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-6">
          {messages.map((message) => (
            <div key={message.id} className={cn('flex items-end gap-3', message.role === 'user' && 'flex-row-reverse')}>
              <Avatar className="h-8 w-8">
                <AvatarFallback className={cn(message.role === 'user' ? 'bg-accent text-accent-foreground' : 'bg-primary/20 text-primary')}>
                  {message.role === 'user' ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
                </AvatarFallback>
              </Avatar>
              <div className={cn('max-w-[75%] rounded-lg p-3 text-sm', message.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-none' : 'bg-card text-card-foreground border rounded-bl-none', 'prose prose-sm max-w-none')}>
                <ReactMarkdown
                  components={{
                    a: ({ node, ...props }) => (
                      <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" />
                    ),
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}

          {/* AI Loading State only */}
          {isSending && !agentTyping && (
            <div className="flex items-end gap-3 pb-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className='bg-primary/20 text-primary'>
                  <Bot className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <div className="max-w-[75%] rounded-lg p-3 text-sm bg-card text-card-foreground border rounded-bl-none">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="border-t bg-background px-4 py-3 relative">
        {/* Subtle Typing Indicator Overlay */}
        {agentTyping && (
          <div className="absolute -top-6 left-4 flex items-center gap-2 text-xs text-muted-foreground bg-background/80 backdrop-blur-sm pr-2 rounded-t-md animate-in fade-in slide-in-from-bottom-1">
            <div className="flex gap-1">
              <span className="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></span>
              <span className="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-1 h-1 bg-primary rounded-full animate-bounce"></span>
            </div>
            <span>Agjenti po shkruan...</span>
          </div>
        )}
        <div className="flex flex-col">
          {conversationStatus === 'ended' ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-center p-3 bg-slate-50 text-slate-500 rounded-md text-sm font-medium border border-slate-100 italic">
                Biseda përfundoi
              </div>
              <Button
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold"
                onClick={handleStartNewChat}
              >
                Filloni një bisedë të re
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSendMessage} className="relative">
              <Textarea
                placeholder="Shkruani mesazhin tuaj..."
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  handleTyping();
                }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); } }}
                className="pr-12"
                disabled={isSending}
              />
              <Button type="submit" variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2" disabled={isSending || !input.trim()}>
                <Send className="h-5 w-5 text-primary" />
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
});

export default function ChatWidgetPage() {
  return (<Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}><ChatWidget /></Suspense>);
}