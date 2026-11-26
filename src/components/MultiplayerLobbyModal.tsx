import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Globe,
  Play,
  RefreshCw,
  Share2,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import { CARS, PAINTS } from '../game/cars';
import { ConnectionStatus } from '../game/multiplayer';
import { TRACKS } from '../game/track';
import {
  LobbyRoomState,
  LobbyRoomSummary,
  NetworkInfo,
  RoomScope,
  TrackId,
} from '../game/types';

interface MultiplayerLobbyModalProps {
  scope: RoomScope;
  driverName: string;
  selectedTrackId: TrackId;
  connectionStatus: ConnectionStatus;
  pingMs: number | null;
  directPeerCount: number;
  room: LobbyRoomState | null;
  localPlayerId: string;
  availableRooms: LobbyRoomSummary[];
  networkInfo: NetworkInfo | null;
  errorMessage: string | null;
  onDriverNameChange: (name: string) => void;
  onRefreshRooms: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onLeaveRoom: () => void;
  onSelectRoomTrack: (trackId: TrackId) => void;
  onStartRace: () => void;
  onInspectUser?: (userId: string) => void;
  onClose: () => void;
}

export const MultiplayerLobbyModal: React.FC<MultiplayerLobbyModalProps> = ({
  scope,
  driverName,
  selectedTrackId,
  connectionStatus,
  pingMs,
  directPeerCount,
  room,
  localPlayerId,
  availableRooms,
  networkInfo,
  errorMessage,
  onDriverNameChange,
  onRefreshRooms,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onSelectRoomTrack,
  onStartRace,
  onInspectUser,
  onClose,
}) => {
  const [joinCode, setJoinCode] = useState('');
  const [copiedKey, setCopiedKey] = useState<'code' | 'link' | 'lan' | null>(null);

  useEffect(() => {
    if (room) return;
    onRefreshRooms();
    const timer = window.setInterval(onRefreshRooms, 3000);
    return () => window.clearInterval(timer);
  }, [room, scope, onRefreshRooms]);

  const isWifi = scope === 'wifi';
  const isHost = Boolean(room && room.hostId === localPlayerId);

  const inviteUrl = room
    ? `${window.location.origin}/?room=${encodeURIComponent(room.code)}&mode=${encodeURIComponent(room.scope)}`
    : '';

  const copyText = (text: string, key: 'code' | 'link' | 'lan') => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleNativeShare = async () => {
    if (!room || !navigator.share) return;
    try {
      await navigator.share({
        title: `Apex Velocity — ${isWifi ? 'Same Wi-Fi' : 'Online'} Race`,
        text: `Join my Apex Velocity race room (${room.code})!`,
        url: inviteUrl,
      });
    } catch {
      // Ignore cancelled share sheet
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#080B12]/90 flex items-center justify-center p-3 sm:p-5">
      <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto bg-slate-900 border border-white/12 rounded-2xl p-4 sm:p-6 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                isWifi
                  ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-400'
                  : 'bg-cyan-500/15 border-cyan-400/40 text-cyan-400'
              }`}
            >
              {isWifi ? <Wifi className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg sm:text-xl font-bold text-white truncate">
                {isWifi ? 'Same Wi-Fi Race Lobby' : 'User vs User Online'}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    connectionStatus === 'connected'
                      ? 'bg-emerald-400'
                      : connectionStatus === 'connecting'
                        ? 'bg-amber-400'
                        : 'bg-red-400'
                  }`}
                />
                <span>
                  {connectionStatus === 'connected'
                    ? pingMs !== null
                      ? `Connected · ${pingMs} ms`
                      : 'Connected'
                    : connectionStatus === 'connecting'
                      ? 'Connecting...'
                      : 'Disconnected'}
                </span>
                {isWifi && directPeerCount > 0 && (
                  <span className="text-emerald-400 font-semibold">
                    · Direct Wi-Fi P2P
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (room) onLeaveRoom();
              onClose();
            }}
            aria-label="Close multiplayer lobby"
            className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="bg-red-500/15 border border-red-400/40 rounded-xl px-3.5 py-2.5 text-xs font-medium text-red-200">
            {errorMessage}
          </div>
        )}

        {/* Not in a room yet: Create or Join */}
        {!room && (
          <div className="flex flex-col gap-4">
            {/* Driver Name */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-950/60 border border-white/8 rounded-xl p-3">
              <label
                htmlFor="mp-driver-name"
                className="text-xs font-semibold text-slate-300 shrink-0"
              >
                Your Driver Name
              </label>
              <input
                id="mp-driver-name"
                type="text"
                maxLength={18}
                value={driverName}
                onChange={(e) => onDriverNameChange(e.target.value)}
                placeholder="Street Racer"
                className="w-full sm:w-56 min-h-[40px] px-3 rounded-lg bg-slate-900 border border-white/15 text-sm text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Host / Join Split */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-950/65 border border-white/10 rounded-xl p-3.5 flex flex-col justify-between gap-3">
                <div>
                  <div className="text-sm font-display font-bold text-white">
                    {isWifi ? 'Host Wi-Fi Room' : 'Create Online Room'}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {isWifi
                      ? 'Automatically visible to players on your Wi-Fi network.'
                      : 'Generate a room code and invite up to 3 opponents.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onCreateRoom}
                  className="min-h-[46px] w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm transition-colors"
                >
                  Create Room
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (joinCode.trim().length >= 4) {
                    onJoinRoom(joinCode.trim().toUpperCase());
                  }
                }}
                className="bg-slate-950/65 border border-white/10 rounded-xl p-3.5 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="text-sm font-display font-bold text-white">
                    Join by Code
                  </div>
                  <input
                    type="text"
                    maxLength={8}
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="Enter 6-char code"
                    className="mt-2 w-full min-h-[40px] px-3 rounded-lg bg-slate-900 border border-white/15 font-telemetry text-sm tracking-widest text-white uppercase focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <button
                  type="submit"
                  disabled={joinCode.trim().length < 4}
                  className="min-h-[46px] w-full rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 disabled:opacity-40 border border-cyan-400/50 text-cyan-200 font-display font-bold text-sm transition-colors"
                >
                  Join Room
                </button>
              </form>
            </div>

            {/* Active Discovery List */}
            <div className="bg-slate-950/60 border border-white/8 rounded-xl p-3.5">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                  {isWifi ? (
                    <Wifi className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Users className="w-4 h-4 text-cyan-400" />
                  )}
                  <span>
                    {isWifi ? 'Nearby Rooms on Your Wi-Fi' : 'Open Online Rooms'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onRefreshRooms}
                  className="min-h-[34px] px-2.5 rounded-lg bg-slate-800 border border-white/10 text-xs text-slate-300 hover:text-white flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Scan</span>
                </button>
              </div>

              {availableRooms.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center">
                  {isWifi
                    ? 'No Wi-Fi rooms detected yet. Tap Create Room on one device and it will appear here on all devices using the same Wi-Fi.'
                    : 'No open public rooms right now. Create a room or enter a friend’s room code.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {availableRooms.map((r) => {
                    const track = TRACKS.find((t) => t.id === r.trackId);
                    return (
                      <div
                        key={r.code}
                        className="bg-slate-900/90 border border-white/10 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-telemetry text-sm font-bold text-amber-400">
                              {r.code}
                            </span>
                            <span className="text-xs font-semibold text-white truncate">
                              {r.hostName}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {track?.name ?? r.trackId} · {r.playerCount}/{r.maxPlayers} racers
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onJoinRoom(r.code)}
                          className="min-h-[40px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs shrink-0"
                        >
                          Join
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Same Wi-Fi Local LAN URL helper */}
            {isWifi && networkInfo && networkInfo.lanUrls.length > 0 && (
              <div className="bg-emerald-950/25 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-emerald-300">
                    Local Wi-Fi Address
                  </div>
                  <div className="font-telemetry text-xs text-slate-200 truncate">
                    {networkInfo.lanUrls[0]}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copyText(networkInfo.lanUrls[0], 'lan')}
                  className="min-h-[36px] px-3 rounded-lg bg-slate-800 border border-white/10 text-xs text-slate-200 flex items-center gap-1.5 shrink-0"
                >
                  {copiedKey === 'lan' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedKey === 'lan' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Inside an Active Room */}
        {room && (
          <div className="flex flex-col gap-4">
            {/* Room Code & Share Bar */}
            <div className="bg-slate-950/75 border border-white/10 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] text-slate-400">
                  {room.scope === 'wifi' ? 'Wi-Fi Room Code' : 'Online Room Code'}
                </div>
                <div className="font-telemetry text-2xl font-bold tracking-widest text-amber-400">
                  {room.code}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyText(room.code, 'code')}
                  className="min-h-[40px] px-3 rounded-xl bg-slate-800 border border-white/10 text-xs font-semibold text-slate-200 flex items-center gap-1.5"
                >
                  {copiedKey === 'code' ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  <span>{copiedKey === 'code' ? 'Copied' : 'Code'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => copyText(inviteUrl, 'link')}
                  className="min-h-[40px] px-3 rounded-xl bg-slate-800 border border-white/10 text-xs font-semibold text-slate-200 flex items-center gap-1.5"
                >
                  {copiedKey === 'link' ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  <span>{copiedKey === 'link' ? 'Copied' : 'Link'}</span>
                </button>

                {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    aria-label="Share room link"
                    className="min-h-[40px] px-3 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-xs font-semibold text-cyan-200 flex items-center gap-1.5"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Share</span>
                  </button>
                )}
              </div>
            </div>

            {/* Track Selection in Room */}
            <div className="bg-slate-950/60 border border-white/8 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300">Circuit Track</span>
                {!isHost && (
                  <span className="text-[11px] text-slate-400">Selected by Host</span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {TRACKS.map((trk) => {
                  const active = (room.trackId ?? selectedTrackId) === trk.id;
                  return (
                    <button
                      key={trk.id}
                      type="button"
                      disabled={!isHost}
                      onClick={() => onSelectRoomTrack(trk.id)}
                      className={`min-h-[44px] px-2.5 py-2 rounded-xl border text-left transition-colors ${
                        active
                          ? 'bg-slate-800 border-amber-400 text-white'
                          : 'bg-slate-900/60 border-white/8 text-slate-400'
                      } ${!isHost ? 'cursor-default' : 'hover:border-white/25'}`}
                    >
                      <div className="text-xs font-bold truncate">{trk.name.split(' ')[0]} {trk.name.split(' ')[1]}</div>
                      <div className="text-[10px] text-slate-400 truncate">{trk.lengthLabel}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Connected Racers */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-300">
                Starting Grid ({room.players.length}/4 Racers)
              </div>
              {room.players.map((p, idx) => {
                const car = CARS.find((c) => c.id === p.carId);
                const paint = PAINTS.find((pt) => pt.id === p.paintId);
                const isSelf = p.id === localPlayerId;
                const canInspect = Boolean(!isSelf && p.userId && onInspectUser);
                return (
                  <div
                    key={p.id}
                    className={`rounded-xl px-3.5 py-2.5 border flex items-center justify-between gap-3 ${
                      isSelf
                        ? 'bg-slate-800/85 border-amber-500/50'
                        : 'bg-slate-950/65 border-white/8'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-telemetry text-xs text-slate-400 w-5">
                        P{idx + 1}
                      </span>
                      <span
                        className="w-4 h-4 rounded-sm border border-white/30 shrink-0"
                        style={{ backgroundColor: paint?.hex ?? '#F59E0B' }}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                          {canInspect ? (
                            <button
                              type="button"
                              onClick={() => onInspectUser?.(p.userId!)}
                              className="text-cyan-300 hover:text-amber-300 underline decoration-cyan-500/40 underline-offset-2 truncate"
                            >
                              {p.name}
                            </button>
                          ) : (
                            <span className="truncate">{p.name}</span>
                          )}
                          {p.handle && (
                            <span className="font-telemetry text-[11px] font-normal text-slate-400">
                              @{p.handle}
                            </span>
                          )}
                          {isSelf && <span className="text-xs text-amber-400">(You)</span>}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {car?.name ?? p.carId} · {paint?.name ?? p.paintId}
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-400 shrink-0">
                      {p.isHost ? 'Host' : 'Ready'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={onLeaveRoom}
                className="min-h-[48px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 font-semibold text-sm"
              >
                Leave
              </button>

              {isHost ? (
                <button
                  type="button"
                  disabled={room.players.length < 2}
                  onClick={onStartRace}
                  className="flex-1 min-h-[48px] rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-400 text-slate-950 font-display font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <Play className="w-4 h-4" />
                  <span>
                    {room.players.length < 2
                      ? 'Waiting for 2nd Racer...'
                      : `Start 3-Lap Race (${room.players.length} Players)`}
                  </span>
                </button>
              ) : (
                <div className="flex-1 min-h-[48px] rounded-xl bg-slate-800/80 border border-white/10 text-cyan-300 font-semibold text-sm flex items-center justify-center">
                  Waiting for host to start race...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
