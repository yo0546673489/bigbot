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
}

type RideActionCallback = (phone: string, data: any) => void;

/**
 * Standalone WebSocket server for Android driver app connections.
 * Accepts connections at /drivers path.
 * Singleton — attach once to the HTTP server after app.listen().
 */
export class DriverWsServer {
  private static instance: DriverWsServer;
  private wss: any = null;
  private connections = new Map<string, DriverWsConnection>();
  private readonly logger = new Logger('DriverWsServer');
  private onRideActionCb?: RideActionCallback;

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
      const name = (req.headers['x-driver-name'] as string)?.trim() || phone;

      if (!phone) {
        ws.close(1008, 'Phone required');
        return;
      }

      // Close previous connection for same phone
      const existing = this.connections.get(phone);
      if (existing && existing.ws.readyState === WS.WebSocket.OPEN) {
        existing.ws.close(1000, 'New connection');
      }

      const conn: DriverWsConnection = {
        ws, phone, name,
        available: false, keywords: [],
        pausedKeywords: [], autoMode: false,
      };
      this.connections.set(phone, conn);
      this.logger.log(`Driver connected via app: ${phone} (${name})`);

      // Inform driver of WA connection status
      this.send(phone, 'wa_status', { connected: true });

      ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());
          this.handleMessage(phone, msg);
        } catch { /* ignore parse errors */ }
      });

      ws.on('close', () => {
        this.connections.delete(phone);
        this.logger.log(`Driver disconnected from app: ${phone}`);
      });

      ws.on('error', (err: Error) => {
        this.logger.warn(`WS error for ${phone}: ${err.message}`);
        this.connections.delete(phone);
      });
    });

    this.logger.log('DriverWsServer attached at /drivers');
  }

  private handleMessage(phone: string, msg: any): void {
    const conn = this.connections.get(phone);
    if (!conn) return;
    const { type, data } = msg || {};

    switch (type) {
      case 'set_availability':
        conn.available = !!data?.available;
        if (Array.isArray(data?.keywords)) conn.keywords = data.keywords;
        break;
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
      case 'get_status':
        this.send(phone, 'wa_status', { connected: true });
        break;
      case 'ride_action':
        if (this.onRideActionCb) this.onRideActionCb(phone, data);
        break;
      default:
        break;
    }
  }

  onRideAction(cb: RideActionCallback): void {
    this.onRideActionCb = cb;
  }

  send(phone: string, type: string, data: any): void {
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

  isConnected(phone: string): boolean {
    const conn = this.connections.get(phone);
    return conn != null && conn.ws.readyState === WS.WebSocket.OPEN;
  }

  getConnection(phone: string): DriverWsConnection | undefined {
    return this.connections.get(phone);
  }

  get connectedPhones(): string[] {
    return [...this.connections.keys()].filter(p => this.isConnected(p));
  }
}
