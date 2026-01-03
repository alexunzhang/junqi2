/**
 * Q-Learning for Setup/Placement Strategy
 * Learns which initial piece arrangements lead to better outcomes
 */

import { BoardNode, Piece, PieceType, PlayerId, Position } from '../types';
import { BOARD_ROWS, BOARD_COLS } from '../constants';

// Setup feature vector - describes key aspects of initial placement
export interface SetupFeatures {
    commanderPosition: number;       // 0=front, 0.5=mid, 1=back (normalized)
    corpsPosition: number;           // Same scale
    bombsNearFlag: number;           // 0-1, how many bombs protect flag
    minesAroundFlag: number;         // 0-1, how many mines around flag
    strongPiecesOnRailway: number;   // 0-1, strong pieces on railway
    engineerPosition: number;        // 0=exposed, 1=protected
    flagCorner: number;              // 0=left corner, 1=right corner
    defensiveDepth: number;          // How many layers of defense
}

// Setup action types (templates/archetypes)
export type SetupActionType =
    | 'AGGRESSIVE_BLITZ'    // Commander forward
    | 'DEFENSIVE_TURTLE'    // Commander back, heavy mines
    | 'BALANCED'            // Standard setup
    | 'DECEPTIVE';          // Unusual placement

const SETUP_FEATURE_COUNT = 8;
const SETUP_ACTIONS: SetupActionType[] = ['AGGRESSIVE_BLITZ', 'DEFENSIVE_TURTLE', 'BALANCED', 'DECEPTIVE'];

export class SetupQLearning {
    // Weights for linear function approximation
    private weights: Record<SetupActionType, number[]>;

    // Hyperparameters
    private alpha: number = 0.1;      // Learning rate
    private gamma: number = 0.9;      // Discount factor

    // Statistics
    private setupsPlayed: Record<SetupActionType, number>;
    private setupWins: Record<SetupActionType, number>;

    constructor() {
        this.weights = {} as Record<SetupActionType, number[]>;
        this.setupsPlayed = {} as Record<SetupActionType, number>;
        this.setupWins = {} as Record<SetupActionType, number>;

        for (const action of SETUP_ACTIONS) {
            this.weights[action] = new Array(SETUP_FEATURE_COUNT).fill(0).map(() => Math.random() * 0.1 - 0.05);
            this.setupsPlayed[action] = 0;
            this.setupWins[action] = 0;
        }

        this.loadFromLocalStorage();
    }

