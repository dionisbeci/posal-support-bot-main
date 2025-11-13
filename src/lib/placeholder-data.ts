import type { Conversation, Message, Agent } from '@/lib/types';

export const placeholderAgents: Agent[] = [
  {
    id: 'agent-1',
    name: 'Alex Ray',
    email: 'alex.ray@posal.al',
    role: 'admin',
    avatar: 'https://picsum.photos/id/1005/100/100',
  },
  {
    id: 'agent-2',
    name: 'Jordan Smith',
    email: 'jordan.smith@posal.al',
    role: 'agent',
    avatar: 'https://picsum.photos/id/1012/100/100',
  },
  {
    id: 'agent-3',
    name: 'Taylor Brown',
    email: 'taylor.brown@posal.al',
    role: 'agent',
    avatar: 'https://picsum.photos/id/1027/100/100',
  },
];

export const placeholderConversations: Conversation[] = [
  {
    id: 'conv-1',
    visitorId: 'visitor-a1b2',
    lastMessage: "Okay, I'll try that. Thank you for your help!",
    lastMessageAt: new Date(Date.now() - 2 * 60 * 1000),
    status: 'active',
    agent: placeholderAgents[0],
    unreadCount: 0,
  },
  {
    id: 'conv-2',
    visitorId: 'visitor-c3d4',
    lastMessage: 'I need to speak with a human agent, please.',
    lastMessageAt: new Date(Date.now() - 5 * 60 * 1000),
    status: 'pending',
    agent: null,
    unreadCount: 1,
  },
  {
    id: 'conv-3',
    visitorId: 'visitor-e5f6',
    lastMessage: 'The AI is not understanding my issue about billing.',
    lastMessageAt: new Date(Date.now() - 15 * 60 * 1000),
    status: 'pending',
    agent: null,
    unreadCount: 3,
  },
  {
    id: 'conv-4',
    visitorId: 'visitor-g7h8',
    lastMessage: 'The payment page is not loading on my browser.',
    lastMessageAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
    status: 'ai',
    agent: null,
    unreadCount: 0,
  },
  {
    id: 'conv-5',
    visitorId: 'visitor-i9j0',
    lastMessage: 'Thanks, that solved my problem!',
    lastMessageAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    status: 'archived',
    agent: placeholderAgents[1],
    unreadCount: 0,
  },
];

export const placeholderMessages: Message[] = [
  {
    id: 'msg-1',
    role: 'user',
    content: "Hi, I'm having trouble with my recent order. It hasn't arrived yet.",
    timestamp: new Date(Date.now() - 10 * 60 * 1000),
  },
  {
    id: 'msg-2',
    role: 'ai',
    content:
      'I can help with that. Could you please provide your order number?',
    timestamp: new Date(Date.now() - 9 * 60 * 1000),
  },
  {
    id: 'msg-3',
    role: 'user',
    content: 'Sure, it is #12345XYZ.',
    timestamp: new Date(Date.now() - 8 * 60 * 1000),
  },
  {
    id: 'msg-4',
    role: 'ai',
    content:
      'Thank you. I see your order was shipped two days ago and is currently in transit. The estimated delivery date is tomorrow. Would you like me to ping you with an update tomorrow morning?',
    timestamp: new Date(Date.now() - 7 * 60 * 1000),
  },
  {
    id: 'msg-5',
    role: 'user',
    content: "No, that's fine. I was just worried it was lost.",
    timestamp: new Date(Date.now() - 6 * 60 * 1000),
  },
  {
    id: 'msg-6',
    role: 'agent',
    content:
      "Hi there, I'm Alex. I've taken over this chat to make sure everything is okay. Is there anything else I can assist you with regarding your order?",
    timestamp: new Date(Date.now() - 3 * 60 * 1000),
    agent: placeholderAgents[0],
  },
  {
    id: 'msg-7',
    role: 'user',
    content: "Okay, I'll try that. Thank you for your help!",
    timestamp: new Date(Date.now() - 2 * 60 * 1000),
  },
];

export const placeholderChartData = [
  { date: 'Mon', total: 123, ai: 80, human: 43 },
  { date: 'Tue', total: 152, ai: 95, human: 57 },
  { date: 'Wed', total: 160, ai: 100, human: 60 },
  { date: 'Thu', total: 145, ai: 90, human: 55 },
  { date: 'Fri', total: 180, ai: 120, human: 60 },
  { date: 'Sat', total: 90, ai: 60, human: 30 },
  { date: 'Sun', total: 110, ai: 75, human: 35 },
];
