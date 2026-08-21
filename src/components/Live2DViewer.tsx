import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    PIXI?: any;
    Live2D?: any;
  }
}

interface Live2DViewerProps {
  modelPath?: string;
  width?: number;
  height?: number;
  expression?: "smile" | "blush" | "shy" | "pout" | "sleepy" | "surprised" | "normal";
  onTapArea?: (area: "head" | "body" | "face") => void;
  className?: string;
}

export function Live2DViewer({
  modelPath = "/live2d/shizuku/shizuku.model.json",
  width = 220,
  height = 250,
  expression = "smile",
  onTapArea,
  className = "",
}: Live2DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<any>(null);
  const appRef = useRef<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function initLive2D() {
      if (!containerRef.current || typeof window === "undefined") return;

      const PIXI = window.PIXI;
      if (!PIXI || !PIXI.live2d || !PIXI.live2d.Live2DModel) {
        setTimeout(() => {
          if (!isCancelled && (!window.PIXI || !window.PIXI.live2d?.Live2DModel)) {
            setLoadError("Live2D 引擎未加载");
          }
        }, 800);
        return;
      }

      try {
        // Register Ticker
        try {
          PIXI.live2d.Live2DModel.registerTicker(PIXI.Ticker);
        } catch {}

        // Create Pixi App
        const app = new PIXI.Application({
          width,
          height,
          backgroundAlpha: 0,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1,
          antialias: true,
        });

        if (isCancelled) {
          app.destroy(true);
          return;
        }

        appRef.current = app;
        const canvasEl = app.view as HTMLCanvasElement;
        canvasEl.className = "live2d-canvas";
        canvasEl.style.width = `${width}px`;
        canvasEl.style.height = `${height}px`;
        canvasEl.style.background = "transparent";

        // Clear previous children and append
        containerRef.current.innerHTML = "";
        containerRef.current.appendChild(canvasEl);

        const model = await PIXI.live2d.Live2DModel.from(modelPath, {
          autoInteract: false,
        });

        if (isCancelled) {
          model.destroy();
          app.destroy(true);
          return;
        }

        modelRef.current = model;

        // Scale and center model
        const baseWidth = model.width || 1280;
        const scale = (width * 0.94) / baseWidth;
        model.scale.set(scale);

        model.x = (width - model.width) / 2;
        model.y = 8;

        app.stage.addChild(model);
        setIsLoaded(true);
        setLoadError(null);

        // Interactive hit areas
        model.interactive = true;
        model.on("hit", (hitAreas: string[]) => {
          if (hitAreas.includes("head") || hitAreas.includes("D_REF.HEAD")) {
            onTapArea?.("head");
            try {
              model.motion("flick_head");
            } catch {}
          } else if (hitAreas.includes("mouth") || hitAreas.includes("D_REF.MOUTH")) {
            onTapArea?.("face");
            try {
              model.motion("tap_body");
            } catch {}
          } else {
            onTapArea?.("body");
            try {
              model.motion("tap_body");
            } catch {}
          }
        });
      } catch (err: any) {
        console.warn("[Live2D] Failed to load Live2D model:", err);
        if (!isCancelled) {
          setLoadError(err.message || "模型加载失败");
        }
      }
    }

    initLive2D();

    return () => {
      isCancelled = true;
      if (modelRef.current) {
        try {
          modelRef.current.destroy();
        } catch {}
        modelRef.current = null;
      }
      if (appRef.current) {
        const app = appRef.current;
        appRef.current = null;
        try {
          app.destroy(true, { children: true });
        } catch {}
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [modelPath, width, height]);

  // Expression updates
  useEffect(() => {
    if (!modelRef.current || !isLoaded) return;
    try {
      if (expression === "blush" || expression === "shy") {
        modelRef.current.expression("f02");
      } else if (expression === "pout") {
        modelRef.current.expression("f03");
      } else if (expression === "surprised") {
        modelRef.current.expression("f04");
      } else {
        modelRef.current.expression("f01");
      }
    } catch {}
  }, [expression, isLoaded]);

  // Pointer move gaze tracking
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!modelRef.current || !isLoaded || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - (rect.left + rect.width / 2);
      const y = e.clientY - (rect.top + rect.height / 2);
      modelRef.current.focus(x, y);
    };

    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [isLoaded]);

  return (
    <div
      ref={containerRef}
      className={`live2d-container ${className}`}
      style={{ width: `${width}px`, height: `${height}px`, position: "relative" }}
    >
      {loadError && (
        <div className="live2d-fallback-msg">
          <span>{loadError}</span>
        </div>
      )}
    </div>
  );
}
