import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Flame, Disc } from 'lucide-react';
import { ControlScheme } from '../game/types';

export interface TouchInputValues {
  left: boolean;
  right: boolean;
  steer?: number;
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

type ControlKey = keyof Omit<TouchInputValues, 'steer'>;

export const TouchControls: React.FC<TouchControlsProps> = ({
  controlScheme,
  nosAmount,
  tiltAngleDeg,
  onChange,
  onFirstTouch,
}) => {
  const activePointers = useRef<Map<number, ControlKey>>(new Map());
  const [steerVal, setSteerVal] = useState(0);
  const currentAnalogSteer = useRef(0);
  const [pressed, setPressed] = useState<TouchInputValues>({
    left: false,
    right: false,
    steer: 0,
    gas: false,
    brake: false,
    handbrake: false,
    nos: false,
  });

  const syncFromPointers = () => {
    const next: TouchInputValues = {
      left: false,
      right: false,
      steer: currentAnalogSteer.current,
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

  const wheelRef = useRef<HTMLDivElement>(null);

  const handleWheelMove = (clientX: number) => {
    if (!wheelRef.current) return;
    const rect = wheelRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const rawVal = Math.max(-1, Math.min(1, (clientX - centerX) / (rect.width * 0.45)));
    setSteerVal(rawVal);

    // Progressive analog curve with comfortable center deadzone
    const deadzone = 0.08;
    let analog = 0;
    if (Math.abs(rawVal) > deadzone) {
      const norm = (Math.abs(rawVal) - deadzone) / (1 - deadzone);
      const curved = Math.pow(norm, 1.4) * 0.75;
      // In physics: positive is left (+), negative is right (-)
      analog = rawVal > 0 ? -curved : curved;
    }
    currentAnalogSteer.current = analog;

    const next: TouchInputValues = {
      ...pressed,
      left: rawVal < -0.15,
      right: rawVal > 0.15,
      steer: analog,
    };
    setPressed(next);
    onChange(next);
  };

  const handleWheelEnd = () => {
    setSteerVal(0);
    currentAnalogSteer.current = 0;
    const next: TouchInputValues = {
      ...pressed,
      left: false,
      right: false,
      steer: 0,
    };
    setPressed(next);
    onChange(next);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex items-end justify-between px-2.5 pb-3 sm:px-6 sm:pb-5">
      {/* Left Thumb Zone: Exact Virtual Steering Wheel matching reference image */}
      <div className="pointer-events-auto flex items-center">
        <div
          ref={wheelRef}
          onPointerDown={(e) => {
            e.preventDefault();
            onFirstTouch();
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {}
            handleWheelMove(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.buttons > 0 || e.pointerType === 'touch') {
              handleWheelMove(e.clientX);
            }
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            handleWheelEnd();
          }}
          onPointerCancel={(e) => {
            e.preventDefault();
            handleWheelEnd();
          }}
          className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-slate-950/75 border-3 border-slate-600/80 shadow-xl flex items-center justify-center select-none touch-none cursor-pointer"
        >
          <div
            className="absolute inset-1.5 rounded-full border-5 border-slate-300/90 flex items-center justify-center transition-transform duration-75 shadow-md"
            style={{ transform: `rotate(${steerVal * 80}deg)` }}
          >
            <div className="absolute w-2.5 h-10 bg-slate-400/90 rounded-sm top-2" />
            <div className="absolute w-10 h-2.5 bg-slate-400/90 rounded-sm left-2.5 bottom-4 -rotate-30" />
            <div className="absolute w-10 h-2.5 bg-slate-400/90 rounded-sm right-2.5 bottom-4 rotate-30" />
            <div className="w-9 h-9 rounded-full bg-slate-900 border-2 border-slate-500 shadow-inner flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-cyan-400 shadow-md" />
            </div>
          </div>
        </div>
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
