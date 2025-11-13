import '../globals.css';
import { Toaster } from '@/components/ui/toaster';

export default function ChatWidgetLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="bg-transparent">
      {children}
      <Toaster />
    </div>
  );
}
