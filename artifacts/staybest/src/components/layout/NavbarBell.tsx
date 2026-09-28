import { Link } from "wouter";
import { Bell } from "lucide-react";
import { useListNotifications, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

export function NavbarBell({ textClass }: { textClass: string }) {
  const { data: notifications } = useListNotifications({
    query: { queryKey: getListNotificationsQueryKey(), enabled: true }
  });

  const unreadCount = notifications?.filter(n => !n.readAt).length || 0;

  return (
    <Link href="/profile?section=notifications" className={cn("relative p-2 rounded-full hover:bg-black/5 transition-colors", textClass)}>
      <Bell className="w-5 h-5" />
      {unreadCount > 0 && (
        <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
        </span>
      )}
    </Link>
  );
}
