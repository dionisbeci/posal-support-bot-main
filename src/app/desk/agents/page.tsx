'use client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MoreHorizontal, Trash2, Edit, KeyRound } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, limit } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import type { Agent } from '@/lib/types';
import { AddAgentDialog } from './add-agent-dialog';
import { EditAgentDialog } from './edit-agent-dialog';
import { CredentialsDialog } from './credentials-dialog';
import { useToast } from '@/hooks/use-toast';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Dialog states
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resetCredentials, setResetCredentials] = useState<{ email: string; password?: string } | null>(null);

  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    // Auth check
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/login');
        return;
      }
      const tokenResult = await user.getIdTokenResult();
      if (tokenResult.claims.role !== 'admin') {
        toast({
          title: 'Access Denied',
          description: 'You do not have permission to view this page.',
          variant: 'destructive',
        });
        router.push('/desk/overview');
      } else {
        setIsAdmin(true);
      }
    });

    // Agents listener
    const q = query(collection(db, 'agents'), limit(100));
    const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
      const agentData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Agent));
      setAgents(agentData);
      setLoading(false);
    }, (error) => {
      console.error('Firestore error:', error);
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeSnapshot();
    };
  }, [router, toast]);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const user = auth.currentUser;
      if (!user) return;
      const idToken = await user.getIdToken();

      const res = await fetch(`/api/agents/${deleteId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to delete agent');
      }

      toast({
        title: 'Success',
        description: 'Agent deleted successfully.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete agent.',
        variant: 'destructive',
      });
    } finally {
      setDeleteOpen(false);
      setDeleteId(null);
    }
  };

  const openEdit = (agent: Agent) => {
    setEditAgent(agent);
    setEditOpen(true);
  };

  const openDelete = (id: string) => {
    setDeleteId(id);
    setDeleteOpen(true);
  };

  const handleResetPassword = async (agent: Agent) => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const idToken = await user.getIdToken();

      const res = await fetch(`/api/agents/${agent.id}/reset-password`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      setResetCredentials({ email: agent.email, password: result.password });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to reset password.',
        variant: 'destructive',
      });
    }
  };

  if (!isAdmin && loading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  if (!isAdmin) return null; // Should redirect, but prevent flash

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Agents</CardTitle>
            <CardDescription>
              Manage your team members and their roles.
            </CardDescription>
          </div>
          <AddAgentDialog />
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground">Loading agents...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={agent.avatar} alt={agent.name} />
                          <AvatarFallback>
                            {agent.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="font-medium">{agent.name}</div>
                      </div>
                    </TableCell>
                    <TableCell>{agent.email}</TableCell>
                    <TableCell>
                      <Badge variant={agent.role === 'admin' ? 'default' : 'secondary'}>
                        {agent.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button aria-haspopup="true" size="icon" variant="ghost">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Toggle menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => openEdit(agent)}>
                            <Edit className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleResetPassword(agent)}>
                            <KeyRound className="mr-2 h-4 w-4" /> Reset Password
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => openDelete(agent.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <EditAgentDialog
        agent={editAgent}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={() => setEditOpen(false)}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the agent account
              and remove their access to the platform.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Delete Agent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CredentialsDialog
        open={!!resetCredentials}
        onOpenChange={(open) => !open && setResetCredentials(null)}
        title="Password Reset Successful"
        description="The password has been reset. Share these new credentials with the agent."
        email={resetCredentials?.email || ''}
        password={resetCredentials?.password}
      />
    </>
  );
}
