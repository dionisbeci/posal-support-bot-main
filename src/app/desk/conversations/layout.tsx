'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { collection, onSnapshot, query, orderBy, getDoc, DocumentReference } from 'firebase/firestore';

import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { db } from '@/lib/firebase';
import type { Conversation, Agent } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';


export default function ConversationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [conversations, setConversations] = useState<(Conversation & { agentDetails?: Agent })[]>([]);
  const [loading, setLoading] = useState(true);

  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'conversations'), orderBy('lastMessageAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      setLoading(true);
      const convos = await Promise.all(snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data() as Conversation;
        data.id = docSnap.id;

        // Convert Firestore Timestamps to JS Dates
        if (data.lastMessageAt instanceof Timestamp) {
          data.lastMessageAt = data.lastMessageAt.toDate();
        }

        let agentDetails: Agent | undefined = undefined;
        if (data.agent && data.agent instanceof DocumentReference) {
          try {
            const agentSnap = await getDoc(data.agent);
            if (agentSnap.exists()) {
              agentDetails = agentSnap.data() as Agent;
            }
          } catch (e) {
            console.error("Error fetching agent:", e)
          }
        } else if(data.agent) {
           // It might already be populated in some cases, or be null
           agentDetails = data.agent as Agent;
        }

        return { ...data, agentDetails };
      }));
      setConversations(convos);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500';
      case 'pending':
        return 'bg-yellow-500';
      case 'ai':
        return 'bg-blue-500';
      default:
        return 'bg-gray-400';
    }
  };
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-[350px_1fr] h-[calc(100vh-65px)]">
      <Card className="rounded-none border-r border-t-0 border-b-0 border-l-0">
        <CardHeader className="p-4">
          <CardTitle>Conversations</CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." className="pl-8" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="flex flex-col">
              {loading ? (
                <p className="p-4 text-muted-foreground">Loading conversations...</p>
              ) : (
                conversations.map((convo) => (
                  <Link
                    key={convo.id}
                    href={`/desk/conversations/${convo.id}`}
                    className={cn(
                      'flex items-start gap-4 p-4 hover:bg-muted/50 transition-colors border-b',
                      pathname === `/desk/conversations/${convo.id}` &&
                        'bg-muted'
                    )}
                  >
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={convo.agentDetails?.avatar} />
                        <AvatarFallback>
                          {convo.visitorId.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        className={`absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-card ${getStatusColor(
                          convo.status
                        )}`}
                      />
                    </div>
                    <div className="flex-1 truncate">
                      <div className="flex items-baseline justify-between">
                        <p className="font-semibold truncate">
                          {convo.agentDetails?.name || `Visitor ${convo.visitorId.substring(0,6)}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isClient ? formatDistanceToNow(new Date(convo.lastMessageAt as Date), {
                            addSuffix: true,
                          }) : ''}
                        </p>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-sm text-muted-foreground truncate">
                          {convo.lastMessage}
                        </p>
                        {convo.unreadCount > 0 && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                            {convo.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
      <div className="bg-background">{children}</div>
    </div>
  );
}
