export interface Slot {
  id: string;
  creator_name: string;
  start_time: string;
  player1: string;
  player2: string;
  player3: string;
  player4: string;
  substitute: string;
  status: 'active' | 'cancelled';
  created_at: string;
}
