'use client';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, CheckCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface CredentialsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    email: string;
    password?: string;
}

export function CredentialsDialog({
    open,
    onOpenChange,
    title,
    description,
    email,
    password,
}: CredentialsDialogProps) {
    const { toast } = useToast();
    const [copied, setCopied] = useState(false);

    const passwordRef = useRef<HTMLInputElement>(null);

    const handleCopy = async () => {
        if (!password) return;

        try {
            // Priority 1: Modern API
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(password);
                setCopied(true);
                toast({ title: 'Copied', description: 'Password copied to clipboard.' });
                setTimeout(() => setCopied(false), 2000);
                return;
            }
        } catch (e) {
            console.warn("Clipboard API failed, trying fallback");
        }

        // Priority 2: Fallback to selecting the visible input
        try {
            if (passwordRef.current) {
                passwordRef.current.select();
                passwordRef.current.setSelectionRange(0, 99999); // For mobile

                const successful = document.execCommand('copy');
                if (successful) {
                    setCopied(true);
                    toast({ title: 'Copied', description: 'Password copied to clipboard.' });
                    setTimeout(() => setCopied(false), 2000);
                } else {
                    throw new Error("execCommand returned false");
                }
            }
        } catch (err) {
            // If all fails, at least the text is selected for manual copy
            toast({
                title: 'Manual Copy Required',
                description: 'Press Ctrl+C (or Cmd+C) to copy.',
                variant: 'destructive',
            });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="flex items-center gap-2">
                        <CheckCircle className="h-6 w-6 text-green-500" />
                        <DialogTitle>{title}</DialogTitle>
                    </div>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" value={email} readOnly className="bg-muted" />
                    </div>
                    {password && (
                        <div className="grid gap-2">
                            <Label htmlFor="password">Temporary Password</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    ref={passwordRef}
                                    id="password"
                                    value={password}
                                    readOnly
                                    className="font-mono bg-muted text-lg tracking-wide"
                                />
                                <Button type="button" size="icon" onClick={handleCopy} className="shrink-0">
                                    {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                </Button>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">
                                Copy this password immediately. It will not be shown again.
                            </p>
                        </div>
                    )}
                </div>
                <DialogFooter className="sm:justify-start">
                    <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} className="w-full">
                        Done
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
