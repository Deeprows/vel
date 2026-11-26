import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Flame, Disc } from 'lucide-react';
import { ControlScheme } from '../game/types';

export interface TouchInputValues {
  left: boolean;
  right: boolean;
  gas: boolean;
  brake: boolean;
  handbrake: boolean;
  nos: boolean;
}

interface TouchControlsProps {
  controlScheme: ControlScheme;
  nosAmount: number;
  tiltAngleDeg: number;
  onChange: (values: TouchInputValues) => void;
  onFirstTouch: () => void;
}

type ControlKey = keyof TouchInputValues;

export const TouchControls: React.FC<TouchControlsProps> = ({
  controlScheme,
  nosAmount,
  tiltAngleDeg,
  onChange,
  onFirstTouch,
}) => {
  const activePointers = useRef<Map<number, ControlKey>>(new Map());
  const [pressed, setPressed] = useState<TouchInputValues>({
    left: false,
    right: false,
    gas: false,
    brake: false,
    handbrake: false,
    nos: false,
  });

  const syncFromPointers = () => {
    const next: TouchInputValues = {
      left: false,
      right: false,
      gas: false,
      brake: false,
      handbrake: false,
      nos: false,
    };
    for (const key of activePointers.current.values()) {
      next[key] = true;
    }
    setPressed(next);
    onChange(next);
  };

  const handleDown = (key: ControlKey) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    onFirstTouch();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore on unsupported synthetic events
    }
    activePointers.current.set(e.pointerId, key);
    syncFromPointers();
  };

  const handleUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    activePointers.current.delete(e.pointerId);
    syncFromPointers();
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex items-end justify-between px-2.5 pb-3 sm:px-6 sm:pb-5">
      {/* Left Thumb Zone: Steering Paddles or Tilt Indicator */}
      <div className="pointer-events-auto flex items-center gap-2 sm:gap-3">
        {controlScheme === 'buttons' ? (
          <>
            <button
              type="button"
              aria-label="Steer Left"
              onPointerDown={handleDown('left')}
              onPointerUp={handleUp}
              onPointerCancel={handleUp}
              onContextMenu={(e) => e.preventDefault()}
              className={`touch-control w-14 h-16 sm:w-20 sm:h-20 rounded-2xl border flex items-center justify-center transition-transform duration-75 ${
                pressed.left
                  ? 'bg-amber-500/35 border-amber-400 text-amber-200 scale-95'
                  : 'bg-[#0B0F19]/80 border-white/15 text-slate-200'
              }`}
            >
              <ChevronLeft className="w-7 h-7 sm:w-8 sm:h-8" />
            </button>
            <button
              type="button"
              aria-label="Steer Right"
              onPointerDown={handleDown('right')}
              onPointerUp={handleUp}
              onPointerCancel={handleUp}
              onContextMenu={(e) => e.preventDefault()}
              className={`touch-control w-14 h-16 sm:w-20 sm:h-20 rounded-2xl border flex items-center justify-center transition-transform duration-75 ${
                pressed.right
                  ? 'bg-amber-500/35 border-amber-400 text-amber-200 scale-95'
                  : 'bg-[#0B0F19]/80 border-white/15 text-slate-200'
              }`}
            >
              <ChevronRight className="w-7 h-7 sm:w-8 sm:h-8" />
            </button>
          </>
        ) : (
          <div className="bg-[#0B0F19]/80 border border-white/12 rounded-xl px-3.5 py-2.5 flex flex-col items-center gap-1 min-w-[116px]">
            <span className="text-[11px] font-medium text-slate-300">Tilt Steer</span>
            <div className="w-24 h-2 bg-slate-800 rounded-sm relative overflow-hidden">
              <div
                className="absolute top-0 bottom-0 w-3 bg-amber-400 rounded-sm"
                style={{
                  left: `calc(${Math.max(8, Math.min(92, 50 + (tiltAngleDeg / 35) * 42))}% - 6px)`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Right Thumb Zone: Drift + NOS + Brake/Reverse + Gas */}
      <div className="pointer-events-auto flex items-end gap-1.5 sm:gap-3">
        <div className="flex flex-col gap-1.5 sm:gap-2">
          <button
            type="button"
            aria-label="Nitrous Boost"
            onPointerDown={handleDown('nos')}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            onContextMenu={(e) => e.preventDefault()}
            className={`touch-control h-11 sm:h-12 min-w-[60px] sm:min-w-[68px] px-2.5 sm:px-3 rounded-xl border flex items-center justify-center gap-1 text-xs font-bold tracking-wide transition-transform duration-75 ${
              pressed.nos && nosAmount > 2
                ? 'bg-cyan-500/40 border-cyan-300 text-cyan-100 scale-95'
                : nosAmount > 10
                  ? 'bg-[#0B0F19]/85 border-cyan-500/45 text-cyan-300'
                  : 'bg-[#0B0F19]/65 border-white/10 text-slate-500'
            }`}
          >
            <Flame className="w-4 h-4" />
            <span>NOS</span>
          </button>

          <button
            type="button"
            aria-label="Handbrake Drift"
            onPointerDown={handleDown('handbrake')}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            onContextMenu={(e) => e.preventDefault()}
            className={`touch-control h-11 sm:h-12 min-w-[60px] sm:min-w-[68px] px-2.5 sm:px-3 rounded-xl border flex items-center justify-center gap-1 text-xs font-bold tracking-wide transition-transform duration-75 ${
              pressed.handbrake
                ? 'bg-amber-500/40 border-amber-300 text-amber-100 scale-95'
                : 'bg-[#0B0F19]/85 border-white/15 text-slate-200'
            }`}
          >
            <Disc className="w-4 h-4" />
            <span>Drift</span>
          </button>
        </div>

        <button
          type="button"
          aria-label="Brake or Reverse"
          onPointerDown={handleDown('brake')}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          onContextMenu={(e) => e.preventDefault()}
          className={`touch-control w-12 h-20 sm:w-16 sm:h-24 rounded-2xl border flex flex-col items-center justify-center gap-1 text-xs font-bold transition-transform duration-75 ${
            pressed.brake
              ? 'bg-red-600/45 border-red-400 text-white scale-95'
              : 'bg-[#0B0F19]/85 border-red-500/35 text-red-300'
          }`}
        >
          <span className="text-[11px]">Brake</span>
        </button>

        <button
          type="button"
          aria-label="Accelerate"
          onPointerDown={handleDown('gas')}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          onContextMenu={(e) => e.preventDefault()}
          className={`touch-control w-14 h-24 sm:w-20 sm:h-28 rounded-2xl border flex flex-col items-center justify-center gap-1 text-xs font-bold transition-transform duration-75 ${
            pressed.gas
              ? 'bg-amber-500/45 border-amber-300 text-white scale-95'
              : 'bg-[#0B0F19]/85 border-amber-500/50 text-amber-300'
          }`}
        >
          <span className="text-sm font-display">GAS</span>
        </button>
      </div>
    </div>
  );
};
