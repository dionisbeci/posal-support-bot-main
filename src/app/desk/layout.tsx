'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquare,
  Settings,
  Users,
  ChevronDown,
  LogOut,
  User,
  PanelLeft,
} from 'lucide-react';
import { getAuth, onAuthStateChanged, User as FirebaseUser, signOut } from 'firebase/auth';
import { app } from '@/lib/firebase';
import { cn } from '@/lib/utils';

import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Icons } from '@/components/icons';

export default function DeskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = React.useState<FirebaseUser | null>(null);

  React.useEffect(() => {
    const auth = getAuth(app);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
      } else {
        router.push('/login');
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleLogout = () => {
    const auth = getAuth(app);
    signOut(auth);
  };

  const navItems = [
    {
      href: '/desk/overview',
      icon: LayoutDashboard,
      label: 'Overview',
    },
    {
      href: '/desk/conversations',
      icon: MessageSquare,
      label: 'Conversations',
    },
    {
      href: '/desk/agents',
      icon: Users,
      label: 'Agents',
    },
    {
      href: '/desk/settings',
      icon: Settings,
      label: 'Settings',
    },
  ];

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="p-4">
          <Link
            href="/desk"
            className="flex items-center gap-2 font-bold text-xl"
          >
            <Icons.logo className="h-8 w-8 text-primary" />
            <span className="group-data-[collapsible=icon]:hidden">
              Posal Chat
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={
                    item.href === '/desk/conversations'
                      ? pathname.startsWith(item.href)
                      : pathname === item.href
                  }
                  tooltip={{
                    children: item.label,
                    className: 'bg-primary text-primary-foreground',
                  }}
                >
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start h-auto p-2"
              >
                <div className="flex items-center gap-3 w-full">
                  <Avatar className="h-8 w-8">
                    {user?.photoURL && <AvatarImage src={user.photoURL} alt={user.displayName || ''} />}
                    <AvatarFallback>
                      {user?.displayName
                        ? user.displayName.split(' ').map((n) => n[0]).join('')
                        : user?.email?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left group-data-[collapsible=icon]:hidden">
                    <p className="font-medium text-sm">{user?.displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      {user?.email}
                    </p>
                  </div>
                  <ChevronDown className="h-4 w-4 group-data-[collapsible=icon]:hidden" />
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" side="top" align="start">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/desk/profile">
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className={cn(pathname.includes('/desk/conversations') && "h-screen overflow-hidden")}>
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4 md:px-6">
          <SidebarTrigger className="md:hidden">
            <PanelLeft />
          </SidebarTrigger>
          <div className="flex-1">
            <h1 className="text-xl font-semibold capitalize">
              {pathname.includes('/desk/conversations/') ? 'Conversations' : pathname.split('/').pop()?.replace('-', ' ')}
            </h1>
          </div>
          {/* Header actions can go here */}
        </header>
        <main className={cn("flex-1", pathname.includes('/desk/conversations') ? "p-0 overflow-hidden" : "p-4 md:p-6")}>{children}</main>
      </SidebarInset>
    </SidebarProvider >
  );
}
