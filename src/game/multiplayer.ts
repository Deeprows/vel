import {
  CarId,
  LobbyRoomState,
  LobbyRoomSummary,
  NetworkInfo,
  RaceInvite,
  RemoteTelemetryPacket,
  RoomScope,
  TrackId,
} from './types';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface InviteStatusUpdate {
  status: string;
  inviteId?: string;
  message: string;
}

export interface MultiplayerCallbacks {
  onConnectionChange?: (status: ConnectionStatus, pingMs: number | null) => void;
  onWelcome?: (playerId: string) => void;
  onRoomUpdate?: (room: LobbyRoomState | null) => void;
  onRoomError?: (message: string) => void;
  onRaceStart?: (room: LobbyRoomState, countdownMs: number) => void;
  onRemoteTelemetry?: (packet: RemoteTelemetryPacket) => void;
  onP2PStatusChange?: (directPeerCount: number) => void;
  onDirectoryUpdated?: () => void;
  onInviteReceived?: (invite: RaceInvite) => void;
  onInviteStatus?: (update: InviteStatusUpdate) => void;
}

interface PeerEntry {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private callbacks: MultiplayerCallbacks = {};
  private status: ConnectionStatus = 'disconnected';
  private localPlayerId = '';
  private currentRoom: LobbyRoomState | null = null;
  private pingMs: number | null = null;
  private pingTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private intentionalClose = false;
  private seq = 0;
  private authToken: string | null = null;

  // WebRTC direct P2P channels for Same Wi-Fi mode
  private peers = new Map<string, PeerEntry>();
  private lastRemoteSeq = new Map<string, number>();

  public setCallbacks(cb: MultiplayerCallbacks): void {
    this.callbacks = cb;
  }

  public getLocalPlayerId(): string {
    return this.localPlayerId;
  }

  public getCurrentRoom(): LobbyRoomState | null {
    return this.currentRoom;
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public getPingMs(): number | null {
    return this.pingMs;
  }

  public getDirectPeerCount(): number {
    let count = 0;
    for (const p of this.peers.values()) {
      if (p.dc && p.dc.readyState === 'open') count++;
    }
    return count;
  }

  public connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.intentionalClose = false;
    this.status = 'connecting';
    this.callbacks.onConnectionChange?.(this.status, this.pingMs);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        this.status = 'connected';
        this.callbacks.onConnectionChange?.(this.status, this.pingMs);
        this.startPingLoop();
      };

      ws.onmessage = (ev) => {
        this.handleWsMessage(ev.data);
      };

