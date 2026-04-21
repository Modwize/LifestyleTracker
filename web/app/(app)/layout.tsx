// Authenticated-app layout: constrained width + persistent bottom nav.
// Login/auth routes sit outside this group and use the root layout directly.

import { BottomNav } from '@/components/BottomNav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <div className="flex-1">{children}</div>
      <BottomNav />
    </div>
  );
}
