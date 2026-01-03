import { BoardNode, BoardNodeType, PieceType, PlayerId } from '../types';
import { BOARD_ROWS, BOARD_COLS } from '../constants';

// Data structure for persisted knowledge
interface AIKnowledgeBase {
    version: number;
    // Map of PlayerId -> "Coordinate String" -> Frequency Count
    // e.g. "0" -> "16,7" -> 5 (User placed Flag at 16,7 five times)
    flagLocations: Record<number, Record<string, number>>;
    gameCount: number;
}

const STORAGE_KEY = 'junqi_ai_knowledge_v1';

export class AIPatternLearning {
    private knowledge: AIKnowledgeBase;

    constructor() {
        this.knowledge = this.loadKnowledge();
    }

    private loadKnowledge(): AIKnowledgeBase {
        if (typeof window === 'undefined') return this.createEmptyKnowledge();

        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return this.createEmptyKnowledge();

        try {
            return JSON.parse(stored);
        } catch (e) {
            console.error('Failed to load AI knowledge', e);
            return this.createEmptyKnowledge();
        }
    }

    private createEmptyKnowledge(): AIKnowledgeBase {
        return {
            version: 1,
            flagLocations: {
                0: {}, // User
                1: {}, // Right
                2: {}, // Top
                3: {}  // Left
            },
            gameCount: 0
        };
    }

    // Call this at the end of a game to learn from the final board state
    learnFromGame(finalBoard: (BoardNode | null)[][]) {
        if (typeof window === 'undefined') return;

        let learned = false;

        // Scan board for Flags
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const node = finalBoard[r][c];
                // Note: We learn from the ACTUAL piece, regardless of revealed state
                // because the game is over and everything is revealed for review.
                if (node?.piece && node.piece.type === PieceType.Flag) {
                    const pid = node.piece.player;
                    const key = `${r},${c}`;

                    if (!this.knowledge.flagLocations[pid]) {
                        this.knowledge.flagLocations[pid] = {};
                    }

                    this.knowledge.flagLocations[pid][key] = (this.knowledge.flagLocations[pid][key] || 0) + 1;
                    learned = true;
                }
            }
        }

        if (learned) {
            this.knowledge.gameCount++;
            this.saveKnowledge();
        }
    }

    private saveKnowledge() {
        if (typeof window === 'undefined') return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.knowledge));
    }

    // Returns a probability score (0-1) for a specific position being a Flag
    // based on historical data for that player.
    getFlagProbability(playerId: PlayerId, r: number, c: number): number {
        const history = this.knowledge.flagLocations[playerId];
        if (!history) return 0;

        const key = `${r},${c}`;
        const count = history[key] || 0;
        const totalGames = Math.max(1, this.knowledge.gameCount);

        // Simple frequency: count / totalGames
        // e.g. if user hid flag there 5/10 times, prob is 0.5.
        // Cap at 0.8 to leave room for doubt.
        return Math.min(0.8, count / totalGames);
    }
}
