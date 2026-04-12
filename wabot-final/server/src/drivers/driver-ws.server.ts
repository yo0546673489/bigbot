/* eslint-disable @typescript-eslint/no-var-requires */
import * as http from 'http';
import { Logger } from '@nestjs/common';

// Use require to avoid needing @types/ws
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WS = require('ws');

export interface DriverWsConnection {
  ws: any;
  phone: string;
  name: string;
  available: boolean;
  keywords: string[];
  pausedKeywords: string[];
  autoMode: boolean;
  defaultEta: number;
}

type RideActionCallback = (phone: string, data: any) => void;
type ChatMessageCallback = (driverPhone: string, data: any) => void;
type WaStatusProvider = (phone: string) => Promise<boolean>;
type AvailabilityCallback = (phone: string, available: boolean) => void;
type KmFilterCallback = (phone: string, km: number | null) => void;
type MinPriceCallback = (phone: string, minPrice: number | null) => void;

/**
 * Standalone WebSocket server for Android driver app connections.
 * Accepts connections at /drivers path.
 * Singleton — attach once to the HTTP server after app.listen().
 */
interface BufferedMessage {
  type: string;
  data: any;
  ts: number;
  // Dedup key — for rides this is the rideId; replays use it to skip already-seen.
  key?: string;
}

export class DriverWsServer {
  private static instance: DriverWsServer;
  private wss: any = null;
  private connections = new Map<string, DriverWsConnection>();
  // Per-phone buffer of recent messages. Replayed on reconnect so that no
  // ride is lost during a disconnect window (NAT timeout, Doze mode, network
  // handoff). Bounded by size + age.
  private buffers = new Map<string, BufferedMessage[]>();
  private readonly BUFFER_MAX = 50;
  private readonly BUFFER_TTL_MS = 5 * 60 * 1000; // 5 min
  private readonly logger = new Logger('DriverWsServer');
  private onRideActionCb?: RideActionCallback;
  private onChatMessageCb?: ChatMessageCallback;
  private onAvailabilityCb?: AvailabilityCallback;
  private onKmFilterCb?: KmFilterCallback;
  private onMinPriceCb?: MinPriceCallback;
  private waStatusProvider?: WaStatusProvider;

  private constructor() {}

  static getInstance(): DriverWsServer {
    if (!DriverWsServer.instance) {
      DriverWsServer.instance = new DriverWsServer();
    }
    return DriverWsServer.instance;
  }

