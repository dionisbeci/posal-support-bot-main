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
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { app, db } from '@/lib/firebase';
import type { Message } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Bot, Send, User, Loader2 } from 'lucide-react';
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
        const res = await fetch('/api/init-chat-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, origin, params }),
        });
        const response = await res.json();
        if (response.success && response.token && response.conversationId) {
          const auth = getAuth(app);
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
      if (docSnap.exists()) {
        const data = docSnap.data();
        setConversationStatus(data.status);
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
    if (!input.trim() || !conversationId || isSending) return;

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

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (error) return <div className="flex h-full items-center justify-center p-4 text-center text-red-700">{error}</div>;

  return (
    <div className="flex h-screen flex-col bg-background font-body">
      <header className="flex items-center gap-4 border-b p-4 shadow-sm">
        <Avatar><AvatarFallback className="bg-primary text-primary-foreground"><Bot className="h-6 w-6" /></AvatarFallback></Avatar>
        <div>
          <p className="font-semibold">Posal Chat</p>
          <p className="text-sm text-muted-foreground">Jemi këtu për t'ju ndihmuar</p>
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
                <ReactMarkdown>
                  {message.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}

          {/* Typing Indicator */}
          {(isSending || agentTyping) && (
            <div className="flex items-end gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className='bg-primary/20 text-primary'>
                  <Bot className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <div className="max-w-[75%] rounded-lg p-3 text-sm bg-card text-card-foreground border rounded-bl-none">
                {agentTyping ? (
                  <span className="text-xs text-muted-foreground animate-pulse">Agjenti po shkruan...</span>
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="border-t bg-background p-4">
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
      </div>
    </div>
  );
});

export default function ChatWidgetPage() {
  return (<Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}><ChatWidget /></Suspense>);
}