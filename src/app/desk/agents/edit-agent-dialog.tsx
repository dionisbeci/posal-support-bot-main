'use client';

import { useState, useEffect } from 'react';
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
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ImagePlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Agent } from '@/lib/types';

const editAgentSchema = z.object({
    name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
    email: z.string().email({ message: 'Please enter a valid email.' }),
    role: z.enum(['admin', 'agent']),
    avatar: z.string().url({ message: 'Please enter a valid URL.' }).or(z.literal('')).optional(),
});

type EditAgentFormValues = z.infer<typeof editAgentSchema>;

interface EditAgentDialogProps {
    agent: Agent | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

export function EditAgentDialog({ agent, open, onOpenChange, onSuccess }: EditAgentDialogProps) {
    const { toast } = useToast();
    const [uploading, setUploading] = useState(false);

    const form = useForm<EditAgentFormValues>({
        resolver: zodResolver(editAgentSchema),
        defaultValues: {
            name: '',
            email: '',
            role: 'agent',
            avatar: '',
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

    useEffect(() => {
        if (agent) {
            form.reset({
                name: agent.name,
                email: agent.email,
                role: agent.role,
                avatar: agent.avatar || '',
            });
        }
    }, [agent, form]);

    const onSubmit = async (data: EditAgentFormValues) => {
        try {
            if (!agent) return;

            const user = auth.currentUser;
            if (!user) {
                toast({ title: 'Unauthorized', description: 'You must be signed in as an admin to edit agents.', variant: 'destructive' });
                return;
            }

            const idToken = await user.getIdToken();

            const res = await fetch(`/api/agents/${agent.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify(data),
            });

            const result = await res.json();
            if (!res.ok) {
                throw new Error(result?.error || 'Failed to update agent');
            }

            toast({
                title: 'Success',
                description: 'Agent updated successfully.',
            });

            onSuccess();
            onOpenChange(false);
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'Failed to update agent.',
                variant: 'destructive',
            });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Agent</DialogTitle>
                    <DialogDescription>
                        Update agent details and permissions.
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
                                        id="edit-avatar-upload"
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
                                        <label htmlFor="edit-avatar-upload">
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
                                onClick={() => onOpenChange(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={uploading}>
                                {uploading ? "Saving..." : "Save Changes"}
                            </Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
