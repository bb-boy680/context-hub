import { useEffect, type RefObject } from "react";

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const smooth = (t: number, from: number, to: number) => {
  const x = clamp01((t - from) / (to - from));
  return x * x * (3 - 2 * x);
};

export function useScrollProgress(ref: RefObject<HTMLElement | null>, apply: (p: number) => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const total = el.offsetHeight - window.innerHeight;
      const p = total > 0 ? clamp01(-el.getBoundingClientRect().top / total) : 0;
      apply(p);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [ref, apply]);
}
