export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai' | 'system'; // 'system' for status messages like errors
  timestamp?: string; // ISO string
  status?: 'sending' | 'sent' | 'failed' | 'streaming'; // For UI feedback
}
