import { MessageSquare } from 'lucide-react';

export default function ConversationsPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <MessageSquare className="h-24 w-24 text-muted-foreground/30" />
      <div className="space-y-1">
        <h3 className="text-2xl font-bold tracking-tight">
          Select a conversation
        </h3>
        <p className="text-sm text-muted-foreground">
          Choose a conversation from the list on the left to view messages.
        </p>
      </div>
    </div>
  );
}
