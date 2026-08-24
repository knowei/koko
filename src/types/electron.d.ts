export {};

declare global {
  interface Window {
    electronAPI?: {
      isElectron?: boolean;
      switchWindowMode: (mode: "full" | "mini") => void;
      minimize: () => void;
      close: () => void;
      setStickyExpanded?: (expanded: boolean) => void;
      hideStickyWindow?: () => void;
      openStickyManager?: () => void;
      onStickyReset?: (cb: () => void) => () => void;
      captureScreenFrame?: () => Promise<string | null>;
      onWindowModeChange: (cb: (mode: "full" | "mini") => void) => void;
      onTrayAction?: (cb: (action: "sticky" | "focus" | "life" | "settings") => void) => () => void;
    };
    PIXI?: any;
    Live2D?: any;
  }
}
