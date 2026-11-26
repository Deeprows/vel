import React, { useState } from 'react';
import {
  Flag,
  Globe,
  MapPin,
  Send,
  Trophy,
  UserCheck,
  Wifi,
  X,
} from 'lucide-react';
import { CARS, PAINTS } from '../game/cars';
import { TRACKS } from '../game/track';
import {
  AuthSession,
  PublicDriverProfile,
  RoomScope,
  TrackId,
} from '../game/types';
import { formatShortDate, formatTimeMs } from '../utils/format';

interface UserProfileModalProps {
  profile: PublicDriverProfile;
  session: AuthSession | null;
  defaultTrackId: TrackId;
  inviteFeedback: string | null;
  onRequestRace: (targetUserId: string, trackId: TrackId, scope: RoomScope) => void;
  onOpenSignIn: () => void;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  profile,
  session,
  defaultTrackId,
  inviteFeedback,
  onRequestRace,
  onOpenSignIn,
  onClose,
}) => {
  const [raceTrackId, setRaceTrackId] = useState<TrackId>(defaultTrackId);
  const [raceScope, setRaceScope] = useState<RoomScope>('online');

  const isSelf = session?.profile.userId === profile.userId;
  const favCar = CARS.find((c) => c.id === profile.favoriteCarId) ?? CARS[0];
  const favPaint = PAINTS.find((p) => p.id === profile.paintId) ?? PAINTS[0];

  const statusLabel = profile.isOnline
    ? profile.activity === 'racing'
      ? 'Currently Racing'
      : profile.activity === 'lobby'
        ? 'In Race Lobby'
        : 'Online in Garage'
    : 'Offline';

  return (
    <div className="fixed inset-0 z-50 bg-[#080B12]/90 flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-slate-900 border border-white/12 rounded-2xl shadow-2xl p-4 sm:p-6 flex flex-col gap-4">
        {/* Top Profile Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative shrink-0">
              <div
                className="w-14 h-14 rounded-2xl border border-white/25 flex items-center justify-center font-display text-lg font-bold text-white shadow-lg"
                style={{ backgroundColor: favPaint.hex }}
              >
                {profile.displayName.slice(0, 2).toUpperCase()}
              </div>
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
                  profile.isOnline ? 'bg-emerald-400' : 'bg-slate-600'
                }`}
              />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl font-bold text-white truncate">
                  {profile.displayName}
                </h2>
                {isSelf && (
                  <span className="text-[11px] font-semibold text-amber-400 shrink-0">(You)</span>
                )}
              </div>
              <div className="font-telemetry text-xs text-cyan-300 truncate">
                @{profile.handle}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 mt-1">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {profile.region}
                </span>
                <span>Joined {formatShortDate(profile.joinedAt)}</span>
                <span
                  className={`font-semibold ${
                    profile.isOnline ? 'text-emerald-400' : 'text-slate-500'
                  }`}
                >
                  · {statusLabel}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close user profile"
            className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Bio & Signature Car */}
        <div className="bg-slate-950/65 border border-white/8 rounded-xl p-3.5 space-y-2">
          <p className="text-xs text-slate-300 leading-relaxed">
            {profile.bio ? profile.bio : 'Street racer on Apex Velocity. Ready for circuit & drift battles.'}
          </p>
          <div className="pt-2 border-t border-white/8 flex items-center justify-between text-xs">
            <span className="text-slate-400">Signature Ride</span>
            <div className="flex items-center gap-2 font-semibold text-white">
              <span
                className="w-3.5 h-3.5 rounded-sm border border-white/30"
                style={{ backgroundColor: favPaint.hex }}
              />
              <span>{favCar.name}</span>
              <span className="text-slate-500">· {favPaint.name}</span>
            </div>
          </div>
        </div>

        {/* Driver Telemetry Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-slate-950/75 border border-white/8 rounded-xl p-3">
            <div className="text-[10px] text-slate-400">Races</div>
            <div className="font-telemetry text-base font-bold text-white mt-0.5">
              {profile.stats.racesCompleted}
            </div>
          </div>
          <div className="bg-slate-950/75 border border-white/8 rounded-xl p-3">
            <div className="text-[10px] text-slate-400">Wins</div>
            <div className="font-telemetry text-base font-bold text-amber-400 mt-0.5 flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5" />
              <span>{profile.stats.wins}</span>
            </div>
          </div>
          <div className="bg-slate-950/75 border border-white/8 rounded-xl p-3">
            <div className="text-[10px] text-slate-400">Best Lap</div>
            <div className="font-telemetry text-base font-bold text-cyan-400 mt-0.5">
              {formatTimeMs(profile.stats.bestLapMs)}
            </div>
          </div>
          <div className="bg-slate-950/75 border border-white/8 rounded-xl p-3">
            <div className="text-[10px] text-slate-400">Top Speed</div>
            <div className="font-telemetry text-base font-bold text-emerald-400 mt-0.5">
              {profile.stats.topSpeedKmh > 0 ? `${profile.stats.topSpeedKmh} km/h` : '--'}
            </div>
          </div>
        </div>

        {/* Request Race Section */}
        {!isSelf && (
          <div className="bg-slate-950/75 border border-cyan-500/25 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Flag className="w-4 h-4 text-amber-400" />
                <span>Request 1v1 Head-to-Head Race</span>
              </div>
              <span className="font-telemetry text-[11px] text-slate-400">
                Best Drift {profile.stats.bestDriftScore.toLocaleString()}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {TRACKS.map((trk) => (
                <button
                  key={trk.id}
                  type="button"
                  onClick={() => setRaceTrackId(trk.id)}
                  className={`min-h-[40px] px-2 rounded-lg border text-[11px] font-semibold truncate transition-colors ${
                    raceTrackId === trk.id
                      ? 'bg-slate-800 border-amber-400 text-white'
                      : 'bg-slate-900 border-white/8 text-slate-400 hover:text-white'
                  }`}
                >
                  {trk.name.replace(' Circuit', '').replace(' Pass', '').replace(' Expressway', '')}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRaceScope('online')}
                className={`min-h-[40px] px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                  raceScope === 'online'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                    : 'bg-slate-900 border-white/8 text-slate-400'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Online PvP</span>
              </button>
              <button
                type="button"
                onClick={() => setRaceScope('wifi')}
                className={`min-h-[40px] px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                  raceScope === 'wifi'
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                    : 'bg-slate-900 border-white/8 text-slate-400'
                }`}
              >
                <Wifi className="w-3.5 h-3.5" />
                <span>Same Wi-Fi</span>
              </button>
            </div>

            {inviteFeedback && (
              <div className="text-xs font-semibold text-cyan-300 bg-cyan-500/10 border border-cyan-400/30 rounded-lg px-3 py-2">
                {inviteFeedback}
              </div>
            )}

            {!session ? (
              <button
                type="button"
                onClick={onOpenSignIn}
                className="min-h-[46px] w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm flex items-center justify-center gap-2"
              >
                <UserCheck className="w-4 h-4" />
                <span>Sign In to Request Race</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={!profile.isOnline}
                onClick={() => onRequestRace(profile.userId, raceTrackId, raceScope)}
                className="min-h-[46px] w-full rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-display font-bold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Send className="w-4 h-4" />
                <span>
                  {profile.isOnline
                    ? `Request Race vs ${profile.displayName}`
                    : 'Driver Currently Offline'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
