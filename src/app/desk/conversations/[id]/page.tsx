'use client';
import { useState, useEffect, FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import {
  doc,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  addDoc,
  serverTimestamp,
  getDoc,
  DocumentReference,
  Timestamp,
  updateDoc
} from 'firebase/firestore';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Paperclip,
  Send,
  UserCheck,
  Bot,
  Loader,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  summarizeConversation,
  SummarizeConversationOutput,
} from '@/ai/flows/summarize-conversation';
import type { Message, Conversation, Agent } from '@/lib/types';
import { db } from '@/lib/firebase';
import { placeholderAgents } from '@/lib/placeholder-data';


export default function ConversationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { toast } = useToast();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<(Conversation & {agentDetails?: Agent}) | null>(null);
  const [loading, setLoading] = useState(true);

  const [input, setInput] = useState('');
  const [summary, setSummary] = useState<SummarizeConversationOutput | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    const convoRef = doc(db, 'conversations', id);
    const unsubscribeConvo = onSnapshot(convoRef, async (docSnap) => {
      if (docSnap.exists()) {
        const convoData = docSnap.data() as Conversation;
        convoData.id = docSnap.id;
        
        if (convoData.lastMessageAt instanceof Timestamp) {
          convoData.lastMessageAt = convoData.lastMessageAt.toDate();
        }

        let agentDetails: Agent | undefined = undefined;
        if (convoData.agent && convoData.agent instanceof DocumentReference) {
          const agentSnap = await getDoc(convoData.agent);
          if (agentSnap.exists()) {
            agentDetails = agentSnap.data() as Agent;
          }
        } else if (convoData.agent) {
           agentDetails = convoData.agent as Agent;
        }

        setConversation({...convoData, agentDetails});
      } else {
        setConversation(null);
      }
    });

    const q = query(collection(db, 'messages'), where('conversationId', '==', id), orderBy('timestamp', 'asc'));
    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => {
          const data = doc.data() as Message;
          if (data.timestamp instanceof Timestamp) {
             data.timestamp = data.timestamp.toDate();
          }
          return { ...data, id: doc.id }
      });
      setMessages(msgs);
      setLoading(false);
    });

    return () => {
      unsubscribeConvo();
      unsubscribeMessages();
    };
  }, [id]);

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !id) return;
    
    const currentUser = placeholderAgents[0]; // Mock current agent

    const newMessage: Omit<Message, 'id' | 'timestamp'> = {
      role: 'agent',
      content: input,
      conversationId: id,
      agent: {
        name: currentUser.name,
        avatar: currentUser.avatar,
      },
    };

    setInput('');

    try {
      const messagesCollection = collection(db, 'messages');
      await addDoc(messagesCollection, {
        ...newMessage,
        timestamp: serverTimestamp(),
      });
      
      const convoRef = doc(db, 'conversations', id);
      await updateDoc(convoRef, {
        lastMessage: input,
        lastMessageAt: serverTimestamp(),
      });

    } catch(error) {
       console.error("Error sending message:", error);
       toast({
         title: "Error",
         description: "Could not send message.",
         variant: "destructive"
       });
    }
  };

  const handleSummarize = async () => {
    setIsSummarizing(true);
    setSummary(null);
    try {
      const conversationHistory = messages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');
      const result = await summarizeConversation({ conversationHistory });
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

  if (loading) {
    return <div className="flex h-full items-center justify-center">Loading conversation...</div>;
  }

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center">
        Conversation not found.
      </div>
    );
  }
  
  const visitorName = `Visitor ${conversation.visitorId.substring(0,6)}`;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] h-full">
      <div className="flex flex-col h-full">
        <header className="flex items-center gap-4 border-b p-4">
          <Avatar className="h-10 w-10">
            <AvatarImage src={conversation.agentDetails?.avatar} />
            <AvatarFallback>
              {conversation.visitorId.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">
              {conversation.agentDetails?.name || visitorName}
            </p>
            <p className="text-sm text-muted-foreground">
              Status: <span className="capitalize">{conversation.status}</span>
            </p>
          </div>
        </header>
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex items-end gap-3',
                  message.role === 'agent' && 'flex-row-reverse'
                )}
              >
                {message.role !== 'agent' && (
                  <Avatar className="h-8 w-8">
                    {message.role === 'ai' ? (
                      <AvatarFallback className="bg-primary/20 text-primary">
                        <Bot className="h-5 w-5" />
                      </AvatarFallback>
                    ) : (
                      <>
                        <AvatarImage src={message.agent?.avatar} />
                        <AvatarFallback>
                           {conversation.visitorId.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </>
                    )}
                  </Avatar>
                )}
                <div
                  className={cn(
                    'max-w-xs lg:max-w-md rounded-lg p-3 text-sm',
                    message.role === 'agent'
                      ? 'bg-primary text-primary-foreground rounded-br-none'
                      : 'bg-card text-card-foreground border rounded-bl-none'
                  )}
                >
                  <p>{message.content}</p>
                  <p className="mt-2 text-xs text-right opacity-70">
                    {isClient ? format(new Date(message.timestamp as Date), 'p') : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <div className="border-t p-4">
          <form onSubmit={handleSendMessage} className="relative">
            <Textarea
              placeholder="Type your message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  handleSendMessage(e);
                }
              }}
              className="pr-20"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
              <Button type="button" variant="ghost" size="icon">
                <Paperclip className="h-5 w-5" />
              </Button>
              <Button type="submit" variant="ghost" size="icon">
                <Send className="h-5 w-5 text-primary" />
              </Button>
            </div>
          </form>
        </div>
      </div>
      <aside className="hidden xl:flex flex-col border-l h-full">
        <ScrollArea className="flex-1">
          <Card className="rounded-none border-0 border-b">
            <CardHeader>
              <CardTitle>Conversation Details</CardTitle>
              <CardDescription>
                Visitor ID: {conversation.visitorId}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p>
                <strong>Last Active:</strong>{' '}
                {isClient ? format(new Date(conversation.lastMessageAt as Date), 'PPpp') : ''}
              </p>
              <p>
                <strong>Status:</strong>{' '}
                <span className="capitalize">{conversation.status}</span>
              </p>
              <p>
                <strong>Assigned Agent:</strong>{' '}
                {conversation.agentDetails?.name || 'None'}
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-none border-0 border-b">
            <CardHeader>
              <CardTitle>Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p>
                <strong>Tone:</strong>{' '}
                <span className="capitalize">{conversation.tone || 'N/A'}</span>
              </p>
              <p>
                <strong>Anger:</strong>{' '}
                <span className="capitalize">{conversation.anger || 'N/A'}</span>
              </p>
              <p>
                <strong>Frustration (Customer):</strong>{' '}
                <span className="capitalize">{conversation.frustration?.customer || 'N/A'}</span>
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-none border-0 border-b">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                AI Summary
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSummarize}
                  disabled={isSummarizing}
                >
                  {isSummarizing ? (
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Generate
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              {isSummarizing && (
                <p>Generating summary, please wait...</p>
              )}
              {summary ? (
                <p>{summary.summary}</p>
              ) : (
                !isSummarizing && <p>Click "Generate" to get an AI summary of this conversation.</p>
              )}
            </CardContent>
          </Card>

        </ScrollArea>
        <div className="p-4 border-t">
          <Button className="w-full" disabled={conversation.status !== 'pending'}>
            <UserCheck className="mr-2 h-4 w-4" />
            Join Conversation
          </Button>
        </div>
      </aside>
    </div>
  );
}
