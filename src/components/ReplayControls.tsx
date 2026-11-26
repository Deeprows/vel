import React from 'react';
import { Camera, Pause, Play, RotateCcw, Volume2, VolumeX, ArrowLeft } from 'lucide-react';
import { CameraMode } from '../game/types';
import { formatTimeMs } from '../utils/format';

interface ReplayControlsProps {
  currentMs: number;
  durationMs: number;
  paused: boolean;
  speed: 0.5 | 1 | 2;
  cameraMode: CameraMode;
  muted: boolean;
  trackName: string;
  carName: string;
  speedKmh: number;
  gear: number;
  onTogglePause: () => void;
  onSeek: (timeMs: number) => void;
  onChangeSpeed: (speed: 0.5 | 1 | 2) => void;
  onCycleCamera: () => void;
  onToggleMute: () => void;
  onRestartFromStart: () => void;
  onExit: () => void;
}

export const ReplayControls: React.FC<ReplayControlsProps> = ({
  currentMs,
  durationMs,
  paused,
  speed,
  cameraMode,
  muted,
  trackName,
  carName,
  speedKmh,
  gear,
  onTogglePause,
  onSeek,
  onChangeSpeed,
  onCycleCamera,
  onToggleMute,
  onRestartFromStart,
  onExit,
}) => {
  const speeds: (0.5 | 1 | 2)[] = [0.5, 1, 2];

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex flex-col justify-between p-3 sm:p-5">
      {/* Top Bar: Replay Context + Telemetry + Exit */}
      <div className="flex items-start justify-between gap-3">
        <div className="pointer-events-auto bg-[#080B12]/88 border border-white/12 rounded-xl px-3.5 py-2 flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onExit}
            className="min-h-[40px] px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Results</span>
          </button>
          <div className="min-w-0">
            <div className="font-display text-sm font-bold text-amber-400 truncate">
              Race Replay
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {trackName} · {carName}
            </div>
          </div>
        </div>

        {/* Compact Telemetry Strip */}
        <div className="pointer-events-none bg-[#080B12]/88 border border-white/12 rounded-xl px-3.5 py-2 flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="font-telemetry text-lg sm:text-xl font-bold text-white leading-none">
              {speedKmh}
            </div>
            <div className="text-[10px] text-slate-400">KM/H</div>
          </div>
          <div className="border-l border-white/10 pl-3 text-center">
            <div className="font-telemetry text-sm font-bold text-amber-400 leading-none">
              {gear === 0 ? 'R' : gear}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Gear</div>
          </div>
        </div>
      </div>

      {/* Bottom Playback Scrubber Dock */}
      <div className="pointer-events-auto mx-auto w-full max-w-2xl bg-[#080B12]/90 border border-white/12 rounded-2xl p-3 sm:p-4 shadow-2xl flex flex-col gap-3">
        {/* Timeline Scrubber */}
        <div className="flex items-center gap-3">
          <span className="font-telemetry text-xs text-slate-200 w-16 shrink-0">
            {formatTimeMs(currentMs)}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(100, Math.round(durationMs))}
            value={Math.min(durationMs, Math.round(currentMs))}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label="Replay timeline scrubber"
            className="flex-1 accent-amber-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
          />
          <span className="font-telemetry text-xs text-slate-400 w-16 text-right shrink-0">
            {formatTimeMs(durationMs)}
          </span>
        </div>

        {/* Transport & Camera Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onTogglePause}
              aria-label={paused ? 'Play replay' : 'Pause replay'}
              className="min-h-[44px] min-w-[44px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs flex items-center justify-center gap-1.5"
            >
              {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              <span>{paused ? 'Play' : 'Pause'}</span>
            </button>

            <button
              type="button"
              onClick={onRestartFromStart}
              aria-label="Restart replay from beginning"
              className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 flex items-center justify-center"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-white/8">
              {speeds.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChangeSpeed(s)}
                  className={`min-h-[36px] px-2.5 rounded-lg font-telemetry text-xs font-semibold transition-colors ${
                    speed === s
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCycleCamera}
              className="min-h-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 text-xs font-semibold flex items-center gap-1.5 capitalize whitespace-nowrap"
            >
              <Camera className="w-4 h-4" />
              <span>{cameraMode}</span>
            </button>

            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Unmute replay audio' : 'Mute replay audio'}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 flex items-center justify-center"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
