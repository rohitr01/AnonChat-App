export interface UserProfile {
  uid: string;
  username: string;
  displayName: string;
  photoURL?: string;
  bio?: string;
  createdAt: number;
  lastActive: number;
  sessions: string[]; // List of session IDs
  blockedUsers: string[]; // List of UIDs
  email?: string; // Optional for recovery
  role?: 'admin' | 'user';
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  type: 'text' | 'image' | 'video';
  mediaUrl?: string;
  createdAt: number;
  roomId?: string; // If it's a room message
  receiverId?: string; // If it's a DM
  isEncrypted?: boolean;
  reactions?: { [emoji: string]: string[] }; // emoji -> list of user UIDs
  readBy?: string[]; // List of UIDs who have seen the message
}

export interface Room {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: number;
  members: string[]; // UIDs
}

export interface Session {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  createdAt: number;
  lastActive: number;
}
