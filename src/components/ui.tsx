import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { Check as CheckIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" aria-hidden>
      {[0, 60, 120].map((r) => (
        <rect key={r} x="13.2" y="2" width="5.6" height="28" transform={`rotate(${r} 16 16)`} />
      ))}
    </svg>
  );
}

export function CountUp({ value, decimals = 0, suffix = '' }: { value: number; decimals?: number; suffix?: string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`);
  useEffect(() => {
    const c = animate(mv, value, { duration: 1, ease: [0.22, 1, 0.36, 1] });
    return c.stop;
  }, [value, mv]);
  return <motion.span className="tnum">{text}</motion.span>;
}

export function Check({
  on,
  color,
  onToggle,
  size,
  label,
}: {
  on: boolean;
  color: string;
  onToggle: () => void;
  size?: 'lg';
  label?: string;
}) {
  const [pop, setPop] = useState(false);
  const [local, setLocal] = useState(on);
  useEffect(() => setLocal(on), [on]);
  return (
    <button
      type="button"
      aria-label={label ?? (on ? 'Desmarcar' : 'Concluir')}
      className={`check ${size ?? ''} ${local ? 'on' : ''} ${pop ? 'pop' : ''}`}
      style={{ ['--pc' as string]: color }}
      onClick={(e) => {
        e.stopPropagation();
        if (!local) {
          setLocal(true);
          setPop(true);
          setTimeout(() => {
            setPop(false);
            onToggle();
          }, 320);
        } else {
          setLocal(false);
          onToggle();
        }
      }}
    >
      <CheckIcon size={size === 'lg' ? 14 : 12} strokeWidth={3.4} />
      <span className="burst" />
    </button>
  );
}

/** Popover em portal, ancorado num elemento, com clique-fora e Esc. */
export function Popover({
  anchor,
  open,
  onClose,
  children,
  width,
}: {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const el = ref.current;
      const h = el?.offsetHeight ?? 300;
      const w = el?.offsetWidth ?? width ?? 260;
      let top = r.bottom + 6;
      if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
      let left = r.left;
      if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
      setPos({ top, left });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
    };
  }, [open, anchor, width]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor?.contains(e.target as Node)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', down);
    window.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key, true);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return createPortal(
    <motion.div
      ref={ref}
      className="popover"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, position: 'fixed', width }}
      initial={{ opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.16 }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </motion.div>,
    document.body,
  );
}

export function useAnchor<T extends HTMLElement = HTMLButtonElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [open, setOpen] = useState(false);
  return { ref: setEl, el, open, setOpen, toggle: () => setOpen((o) => !o), close: () => setOpen(false) };
}

/** Brilho que segue o mouse dentro de um card. */
export function useShine() {
  return {
    onMouseMove: (e: React.MouseEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      e.currentTarget.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    },
  };
}

export const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
};

export function stagger(i: number) {
  return { ...fadeUp, transition: { ...fadeUp.transition, delay: 0.04 * i } };
}
