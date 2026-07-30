import { Database, DatabaseReference } from "firebase/database";
import OpenAI from "openai";

declare global {
    interface Player {
        name: string;
        ready: boolean;
        code: string;
    }

    interface Room {
        host: string;

        max_player_count: number;
        current_player_count: number;
        players: Record<string, Player>;

        playing_now: boolean;
        start_time: number;
    }

    interface Window {
        open_ai_client: OpenAI;
        
        this_user_id: string;
        
        room_reference: DatabaseReference;
        room_snapshot: Room;
        difficulty: number;
    }
}

export {}