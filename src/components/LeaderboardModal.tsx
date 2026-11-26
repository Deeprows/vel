import React, { useCallback, useEffect, useState } from 'react';
import { Globe, HardDrive, RefreshCw, Trash2, Trophy, User, X } from 'lucide-react';
import { fetchGlobalLeaderboard } from '../game/auth';
import { clearTrackLeaderboard, getTrackLeaderboard } from '../game/leaderboard';
import { TRACKS } from '../game/track';
import { TrackId, TrackLeaderboard } from '../game/types';
import { formatShortDate, formatTimeMs } from '../utils/format';

interface LeaderboardModalProps {
  initialTrackId: TrackId;
  driverName: string;
  onDriverNameChange: (name: string) => void;
  onInspectUser?: (userId: string) => void;
  onClose: () => void;
}

type BoardCategory = 'laps' | 'drifts';
type BoardScope = 'global' | 'local';

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  initialTrackId,
  driverName,
  onDriverNameChange,
  onInspectUser,
  onClose,
}) => {
  const [trackId, setTrackId] = useState<TrackId>(initialTrackId);
  const [scope, setScope] = useState<BoardScope>('global');
  const [category, setCategory] = useState<BoardCategory>('laps');
  const [localBoard, setLocalBoard] = useState<TrackLeaderboard>(() =>
    getTrackLeaderboard(initialTrackId)
  );
  const [globalBoard, setGlobalBoard] = useState<TrackLeaderboard>({ topLaps: [], topDrifts: [] });
  const [loadingGlobal, setLoadingGlobal] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [nameInput, setNameInput] = useState(driverName);

  const loadGlobal = useCallback(async (tId: TrackId) => {
    setLoadingGlobal(true);
    const data = await fetchGlobalLeaderboard(tId);
    setGlobalBoard(data);
    setLoadingGlobal(false);
  }, []);

  useEffect(() => {
    setLocalBoard(getTrackLeaderboard(trackId));
    setConfirmClear(false);
    loadGlobal(trackId);
  }, [trackId, loadGlobal]);

  const activeTrack = TRACKS.find((t) => t.id === trackId) ?? TRACKS[0];
  const activeBoard = scope === 'global' ? globalBoard : localBoard;
  const entries = category === 'laps' ? activeBoard.topLaps : activeBoard.topDrifts;

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    const empty = clearTrackLeaderboard(trackId);
    setLocalBoard(empty);
    setConfirmClear(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#080B12]/90 flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-slate-900 border border-white/12 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-6 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-amber-400 shrink-0">
              <Trophy className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg sm:text-xl font-bold text-white truncate">
                Track Leaderboards
              </h2>
              <p className="text-xs text-slate-400 truncate">
                {activeTrack.name} · {activeTrack.location} · {activeTrack.lengthLabel}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close leaderboard"
            className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scope, Track Selector & Category Switch */}
        <div className="px-4 py-3 sm:px-6 border-b border-white/10 flex flex-col gap-2.5 bg-slate-950/40">
          {/* Global vs Local Toggle */}
          <div className="flex items-center justify-between gap-2">
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900 rounded-xl border border-white/8 flex-1">
              <button
                type="button"
                onClick={() => setScope('global')}
                className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  scope === 'global'
                    ? 'bg-cyan-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Global Online</span>
              </button>
              <button
                type="button"
                onClick={() => setScope('local')}
                className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  scope === 'local'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>This Device</span>
              </button>
            </div>

            {scope === 'global' && (
              <button
                type="button"
                onClick={() => loadGlobal(trackId)}
                aria-label="Refresh global leaderboard"
                className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 flex items-center justify-center shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${loadingGlobal ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {TRACKS.map((t) => {
              const active = t.id === trackId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTrackId(t.id)}
                  className={`min-h-[42px] px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-colors truncate ${
                    active
                      ? 'bg-slate-800 border-amber-500/70 text-white'
                      : 'bg-slate-900/70 border-white/8 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.name.replace(' Circuit', '').replace(' Pass', '').replace(' Expressway', '')}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-white/8">
              <button
                type="button"
                onClick={() => setCategory('laps')}
                className={`min-h-[38px] px-3.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  category === 'laps'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Top Lap Times
              </button>
              <button
                type="button"
                onClick={() => setCategory('drifts')}
                className={`min-h-[38px] px-3.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  category === 'drifts'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                High Drift Scores
              </button>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-400">
              <span className="whitespace-nowrap">Driver</span>
              <input
                type="text"
                maxLength={18}
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  onDriverNameChange(e.target.value);
                }}
                placeholder="Driver"
                className="w-28 sm:w-32 min-h-[38px] px-2.5 py-1 rounded-lg bg-slate-950 border border-white/12 text-xs font-medium text-white focus:outline-none focus:border-amber-400"
              />
            </label>
          </div>
        </div>

        {/* Entries List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6">
          {entries.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-medium text-slate-300">
                No {category === 'laps' ? 'lap times' : 'drift scores'} recorded on {activeTrack.name} yet.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {scope === 'global'
                  ? 'Finish any race to post your run to the global leaderboard.'
                  : 'Complete a race or finish a Time Attack session to set the local benchmark.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/8">
              {entries.map((entry, idx) => {
                const canInspect = Boolean(entry.userId && onInspectUser);
                return (
                  <div
                    key={entry.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`font-telemetry w-7 text-sm font-bold shrink-0 ${
                          idx === 0
                            ? 'text-amber-400'
                            : idx === 1
                              ? 'text-slate-200'
                              : idx === 2
                                ? 'text-amber-600'
                                : 'text-slate-500'
                        }`}
                      >
                        #{idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          {canInspect ? (
                            <button
                              type="button"
                              onClick={() => onInspectUser?.(entry.userId!)}
                              className="text-sm font-semibold text-cyan-300 hover:text-amber-300 underline decoration-cyan-500/40 underline-offset-2 truncate flex items-center gap-1"
                            >
                              <User className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{entry.driverName}</span>
                              {entry.handle && (
                                <span className="font-telemetry text-[11px] text-slate-400 no-underline">
                                  @{entry.handle}
                                </span>
                              )}
                            </button>
                          ) : (
                            <div className="text-sm font-semibold text-white truncate">
                              {entry.driverName}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {entry.carName} · {entry.topSpeedKmh} km/h · {formatShortDate(entry.recordedAt)}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {category === 'laps' ? (
                        <>
                          <div className="font-telemetry text-sm sm:text-base font-bold text-cyan-400">
                            {formatTimeMs(entry.bestLapMs)}
                          </div>
                          {entry.driftScore > 0 && (
                            <div className="font-telemetry text-[11px] text-slate-500">
                              {entry.driftScore.toLocaleString()} drift
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="font-telemetry text-sm sm:text-base font-bold text-amber-400">
                            {entry.driftScore.toLocaleString()} pts
                          </div>
                          {entry.bestLapMs !== null && (
                            <div className="font-telemetry text-[11px] text-slate-500">
                              {formatTimeMs(entry.bestLapMs)}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 sm:px-6 border-t border-white/10 flex items-center justify-between gap-3 bg-slate-950/40">
          {scope === 'local' ? (
            <button
              type="button"
              onClick={handleClear}
              disabled={entries.length === 0 && !confirmClear}
              className={`min-h-[42px] px-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-colors ${
                confirmClear
                  ? 'bg-red-600/25 border-red-500/60 text-red-200'
                  : 'bg-slate-800/80 border-white/10 text-slate-300 hover:text-white disabled:opacity-40'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{confirmClear ? 'Tap again to clear track' : 'Clear Track Records'}</span>
            </button>
          ) : (
            <div className="text-[11px] text-slate-400 truncate">
              Tap any highlighted driver to open their profile &amp; request a race.
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs shrink-0"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

