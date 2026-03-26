import type { GroupMetadata, WASocket } from '@whiskeysockets/baileys';

export interface WhatsAppInstance {
    client: WASocket;
    connected: boolean;
    groupCache: Map<string, { metadata: GroupMetadata; timestamp: number }>;
    groupMetadataLocks: Map<string, Promise<GroupMetadata>>;
    lastGroupMetadataCall: number;
    isReady: boolean;
    flushInterval?: NodeJS.Timeout;
}

export interface GroupInfo {
  jid: string;
  name: string;
  description: string;
  participants: GroupParticipantInfo[];
}

export interface GroupParticipantInfo {
  jid: string;
  phoneNumber: string;
  lid: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}