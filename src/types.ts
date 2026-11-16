export interface Blessing {
  id: string;
  nickname: string | null;
  message: string;
  created_at: string;
  updated_at: string;
  ornament_seed: number;
}
export interface BlessingResponse { blessings?: Blessing[]; revision: number; unchanged?: boolean }
