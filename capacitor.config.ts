import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.sabinkhanal.nepselens",
  appName: "NEPSE Lens",
  webDir: "dist",
  backgroundColor: "#070B14",
  plugins: {
    LocalNotifications: { iconColor: "#22D3EE" },
  },
};

export default config;
