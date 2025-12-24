'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { auth } from '@/lib/firebase';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ImagePlus, Loader2, PlusCircle } from 'lucide-react';

import { useToast } from '@/hooks/use-toast';
import { CredentialsDialog } from './credentials-dialog';

const addAgentSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email({ message: 'Please enter a valid email.' }),
  role: z.enum(['admin', 'agent']),
  avatar: z.string().url({ message: 'Please enter a valid URL.' }).or(z.literal('')).optional(),
  password: z.string().min(6).optional().or(z.literal('')),
});

type AddAgentFormValues = z.infer<typeof addAgentSchema>;

export function AddAgentDialog() {
  const [open, setOpen] = useState(false);
  const [createdAgent, setCreatedAgent] = useState<{ email: string; password?: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const form = useForm<AddAgentFormValues>({
    resolver: zodResolver(addAgentSchema),
    defaultValues: {
      name: '',
      email: '',
      role: 'agent',
      avatar: '',
      password: '',
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please upload an image file.', variant: 'destructive' });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Image must be under 2MB.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const storageRef = ref(storage, `avatars/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      form.setValue('avatar', url);
      toast({ title: 'Success', description: 'Image uploaded successfully.' });
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({ title: 'Error', description: 'Failed to upload image.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (data: AddAgentFormValues) => {
    try {
      const user = auth.currentUser;
      if (!user) {
        toast({ title: 'Unauthorized', description: 'You must be signed in as an admin to add agents.', variant: 'destructive' });
        return;
      }

      const idToken = await user.getIdToken();

      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(data),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result?.error || 'Failed to create agent');
      }

      const passwordMsg = result.password ? ` Temporary password: ${result.password}` : '';

      // Close the form dialog
      setOpen(false);
      form.reset();

      // Open the credentials dialog
      if (result.password) {
        setCreatedAgent({ email: data.email, password: result.password });
      } else {
        toast({
          title: 'Success',
          description: `Agent added successfully.`,
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add agent.',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" className="gap-1">
            <PlusCircle className="h-4 w-4" />
            Add Agent
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Agent</DialogTitle>
            <DialogDescription>
              Add a new team member to manage conversations.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="john.doe@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="agent">Agent</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-3">
                <FormLabel>Avatar (URL or Upload)</FormLabel>
                <div className="flex gap-2">
                  <FormField
                    control={form.control}
                    name="avatar"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input
                            placeholder="https://example.com/avatar.jpg"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="avatar-upload"
                      onChange={handleImageUpload}
                      disabled={uploading}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      asChild
                      className={uploading ? "opacity-50 pointer-events-none" : "cursor-pointer"}
                    >
                      <label htmlFor="avatar-upload">
                        {uploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ImagePlus className="h-4 w-4" />
                        )}
                      </label>
                    </Button>
                  </div>
                </div>
                {form.watch('avatar') && (
                  <div className="mt-2 flex items-center gap-2">
                    <img
                      src={form.watch('avatar')}
                      alt="Preview"
                      className="h-10 w-10 rounded-full object-cover border"
                    />
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">Avatar Preview</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => form.setValue('avatar', '')}
                      className="h-6 px-2 text-red-500 hover:text-red-600"
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={uploading}>
                  {uploading ? "Adding..." : "Add Agent"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <CredentialsDialog
        open={!!createdAgent}
        onOpenChange={(open) => !open && setCreatedAgent(null)}
        title="Agent Created"
        description="The account has been created successfully. Send these credentials to the new agent."
        email={createdAgent?.email || ''}
        password={createdAgent?.password}
      />
    </>
  );
}