  /** Called once from main.ts after app.listen() */
  attach(server: http.Server): void {
    this.wss = new WS.WebSocketServer({ server, path: '/drivers' });

    this.wss.on('connection', (ws: any, req: http.IncomingMessage) => {
      const phone = (req.headers['x-driver-phone'] as string)?.trim();
      const rawName = (req.headers['x-driver-name'] as string)?.trim() || '';
      // Hebrew names arrive URL-encoded because HTTP headers must be ASCII
      let name = rawName;
      try { name = decodeURIComponent(rawName) || phone; } catch { name = rawName || phone; }
      if (!name) name = phone;
      const remoteAddr = (req.socket?.remoteAddress || '') + ':' + (req.socket?.remotePort || '');
      const ua = (req.headers['user-agent'] as string) || '';

      if (!phone) {
        ws.close(1008, 'Phone required');
        return;
      }

      // Close previous connection for same phone
      const existing = this.connections.get(phone);
      if (existing && existing.ws.readyState === WS.WebSocket.OPEN) {
        this.logger.warn(`Closing existing WS for ${phone} (new conn from ${remoteAddr})`);
        existing.ws.close(1000, 'New connection');
      }
      (ws as any).connectedAt = Date.now();
      (ws as any).remoteAddr = remoteAddr;

      // Liveness flag — ANY inbound traffic (pong OR client message) counts as
      // proof of life. Under heavy ride load the server was wrongly terminating
      // connections at ~85s because pongs were queued behind outbound JSON and
      // arrived late. "lastSeenMs" is reset on any read — which is robust.
      (ws as any).lastSeenMs = Date.now();
      ws.on('pong', () => { (ws as any).lastSeenMs = Date.now(); });

      const conn: DriverWsConnection = {
        ws, phone, name,
        available: false, keywords: [],
        pausedKeywords: [], autoMode: false, defaultEta: 5,
      };
      this.connections.set(phone, conn);
      this.logger.log(`Driver connected via app: ${phone} (${name})`);

      // Replay any rides queued during the disconnect window. Client dedupes
      // by rideId so duplicates from a brief disconnect are harmless.
      this.replayBuffer(phone);

      // Inform driver of WA connection status (query actual state if provider is set)
      if (this.waStatusProvider) {
        this.waStatusProvider(phone)
          .then(isConn => this.send(phone, 'wa_status', { connected: isConn }))
          .catch(() => this.send(phone, 'wa_status', { connected: false }));
      } else {
        this.send(phone, 'wa_status', { connected: true });
      }

      ws.on('message', (raw: Buffer) => {
        (ws as any).lastSeenMs = Date.now();
        try {
          const msg = JSON.parse(raw.toString());
          this.handleMessage(phone, msg);
        } catch { /* ignore parse errors */ }
      });

      ws.on('close', (code: number, reason: Buffer) => {
        const lifetime = Date.now() - ((ws as any).connectedAt || Date.now());
        // Only delete if this ws is still the active one (avoid removing a newer conn)
        const current = this.connections.get(phone);
        if (current && current.ws === ws) this.connections.delete(phone);
        this.logger.log(
          `Driver disconnected: ${phone} code=${code} reason="${reason?.toString() || ''}" lifetime=${lifetime}ms from=${(ws as any).remoteAddr}`
        );
      });

      ws.on('error', (err: Error) => {
        this.logger.warn(`WS error for ${phone}: ${err.message} from=${(ws as any).remoteAddr}`);
        const current = this.connections.get(phone);
        if (current && current.ws === ws) this.connections.delete(phone);
      });
    });

    // Server-side heartbeat: ping every 30s. Terminate only after 4 minutes
    // of TOTAL silence (no pong AND no client message). Under heavy load
    // (hundreds of rides/sec) pongs get queued behind outbound JSON and
    // arrive late — we were wrongly killing healthy connections at ~85s.
    // OkHttp on the client also pings every 20s and will self-close dead
    // sockets, so we can afford to be very tolerant on the server side.
    const PING_INTERVAL_MS = 30000;
    const ZOMBIE_TIMEOUT_MS = 4 * 60 * 1000; // 4 minutes of silence
    const heartbeat = setInterval(() => {
      const now = Date.now();
      this.wss.clients.forEach((ws: any) => {
        const lastSeen = ws.lastSeenMs || 0;
        if (now - lastSeen > ZOMBIE_TIMEOUT_MS) {
          try { ws.terminate(); } catch { /* noop */ }
          return;
        }
        try { ws.ping(); } catch { /* noop */ }
      });
    }, PING_INTERVAL_MS);

    this.wss.on('close', () => clearInterval(heartbeat));

    this.logger.log(`DriverWsServer attached at /drivers (ping ${PING_INTERVAL_MS}ms, zombie timeout ${ZOMBIE_TIMEOUT_MS}ms)`);
  }

  private handleMessage(phone: string, msg: any): void {
    const conn = this.connections.get(phone);
    if (!conn) return;
    const { type, data } = msg || {};

    switch (type) {
      case 'set_availability': {
        const available = !!data?.available;
        conn.available = available;
        if (Array.isArray(data?.keywords)) conn.keywords = data.keywords;
        if (Array.isArray(data?.pausedKeywords)) conn.pausedKeywords = data.pausedKeywords;
        // Persist to Mongo/Redis so the dispatch filter (which reads
        // driver.isBusy from the Redis cache) actually respects the toggle.
        if (this.onAvailabilityCb) {
          try { this.onAvailabilityCb(phone, available); } catch (e: any) {
            this.logger.warn(`availability cb failed for ${phone}: ${e?.message}`);
          }
        }
        break;
      }
      case 'add_keyword':
        if (data?.keyword && !conn.keywords.includes(data.keyword)) conn.keywords.push(data.keyword);
        break;
      case 'remove_keyword':
        conn.keywords = conn.keywords.filter((k: string) => k !== data?.keyword);
        break;
      case 'pause_keyword':
        if (data?.keyword && !conn.pausedKeywords.includes(data.keyword)) conn.pausedKeywords.push(data.keyword);
        break;
      case 'resume_keyword':
        conn.pausedKeywords = conn.pausedKeywords.filter((k: string) => k !== data?.keyword);
        break;
      case 'set_auto_mode':
        conn.autoMode = !!data?.enabled;
        break;
      case 'set_default_eta':
        conn.defaultEta = Number(data?.eta) || 5;
        break;
      case 'set_min_price': {
        const raw = data?.minPrice;
        const minPrice: number | null = (raw == null || raw === '' || Number(raw) <= 0)
          ? null
          : Number(raw);
        if (this.onMinPriceCb) {
          try { this.onMinPriceCb(phone, minPrice); } catch (e: any) {
            this.logger.warn(`min price cb failed for ${phone}: ${e?.message}`);
          }
        }
        break;
      }
      case 'set_km_filter': {
        // data.km: number | null — range in km, or null to clear the filter.
        // Persisted via onKmFilterCb to Mongo+Redis so the dispatch filter
        // (which reads driver.kmFilter from the Redis cache) picks it up.
        const raw = data?.km;
        const km: number | null = (raw == null || raw === '' || Number(raw) <= 0)
          ? null
          : Number(raw);
        if (this.onKmFilterCb) {
          try { this.onKmFilterCb(phone, km); } catch (e: any) {
            this.logger.warn(`km filter cb failed for ${phone}: ${e?.message}`);
          }
        }
        break;
      }
      case 'get_status':
        if (this.waStatusProvider) {
          this.waStatusProvider(phone)
            .then(isConn => this.send(phone, 'wa_status', { connected: isConn }))
            .catch(() => this.send(phone, 'wa_status', { connected: false }));
        } else {
          this.send(phone, 'wa_status', { connected: true });
        }
        break;
      case 'ride_action':
        if (this.onRideActionCb) this.onRideActionCb(phone, data);
        break;
      case 'send_message':
        if (this.onChatMessageCb) this.onChatMessageCb(phone, data);
        break;
      default:
        break;
    }
  }

