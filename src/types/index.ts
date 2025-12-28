export interface Slot {
  id: string;
  created_by?: string;
  creator_name: string;
  start_time: string;
  player1: string;
  player2: string;
  player3: string;
  player4: string;
  player1_comment: string;
  player2_comment: string;
  player3_comment: string;
  player4_comment: string;
  waiting_queue: string[];
  status: 'active' | 'cancelled';
  created_at: string;
}
