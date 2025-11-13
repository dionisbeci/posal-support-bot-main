
'use client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';


function GeneralSettingsForm() {
  const form = useForm();
  return (
    <Form {...form}>
      <form className="space-y-8">
        <FormField
          control={form.control}
          name="orgName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Organization Name</FormLabel>
              <FormControl>
                <Input placeholder="Your Company Inc." {...field} />
              </FormControl>
              <FormDescription>
                This is your public organization name.
              </FormDescription>
            </FormItem>
          )}
        />
        <Button type="submit">Save Changes</Button>
      </form>
    </Form>
  );
}

const appearanceFormSchema = z.object({
  welcomeMessage: z.string().min(1, 'Welcome message cannot be empty.'),
  showAvatar: z.boolean(),
});

function AppearanceSettingsForm() {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof appearanceFormSchema>>({
    resolver: zodResolver(appearanceFormSchema),
    defaultValues: {
      welcomeMessage: 'Welcome to our support chat! How can I help you today?',
      showAvatar: true,
    },
  });
  
  async function onSubmit(values: z.infer<typeof appearanceFormSchema>) {
    try {
      const settingsRef = doc(db, 'settings', 'widget');
      await setDoc(settingsRef, values, { merge: true });
      toast({ title: 'Success', description: 'Appearance settings saved.' });
    } catch(error) {
      console.error(error);
      toast({ title: 'Error', description: 'Could not save settings.', variant: 'destructive'});
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="welcomeMessage"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Welcome Message</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Welcome to our support chat! How can I help you today?"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                The first message a visitor sees.
              </FormDescription>
               <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="showAvatar"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel>Show AI Avatar</FormLabel>
                <FormDescription>
                  Display an avatar for the AI assistant in chat.
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>Save Changes</Button>
      </form>
    </Form>
  );
}

const aiFormSchema = z.object({
  confidenceThreshold: z.number().min(0).max(100),
  crawlerUrl: z.string().url().optional().or(z.literal('')),
  allowedDomains: z.string().min(1, 'You must provide at least one domain.')
});

function AISettingsForm() {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof aiFormSchema>>({
    resolver: zodResolver(aiFormSchema),
    defaultValues: {
      confidenceThreshold: 65,
      crawlerUrl: '',
      allowedDomains: '',
    },
  });
  
  useEffect(() => {
    async function loadSettings() {
      const settingsRef = doc(db, 'settings', 'widget');
      const docSnap = await getDoc(settingsRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        form.reset({
          confidenceThreshold: data.confidenceThreshold || 65,
          crawlerUrl: data.crawlerUrl || '',
          allowedDomains: (data.allowedDomains || []).join('\n'),
        });
      }
    }
    loadSettings();
  }, [form]);

  async function onSubmit(values: z.infer<typeof aiFormSchema>) {
    try {
      const settingsRef = doc(db, 'settings', 'widget');
      const domains = values.allowedDomains.split('\n').map(d => d.trim()).filter(Boolean);
      await setDoc(settingsRef, {
        confidenceThreshold: values.confidenceThreshold,
        crawlerUrl: values.crawlerUrl,
        allowedDomains: domains,
      }, { merge: true });
      toast({ title: 'Success', description: 'AI & Handoff settings saved.' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'Could not save settings.', variant: 'destructive'});
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="confidenceThreshold"
          render={({ field: { onChange, value, ...rest } }) => (
            <FormItem>
              <FormLabel>AI Handoff Threshold</FormLabel>
               <FormControl>
                <Slider
                  defaultValue={[value]}
                  max={100}
                  step={1}
                  onValueChange={(vals) => onChange(vals[0])}
                  {...rest}
                />
              </FormControl>
              <FormDescription>
                The confidence level below which the AI will hand off to a human
                agent. (Currently: {value}%)
              </FormDescription>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="crawlerUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Knowledge Base URL</FormLabel>
              <FormControl>
                <Input placeholder="https://your-docs.com" {...field} />
              </FormControl>
              <FormDescription>
                The URL for the scheduled crawler to update the knowledge base.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="allowedDomains"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Allowed Domains</FormLabel>
              <FormControl>
                <Textarea placeholder="example.com&#10;*.example.org" {...field} />
              </FormControl>
              <FormDescription>
                Domains where the chat widget is allowed to be embedded. Add one domain per line. Use * as a wildcard (e.g., *.your-app.com).
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>Save Changes</Button>
      </form>
    </Form>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Manage your organization's settings and preferences.
        </p>
      </div>
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="ai">AI & Chat Widget</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General</CardTitle>
              <CardDescription>
                Update your organization's details.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GeneralSettingsForm />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Customize the look and feel of your chat widget.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AppearanceSettingsForm />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle>AI & Chat Widget</CardTitle>
              <CardDescription>
                Configure AI behavior, handoff rules, and widget settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AISettingsForm />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
