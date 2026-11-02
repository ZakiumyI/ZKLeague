import { useEffect } from "react";

const EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"];

// Llama a onIdle tras `minutes` sin actividad. También bloquea si la pestaña
// estuvo oculta más tiempo que ese límite.
export function useIdleLock(active, onIdle, minutes = 10) {
  useEffect(() => {
    if (!active) return;
    const limit = minutes * 60 * 1000;
    let last = Date.now();
    const touch = () => (last = Date.now());
    const check = () => {
      if (Date.now() - last >= limit) onIdle();
    };

    EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    document.addEventListener("visibilitychange", check);
    const timer = setInterval(check, 15_000);

    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener("visibilitychange", check);
      clearInterval(timer);
    };
  }, [active, onIdle, minutes]);
}
