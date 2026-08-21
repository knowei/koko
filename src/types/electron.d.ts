export {};

declare global {
  interface Window {
    electronAPI?: {
      isElectron?: boolean;
      switchWindowMode: (mode: "full" | "mini") => void;
      minimize: () => void;
      close: () => void;
      captureScreenFrame?: () => Promise<string | null>;
      onWindowModeChange: (cb: (mode: "full" | "mini") => void) => void;
    };
    PIXI?: any;
    Live2D?: any;
  }
}
