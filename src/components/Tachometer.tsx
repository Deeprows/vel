import React from 'react';

interface TachometerProps {
  speedKmh: number;
  rpm: number;
  redlineRpm: number;
  gear: number;
  nos: number;
  isNosActive: boolean;
}

export const Tachometer: React.FC<TachometerProps> = ({
  speedKmh,
  rpm,
  redlineRpm,
  gear,
  nos,
  isNosActive,
}) => {
  const rpmRatio = Math.min(1, Math.max(0, rpm / redlineRpm));
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  // 240 degree arc
  const arcFraction = 240 / 360;
  const maxDash = circumference * arcFraction;
  const activeDash = maxDash * rpmRatio;
  const isRedline = rpmRatio > 0.86;

  return (
    <div className="pointer-events-none select-none flex flex-col items-center">
      <div className="relative w-36 h-32 sm:w-44 sm:h-38 flex items-center justify-center">
        <svg viewBox="0 0 140 130" className="w-full h-full overflow-visible">
          {/* Background dark gauge plate */}
          <circle
            cx="70"
            cy="70"
            r="60"
            fill="rgba(8, 11, 18, 0.82)"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="1.5"
          />

          {/* Base track arc */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="rgba(148, 163, 184, 0.2)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${maxDash} ${circumference}`}
            transform="rotate(150 70 70)"
          />

          {/* Redline danger zone marker */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="rgba(239, 68, 68, 0.45)"
            strokeWidth="7"
            strokeDasharray={`${maxDash * 0.16} ${circumference}`}
            strokeDashoffset={-maxDash * 0.84}
            transform="rotate(150 70 70)"
          />

          {/* Active RPM arc */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke={isRedline ? '#EF4444' : isNosActive ? '#06B6D4' : '#F59E0B'}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${activeDash} ${circumference}`}
            transform="rotate(150 70 70)"
          />
        </svg>

        {/* Center Speed & Gear Readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-3">
          <div className="flex items-baseline gap-1">
            <span className="font-telemetry text-3xl sm:text-4xl font-bold tracking-tight text-white leading-none">
              {speedKmh}
            </span>
          </div>
          <span className="text-[10px] font-medium tracking-wider text-slate-400 mt-0.5">
            KM/H
          </span>

          <div className="mt-1.5 flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">Gear</span>
            <span
              className={`font-telemetry font-bold text-sm px-1.5 py-0.5 rounded bg-slate-800/90 border border-white/10 ${
                isRedline ? 'text-red-400' : 'text-amber-400'
              }`}
            >
              {gear === 0 ? 'R' : gear}
            </span>
          </div>
        </div>
      </div>

      {/* Nitrous Bar */}
      <div className="w-32 sm:w-40 -mt-1 bg-[#080B12]/88 border border-white/10 rounded-lg px-2.5 py-1.5">
        <div className="flex items-center justify-between text-[10px] font-semibold tracking-wide mb-1">
          <span className={isNosActive ? 'text-cyan-300' : 'text-slate-300'}>Nitrous</span>
          <span className="font-telemetry text-cyan-400">{nos}%</span>
        </div>
        <div className="h-1.5 w-full bg-slate-800 rounded-sm overflow-hidden">
          <div
            className="h-full transition-all duration-75"
            style={{
              width: `${nos}%`,
              backgroundColor: isNosActive ? '#38BDF8' : '#06B6D4',
            }}
          />
        </div>
      </div>
    </div>
  );
};
