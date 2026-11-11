import confetti from 'canvas-confetti';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq: number, at: number, dur: number, gain = 0.06) {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, a.currentTime + at);
  o.frequency.exponentialRampToValueAtTime(freq * 1.5, a.currentTime + at + dur);
  g.gain.setValueAtTime(0, a.currentTime + at);
  g.gain.linearRampToValueAtTime(gain, a.currentTime + at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + at + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + at);
  o.stop(a.currentTime + at + dur + 0.02);
}

/** "plim" curto de tarefa concluída. */
export function tick() {
  blip(880, 0, 0.12);
  blip(1320, 0.07, 0.16, 0.045);
  navigator.vibrate?.(12);
}

export function chime() {
  blip(660, 0, 0.18);
  blip(990, 0.1, 0.2);
  blip(1320, 0.2, 0.3, 0.05);
  navigator.vibrate?.([10, 40, 18]);
}

const PALETTE = ['#ff5b36', '#ffd9c4', '#d4d4dc', '#ff6a3d', '#ffffff', '#ffa36b'];

export function celebrate(size: 'small' | 'big' = 'small', origin?: { x: number; y: number }) {
  if (size === 'small') {
    confetti({
      particleCount: 40,
      spread: 60,
      startVelocity: 28,
      scalar: 0.8,
      ticks: 120,
      origin: origin ?? { x: 0.5, y: 0.6 },
      colors: PALETTE,
      disableForReducedMotion: true,
    });
    return;
  }
  const end = Date.now() + 900;
  const frame = () => {
    confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors: PALETTE, disableForReducedMotion: true });
    confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors: PALETTE, disableForReducedMotion: true });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}
