'use client';
import { useState, useEffect, FormEvent, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  doc,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  addDoc,
  serverTimestamp,
  updateDoc,
  Timestamp,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Conversation, Message } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  User,
  Bot,
  Send,
  Paperclip,
  UserCheck,
  LogOut,
  Sparkles,
  Loader
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { analyzeConversation } from '@/ai/flows/analyze-conversation';
import { summarizeConversation, SummarizeConversationOutput } from '@/ai/flows/summarize-conversation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function ConversationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const [visitorTyping, setVisitorTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const convoRef = doc(db, 'conversations', id);
    const unsubscribeConvo = onSnapshot(convoRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Conversation;
        if (data.lastMessageAt instanceof Timestamp) {
          data.lastMessageAt = data.lastMessageAt.toDate();
        }
        setConversation({ ...data, id: docSnap.id });

        // Check if visitor is typing
        if (data.typing && data.typing.visitor) {
          const lastUpdate = data.typing.lastUpdate instanceof Timestamp ? data.typing.lastUpdate.toDate() : new Date();
          const now = new Date();
          if (now.getTime() - lastUpdate.getTime() < 5000) {
            setVisitorTyping(true);
          } else {
            setVisitorTyping(false);
          }
        } else {
          setVisitorTyping(false);
        }
      } else {
        setLoading(false);
      }
    });

    const q = query(
      collection(db, 'messages'),
      where('conversationId', '==', id),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => {
        const data = doc.data() as Message;
        if (data.timestamp instanceof Timestamp) {
          data.timestamp = data.timestamp.toDate();
        }
        return { ...data, id: doc.id };
      });
      setMessages(msgs.reverse());
      setLoading(false);
    });

    return () => {
      unsubscribeConvo();
      unsubscribeMessages();
    };
  }, [id]);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [messages, visitorTyping]);

  const handleTyping = async () => {
    if (!conversation) return;

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Update typing status
    await updateDoc(doc(db, 'conversations', id), {
      'typing.agent': true,
      'typing.lastUpdate': serverTimestamp()
    });

    // Set timeout to reset
    typingTimeoutRef.current = setTimeout(async () => {
      await updateDoc(doc(db, 'conversations', id), {
        'typing.agent': false,
        'typing.lastUpdate': serverTimestamp()
      });
    }, 2000);
  };

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !conversation) return;

    const content = input;
    setInput('');
    setSending(true);

    // Reset typing status
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    await updateDoc(doc(db, 'conversations', id), {
      'typing.agent': false,
      'typing.lastUpdate': serverTimestamp()
    });

    try {
      await addDoc(collection(db, 'messages'), {
        role: 'agent',
        content,
        conversationId: id,
        timestamp: serverTimestamp(),
        agent: {
          name: 'Support Agent', // In a real app, get from auth context
          avatar: 'https://github.com/shadcn.png',
        },
      });

      await updateDoc(doc(db, 'conversations', id), {
        lastMessage: content,
        lastMessageAt: serverTimestamp(),
        unreadCount: 0, // Reset unread count when agent replies
      });
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message.",
        variant: "destructive"
      });
    } finally {
      setSending(false);
    }
  };

  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const conversationHistory = messages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');

      const result = await analyzeConversation({ conversationHistory });

      const convoRef = doc(db, 'conversations', id);
      await updateDoc(convoRef, {
        tone: result.tone,
        anger: result.anger,
        frustration: result.frustration,
      });

      toast({ title: 'Analysis Updated' });
    } catch (error) {
      console.error("Error analyzing conversation:", error);
      toast({
        title: "Error",
        description: "Could not analyze conversation.",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const [summary, setSummary] = useState<SummarizeConversationOutput | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryLanguage, setSummaryLanguage] = useState<'en' | 'sq'>('en');

  const handleSummarize = async () => {
    setIsSummarizing(true);
    setSummary(null);
    try {
      const conversationHistory = messages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');
      const result = await summarizeConversation({ conversationHistory, language: summaryLanguage });
      setSummary(result);
      toast({ title: 'Summary Generated' });
    } catch (error) {
      console.error(error);
      toast({
        title: 'Error',
        description: 'Could not generate summary.',
        variant: 'destructive',
      });
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleLeaveConversation = async () => {
    if (!conversation) return;

    try {
      // 1. Send "Bot is back" message
      await addDoc(collection(db, 'messages'), {
        role: 'ai',
        content: "Tani po bisedoni me asistentin tonë virtual.",
        conversationId: id,
        timestamp: serverTimestamp()
      });

      // 2. Update conversation status and remove agent
      const convoRef = doc(db, 'conversations', id);
      await updateDoc(convoRef, {
        status: 'ai',
        agent: null,
        lastMessage: "Tani po bisedoni me asistentin tonë virtual.",
        lastMessageAt: serverTimestamp()
      });

      toast({
        title: "Left Conversation",
        description: "You have left the conversation. AI is now in control.",
      });

    } catch (error) {
      console.error("Error leaving conversation:", error);
      toast({
        title: "Error",
        description: "Failed to leave conversation.",
        variant: "destructive"
      });
    }
  };

  const handleJoinConversation = async () => {
    if (!conversation) return;

    try {
      const convoRef = doc(db, 'conversations', id);
      // Assign current agent (mock for now)
      const mockAgent = {
        id: 'mock-agent-id',
        name: 'Support Agent',
        email: 'agent@example.com',
        role: 'agent',
        avatar: 'https://github.com/shadcn.png'
      };

      await updateDoc(convoRef, {
        status: 'active',
        // agent: doc(db, 'agents', 'mock-agent-id') // If we had an agents collection
      });

      toast({
        title: "Joined Conversation",
        description: "You are now chatting with the visitor.",
      });
    } catch (error) {
      console.error("Error joining conversation:", error);
      toast({
        title: "Error",
        description: "Failed to join conversation.",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center">Loading conversation...</div>;
  }

  if (!conversation) {
    return <div className="flex h-full items-center justify-center">Conversation not found</div>;
  }

  return (
    <div className="grid h-full grid-cols-1 overflow-hidden md:grid-cols-[1fr_300px]">
      <div className="flex flex-col border-r overflow-hidden">
        <header className="flex items-center justify-between border-b p-4 shrink-0">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback>{conversation.visitorId.substring(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="font-semibold">{conversation.title || `Visitor ${conversation.visitorId.substring(0, 6)}`}</h2>
              <p className="text-sm text-muted-foreground">
                {conversation.status === 'active' ? 'Active now' : `Last active ${new Date(conversation.lastMessageAt as Date).toLocaleTimeString()}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {conversation.status === 'active' ? (
              <Button variant="outline" size="sm" onClick={handleLeaveConversation}>
                <LogOut className="mr-2 h-4 w-4" />
                Leave Conversation
              </Button>
            ) : (
              <Button size="sm" onClick={handleJoinConversation}>
                <UserCheck className="mr-2 h-4 w-4" />
                Join Conversation
              </Button>
            )}
          </div>
        </header>

        <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
          <div className="space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex items-start gap-3',
                  message.role === 'agent' && 'flex-row-reverse'
                )}
              >
                <Avatar className="h-8 w-8">
                  {message.role === 'agent' ? (
                    <AvatarImage src={message.agent?.avatar} />
                  ) : null}
                  <AvatarFallback className={cn(message.role === 'agent' ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                    {message.role === 'agent' ? 'A' : message.role === 'ai' ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg p-3 text-sm',
                    message.role === 'agent'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <p>{message.content}</p>
                  <span className="mt-1 block text-xs opacity-50">
                    {new Date(message.timestamp as Date).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
            {visitorTyping && (
              <div className="flex items-start gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-muted"><User className="h-4 w-4" /></AvatarFallback>
                </Avatar>
                <div className="max-w-[80%] rounded-lg p-3 text-sm bg-muted">
                  <span className="text-xs text-muted-foreground animate-pulse">Visitor is typing...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-4 shrink-0">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <Button type="button" variant="ghost" size="icon">
              <Paperclip className="h-5 w-5 text-muted-foreground" />
            </Button>
            <Textarea
              placeholder="Type your reply..."
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                handleTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
              className="min-h-[2.5rem] flex-1 resize-none"
              disabled={conversation.status !== 'active' || sending}
            />
            <Button type="submit" size="icon" disabled={conversation.status !== 'active' || sending || !input.trim()}>
              <Send className="h-5 w-5" />
            </Button>
          </form>
          {conversation.status !== 'active' && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              You must join the conversation to reply.
            </p>
          )}
        </div>
      </div>

      <ScrollArea className="border-l bg-muted/10 h-full">
        <div className="p-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Customer Info</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ID</span>
                  <span className="font-mono">{conversation.visitorId.substring(0, 8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Location</span>
                  <span>Tirana, Albania</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Device</span>
                  <span>Chrome / Windows</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Analysis</CardTitle>
              <Button variant="ghost" size="icon" className="h-4 w-4" onClick={handleAnalyze} disabled={isAnalyzing}>
                {isAnalyzing ? <Loader className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div>
                <span className="text-xs text-muted-foreground">Tone</span>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {conversation.tone || 'N/A'}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Anger Level</span>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-red-500 transition-all"
                    style={{ width: `${(conversation.anger ?? 0) * 10}%` }}
                  />
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Frustration</span>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground">Customer</span>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full bg-orange-500 transition-all"
                        style={{ width: `${(conversation.frustration?.customer ?? 0) * 10}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">Agent</span>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${(conversation.frustration?.agent ?? 0) * 10}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="text-sm font-medium">AI Summary</CardTitle>
                <div className="flex items-center gap-2">
                  <Select
                    value={summaryLanguage}
                    onValueChange={(value: 'en' | 'sq') => setSummaryLanguage(value)}
                    disabled={isSummarizing}
                  >
                    <SelectTrigger className="h-8 w-[100px] text-xs">
                      <SelectValue placeholder="Language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="sq">Albanian</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={handleSummarize}
                    disabled={isSummarizing}
                  >
                    {isSummarizing ? (
                      <Loader className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground pt-0">
              {isSummarizing && (
                <div className="flex items-center gap-2 py-4 text-xs">
                  <Loader className="h-3 w-3 animate-spin" />
                  <span>Generating summary in {summaryLanguage === 'sq' ? 'Albanian' : 'English'}...</span>
                </div>
              )}
              {summary ? (
                <div className="rounded-md bg-muted/50 p-3 text-sm leading-relaxed text-foreground">
                  {summary.summary}
                </div>
              ) : (
                !isSummarizing && <p className="text-xs text-muted-foreground">Select a language and click the sparkles to get an AI summary.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
