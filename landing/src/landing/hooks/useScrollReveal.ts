import { useEffect, useRef } from 'react';

export function useScrollReveal(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        el.classList.add('reveal-in');
        io.disconnect();
      }
    }, { threshold: 0.12, ...options });
    io.observe(el);
    return () => io.disconnect();
  }, [options]);

  return ref;
}
