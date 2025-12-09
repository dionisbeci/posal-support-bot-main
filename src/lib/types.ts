
import type { DocumentReference, Timestamp } from 'firebase/firestore';

export type Conversation = {
  id: string;
  visitorId: string;
  lastMessage: string;
  lastMessageAt: Date | Timestamp;
  status: 'active' | 'archived' | 'ai' | 'pending';
  agent: Agent | DocumentReference | null;
  unreadCount: number;
  threadId?: string; // OpenAI Assistant thread ID for conversation context
  tone?: string;
  anger?: number;
  frustration?: {
    customer: number;
    agent: number;
  };
  resolutionStatus?: 'waiting from customer' | 'waiting from agent' | 'waiting from a coworker' | 'not resolvable' | 'redirected';
  typing?: {
    agent: boolean;
    visitor: boolean;
    lastUpdate: Timestamp | Date;
  };
  title?: string;
};

export type CannedResponse = {
  id: string;
  title: string;
  content: string;
  category?: string;
  createdAt: Timestamp | Date;
};

export type Message = {
  id: string;
  role: 'user' | 'agent' | 'ai';
  content: string;
  timestamp: Date | Timestamp;
  agent?: Pick<Agent, 'name' | 'avatar'>;
  conversationId?: string;
};

export type Agent = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'agent';
  avatar: string;
};