export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "user" | "admin";
export type Visibility = "public" | "private";
export type EpisodeStatus = "draft" | "generating" | "ready" | "failed";
export type CutStatus = "pending" | "generating" | "done" | "failed";
export type JobKind = "json" | "references" | "cuts";
export type JobStatus = "pending" | "running" | "done" | "failed" | "cancelled";
export type TargetType = "webtoon" | "episode" | "cut";
export type ImageProvider = "openai" | "gemini";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          role: UserRole;
          is_approved: boolean;
          credits: number;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          role?: UserRole;
          is_approved?: boolean;
          credits?: number;
          created_at?: string;
        };
        Update: {
          display_name?: string | null;
          // RLS로 클라이언트 직접 수정 불가 — service role (서버 액션)에서만 사용
          role?: UserRole;
          is_approved?: boolean;
          credits?: number;
        };
        Relationships: [];
      };
      webtoons: {
        Row: {
          id: string;
          author_id: string;
          title: string;
          description: string | null;
          style: string | null;
          brief: string | null;
          cover_image_url: string | null;
          visibility: Visibility;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          title: string;
          description?: string | null;
          style?: string | null;
          brief?: string | null;
          cover_image_url?: string | null;
          visibility?: Visibility;
          created_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          style?: string | null;
          brief?: string | null;
          cover_image_url?: string | null;
          visibility?: Visibility;
        };
        Relationships: [];
      };
      episodes: {
        Row: {
          id: string;
          webtoon_id: string;
          episode_number: number;
          title: string;
          status: EpisodeStatus;
          script_source: string | null;
          story_json: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          webtoon_id: string;
          episode_number: number;
          title: string;
          status?: EpisodeStatus;
          script_source?: string | null;
          story_json?: Json | null;
          created_at?: string;
        };
        Update: {
          title?: string;
          status?: EpisodeStatus;
          script_source?: string | null;
          story_json?: Json | null;
        };
        Relationships: [];
      };
      characters: {
        Row: {
          id: string;
          webtoon_id: string;
          episode_id: string | null;
          char_key: string;
          name: string;
          bible: Json | null;
          reference_image_url: string | null;
          locked: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          webtoon_id: string;
          episode_id?: string | null;
          char_key: string;
          name: string;
          bible?: Json | null;
          reference_image_url?: string | null;
          locked?: boolean;
          created_at?: string;
        };
        Update: {
          name?: string;
          bible?: Json | null;
          reference_image_url?: string | null;
          locked?: boolean;
        };
        Relationships: [];
      };
      locations: {
        Row: {
          id: string;
          webtoon_id: string;
          episode_id: string | null;
          loc_key: string;
          name: string;
          reference_image_url: string | null;
          locked: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          webtoon_id: string;
          episode_id?: string | null;
          loc_key: string;
          name: string;
          reference_image_url?: string | null;
          locked?: boolean;
          created_at?: string;
        };
        Update: {
          name?: string;
          reference_image_url?: string | null;
          locked?: boolean;
        };
        Relationships: [];
      };
      cuts: {
        Row: {
          id: string;
          episode_id: string;
          cut_id_key: string;
          order_index: number;
          panel_type: string | null;
          visual_prompt: string | null;
          camera: string | null;
          dialogue: Json | null;
          narration: Json | null;
          sfx: Json | null;
          emotion: string | null;
          character_keys: string[];
          location_key: string | null;
          image_url: string | null;
          status: CutStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          episode_id: string;
          cut_id_key: string;
          order_index: number;
          panel_type?: string | null;
          visual_prompt?: string | null;
          camera?: string | null;
          dialogue?: Json | null;
          narration?: Json | null;
          sfx?: Json | null;
          emotion?: string | null;
          character_keys?: string[];
          location_key?: string | null;
          image_url?: string | null;
          status?: CutStatus;
          created_at?: string;
        };
        Update: {
          visual_prompt?: string | null;
          camera?: string | null;
          dialogue?: Json | null;
          narration?: Json | null;
          sfx?: Json | null;
          emotion?: string | null;
          image_url?: string | null;
          status?: CutStatus;
        };
        Relationships: [];
      };
      props: {
        Row: {
          id: string;
          webtoon_id: string;
          episode_id: string | null;
          prop_key: string;
          name: string;
          description: string | null;
          visual_core: string | null;
          reference_image_url: string | null;
          locked: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          webtoon_id: string;
          episode_id?: string | null;
          prop_key: string;
          name: string;
          description?: string | null;
          visual_core?: string | null;
          reference_image_url?: string | null;
          locked?: boolean;
          created_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          visual_core?: string | null;
          reference_image_url?: string | null;
          locked?: boolean;
        };
        Relationships: [];
      };
      likes: {
        Row: {
          id: string;
          target_type: TargetType;
          target_id: string;
          voter_hash: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          target_type: TargetType;
          target_id: string;
          voter_hash: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      comments: {
        Row: {
          id: string;
          target_type: TargetType;
          target_id: string;
          body: string;
          author_id: string | null;
          voter_hash: string | null;
          nickname: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          target_type: TargetType;
          target_id: string;
          body: string;
          author_id?: string | null;
          voter_hash?: string | null;
          nickname?: string | null;
          created_at?: string;
        };
        Update: {
          body?: string;
        };
        Relationships: [];
      };
      generation_jobs: {
        Row: {
          id: string;
          episode_id: string;
          kind: JobKind;
          status: JobStatus;
          progress: number;
          error: string | null;
          provider: ImageProvider;
          created_at: string;
        };
        Insert: {
          id?: string;
          episode_id: string;
          kind: JobKind;
          status?: JobStatus;
          progress?: number;
          error?: string | null;
          provider: ImageProvider;
          created_at?: string;
        };
        Update: {
          status?: JobStatus;
          progress?: number;
          error?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      adjust_credits: {
        Args: { target_user_id: string; delta: number };
        Returns: number;
      };
      toggle_like: {
        Args: { p_target_type: TargetType; p_target_id: string; p_voter_hash: string };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
