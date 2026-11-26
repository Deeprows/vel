import React, { useMemo } from 'react';
import { RacerTelemetry } from '../game/types';

interface MinimapProps {
  trackPoints: { x: number; y: number }[];
  racers: RacerTelemetry[];
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export const Minimap: React.FC<MinimapProps> = ({ trackPoints, racers }) => {
  const pathD = useMemo(() => {
    if (trackPoints.length === 0) return '';
    return (
      trackPoints
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(' ') + ' Z'
    );
  }, [trackPoints]);

  // Project each racer's progress onto the minimap loop cleanly
  const racerDots = useMemo(() => {
    if (trackPoints.length === 0) return [];
    return racers.map((r) => {
      const idx = Math.floor((((r.trackProgress % 1) + 1) % 1) * trackPoints.length) % trackPoints.length;
      const pt = trackPoints[idx] ?? { x: 50, y: 50 };
      return {
        id: r.id,
        isPlayer: r.isPlayer,
        x: pt.x,
        y: pt.y,
      };
    });
  }, [racers, trackPoints]);

  return (
    <div className="w-20 h-20 sm:w-28 sm:h-28 bg-[#080B12]/82 border border-white/12 rounded-xl p-1.5 pointer-events-none">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {/* Track Shadow */}
        <path
          d={pathD}
          fill="none"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="7"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Track Core */}
        <path
          d={pathD}
          fill="none"
          stroke="#475569"
          strokeWidth="3.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Start Line Tick */}
        {trackPoints[0] && (
          <circle cx={trackPoints[0].x} cy={trackPoints[0].y} r="3" fill="#F8FAFC" />
        )}
        {/* Rival Dots */}
        {racerDots
          .filter((d) => !d.isPlayer)
          .map((d) => (
            <circle
              key={d.id}
              cx={d.x}
              cy={d.y}
              r="3.2"
              fill="#EF4444"
              stroke="#080B12"
              strokeWidth="1"
            />
          ))}
        {/* Player Marker */}
        {racerDots
          .filter((d) => d.isPlayer)
          .map((d) => (
            <circle
              key={d.id}
              cx={d.x}
              cy={d.y}
              r="4.5"
              fill="#F59E0B"
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
          ))}
      </svg>
    </div>
  );
};