  onRideAction(cb: RideActionCallback): void {
    this.onRideActionCb = cb;
  }

  onChatMessage(cb: ChatMessageCallback): void {
    this.onChatMessageCb = cb;
  }

  onAvailability(cb: AvailabilityCallback): void {
    this.onAvailabilityCb = cb;
  }

  onKmFilter(cb: KmFilterCallback): void {
    this.onKmFilterCb = cb;
  }

  onMinPrice(cb: MinPriceCallback): void {
    this.onMinPriceCb = cb;
  }

  setWaStatusProvider(provider: WaStatusProvider): void {
    this.waStatusProvider = provider;
  }

  send(phone: string, type: string, data: any): void {
    // Buffer rides + ride updates so they survive disconnect windows. Status
    // messages (wa_status) are not buffered — they're transient.
    if (type === 'new_ride' || type === 'ride_update') {
      const key = (data && (data.rideId || data.id)) || undefined;
      this.pushBuffer(phone, { type, data, ts: Date.now(), key });
    }
    const conn = this.connections.get(phone);
    if (!conn) return;
    try {
      if (conn.ws.readyState === WS.WebSocket.OPEN) {
        conn.ws.send(JSON.stringify({ type, data }));
      }
    } catch (e: any) {
      this.logger.warn(`Failed to send to ${phone}: ${e?.message}`);
    }
  }

  sendRide(phone: string, ride: object): void {
    this.send(phone, 'new_ride', ride);
  }

  sendRideUpdate(phone: string, update: object): void {
    this.send(phone, 'ride_update', update);
  }

  private pushBuffer(phone: string, msg: BufferedMessage): void {
    let buf = this.buffers.get(phone);
    if (!buf) { buf = []; this.buffers.set(phone, buf); }
    buf.push(msg);
    // Trim by size + age
    const cutoff = Date.now() - this.BUFFER_TTL_MS;
    while (buf.length > 0 && (buf.length > this.BUFFER_MAX || buf[0].ts < cutoff)) {
      buf.shift();
    }
  }

  private replayBuffer(phone: string): void {
    const buf = this.buffers.get(phone);
    if (!buf || buf.length === 0) return;
    const cutoff = Date.now() - this.BUFFER_TTL_MS;
    const fresh = buf.filter(m => m.ts >= cutoff);
    if (fresh.length === 0) {
      this.buffers.delete(phone);
      return;
    }
    const conn = this.connections.get(phone);
    if (!conn || conn.ws.readyState !== WS.WebSocket.OPEN) return;
    this.logger.log(`Replaying ${fresh.length} buffered messages to ${phone}`);
    for (const m of fresh) {
      try {
        conn.ws.send(JSON.stringify({ type: m.type, data: m.data }));
      } catch (e: any) {
        this.logger.warn(`Replay send failed for ${phone}: ${e?.message}`);
        return;
      }
    }
  }

  isConnected(phone: string): boolean {
    const conn = this.connections.get(phone);
    return conn != null && conn.ws.readyState === WS.WebSocket.OPEN;
  }

  getConnection(phone: string): DriverWsConnection | undefined {
    return this.connections.get(phone);
  }

  /** Clear any buffered rides for a phone — used when the driver turns off
   *  availability so reconnects don't replay stale rides. */
  clearBuffer(phone: string): void {
    this.buffers.delete(phone);
  }

  get connectedPhones(): string[] {
    return [...this.connections.keys()].filter(p => this.isConnected(p));
  }

  /** Broadcast a message to ALL connected drivers. Used for areas_updated etc. */
  broadcast(type: string, data: object): void {
    for (const phone of this.connectedPhones) {
      this.send(phone, type, data);
    }
  }
}
