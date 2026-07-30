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
        finish_time: number;
        challenge: Challenge
    }

    interface TestCase {
    input_args: string[];
    expected_output: string;
    }

    interface Challenge {
    title: string;
    intended_behavior: string;
    broken_code: string;
    solution_code: string;
    difficulty_score: number;
    test_cases: TestCase[];
    }

    interface Window {
        open_ai_client: OpenAI;
        database: Database;
        
        this_user_id: string;
        
        room_reference: DatabaseReference;
        room_snapshot: Room;
        difficulty: number;
    }
}