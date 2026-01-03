import { BoardNode, BoardNodeType, PieceType, PlayerId, Piece as PieceModel } from '../types';
import { BOARD_ROWS, BOARD_COLS, INITIAL_PIECES } from '../constants';
import { getPieceRank } from '../gameLogic';

// Setup Archetypes
export type SetupArchetype = 'BALANCED' | 'DEFENSIVE_TURTLE' | 'AGGRESSIVE_BLITZ' | 'DECEPTIVE';

interface SetupStats {
    gamesPlayed: number;
    wins: number;
}

interface AIKnowledgeBase {
    version: number;
    setupStats: Record<SetupArchetype, SetupStats>;
}

const STORAGE_KEY = 'junqi_ai_setup_stats_v1';

export class AISetupManager {
    private stats: Record<SetupArchetype, SetupStats>;

    constructor() {
        this.stats = this.loadStats();
    }

    private loadStats(): Record<SetupArchetype, SetupStats> {
        if (typeof window === 'undefined') return this.createEmptyStats();
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return this.createEmptyStats();
        try {
            const data = JSON.parse(stored);
            return data.setupStats || this.createEmptyStats();
        } catch {
            return this.createEmptyStats();
        }
    }

    private createEmptyStats(): Record<SetupArchetype, SetupStats> {
        return {
            'BALANCED': { gamesPlayed: 0, wins: 0 },
            'DEFENSIVE_TURTLE': { gamesPlayed: 0, wins: 0 },
            'AGGRESSIVE_BLITZ': { gamesPlayed: 0, wins: 0 },
            'DECEPTIVE': { gamesPlayed: 0, wins: 0 }
        };
    }

    public saveStats() {
        if (typeof window === 'undefined') return;
        const data: AIKnowledgeBase = { version: 1, setupStats: this.stats };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    public recordResult(archetype: SetupArchetype, isWin: boolean) {
        if (!this.stats[archetype]) return;
        this.stats[archetype].gamesPlayed++;
        if (isWin) this.stats[archetype].wins++;
        this.saveStats();
    }

    public selectArchetype(): SetupArchetype {
        // Epsilon-greedy or weighted selection
        // 20% Chance to explore random
        if (Math.random() < 0.2) {
            const types: SetupArchetype[] = ['BALANCED', 'DEFENSIVE_TURTLE', 'AGGRESSIVE_BLITZ', 'DECEPTIVE'];
            return types[Math.floor(Math.random() * types.length)];
        }

        // 80% Select best performing
        let bestType: SetupArchetype = 'BALANCED';
        let bestRate = -1;

        (Object.keys(this.stats) as SetupArchetype[]).forEach(type => {
            const s = this.stats[type];
            if (s.gamesPlayed === 0) {
                // Give unplayed strategies a chance (high bias)
                if (bestRate < 0.5) {
                    bestRate = 0.6; // Artificial boost
                    bestType = type;
                }
            } else {
                const rate = s.wins / s.gamesPlayed;
                if (rate > bestRate) {
                    bestRate = rate;
                    bestType = type;
                }
            }
        });

        return bestType;
    }

    public generateSetup(playerId: PlayerId, archetype: SetupArchetype): PieceModel[] {
        // Generate list of pieces
        const pieces: PieceModel[] = [];
        let idCounter = playerId * 25;

        const pieceTypes: PieceType[] = [];
        Object.entries(INITIAL_PIECES).forEach(([type, count]) => {
            for (let i = 0; i < count; i++) pieceTypes.push(Number(type) as PieceType);
        });

        // 1. Determine Flag Position based on Archetype
        // Flag must be in HQ (last row, 2 spots)
        // Bottom Player (0): (16, 6) or (16, 8)
        // Right Player (1): (6, 16) or (8, 16) ... wait, coords need mapping
        // We generate for a "Canonical" zone (0 to 5 rows, 5 cols) then rotate/map?
        // Or just hardcode for each player ID.

        // Let's implement specific placement logic for Player 0 (Bottom) and then map for others?
        // No, `Board.tsx` setup usually handles rotation? 
        // Actually `gameLogic` has `randomShuffle`.
        // We will generate a "List of Assignments" -> Index 0 to 29 (30 spots).
        // 25 pieces + 5 empty.

        // This is getting complex to map manually for 4 players.
        // Let's create a "Template" system that assigns weights to positions for each piece rank.

        // Simpler: Just return the Pieces array, but we need to place them? 
        // No, this function should likely return the fully placed BoardNodes or a list of placements.

        // For this task, let's implement a heuristic shuffler.

        const placedPieces: PieceModel[] = [];

        // Define Zones
        // Front: Rows 0-1 (relative to player front)
        // Mid: Rows 2-3
        // Back: Rows 4-5 (HQ row)

        // Sort pieces by rank
        pieceTypes.sort((a, b) => getPieceRank(b) - getPieceRank(a));

        // Archetype Logic
        // ... (We will implement specific distributions)

        // For now, let's return a simple structure that can be used by the board initializer.
        // But initializing the board requires knowing exact coordinates. 

        // Placeholder for the actual placement logic which needs to move to here or be imported.
        // Let's assume we implement the 'smartShuffle' in gameLogic and pass the archetype variables there.
        // For now, this class just manages the 'Selection'.

        return []; // Not used directly, just the state manager for now.
    }
}