    /**
     * Extract features from a completed setup
     */
    public extractFeatures(board: (BoardNode | null)[][], playerId: PlayerId): SetupFeatures {
        let commanderRow = 0;
        let corpsRow = 0;
        let commanderFound = false;
        let corpsFound = false;
        let bombsNearFlag = 0;
        let minesAroundFlag = 0;
        let strongOnRailway = 0;
        let engineerProtected = 0;
        let flagCol = 0;
        let flagRow = 0;

        const strongTypes = [PieceType.Commander, PieceType.Corps, PieceType.Division, PieceType.Brigade];

        // First pass: find flag and count pieces
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const piece = board[r]?.[c]?.piece;
                if (!piece || piece.player !== playerId) continue;

                if (piece.type === PieceType.Flag) {
                    flagRow = r;
                    flagCol = c;
                }
            }
        }

        // Second pass: analyze positions relative to flag
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const piece = board[r]?.[c]?.piece;
                const node = board[r]?.[c];
                if (!piece || piece.player !== playerId) continue;

                const distToFlag = Math.abs(r - flagRow) + Math.abs(c - flagCol);

                if (piece.type === PieceType.Commander) {
                    commanderRow = r;
                    commanderFound = true;
                }

                if (piece.type === PieceType.Corps) {
                    corpsRow = r;
                    corpsFound = true;
                }

                if (piece.type === PieceType.Bomb && distToFlag <= 2) {
                    bombsNearFlag++;
                }

                if (piece.type === PieceType.Mine && distToFlag <= 1) {
                    minesAroundFlag++;
                }

                if (node?.isRailway && strongTypes.includes(piece.type)) {
                    strongOnRailway++;
                }

                if (piece.type === PieceType.Engineer) {
                    // Engineer is protected if in back rows
                    engineerProtected += (r > flagRow - 2) ? 1 : 0;
                }
            }
        }

        // Normalize based on player position
        // Player 0 is bottom, so higher row = more forward
        // Player 2 is top, so lower row = more forward
        const isBottomPlayer = playerId === 0 || playerId === 3;
        const maxRow = isBottomPlayer ? BOARD_ROWS - 1 : 0;

        const normalizePosition = (row: number) => {
            if (isBottomPlayer) {
                return 1 - (row / BOARD_ROWS); // Higher row = more back for bottom player
            } else {
                return row / BOARD_ROWS; // Higher row = more forward for top player
            }
        };

        return {
            commanderPosition: commanderFound ? normalizePosition(commanderRow) : 0.5,
            corpsPosition: corpsFound ? normalizePosition(corpsRow) : 0.5,
            bombsNearFlag: Math.min(1, bombsNearFlag / 2),
            minesAroundFlag: Math.min(1, minesAroundFlag / 3),
            strongPiecesOnRailway: Math.min(1, strongOnRailway / 4),
            engineerPosition: Math.min(1, engineerProtected / 3),
            flagCorner: flagCol < BOARD_COLS / 2 ? 0 : 1,
            defensiveDepth: Math.min(1, (bombsNearFlag + minesAroundFlag) / 5),
        };
    }

    /**
     * Classify a setup into an action type based on its features
     */
    public classifySetup(features: SetupFeatures): SetupActionType {
        if (features.commanderPosition < 0.3 && features.corpsPosition < 0.4) {
            return 'AGGRESSIVE_BLITZ';
        }
        if (features.defensiveDepth > 0.6 && features.commanderPosition > 0.6) {
            return 'DEFENSIVE_TURTLE';
        }
        // Deceptive: flag on one side, commander on the other
        const commanderOnRight = features.commanderPosition > 0.5;
        const flagOnRight = features.flagCorner > 0.5;
        if (commanderOnRight !== flagOnRight) {
            return 'DECEPTIVE';
        }
        return 'BALANCED';
    }

    /**
     * Get Q-value for setup-action pair
     */
    public getQValue(features: SetupFeatures, action: SetupActionType): number {
        const featureArray = this.featuresToArray(features);
        const weights = this.weights[action];

        let qValue = 0;
        for (let i = 0; i < SETUP_FEATURE_COUNT; i++) {
            qValue += weights[i] * featureArray[i];
        }
        return qValue;
    }

    /**
     * Choose best setup action
     */
    public chooseBestSetup(epsilon: number = 0.1): SetupActionType {
        // Exploration
        if (Math.random() < epsilon) {
            return SETUP_ACTIONS[Math.floor(Math.random() * SETUP_ACTIONS.length)];
        }

        // Exploitation: choose based on win rate + Q-value
        let bestAction = SETUP_ACTIONS[0];
        let bestScore = -Infinity;

        for (const action of SETUP_ACTIONS) {
            const played = this.setupsPlayed[action] || 1;
            const wins = this.setupWins[action] || 0;
            const winRate = wins / played;

            // Simple UCB-like score
            const exploration = Math.sqrt(2 * Math.log(this.getTotalGames() + 1) / played);
            const score = winRate + 0.5 * exploration;

            if (score > bestScore) {
                bestScore = score;
                bestAction = action;
            }
        }

        return bestAction;
    }

    /**
     * Get recommended setup archetype with explanation
     */
    public getRecommendedSetup(): { archetype: SetupActionType; confidence: number; reason: string } {
        const best = this.chooseBestSetup(0); // No exploration for recommendation
        const played = this.setupsPlayed[best] || 0;
        const wins = this.setupWins[best] || 0;
        const winRate = played > 0 ? wins / played : 0;

        return {
            archetype: best,
            confidence: Math.min(1, played / 100), // More data = more confidence
            reason: `胜率 ${(winRate * 100).toFixed(1)}% (${wins}/${played}局)`,
        };
    }

    private featuresToArray(features: SetupFeatures): number[] {
        return [
            features.commanderPosition,
            features.corpsPosition,
            features.bombsNearFlag,
            features.minesAroundFlag,
            features.strongPiecesOnRailway,
            features.engineerPosition,
            features.flagCorner,
            features.defensiveDepth,
        ];
    }

    /**
     * Record game result for a setup
     */
    public recordResult(action: SetupActionType, won: boolean): void {
        this.setupsPlayed[action] = (this.setupsPlayed[action] || 0) + 1;
        if (won) {
            this.setupWins[action] = (this.setupWins[action] || 0) + 1;
        }

        // Save periodically
        if (this.getTotalGames() % 10 === 0) {
            this.saveToLocalStorage();
        }
    }

    /**
     * Update weights using simple gradient
     */
    public update(features: SetupFeatures, action: SetupActionType, reward: number): void {
        const featureArray = this.featuresToArray(features);
        const currentQ = this.getQValue(features, action);
        const error = reward - currentQ;

        for (let i = 0; i < SETUP_FEATURE_COUNT; i++) {
            this.weights[action][i] += this.alpha * error * featureArray[i];
        }
    }

    private getTotalGames(): number {
        return Object.values(this.setupsPlayed).reduce((a, b) => a + b, 0);
    }

    /**
     * Get statistics
     */
    public getStats(): Record<SetupActionType, { played: number; wins: number; winRate: number }> {
        const stats: Record<string, { played: number; wins: number; winRate: number }> = {};

        for (const action of SETUP_ACTIONS) {
            const played = this.setupsPlayed[action] || 0;
            const wins = this.setupWins[action] || 0;
            stats[action] = {
                played,
                wins,
                winRate: played > 0 ? wins / played : 0,
            };
        }

        return stats as Record<SetupActionType, { played: number; wins: number; winRate: number }>;
    }

    public saveToLocalStorage(): void {
        if (typeof window === 'undefined') return;

        try {
            const data = {
                weights: this.weights,
                setupsPlayed: this.setupsPlayed,
                setupWins: this.setupWins,
                version: 1,
            };
            localStorage.setItem('junqi_setup_qlearning', JSON.stringify(data));
        } catch (e) {
            console.warn('Failed to save setup Q-Learning:', e);
        }
    }

    public loadFromLocalStorage(): void {
        if (typeof window === 'undefined') return;

        try {
            const saved = localStorage.getItem('junqi_setup_qlearning');
            if (saved) {
                const data = JSON.parse(saved);
                if (data.version === 1) {
                    this.weights = data.weights || this.weights;
                    this.setupsPlayed = data.setupsPlayed || this.setupsPlayed;
                    this.setupWins = data.setupWins || this.setupWins;
                }
            }
        } catch (e) {
            console.warn('Failed to load setup Q-Learning:', e);
        }
    }

    public reset(): void {
        for (const action of SETUP_ACTIONS) {
            this.weights[action] = new Array(SETUP_FEATURE_COUNT).fill(0).map(() => Math.random() * 0.1 - 0.05);
            this.setupsPlayed[action] = 0;
            this.setupWins[action] = 0;
        }
        this.saveToLocalStorage();
    }
}

// Singleton
let _setupQLearning: SetupQLearning | null = null;

export function getSetupQLearning(): SetupQLearning {
    if (!_setupQLearning) {
        _setupQLearning = new SetupQLearning();
    }
    return _setupQLearning;
}
