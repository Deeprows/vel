import React, { useEffect, useState } from 'react';
import {
  Check,
  ChevronRight,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { defaultAuthConnector } from '../game/auth';
import { CARS, PAINTS } from '../game/cars';
import {
  AuthSession,
  CarId,
  PublicDriverProfile,
} from '../game/types';
import { formatShortDate, formatTimeMs } from '../utils/format';

interface AuthProfileModalProps {
  initialTab: 'account' | 'directory';
  session: AuthSession | null;
  selectedCarId: CarId;
  selectedPaintId: string;
  profiles: PublicDriverProfile[];
  onRefreshProfiles: () => void;
  onSessionChange: (session: AuthSession | null) => void;
  onInspectDriver: (profile: PublicDriverProfile) => void;
  onClose: () => void;
}

export const AuthProfileModal: React.FC<AuthProfileModalProps> = ({
  initialTab,
  session,
  selectedCarId,
  selectedPaintId,
  profiles,
  onRefreshProfiles,
  onSessionChange,
  onInspectDriver,
  onClose,
}) => {
  const [tab, setTab] = useState<'account' | 'directory'>(initialTab);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // Login / register fields
  const [handle, setHandle] = useState('');
  const [passcode, setPasscode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [region, setRegion] = useState('Global Street');
  const [bio, setBio] = useState('');

  // Profile edit fields
  const [editName, setEditName] = useState(session?.profile.displayName ?? '');
  const [editRegion, setEditRegion] = useState(session?.profile.region ?? 'Global Street');
  const [editBio, setEditBio] = useState(session?.profile.bio ?? '');
  const [editCarId, setEditCarId] = useState<CarId>(
    session?.profile.favoriteCarId ?? selectedCarId
  );

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (session) {
      setEditName(session.profile.displayName);
      setEditRegion(session.profile.region);
      setEditBio(session.profile.bio);
      setEditCarId(session.profile.favoriteCarId);
    }
  }, [session]);

  useEffect(() => {
    onRefreshProfiles();
  }, [onRefreshProfiles]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setBusy(true);
    try {
      const nextSession =
        authMode === 'login'
          ? await defaultAuthConnector.login({ handle, passcode })
          : await defaultAuthConnector.register({
              handle,
              passcode,
              displayName: displayName.trim() || handle.trim(),
              bio,
              region,
              favoriteCarId: selectedCarId,
              paintId: selectedPaintId,
            });
      onSessionChange(nextSession);
      setPasscode('');
      setSavedToast(authMode === 'login' ? 'Signed in' : 'Profile created');
      window.setTimeout(() => setSavedToast(null), 2200);
      onRefreshProfiles();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setErrorMsg(null);
    setBusy(true);
    try {
      const updated = await defaultAuthConnector.updateProfile(session.token, {
        displayName: editName,
        region: editRegion,
        bio: editBio,
        favoriteCarId: editCarId,
        paintId: selectedPaintId,
      });
      onSessionChange({ token: session.token, profile: updated });
      setSavedToast('Profile saved');
      window.setTimeout(() => setSavedToast(null), 2200);
      onRefreshProfiles();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save profile.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = () => {
    onSessionChange(null);
    setSavedToast(null);
    setErrorMsg(null);
  };

  const onlineCount = profiles.filter((p) => p.isOnline).length;

  return (
    <div className="fixed inset-0 z-50 bg-[#080B12]/90 flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-slate-900 border border-white/12 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-6 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/35 flex items-center justify-center text-cyan-300 shrink-0">
              {tab === 'directory' ? <Users className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg sm:text-xl font-bold text-white truncate">
                {tab === 'directory'
                  ? 'Drivers Directory'
                  : session
                    ? `${session.profile.displayName} (@${session.profile.handle})`
                    : 'Driver Sign In'}
              </h2>
              <p className="text-xs text-slate-400 truncate">
                {tab === 'directory'
                  ? `${onlineCount} online · Tap any driver to inspect profile & request a race`
                  : session
                    ? 'Online driver identity & career telemetry'
                    : 'Create or sign into a driver profile to challenge racers'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close driver profile modal"
            className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-navigation tabs */}
        <div className="px-4 py-2.5 sm:px-6 border-b border-white/10 bg-slate-950/50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-white/8">
            <button
              type="button"
              onClick={() => setTab('account')}
              className={`min-h-[38px] px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                tab === 'account'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>{session ? 'My Profile' : 'Sign In / Join'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('directory');
                onRefreshProfiles();
              }}
              className={`min-h-[38px] px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                tab === 'directory'
                  ? 'bg-cyan-400 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Drivers</span>
              <span
                className={`font-telemetry text-[10px] px-1.5 py-0.5 rounded ${
                  tab === 'directory'
                    ? 'bg-slate-950/20 text-slate-950'
                    : 'bg-cyan-500/20 text-cyan-300'
                }`}
              >
                {profiles.length}
              </span>
            </button>
          </div>

          {tab === 'directory' && (
            <button
              type="button"
              onClick={onRefreshProfiles}
              className="min-h-[38px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-semibold text-slate-200 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {errorMsg && (
            <div className="bg-red-500/15 border border-red-400/40 rounded-xl px-3.5 py-2.5 text-xs font-medium text-red-200">
              {errorMsg}
            </div>
          )}

          {savedToast && (
            <div className="bg-emerald-500/15 border border-emerald-400/40 rounded-xl px-3.5 py-2 text-xs font-semibold text-emerald-200 flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>{savedToast}</span>
            </div>
          )}

          {tab === 'account' && !session && (
            <div className="space-y-4">
              {/* Sign In / Register Switch */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setErrorMsg(null);
                  }}
                  className={`min-h-[44px] rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                    authMode === 'login'
                      ? 'bg-slate-800 border-amber-400 text-white'
                      : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setErrorMsg(null);
                  }}
                  className={`min-h-[44px] rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                    authMode === 'register'
                      ? 'bg-slate-800 border-cyan-400 text-white'
                      : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Create Account</span>
                </button>
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-300">
                      Driver Handle (min 3 letters/numbers)
                    </span>
                    <div className="mt-1 flex items-center rounded-xl bg-slate-950 border border-white/12 px-3 min-h-[44px] focus-within:border-amber-400">
                      <span className="text-slate-500 text-sm mr-1">@</span>
                      <input
                        type="text"
                        required
                        minLength={3}
                        maxLength={16}
                        value={handle}
                        onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                        placeholder="apex_driver"
                        className="w-full bg-transparent text-sm text-white focus:outline-none"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="text-xs font-semibold text-slate-300">
                      Passcode (min 4 characters)
                    </span>
                    <input
                      type="password"
                      required
                      minLength={4}
                      maxLength={48}
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder="••••••"
                      className="mt-1 w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-white/12 text-sm text-white focus:outline-none focus:border-amber-400"
                    />
                  </label>
                </div>

                {authMode === 'register' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block">
                        <span className="text-xs font-semibold text-slate-300">Display Name</span>
                        <input
                          type="text"
                          maxLength={18}
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Midnight King"
                          className="mt-1 w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-white/12 text-sm text-white focus:outline-none focus:border-cyan-400"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold text-slate-300">Region / Crew</span>
                        <input
                          type="text"
                          maxLength={24}
                          value={region}
                          onChange={(e) => setRegion(e.target.value)}
                          placeholder="Tokyo Bay"
                          className="mt-1 w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-white/12 text-sm text-white focus:outline-none focus:border-cyan-400"
                        />
                      </label>
                    </div>

                    <label className="block">
                      <span className="text-xs font-semibold text-slate-300">Driver Bio</span>
                      <input
                        type="text"
                        maxLength={90}
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Twin-turbo street tuner · Always down for midnight canyon runs"
                        className="mt-1 w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-white/12 text-sm text-white focus:outline-none focus:border-cyan-400"
                      />
                    </label>
                  </>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="min-h-[48px] w-full rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-display font-bold text-sm transition-colors"
                >
                  {busy
                    ? 'Connecting...'
                    : authMode === 'login'
                      ? 'Sign In as Driver'
                      : 'Create Driver Profile'}
                </button>
              </form>

              <div className="bg-slate-950/60 border border-white/8 rounded-xl p-3 flex items-start gap-2.5 text-[11px] text-slate-400 leading-relaxed">
                <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>
                  Accounts use the built-in driver profile connector (`src/game/auth.ts`), so you can test profiles, online presence, leaderboards, and race requests right now or swap in your own external login provider later.
                </span>
              </div>
            </div>
          )}

          {tab === 'account' && session && (
            <div className="space-y-4">
              {/* Career Telemetry Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-slate-950/75 border border-white/8 rounded-xl p-3">
                  <div className="text-[10px] text-slate-400">Races</div>
                  <div className="font-telemetry text-lg font-bold text-white mt-0.5">
                    {session.profile.stats.racesCompleted}
                  </div>
                </div>
                <div className="bg-slate-950/75 border border-white/8 rounded-xl p-3">
                  <div className="text-[10px] text-slate-400">Wins</div>
                  <div className="font-telemetry text-lg font-bold text-amber-400 mt-0.5">
                    {session.profile.stats.wins}
                  </div>
                </div>
                <div className="bg-slate-950/75 border border-white/8 rounded-xl p-3">
                  <div className="text-[10px] text-slate-400">Best Lap</div>
                  <div className="font-telemetry text-lg font-bold text-cyan-400 mt-0.5">
                    {formatTimeMs(session.profile.stats.bestLapMs)}
                  </div>
                </div>
                <div className="bg-slate-950/75 border border-white/8 rounded-xl p-3">
                  <div className="text-[10px] text-slate-400">Best Drift</div>
                  <div className="font-telemetry text-lg font-bold text-emerald-400 mt-0.5">
                    {session.profile.stats.bestDriftScore.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Edit Profile Form */}
              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-300">Display Name</span>
                    <input
                      type="text"
                      required
                      maxLength={18}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="mt-1 w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-white/12 text-sm text-white focus:outline-none focus:border-amber-400"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-300">Region / Crew</span>
                    <input
                      type="text"
                      maxLength={24}
                      value={editRegion}
                      onChange={(e) => setEditRegion(e.target.value)}
                      className="mt-1 w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-white/12 text-sm text-white focus:outline-none focus:border-amber-400"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-300">Signature Vehicle</span>
                  <select
                    value={editCarId}
                    onChange={(e) => setEditCarId(e.target.value as CarId)}
                    className="mt-1 w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-white/12 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    {CARS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.category})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-300">Driver Bio</span>
                  <input
                    type="text"
                    maxLength={90}
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    placeholder="Add a short bio other racers see on your card..."
                    className="mt-1 w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-white/12 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </label>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="min-h-[46px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-300 text-xs font-semibold flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>

                  <button
                    type="submit"
                    disabled={busy}
                    className="min-h-[46px] px-6 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-display font-bold text-sm"
                  >
                    {busy ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {tab === 'directory' && (
            <div className="space-y-2.5">
              {profiles.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm font-semibold text-slate-300">
                    No driver profiles registered yet.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Create a driver account in Sign In / Join to appear in the online directory and accept 1v1 race challenges.
                  </p>
                </div>
              ) : (
                profiles.map((p) => {
                  const isMe = session?.profile.userId === p.userId;
                  const favCar = CARS.find((c) => c.id === p.favoriteCarId) ?? CARS[0];
                  const favPaint = PAINTS.find((pt) => pt.id === p.paintId) ?? PAINTS[0];

                  return (
                    <button
                      key={p.userId}
                      type="button"
                      onClick={() => onInspectDriver(p)}
                      className="w-full text-left bg-slate-950/75 hover:bg-slate-800/80 border border-white/10 hover:border-cyan-400/50 rounded-xl p-3.5 flex items-center justify-between gap-3 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <div
                            className="w-10 h-10 rounded-xl border border-white/25 flex items-center justify-center font-display font-bold text-sm text-white shadow-inner"
                            style={{ backgroundColor: favPaint.hex }}
                          >
                            {p.displayName.slice(0, 2).toUpperCase()}
                          </div>
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${
                              p.isOnline ? 'bg-emerald-400' : 'bg-slate-600'
                            }`}
                          />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-display text-sm font-bold text-white truncate">
                              {p.displayName}
                            </span>
                            <span className="font-telemetry text-[11px] text-slate-400 truncate">
                              @{p.handle}
                            </span>
                            {isMe && (
                              <span className="text-[10px] font-bold text-amber-400">You</span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate mt-0.5">
                            {favCar.name} · {p.stats.wins} wins · Best{' '}
                            {formatTimeMs(p.stats.bestLapMs)} · Joined {formatShortDate(p.joinedAt)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[11px] font-semibold px-2 py-1 rounded-lg border ${
                            p.isOnline
                              ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300'
                              : 'bg-slate-900 border-white/8 text-slate-500'
                          }`}
                        >
                          {p.isOnline
                            ? p.activity === 'racing'
                              ? 'Racing'
                              : p.activity === 'lobby'
                                ? 'In Lobby'
                                : 'Online'
                            : 'Offline'}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
