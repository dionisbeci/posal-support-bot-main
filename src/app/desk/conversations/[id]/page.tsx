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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Paperclip, Loader2, Sparkles, XCircle, LogOut, UserCheck, Bot, User, PanelRightClose, PanelRightOpen, Send } from 'lucide-react';
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

  // Automatic Analysis Hook
  useEffect(() => {
    // Requirements:
    // 1. Conversation loaded
    // 2. Messages loaded (> 3 messages for context)
    // 3. Not currently analyzing
    if (!conversation || loading || messages.length < 3) return;

    const checkAndRunAnalysis = async () => {
      // 4. Debounce / Staleness Check
      const now = new Date();
      let lastAnalyzedTime = new Date(0); // Default to epoch if never analyzed

      if (conversation.lastAnalyzedAt) {
        lastAnalyzedTime = conversation.lastAnalyzedAt instanceof Timestamp
          ? conversation.lastAnalyzedAt.toDate()
          : (conversation.lastAnalyzedAt instanceof Date ? conversation.lastAnalyzedAt : new Date(conversation.lastAnalyzedAt));
      }

      const lastMessageTime = conversation.lastMessageAt instanceof Timestamp
        ? conversation.lastMessageAt.toDate()
        : (conversation.lastMessageAt instanceof Date ? conversation.lastMessageAt : new Date());

      // If analyzed AFTER the last message, no need to re-analyze
      if (lastAnalyzedTime.getTime() > lastMessageTime.getTime()) {
        return;
      }

      // If analyzed recently (within last 2 minutes), skip to prevent spam
      if (now.getTime() - lastAnalyzedTime.getTime() < 2 * 60 * 1000) {
        return;
      }

      // Trigger Analysis
      console.log('Triggering automatic conversation analysis...');
      try {
        // Re-use existing handleAnalyze logic but without UI loading state conflict if possible,
        // or just call the server action directly.
        // Let's call server action directly to avoid messing with 'isAnalyzing' which controls the button spinner.
        // Actually, showing the spinner might be nice feedback? Let's use clean logic separate from button.

        const conversationHistory = messages
          .map((m) => `${m.role}: ${m.content}`)
          .join('\n');

        const result = await analyzeConversation({ conversationHistory });

        await updateDoc(doc(db, 'conversations', id), {
          tone: result.tone,
          anger: result.anger,
          frustration: result.frustration,
          lastAnalyzedAt: serverTimestamp() // Mark as analyzed
        });

        // Optional: Toast or silent update? Silent is better for auto-features usually.
        // toast({ title: 'Analysis Updated' }); 

      } catch (error) {
        console.error("Auto-analysis error:", error);
      }
    };

    const timeoutId = setTimeout(checkAndRunAnalysis, 2000); // 2s delay after load to settle
    return () => clearTimeout(timeoutId);

  }, [conversation, messages, loading, id]);

  // Keep refs updated for interval
  const conversationRef = useRef(conversation);
  const messagesRef = useRef(messages);

  useEffect(() => {
    conversationRef.current = conversation;
    messagesRef.current = messages;
  }, [conversation, messages]);

  // Auto-end chat on inactivity
  useEffect(() => {
    const checkInactivity = async () => {
      const convo = conversationRef.current;
      if (!convo || !['active', 'ai'].includes(convo.status)) return;

      const now = new Date();
      let lastMessageTime: Date;

      // Robust Date Parsing for lastMessageAt
      if (convo.lastMessageAt instanceof Timestamp) {
        lastMessageTime = convo.lastMessageAt.toDate();
      } else if (convo.lastMessageAt instanceof Date) {
        lastMessageTime = convo.lastMessageAt;
      } else if (typeof convo.lastMessageAt === 'string' || typeof convo.lastMessageAt === 'number') {
        lastMessageTime = new Date(convo.lastMessageAt);
      } else {
        // Fallback to messages if lastMessageAt is missing
        const msgs = messagesRef.current;
        if (msgs.length > 0 && msgs[0].timestamp) {
          const lastMsg = msgs[0];
          lastMessageTime = lastMsg.timestamp instanceof Timestamp
            ? lastMsg.timestamp.toDate()
            : (lastMsg.timestamp instanceof Date ? lastMsg.timestamp : new Date(lastMsg.timestamp));
        } else {
          // Only if absolute no data, fallback to now (prevents false positive close on load error)
          lastMessageTime = new Date();
        }
      }

      // Check validity of date
      if (isNaN(lastMessageTime.getTime())) {
        lastMessageTime = new Date();
      }

      const lastTypingTime = convo.typing?.lastUpdate instanceof Timestamp
        ? convo.typing.lastUpdate.toDate()
        : (convo.typing?.lastUpdate instanceof Date ? convo.typing.lastUpdate : new Date(0));

      const lastActivity = Math.max(lastMessageTime.getTime(), lastTypingTime.getTime());

      if (now.getTime() - lastActivity > 3 * 60 * 1000) { // 3 minutes
        try {
          await addDoc(collection(db, 'messages'), {
            role: 'system',
            content: 'Biseda përfundoi.',
            conversationId: id,
            timestamp: serverTimestamp()
          });

          await updateDoc(doc(db, 'conversations', id), {
            status: 'ended',
            lastMessage: 'Biseda përfundoi.',
            lastMessageAt: serverTimestamp()
          });
          toast({
            title: "Chat Ended",
            description: "The chat was ended due to inactivity.",
          });
        } catch (error) {
          console.error("Error auto-ending chat:", error);
        }
      }
    };

    const intervalId = setInterval(checkInactivity, 10000);
    return () => clearInterval(intervalId);
  }, [id, toast]);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [messages, visitorTyping]);

  const handleTyping = async () => {
    if (!conversation) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    await updateDoc(doc(db, 'conversations', id), {
      'typing.agent': true,
      'typing.lastUpdate': serverTimestamp()
    });

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
  const [isInfoOpen, setIsInfoOpen] = useState(true);

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

  const handleEndChat = async () => {
    try {
      await addDoc(collection(db, 'messages'), {
        role: 'system',
        content: 'Biseda përfundoi.',
        conversationId: id,
        timestamp: serverTimestamp()
      });

      const convoRef = doc(db, 'conversations', id);
      await updateDoc(convoRef, {
        status: 'ended',
        lastMessage: 'Biseda përfundoi.',
        lastMessageAt: serverTimestamp()
      });
      toast({
        title: "Chat Ended",
        description: "The chat has been ended successfully.",
      });
    } catch (error) {
      console.error("Error ending chat:", error);
      toast({
        title: "Error",
        description: "Failed to end chat.",
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
        humanInvolved: true,
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
    <div className={cn("grid h-full grid-cols-1 overflow-hidden transition-all duration-300 ease-in-out", isInfoOpen ? "md:grid-cols-[1fr_300px]" : "md:grid-cols-[1fr_0px]")}>
      <div className="flex flex-col border-r overflow-hidden min-h-0">
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
            {conversation.status === 'active' && (
              <>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <XCircle className="mr-2 h-4 w-4" />
                      End Chat
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>End Conversation?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to end this chat? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleEndChat} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        End Chat
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button variant="outline" size="sm" onClick={handleLeaveConversation}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Leave Conversation
                </Button>
              </>
            )}
            {conversation.status !== 'active' && conversation.status !== 'ended' && (
              <Button size="sm" onClick={handleJoinConversation}>
                <UserCheck className="mr-2 h-4 w-4" />
                Join Conversation
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => setIsInfoOpen(!isInfoOpen)} title={isInfoOpen ? "Close Info" : "Open Info"}>
              {isInfoOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <ScrollArea className="flex-1 p-4 min-h-0" ref={scrollAreaRef}>
          <div className="space-y-6">
            <div className="flex flex-col gap-2 items-center justify-center pb-4 text-muted-foreground">
              <span className="text-xs">
                {(() => {
                  const date = conversation.lastMessageAt instanceof Timestamp ? conversation.lastMessageAt.toDate() : new Date(conversation.lastMessageAt as Date);
                  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
                })()}
              </span>
            </div>
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
          {conversation.status === 'ended' && (
            <div className="mt-2 flex items-center justify-center p-2 bg-destructive/10 text-destructive rounded-md text-sm font-medium">
              Conversation Ended
            </div>
          )}
          {conversation.status !== 'active' && conversation.status !== 'ended' && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              You must join the conversation to reply.
            </p>
          )}
        </div>
      </div>

      <ScrollArea className="border-l bg-muted/10 h-full min-h-0">
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
                  <span>
                    {conversation.location?.city || 'Unknown'}, {conversation.location?.country || 'Unknown'}
                    {conversation.location?.ip && conversation.location.ip !== 'Unknown' && (
                      <span className="block text-[10px] text-right text-muted-foreground">{conversation.location.ip}</span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Device</span>
                  <span>{conversation.device?.browser || 'Unknown'} / {conversation.device?.os || 'Unknown'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Analysis</CardTitle>
              <Button variant="ghost" size="icon" className="h-4 w-4" onClick={handleAnalyze} disabled={isAnalyzing}>
                {isAnalyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
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
                      <Loader2 className="h-3 w-3 animate-spin" />
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
                  <Loader2 className="h-3 w-3 animate-spin" />
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
    </div >
  );
}