      ws.onclose = () => {
        this.stopPingLoop();
        this.ws = null;
        this.status = 'disconnected';
        this.callbacks.onConnectionChange?.(this.status, null);
        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }
      };

      ws.onerror = () => {
        // Error handler delegates cleanup to onclose
      };
    } catch {
      this.status = 'disconnected';
      this.callbacks.onConnectionChange?.(this.status, null);
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.intentionalClose = true;
    this.stopPingLoop();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.closeAllPeers();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.currentRoom = null;
    this.status = 'disconnected';
    this.callbacks.onConnectionChange?.(this.status, null);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionalClose) {
        this.connect();
      }
    }, 1800);
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    const sendPing = () => {
      this.sendWs({ type: 'ping', t: performance.now() });
    };
    sendPing();
    this.pingTimer = window.setInterval(sendPing, 5000);
  }

  private stopPingLoop(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private sendWs(payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private handleWsMessage(raw: string): void {
    let msg: Record<string, unknown>;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      msg = parsed as Record<string, unknown>;
    } catch {
      return;
    }

    const type = msg.type;
    if (type === 'welcome' && typeof msg.playerId === 'string') {
      this.localPlayerId = msg.playerId;
      if (this.authToken) {
        this.sendWs({ type: 'auth:bind', token: this.authToken });
      }
      this.callbacks.onWelcome?.(this.localPlayerId);
      return;
    }

    if (type === 'directory:updated') {
      this.callbacks.onDirectoryUpdated?.();
      return;
    }

    if (type === 'race:invite_received' && msg.invite) {
      this.callbacks.onInviteReceived?.(msg.invite as RaceInvite);
      return;
    }

    if (type === 'race:invite_status' && typeof msg.status === 'string') {
      this.callbacks.onInviteStatus?.({
        status: msg.status,
        inviteId: typeof msg.inviteId === 'string' ? msg.inviteId : undefined,
        message: typeof msg.message === 'string' ? msg.message : '',
      });
      return;
    }

    if (type === 'pong' && typeof msg.t === 'number') {
      this.pingMs = Math.max(1, Math.round(performance.now() - msg.t));
      this.callbacks.onConnectionChange?.(this.status, this.pingMs);
      return;
    }

    if (type === 'room:joined' || type === 'room:state') {
      if (typeof msg.playerId === 'string') {
        this.localPlayerId = msg.playerId;
      }
      const room = (msg.room as LobbyRoomState) ?? null;
      this.currentRoom = room;
      if (room && room.scope === 'wifi') {
        this.syncWifiPeers(room);
      } else {
        this.closeAllPeers();
      }
      this.callbacks.onRoomUpdate?.(room);
      return;
    }

    if (type === 'room:left') {
      this.currentRoom = null;
      this.closeAllPeers();
      this.callbacks.onRoomUpdate?.(null);
      return;
    }

    if (type === 'room:error' && typeof msg.message === 'string') {
      this.callbacks.onRoomError?.(msg.message);
      return;
    }

    if (type === 'race:start') {
      const room = msg.room as LobbyRoomState;
      const countdownMs = typeof msg.countdownMs === 'number' ? msg.countdownMs : 3400;
      this.currentRoom = room;
      this.lastRemoteSeq.clear();
      this.callbacks.onRaceStart?.(room, countdownMs);
      return;
    }

    if (type === 'race:remote_telemetry' && msg.packet) {
      this.ingestRemoteTelemetry(msg.packet as RemoteTelemetryPacket);
      return;
    }

    if (
      type === 'webrtc:signal' &&
      typeof msg.fromPlayerId === 'string' &&
      typeof msg.signalType === 'string'
    ) {
      this.handleWebRtcSignal(
        msg.fromPlayerId,
        msg.signalType as 'offer' | 'answer' | 'ice',
        msg.payload
      );
    }
  }

  private ingestRemoteTelemetry(packet: RemoteTelemetryPacket): void {
    if (!packet || packet.playerId === this.localPlayerId) return;
    const prevSeq = this.lastRemoteSeq.get(packet.playerId) ?? -1;
    if (packet.seq <= prevSeq) return;
    this.lastRemoteSeq.set(packet.playerId, packet.seq);
    this.callbacks.onRemoteTelemetry?.(packet);
  }

  public createRoom(params: {
    scope: RoomScope;
    trackId: TrackId;
    driverName: string;
    carId: CarId;
    paintId: string;
    underglowId: string;
  }): void {
    this.connect();
    const emit = () => this.sendWs({ type: 'room:create', ...params });
    if (this.ws?.readyState === WebSocket.OPEN) {
      emit();
    } else {
      window.setTimeout(emit, 250);
    }
  }

  public joinRoom(params: {
    code: string;
    driverName: string;
    carId: CarId;
    paintId: string;
    underglowId: string;
  }): void {
    this.connect();
    const emit = () => this.sendWs({ type: 'room:join', ...params });
    if (this.ws?.readyState === WebSocket.OPEN) {
      emit();
    } else {
      window.setTimeout(emit, 250);
    }
  }

  public leaveRoom(): void {
    this.sendWs({ type: 'room:leave' });
    this.currentRoom = null;
    this.closeAllPeers();
    this.callbacks.onRoomUpdate?.(null);
  }

  public updateProfile(params: {
    driverName?: string;
    carId?: CarId;
    paintId?: string;
    underglowId?: string;
    ready?: boolean;
  }): void {
    this.sendWs({ type: 'room:update_profile', ...params });
  }

  public setRoomTrack(trackId: TrackId): void {
    this.sendWs({ type: 'room:set_track', trackId });
  }

  public startRoomRace(): void {
    this.sendWs({ type: 'room:start' });
  }

  public bindAuth(token: string | null): void {
    this.authToken = token;
    if (token) {
      this.connect();
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendWs({ type: 'auth:bind', token });
    }
  }

  public requestRace(params: {
    targetUserId: string;
    trackId: TrackId;
    scope: RoomScope;
    carId: CarId;
  }): void {
    this.connect();
    const emit = () => this.sendWs({ type: 'race:request', ...params });
    if (this.ws?.readyState === WebSocket.OPEN) {
      emit();
    } else {
      window.setTimeout(emit, 250);
    }
  }

  public respondToInvite(params: {
    inviteId: string;
    accept: boolean;
    driverName: string;
    carId: CarId;
    paintId: string;
    underglowId: string;
  }): void {
    this.connect();
    this.sendWs({ type: 'race:invite_respond', ...params });
  }

  public requestRematch(): void {
    this.sendWs({ type: 'room:rematch' });
  }

  public sendTelemetry(packet: Omit<RemoteTelemetryPacket, 'playerId' | 'seq'>): void {
    const fullPacket: RemoteTelemetryPacket = {
      ...packet,
      playerId: this.localPlayerId,
      seq: ++this.seq,
    };

    // In Same Wi-Fi mode, blast direct over open local P2P RTCDataChannels when connected
    let anyViaRelayNeeded = this.currentRoom?.scope !== 'wifi';
    if (this.currentRoom?.scope === 'wifi') {
      const remoteCount = Math.max(0, this.currentRoom.players.length - 1);
      const serialized = JSON.stringify({ type: 'p2p:telemetry', packet: fullPacket });
      let sentDirect = 0;
      for (const peer of this.peers.values()) {
        if (peer.dc && peer.dc.readyState === 'open') {
          try {
            peer.dc.send(serialized);
            sentDirect++;
          } catch {
            // Fall back to WS relay
          }
        }
      }
      if (sentDirect < remoteCount || fullPacket.finished) {
        anyViaRelayNeeded = true;
      }
    }

    if (anyViaRelayNeeded) {
      this.sendWs({
        type: 'race:telemetry',
        ...fullPacket,
      });
    }
  }

  // --- Direct Local Wi-Fi WebRTC DataChannel Mesh ---

  private syncWifiPeers(room: LobbyRoomState): void {
    if (typeof RTCPeerConnection === 'undefined' || !this.localPlayerId) return;

    const remoteIds = new Set(
      room.players.filter((p) => p.id !== this.localPlayerId).map((p) => p.id)
    );

    // Tear down departed peers
    for (const [peerId, entry] of this.peers.entries()) {
      if (!remoteIds.has(peerId)) {
        entry.dc?.close();
        entry.pc.close();
        this.peers.delete(peerId);
      }
    }

    // Create connections with new peers (lexicographically smaller ID initiates offer)
    for (const peerId of remoteIds) {
      if (this.peers.has(peerId)) continue;
      const shouldInitiate = this.localPlayerId < peerId;
      this.createPeerConnection(peerId, shouldInitiate);
    }

    this.callbacks.onP2PStatusChange?.(this.getDirectPeerCount());
  }

  private createPeerConnection(peerId: string, initiateOffer: boolean): PeerEntry {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    const entry: PeerEntry = { pc, dc: null };
    this.peers.set(peerId, entry);

    const attachDataChannel = (dc: RTCDataChannel) => {
      entry.dc = dc;
      dc.onopen = () => {
        this.callbacks.onP2PStatusChange?.(this.getDirectPeerCount());
      };
      dc.onclose = () => {
        this.callbacks.onP2PStatusChange?.(this.getDirectPeerCount());
      };
      dc.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(String(ev.data)) as {
            type?: string;
            packet?: RemoteTelemetryPacket;
          };
          if (parsed.type === 'p2p:telemetry' && parsed.packet) {
            this.ingestRemoteTelemetry(parsed.packet);
          }
        } catch {
          // Ignore malformed P2P datagrams
        }
      };
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.sendWs({
          type: 'webrtc:signal',
          targetPlayerId: peerId,
          signalType: 'ice',
          payload: ev.candidate,
        });
      }
    };

    pc.ondatachannel = (ev) => {
      attachDataChannel(ev.channel);
    };

    if (initiateOffer) {
      const dc = pc.createDataChannel('telemetry', { ordered: false, maxRetransmits: 0 });
      attachDataChannel(dc);
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          if (pc.localDescription) {
            this.sendWs({
              type: 'webrtc:signal',
              targetPlayerId: peerId,
              signalType: 'offer',
              payload: pc.localDescription,
            });
          }
        })
        .catch(() => {});
    }

    return entry;
  }

  private async handleWebRtcSignal(
    fromPlayerId: string,
    signalType: 'offer' | 'answer' | 'ice',
    payload: unknown
  ): Promise<void> {
    if (typeof RTCPeerConnection === 'undefined') return;
    let entry = this.peers.get(fromPlayerId);
    if (!entry) {
      entry = this.createPeerConnection(fromPlayerId, false);
    }

    try {
      if (signalType === 'offer' && payload) {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        if (entry.pc.localDescription) {
          this.sendWs({
            type: 'webrtc:signal',
            targetPlayerId: fromPlayerId,
            signalType: 'answer',
            payload: entry.pc.localDescription,
          });
        }
      } else if (signalType === 'answer' && payload) {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
      } else if (signalType === 'ice' && payload) {
        await entry.pc.addIceCandidate(new RTCIceCandidate(payload as RTCIceCandidateInit));
      }
    } catch {
      // Fall back transparently to WebSocket relay
    }
  }

  private closeAllPeers(): void {
    for (const entry of this.peers.values()) {
      entry.dc?.close();
      entry.pc.close();
    }
    this.peers.clear();
    this.callbacks.onP2PStatusChange?.(0);
  }

  public async fetchRooms(scope: RoomScope): Promise<LobbyRoomSummary[]> {
    try {
      const res = await fetch(`/api/rooms?scope=${encodeURIComponent(scope)}`);
      if (!res.ok) return [];
      const data = (await res.json()) as { rooms?: LobbyRoomSummary[] };
      return Array.isArray(data.rooms) ? data.rooms : [];
    } catch {
      return [];
    }
  }

  public async fetchNetworkInfo(): Promise<NetworkInfo | null> {
    try {
      const res = await fetch('/api/network-info');
      if (!res.ok) return null;
      return (await res.json()) as NetworkInfo;
    } catch {
      return null;
    }
  }
}
