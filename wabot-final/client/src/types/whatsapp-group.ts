export interface WhatsAppGroup {
  _id: string;
  groupId: string;
  name: string;
  description: string;
  participants?: {
    id: string;
    jid: string;
    lid: string;
    admin: string | null;
    _id: string;
    createdAt: string;
    updatedAt: string;
  }[];
  participantsCount?: number;
  createdAt: string;
  updatedAt: string;
}