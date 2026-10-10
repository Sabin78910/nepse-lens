// Local notifications: Capacitor LocalNotifications inside the Android app, the Notification API on the web.

import { Capacitor } from "@capacitor/core";

export async function requestPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const r = await LocalNotifications.requestPermissions();
    return r.display === "granted";
  }
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  return (await Notification.requestPermission()) === "granted";
}

let nextId = 1;

export async function notify(title: string, body: string): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.schedule({ notifications: [{ id: nextId++, title, body }] });
      return;
    }
    if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(title, { body, icon: "./icon-192.png" });
  } catch {
    // notifications are best-effort; the alert still shows as fired in the app
  }
}
