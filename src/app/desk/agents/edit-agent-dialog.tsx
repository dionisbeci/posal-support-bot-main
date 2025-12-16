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
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Agent } from '@/lib/types';

const editAgentSchema = z.object({
    name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
    email: z.string().email({ message: 'Please enter a valid email.' }),
    role: z.enum(['admin', 'agent']),
    avatar: z.string().url({ message: 'Please enter a valid URL.' }).optional(),
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

    const form = useForm<EditAgentFormValues>({
        resolver: zodResolver(editAgentSchema),
        defaultValues: {
            name: '',
            email: '',
            role: 'agent',
            avatar: '',
        },
    });

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
                        <FormField
                            control={form.control}
                            name="avatar"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Avatar URL</FormLabel>
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
                        <div className="flex justify-end gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit">Save Changes</Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
