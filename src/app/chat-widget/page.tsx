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

interface MessageInputFormProps {
  conversationId: string | null;
  currentThreadId: string | null;
  onNewThreadId: (newId: string) => void;

  isSending: boolean;
  setIsSending: (isSending: boolean) => void;
}


function MessageInputForm({ conversationId, currentThreadId, onNewThreadId, isSending, setIsSending }: MessageInputFormProps) {
  const [input, setInput] = useState('');
 

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !conversationId || isSending) return;

    const userInput = input;
    setInput('');
    setIsSending(true);

    await addDoc(collection(db, 'messages'), {
      role: 'user',
      content: userInput,
      conversationId,
      timestamp: serverTimestamp()
    });

    try {
      const res = await fetch('/api/ai/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userInput,
          threadId: currentThreadId
        }),
      });

      if (!res.ok) throw new Error('Failed to get AI response');

      const data = await res.json();

      if (data.threadId) {
        onNewThreadId(data.threadId);
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

  return (
    <div className="border-t bg-background p-4">
      <form onSubmit={handleSendMessage} className="relative">
        <Textarea
          placeholder="Type your message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); } }}
          className="pr-12"
          disabled={isSending}
        />
        <Button type="submit" variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2" disabled={isSending || !input.trim()}>
          <Send className="h-5 w-5 text-primary" />
        </Button>
      </form>
    </div>
  );
}


const ChatWidget = memo(function ChatWidget() {
  console.log("ChatWidget component is rendering/mounting");

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

    const q = query(
      collection(db, 'messages'),
      where('conversationId', '==', conversationId),
      orderBy('timestamp', 'desc'),
      limit(30)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log(`onSnapshot callback fired. Documents received: ${snapshot.size}`);
      const msgs = snapshot.docs.map((doc) => {
        const data = doc.data() as Message;
        if (data.timestamp instanceof Timestamp) data.timestamp = data.timestamp.toDate();
        return { ...data, id: doc.id };
      });
      setMessages(msgs.reverse());
    });
    return () => unsubscribe();
  }, [conversationId]);
  
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [messages, isSending]);

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (error) return <div className="flex h-full items-center justify-center p-4 text-center text-red-700">{error}</div>;

  return (
    <div className="flex h-screen flex-col bg-background font-body">
      <header className="flex items-center gap-4 border-b p-4 shadow-sm">
        <Avatar><AvatarFallback className="bg-primary text-primary-foreground"><Bot className="h-6 w-6" /></AvatarFallback></Avatar>
        <div>
          <p className="font-semibold">Posal Chat</p>
          <p className="text-sm text-muted-foreground">We're here to help</p>
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
        
          {isSending && (
            <div className="flex items-end gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className='bg-primary/20 text-primary'>
                  <Bot className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <div className="max-w-[75%] rounded-lg p-3 text-sm bg-card text-card-foreground border rounded-bl-none">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      <MessageInputForm 
        conversationId={conversationId} 
        currentThreadId={threadId}
        onNewThreadId={setThreadId}
        isSending={isSending}
        setIsSending={setIsSending}
      />
    </div>
  );
});

export default function ChatWidgetPage() {
    return (<Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}><ChatWidget /></Suspense>);
}