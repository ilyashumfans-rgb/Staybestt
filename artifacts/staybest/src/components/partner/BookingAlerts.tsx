import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/react";
import { Link } from "wouter";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type BookingAlert = { id: number; bookingId: number; propertyName: string; bookingRef: string | null; checkIn: string };
const base = import.meta.env.BASE_URL.replace(/\/$/, "");
let sessionAudio: AudioContext | null = null;
let audioUser: string | undefined;
export async function disconnectBookingAlerts() {
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration(`${base}/`);
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      try { await api("/subscriptions", "DELETE", { endpoint: subscription.endpoint }); }
      finally { await subscription.unsubscribe(); }
    }
  }
  await sessionAudio?.close();
  sessionAudio = null;
  audioUser = undefined;
}
async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${base}/api/partner/alerts${path}`, {
    method, credentials: "include", headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(response.status === 403 ? "Only approved partners can enable booking alerts." : "Booking alerts could not connect. Please retry.");
  return response.json();
}
function publicKeyBytes(key: string) {
  const binary = atob(key.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - key.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
export function BookingAlerts() {
  const { user } = useUser();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [queue, setQueue] = useState<BookingAlert[]>([]);
  const [soundReady, setSoundReady] = useState(sessionAudio?.state === "running" && audioUser === user?.id);
  const audio = useRef<AudioContext | null>(audioUser === user?.id ? sessionAudio : null);
  const seen = useRef(new Set<number>());
  const mounted = useRef(true);
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const current = queue[0];

  async function ring() {
    const context = audio.current;
    if (!context || context.state !== "running") return;
    for (let index = 0; index < 6; index++) {
      const tone = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.28;
      tone.frequency.value = index % 2 ? 880 : 660;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.23);
      tone.connect(gain); gain.connect(context.destination);
      tone.start(start); tone.stop(start + 0.25);
      tone.onended = () => { tone.disconnect(); gain.disconnect(); };
    }
  }
  async function enableSound() {
    try {
      audio.current ??= new AudioContext();
      sessionAudio = audio.current;
      audioUser = user?.id;
      await audio.current.resume();
      setSoundReady(audio.current.state === "running");
      await ring();
    } catch { setError("Sound could not start. Check your browser and device sound settings."); }
  }
  useEffect(() => {
    let active = true;
    mounted.current = true;
    seen.current.clear();
    setQueue([]);
    let fetching = false;
    async function poll() {
      if (fetching) return;
      fetching = true;
      try {
        const rows: BookingAlert[] = await api("");
        if (!active) return;
        const fresh = rows.filter(row => !seen.current.has(row.id));
        for (const row of fresh) seen.current.add(row.id);
        if (fresh.length) { setQueue(previous => [...previous, ...fresh]); void ring(); }
        setError(previous => previous === "Booking alerts are reconnecting. Check your connection." ? "" : previous);
      } catch { if (active) setError("Booking alerts are reconnecting. Check your connection."); }
      finally { fetching = false; }
    }
    void poll();
    const timer = setInterval(() => void poll(), 15000);
    if (supported) {
      void navigator.serviceWorker.getRegistration(`${base}/`).then(async registration => {
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription && Notification.permission === "granted") {
          // Rebind this device after switching partner accounts; the server scopes it to this session.
          await api("/subscriptions", "POST", subscription.toJSON());
          if (active) setEnabled(true);
        }
      }).catch(() => { if (active) setError("Background alerts need to be enabled again."); });
    }
    return () => {
      mounted.current = false;
      active = false;
      clearInterval(timer);
    };
  }, [user?.id]);

  async function enable() {
    setBusy(true); setError("");
    try {
      // Request permission directly from the click, before network awaits (Safari requirement).
      const permission = Notification.requestPermission();
      await enableSound();
      if (await permission !== "granted") throw new Error("Allow notifications in your browser's site settings to receive background alerts.");
      const { publicKey } = await api("/config");
      await navigator.serviceWorker.register(`${base}/partner-notifications-sw.js`, { scope: `${base}/` });
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription() ??
        await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKeyBytes(publicKey) });
      try { await api("/subscriptions", "POST", subscription.toJSON()); }
      catch (error) { await subscription.unsubscribe(); throw error; }
      setEnabled(true);
      await registration.showNotification("StayBest booking alerts enabled", {
        body: "This device can now receive new booking notifications.", silent: false,
        tag: "staybest-alert-test", data: { url: `${base}/partner/bookings` },
      });
    } catch (error) { setError(error instanceof Error ? error.message : "Could not enable notifications."); }
    finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true); setError("");
    try {
      const registration = await navigator.serviceWorker.getRegistration(`${base}/`);
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) { await api("/subscriptions", "DELETE", { endpoint: subscription.endpoint }); await subscription.unsubscribe(); }
      setEnabled(false);
    } catch { setError("Could not disable alerts. Please retry."); }
    finally { setBusy(false); }
  }
  async function dismiss() {
    if (!current) return;
    try {
      await api(`/${current.id}/read`, "POST");
      setQueue(previous => previous.slice(1));
    } catch { setError("Could not mark the booking alert as read. Please retry."); }
  }
  return <div className="border-b bg-white px-4 py-3 sm:px-8">
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium">Booking alerts</span>
      {supported ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void (enabled ? disable() : enable())}>
        {enabled ? <BellOff className="mr-2 h-4 w-4" /> : <Bell className="mr-2 h-4 w-4" />}
        {busy ? "Please wait…" : enabled ? "Disable background alerts" : "Enable notifications"}
      </Button> : <span className="text-xs text-muted-foreground">Background push is not supported here. On iPhone/iPad, add this website to your Home Screen and open it there.</span>}
      <Button size="sm" variant="outline" onClick={() => void enableSound()}>{soundReady ? "Test ringtone" : "Enable ringtone"}</Button>
      {enabled && <span className="text-xs text-green-700">Background notifications enabled on this device</span>}
    </div>
    <p className="mt-2 text-xs text-muted-foreground">Keep device notifications and sound allowed. Background alerts use your system notification sound; the dashboard ringtone requires enabling sound in this tab. Force-stopping the browser or Do Not Disturb can prevent alerts.</p>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    <Dialog open={!!current} onOpenChange={open => { if (!open) void dismiss(); }}>
      <DialogContent>
        <DialogTitle>New confirmed booking</DialogTitle>
        <DialogDescription>{current?.propertyName} — {current?.bookingRef || "Confirmed booking"}<br />Check-in: {current?.checkIn}</DialogDescription>
        {queue.length > 1 && <p className="text-sm">{queue.length - 1} more booking alerts waiting</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => void dismiss()}>Dismiss</Button>
          <Link href="/partner/bookings"><Button onClick={() => void dismiss()}>View bookings</Button></Link>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}
