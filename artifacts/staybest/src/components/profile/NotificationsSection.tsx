import { useState, useEffect } from "react";
import { 
  useGetNotificationPreferences, 
  useUpdateNotificationPreferences, 
  useListNotifications,
  useMarkNotificationRead,
  getGetNotificationPreferencesQueryKey,
  getListNotificationsQueryKey
} from "@workspace/api-client-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

function Toggle({ 
  id, 
  label, 
  desc, 
  checked, 
  onChange, 
  disabled 
}: { 
  id: string, label: string, desc: string, checked: boolean, onChange: (v: boolean) => void, disabled: boolean 
}) {
  return (
    <div className="flex items-start justify-between py-4 border-b border-border last:border-0 gap-4">
      <div>
        <label htmlFor={id} className="font-bold text-secondary text-sm block mb-1 cursor-pointer">{label}</label>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

export function NotificationsSection() {
  const queryClient = useQueryClient();
  
  const { data: prefs, isLoading: prefsLoading } = useGetNotificationPreferences({
    query: { queryKey: getGetNotificationPreferencesQueryKey() }
  });
  const updatePrefs = useUpdateNotificationPreferences();

  const { data: notifications, isLoading: notificationsLoading } = useListNotifications({
    query: { queryKey: getListNotificationsQueryKey() }
  });
  const markRead = useMarkNotificationRead();

  const [marketingEnabled, setMarketingEnabled] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => {
    if (prefs) {
      setMarketingEnabled(prefs.marketingEnabled ?? false);
      setPushEnabled(prefs.pushEnabled ?? false);
    }
  }, [prefs]);

  const handleUpdatePref = (field: 'marketingEnabled' | 'pushEnabled', value: boolean) => {
    if (field === 'marketingEnabled') setMarketingEnabled(value);
    if (field === 'pushEnabled') setPushEnabled(value);

    updatePrefs.mutate(
      { data: { [field]: value } },
      {
        onSuccess: () => {
          toast.success("Preferences updated");
          queryClient.invalidateQueries({ queryKey: getGetNotificationPreferencesQueryKey() });
        },
        onError: () => toast.error("Failed to update preference")
      }
    );
  };

  const handleMarkRead = (id: number) => {
    markRead.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        }
      }
    );
  };

  return (
    <div className="space-y-12">
      <div>
        <h3 className="text-lg font-serif font-bold text-secondary mb-4">Notification Settings</h3>
        <div className="bg-white rounded-xl border border-border px-5">
          {prefsLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : (
            <>
              <Toggle 
                id="marketingEnabled" 
                label="Offers & Deals" 
                desc="Exclusive discounts, seasonal offers, and marketing campaigns from StayBest."
                checked={marketingEnabled}
                onChange={(v) => handleUpdatePref('marketingEnabled', v)}
                disabled={updatePrefs.isPending}
              />
              <Toggle 
                id="pushEnabled" 
                label="Important Updates (Push)" 
                desc="Booking confirmations, cancellations, and trip reminders."
                checked={pushEnabled}
                onChange={(v) => handleUpdatePref('pushEnabled', v)}
                disabled={updatePrefs.isPending}
              />
            </>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-serif font-bold text-secondary mb-4">Inbox</h3>
        {notificationsLoading ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : !notifications || notifications.length === 0 ? (
          <div className="text-center py-12 bg-muted/30 rounded-xl border border-border">
            <Bell className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-secondary">You're all caught up!</p>
            <p className="text-sm text-muted-foreground">No new notifications.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => {
              const isUnread = !n.readAt;
              return (
                <div key={n.id} className={`flex gap-4 p-4 rounded-xl border ${isUnread ? 'bg-primary/5 border-primary/20' : 'bg-white border-border'}`}>
                  <div className={`w-2 h-2 mt-2 rounded-full shrink-0 ${isUnread ? 'bg-primary' : 'bg-transparent'}`} />
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className={`text-sm ${isUnread ? 'font-bold' : 'font-medium'} text-secondary`}>{n.title}</h4>
                        <p className="text-sm text-muted-foreground mt-1">{n.body}</p>
                        <p className="text-xs text-muted-foreground mt-2">{new Date(n.createdAt).toLocaleString()}</p>
                      </div>
                      {isUnread && (
                        <Button variant="ghost" size="sm" onClick={() => handleMarkRead(n.id)} className="h-8 text-xs shrink-0" disabled={markRead.isPending}>
                          <Check className="w-3 h-3 mr-1" /> Mark Read
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
