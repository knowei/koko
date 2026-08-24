import { useEffect, type ReactNode } from "react";
import { useStore } from "@/store/companionStore";

const CHANNEL_NAME = "koko-companion-store-sync";
const STORAGE_KEY = "ai-companion-xiaonuan";

export function StoreSyncBridge({ children }: { children: ReactNode }) {
  useEffect(() => {
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;
    let applyingRemoteState = false;
    let broadcastTimer: number | undefined;

    const rehydrate = async () => {
      applyingRemoteState = true;
      try {
        await useStore.persist.rehydrate();
      } finally {
        applyingRemoteState = false;
      }
    };

    const unsubscribe = useStore.subscribe(() => {
      if (applyingRemoteState || !channel) return;
      window.clearTimeout(broadcastTimer);
      broadcastTimer = window.setTimeout(() => channel.postMessage({ type: "store-updated" }), 50);
    });

    if (channel) {
      channel.onmessage = (event) => {
        if (event.data?.type === "store-updated") void rehydrate();
      };
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) void rehydrate();
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      unsubscribe();
      window.clearTimeout(broadcastTimer);
      window.removeEventListener("storage", handleStorage);
      channel?.close();
    };
  }, []);

  return children;
}
