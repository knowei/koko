import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.koko.companion",
  appName: "妹妹陪伴",
  webDir: "dist",
  android: {
    allowMixedContent: true,
    backgroundColor: "#fff8f3",
  },
};

export default config;
