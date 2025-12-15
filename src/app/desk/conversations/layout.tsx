'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { collection, onSnapshot, query, orderBy, getDoc, DocumentReference, limit, deleteDoc, doc, updateDoc } from 'firebase/firestore';

import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, Trash2, CheckSquare, X, Archive, RefreshCcw, Bot, User, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
} from '@/components/ui/alert-dialog';
import { db } from '@/lib/firebase';
import type { Conversation, Agent } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';
import { GlobalChatCleanup } from '@/components/GlobalChatCleanup';


export default function ConversationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [conversations, setConversations] = useState<(Conversation & { agentDetails?: Agent })[]>([]);
  const [loading, setLoading] = useState(true);
  const [limitCount, setLimitCount] = useState(50);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'ended'>('all');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  const agentCache = useRef<Record<string, Agent>>({});

  useEffect(() => {
    const q = query(collection(db, 'conversations'), orderBy('lastMessageAt', 'desc'), limit(limitCount));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      setLoading(true);

      const docsData = snapshot.docs.map(docSnap => {
        const data = docSnap.data() as Conversation;
        data.id = docSnap.id;
        if (data.lastMessageAt instanceof Timestamp) {
          data.lastMessageAt = data.lastMessageAt.toDate();
        }
        return data;
      });

      // 1. Identify unique agents that need fetching
      const uniqueAgentRefs: Record<string, DocumentReference> = {};

      docsData.forEach(convo => {
        if (convo.agent && convo.agent instanceof DocumentReference) {
          const agentId = convo.agent.id;
          if (!agentCache.current[agentId]) {
            uniqueAgentRefs[agentId] = convo.agent;
          }
        }
      });

      // 2. Fetch missing agents in parallel
      const missingAgentIds = Object.keys(uniqueAgentRefs);
      if (missingAgentIds.length > 0) {
        console.log(`Fetching ${missingAgentIds.length} missing agents...`);
        await Promise.all(missingAgentIds.map(async (id) => {
          try {
            const snap = await getDoc(uniqueAgentRefs[id]);
            if (snap.exists()) {
              agentCache.current[id] = snap.data() as Agent;
            }
          } catch (e) {
            console.error(`Error fetching agent ${id}:`, e);
          }
        }));
      }

      // 3. Map conversations with cached agents
      const convos = docsData.map(data => {
        let agentDetails: Agent | undefined = undefined;

        if (data.agent && data.agent instanceof DocumentReference) {
          agentDetails = agentCache.current[data.agent.id];
        } else if (data.agent) {
          agentDetails = data.agent as Agent;
        }

        return { ...data, agentDetails };
      });

      setConversations(convos);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [limitCount]);

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

  const toggleSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await Promise.all(selectedIds.map(id => deleteDoc(doc(db, 'conversations', id))));

      // If the current open conversation is deleted, navigate away
      const currentId = pathname.split('/').pop();
      if (currentId && selectedIds.includes(currentId)) {
        router.push('/desk/conversations');
      }

      setSelectedIds([]);
      setIsSelectionMode(false);
      setShowDeleteDialog(false);
    } catch (error) {
      console.error("Error deleting conversations:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredConversations = conversations.filter(convo => {
    if (viewMode === 'active') {
      if (convo.status === 'archived') return false;

      if (statusFilter === 'in_progress') {
        return ['active', 'pending', 'ai'].includes(convo.status);
      } else if (statusFilter === 'ended') {
        return convo.status === 'ended';
      }
      return true;
    } else {
      return convo.status === 'archived';
    }
  });

  const handleSelectAll = () => {
    if (selectedIds.length === filteredConversations.length && filteredConversations.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredConversations.map(c => c.id));
    }
  };

  const handleArchive = async () => {
    try {
      await Promise.all(selectedIds.map(id => updateDoc(doc(db, 'conversations', id), { status: 'archived' })));
      setSelectedIds([]);
      setIsSelectionMode(false);
    } catch (error) {
      console.error("Error archiving conversations:", error);
    }
  };



  const handleUnarchive = async () => {
    try {
      await Promise.all(selectedIds.map(id => updateDoc(doc(db, 'conversations', id), { status: 'pending' })));
      setSelectedIds([]);
      setIsSelectionMode(false);
    } catch (error) {
      console.error("Error unarchiving conversations:", error);
    }
  };

  // Check if we are in a detail view (not just /desk/conversations)
  const isDetailPage = pathname !== '/desk/conversations' && pathname.includes('/desk/conversations');

  return (
    <div className={cn("grid h-full transition-all duration-300 ease-in-out",
      isCollapsed ? "grid-cols-1 md:grid-cols-[50px_1fr]" : "grid-cols-1 md:grid-cols-[350px_1fr]"
    )}>
      {isCollapsed ? (
        <div className={cn("border-r border-t-0 border-b-0 border-l-0 flex flex-col h-full min-h-0 bg-background items-center py-4 gap-4", isDetailPage ? "hidden md:flex" : "flex")}>
          <GlobalChatCleanup />
          <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(false)} title="Expand Conversations">
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <GlobalChatCleanup />
          <Card className={cn("rounded-none border-r border-t-0 border-b-0 border-l-0 flex-col h-full min-h-0", isDetailPage ? "hidden md:flex" : "flex")}>
            <CardHeader className="p-4 shrink-0">
              <div className="flex items-center justify-between mb-2">
                {isSelectionMode ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={
                          filteredConversations.length > 0 &&
                          selectedIds.length === filteredConversations.length
                        }
                        onCheckedChange={handleSelectAll}
                        id="select-all"
                      />
                      <label
                        htmlFor="select-all"
                        className="font-semibold text-sm cursor-pointer select-none whitespace-nowrap"
                      >
                        {selectedIds.length} Selected
                      </label>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {viewMode === 'active' ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => handleArchive()}
                          disabled={selectedIds.length === 0 || isCollapsed}
                          title="Archive Selected"
                        >
                          <Archive className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Archive</span>
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => handleUnarchive()}
                          disabled={selectedIds.length === 0}
                          title="Unarchive Selected"
                        >
                          <RefreshCcw className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Unarchive</span>
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => setShowDeleteDialog(true)}
                        disabled={selectedIds.length === 0}
                        title="Delete Selected"
                      >
                        <Trash2 className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Delete</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => {
                          setIsSelectionMode(false);
                          setSelectedIds([]);
                        }}
                        title="Cancel Selection"
                      >
                        <X className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Cancel</span>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <CardTitle className="flex items-center gap-2">
                      {viewMode === 'active' ? 'Conversations' : 'Archived Chats'}
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsCollapsed(true)}>
                        <PanelLeftClose className="h-4 w-4" />
                      </Button>
                    </CardTitle>
                    <div className="flex gap-1">
                      {viewMode === 'active' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => {
                            setViewMode('archived');
                            setIsSelectionMode(false);
                            setSelectedIds([]);
                          }}
                          title="View Archived Chats"
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => {
                            setViewMode('active');
                            setIsSelectionMode(false);
                            setSelectedIds([]);
                          }}
                          title="View Active Chats"
                        >
                          <RefreshCcw className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setIsSelectionMode(true)}>
                        <CheckSquare className="h-4 w-4 mr-1" />
                        Select
                      </Button>
                    </div>
                  </>
                )}
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search..." className="pl-8" />
              </div>
              {viewMode === 'active' && (
                <div className="flex items-center gap-2 mt-2 px-1">
                  <Badge
                    variant={statusFilter === 'all' ? "secondary" : "outline"}
                    className="cursor-pointer hover:bg-secondary/80"
                    onClick={() => setStatusFilter('all')}
                  >
                    All
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "cursor-pointer border-transparent",
                      statusFilter === 'in_progress'
                        ? "bg-green-500 text-white hover:bg-green-600"
                        : "bg-green-500/10 text-green-700 hover:bg-green-500/20 hover:text-green-800"
                    )}
                    onClick={() => setStatusFilter('in_progress')}
                  >
                    In Progress
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "cursor-pointer border-transparent",
                      statusFilter === 'ended'
                        ? "bg-red-500 text-white hover:bg-red-600"
                        : "bg-red-500/10 text-red-700 hover:bg-red-500/20 hover:text-red-800"
                    )}
                    onClick={() => setStatusFilter('ended')}
                  >
                    Chat Ended
                  </Badge>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0">
              <ScrollArea className="h-full min-h-0 overscroll-contain">
                <div className="flex flex-col">
                  {loading && conversations.length === 0 ? (
                    <p className="p-4 text-muted-foreground">Loading conversations...</p>
                  ) : (
                    <>
                      {filteredConversations.map((convo) => (
                        <div
                          key={convo.id}
                          className={cn(
                            'flex items-center gap-2 p-4 border-b hover:bg-muted/50 transition-colors cursor-pointer',
                            pathname === `/desk/conversations/${convo.id}` && !isSelectionMode && 'bg-muted'
                          )}
                          onClick={(e) => {
                            if (isSelectionMode) {
                              e.preventDefault();
                              toggleSelection(convo.id);
                            } else {
                              router.push(`/desk/conversations/${convo.id}`);
                            }
                          }}
                        >
                          {isSelectionMode && (
                            <Checkbox
                              checked={selectedIds.includes(convo.id)}
                              onCheckedChange={() => toggleSelection(convo.id)}
                              className="mr-2"
                            />
                          )}
                          <div className="relative">
                            <Avatar className="h-10 w-10 overflow-hidden">
                              {convo.humanInvolved || convo.status === 'active' ? (
                                <div className="relative h-full w-full flex">
                                  {/* Split View: Left Half Bot, Right Half Agent */}
                                  <div className="absolute left-0 top-0 bottom-0 w-1/2 bg-blue-100 flex items-center justify-center">
                                    <Bot className="h-4 w-4 text-blue-600" />
                                  </div>
                                  <div className="absolute right-0 top-0 bottom-0 w-1/2 bg-muted flex items-center justify-center overflow-hidden">
                                    {convo.agentDetails?.avatar ? (
                                      <img src={convo.agentDetails.avatar} alt="Agent" className="h-full w-full object-cover" />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center bg-gray-200">
                                        <User className="h-4 w-4 text-gray-500" />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-blue-100 text-blue-600">
                                  <Bot className="h-6 w-6" />
                                </div>
                              )}
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
                                {convo.title || convo.agentDetails?.name || `Visitor ${convo.visitorId.substring(0, 6)}`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {isClient ? formatDistanceToNow(new Date(convo.lastMessageAt as Date), {
                                  addSuffix: true,
                                }) : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {convo.status === 'ended' ? (
                                <Badge variant="destructive" className="h-5 px-1.5 text-[10px] uppercase font-bold">
                                  Chat Ended
                                </Badge>
                              ) : (
                                <Badge className="h-5 px-1.5 text-[10px] bg-green-500 hover:bg-green-600 uppercase font-bold border-transparent text-white">
                                  In Progress
                                </Badge>
                              )}
                              {convo.typing?.visitor && (() => {
                                const lastUpdate = convo.typing.lastUpdate instanceof Timestamp
                                  ? convo.typing.lastUpdate.toDate()
                                  : (convo.typing.lastUpdate instanceof Date ? convo.typing.lastUpdate : new Date(0));
                                // Check if typing status is fresh (e.g. within last 5 seconds)
                                return new Date().getTime() - lastUpdate.getTime() < 5000;
                              })() ? (
                                <p className="text-sm text-green-600 italic font-medium truncate flex-1 animate-pulse">
                                  Typing...
                                </p>
                              ) : (
                                <p className="text-sm text-muted-foreground truncate flex-1">
                                  {convo.lastMessage}
                                </p>
                              )}
                            </div>
                            <div className="flex justify-end mt-1">
                              {convo.unreadCount > 0 && (
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                                  {convo.unreadCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="p-4">
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLimitCount(prev => prev + 50);
                          }}
                          disabled={loading}
                        >
                          {loading ? 'Loading...' : 'Load More'}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}

      <div className={cn("bg-background h-full overflow-hidden min-h-0", !isDetailPage ? "hidden md:block" : "block")}>{children}</div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete {selectedIds.length} selected conversation{selectedIds.length !== 1 ? 's' : ''} and remove the data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div >
  );
}
