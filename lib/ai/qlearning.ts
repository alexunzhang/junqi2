/**
 * Q-Learning Agent for Junqi AI
 * Uses Linear Function Approximation with feature vectors
 */

import { BoardNode, Piece, PieceType, PlayerId, Position } from '../types';
import { BOARD_ROWS, BOARD_COLS } from '../constants';

// Feature vector for state representation
export interface StateFeatures {
    myPieceCount: number;           // 0-25
    enemyPieceCount: number;        // 0-50 (both enemies)
    myHighValuePieces: number;      // Commander, Corps, Division count
    enemyHighValuePieces: number;
    myFlagThreatLevel: number;      // 0-5 scale
    enemyFlagThreatLevel: number;   // 0-5 scale
    distanceToEnemyFlag: number;    // Minimum distance
    piecesNearMyFlag: number;       // Defenders within 3 steps
    isEndgame: number;              // 0 or 1
    enemiesRemaining: number;       // 1 or 2
    teammateStrength: number;       // 0-1 normalized
}

// Simplified action types
export type ActionType =
    | 'ADVANCE'       // Move towards enemy flag
    | 'RETREAT'       // Move towards own flag
    | 'ATTACK_WEAK'   // Attack revealed weaker piece
    | 'ATTACK_UNKNOWN'// Attack unknown piece
    | 'DEFEND'        // Move to protect flag
    | 'SIDEWAYS';     // Lateral move

// Piece values for reward calculation
const PIECE_VALUES: Record<number, number> = {
    [PieceType.Commander]: 50,
    [PieceType.Corps]: 45,
    [PieceType.Division]: 40,
    [PieceType.Brigade]: 35,
    [PieceType.Regiment]: 30,
    [PieceType.Battalion]: 25,
    [PieceType.Company]: 20,
    [PieceType.Platoon]: 15,
    [PieceType.Engineer]: 25, // Can clear mines
    [PieceType.Bomb]: 35,
    [PieceType.Mine]: 20,
    [PieceType.Flag]: 100,
};

const FEATURE_COUNT = 11;
const ACTION_TYPES: ActionType[] = ['ADVANCE', 'RETREAT', 'ATTACK_WEAK', 'ATTACK_UNKNOWN', 'DEFEND', 'SIDEWAYS'];

export class QLearningAgent {
    // Weights for linear function approximation: weights[action][featureIndex]
    private weights: Record<ActionType, number[]>;

    // Hyperparameters
    private alpha: number = 0.05;      // Learning rate
    private gamma: number = 0.95;      // Discount factor
    private epsilon: number = 0.15;    // Exploration rate

    // Training stats
    private gamesPlayed: number = 0;
    private totalReward: number = 0;

    constructor() {
        // Initialize weights to small random values
        this.weights = {} as Record<ActionType, number[]>;
        for (const action of ACTION_TYPES) {
            this.weights[action] = new Array(FEATURE_COUNT).fill(0).map(() => Math.random() * 0.1 - 0.05);
        }

        // Try to load saved weights
        this.loadFromLocalStorage();
    }

    /**
     * Extract features from current board state
     */
    public extractFeatures(board: (BoardNode | null)[][], playerId: PlayerId): StateFeatures {
        const teammateId = ((playerId + 2) % 4) as PlayerId;
        const enemy1Id = ((playerId + 1) % 4) as PlayerId;
        const enemy2Id = ((playerId + 3) % 4) as PlayerId;

        let myPieceCount = 0;
        let enemyPieceCount = 0;
        let myHighValuePieces = 0;
        let enemyHighValuePieces = 0;
        let teammateStrength = 0;
        let myTotalValue = 0;

        let myFlagPos: Position | null = null;
        let enemyFlagPositions: Position[] = [];
        let enemy1Alive = false;
        let enemy2Alive = false;

        // Scan board for pieces
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const piece = board[r]?.[c]?.piece;
                if (!piece) continue;

                const value = PIECE_VALUES[piece.type] || 10;

                if (piece.player === playerId) {
                    myPieceCount++;
                    myTotalValue += value;
                    if (piece.type === PieceType.Flag) {
                        myFlagPos = { x: r, y: c };
                    }
                    if ([PieceType.Commander, PieceType.Corps, PieceType.Division].includes(piece.type)) {
                        myHighValuePieces++;
                    }
                } else if (piece.player === teammateId) {
                    teammateStrength += value;
                } else {
                    // Enemy
                    enemyPieceCount++;
                    if ([PieceType.Commander, PieceType.Corps, PieceType.Division].includes(piece.type)) {
                        enemyHighValuePieces++;
                    }
                    if (piece.type === PieceType.Flag) {
                        enemyFlagPositions.push({ x: r, y: c });
                        if (piece.player === enemy1Id) enemy1Alive = true;
                        if (piece.player === enemy2Id) enemy2Alive = true;
                    }
                }
            }
        }

        // Calculate threat levels
        const myFlagThreatLevel = myFlagPos ? this.calculateThreatLevel(board, myFlagPos, playerId) : 0;

        let enemyFlagThreatLevel = 0;
        for (const pos of enemyFlagPositions) {
            enemyFlagThreatLevel = Math.max(enemyFlagThreatLevel,
                this.calculateThreatLevel(board, pos, playerId, true));
        }

        // Calculate distance to nearest enemy flag
        let distanceToEnemyFlag = 100;
        if (enemyFlagPositions.length > 0) {
            for (let r = 0; r < BOARD_ROWS; r++) {
                for (let c = 0; c < BOARD_COLS; c++) {
                    const piece = board[r]?.[c]?.piece;
                    if (piece?.player === playerId && piece.type !== PieceType.Flag && piece.type !== PieceType.Mine) {
                        for (const flagPos of enemyFlagPositions) {
                            const dist = Math.abs(r - flagPos.x) + Math.abs(c - flagPos.y);
                            distanceToEnemyFlag = Math.min(distanceToEnemyFlag, dist);
                        }
                    }
                }
            }
        }

        // Count defenders near my flag
        let piecesNearMyFlag = 0;
        if (myFlagPos) {
            for (let r = 0; r < BOARD_ROWS; r++) {
                for (let c = 0; c < BOARD_COLS; c++) {
                    const piece = board[r]?.[c]?.piece;
                    if (piece?.player === playerId && piece.type !== PieceType.Flag) {
                        const dist = Math.abs(r - myFlagPos.x) + Math.abs(c - myFlagPos.y);
                        if (dist <= 3) piecesNearMyFlag++;
                    }
                }
            }
        }

        const enemiesRemaining = (enemy1Alive ? 1 : 0) + (enemy2Alive ? 1 : 0);
        const isEndgame = enemiesRemaining === 1 || myPieceCount <= 5 || enemyPieceCount <= 10 ? 1 : 0;

        return {
            myPieceCount: myPieceCount / 25,  // Normalize to 0-1
            enemyPieceCount: enemyPieceCount / 50,
            myHighValuePieces: myHighValuePieces / 3,
            enemyHighValuePieces: enemyHighValuePieces / 6,
            myFlagThreatLevel: myFlagThreatLevel / 5,
            enemyFlagThreatLevel: enemyFlagThreatLevel / 5,
            distanceToEnemyFlag: Math.max(0, 1 - distanceToEnemyFlag / 20),  // Closer = higher
            piecesNearMyFlag: piecesNearMyFlag / 5,
            isEndgame,
            enemiesRemaining: enemiesRemaining / 2,
            teammateStrength: Math.min(1, teammateStrength / 500),
        };
    }

    /**
     * Calculate threat level to a position
     */
    private calculateThreatLevel(
        board: (BoardNode | null)[][],
        pos: Position,
        observerId: PlayerId,
        isEnemyFlag: boolean = false
    ): number {
        let threat = 0;
        const teammateId = ((observerId + 2) % 4) as PlayerId;

        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const piece = board[r]?.[c]?.piece;
                if (!piece) continue;

                // For our flag: threat from enemies
                // For enemy flag: "threat" from our pieces (how close we are)
                const isThreat = isEnemyFlag
                    ? (piece.player === observerId || piece.player === teammateId)
                    : (piece.player !== observerId && piece.player !== teammateId);

                if (!isThreat) continue;
                if (piece.type === PieceType.Flag || piece.type === PieceType.Mine) continue;

                const dist = Math.abs(r - pos.x) + Math.abs(c - pos.y);
                if (dist <= 1) threat += 3;
                else if (dist <= 2) threat += 2;
                else if (dist <= 3) threat += 1;
            }
        }

        return Math.min(5, threat);
    }

    /**
     * Classify a move into an action type
     */
    public classifyMove(
        board: (BoardNode | null)[][],
        from: Position,
        to: Position,
        playerId: PlayerId
    ): ActionType {
        const piece = board[from.x]?.[from.y]?.piece;
        const target = board[to.x]?.[to.y]?.piece;
        const teammateId = ((playerId + 2) % 4) as PlayerId;

        if (!piece) return 'SIDEWAYS';

        // Find enemy flag positions
        let enemyFlagPos: Position | null = null;
        let myFlagPos: Position | null = null;

        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const p = board[r]?.[c]?.piece;
                if (p?.type === PieceType.Flag) {
                    if (p.player === playerId) {
                        myFlagPos = { x: r, y: c };
                    } else if (p.player !== teammateId) {
                        enemyFlagPos = { x: r, y: c };
                    }
                }
            }
        }

        // Attack classification
        if (target && target.player !== playerId && target.player !== teammateId) {
            if (target.isRevealed && piece.type > target.type) {
                return 'ATTACK_WEAK';
            }
            return 'ATTACK_UNKNOWN';
        }

        // Movement classification
        if (enemyFlagPos) {
            const distBefore = Math.abs(from.x - enemyFlagPos.x) + Math.abs(from.y - enemyFlagPos.y);
            const distAfter = Math.abs(to.x - enemyFlagPos.x) + Math.abs(to.y - enemyFlagPos.y);

            if (distAfter < distBefore) return 'ADVANCE';
        }

        if (myFlagPos) {
            const distBefore = Math.abs(from.x - myFlagPos.x) + Math.abs(from.y - myFlagPos.y);
            const distAfter = Math.abs(to.x - myFlagPos.x) + Math.abs(to.y - myFlagPos.y);

            if (distAfter < distBefore) return 'DEFEND';
            if (distAfter > distBefore && enemyFlagPos) {
                const enemyDistAfter = Math.abs(to.x - enemyFlagPos.x) + Math.abs(to.y - enemyFlagPos.y);
                if (enemyDistAfter > distAfter) return 'RETREAT';
            }
        }

        return 'SIDEWAYS';
    }

    /**
     * Calculate Q-value for state-action pair using linear function approximation
     */
    public getQValue(features: StateFeatures, action: ActionType): number {
        const featureArray = this.featuresToArray(features);
        const weights = this.weights[action];

        let qValue = 0;
        for (let i = 0; i < FEATURE_COUNT; i++) {
            qValue += weights[i] * featureArray[i];
        }

        return qValue;
    }

    /**
     * Get Q-value bonus for a specific move (used by hybrid AI)
     */
    public getMoveBonus(
        board: (BoardNode | null)[][],
        from: Position,
        to: Position,
        playerId: PlayerId
    ): number {
        const features = this.extractFeatures(board, playerId);
        const action = this.classifyMove(board, from, to, playerId);
        const qValue = this.getQValue(features, action);

        // Scale Q-value to be a reasonable bonus (e.g., -500 to +500)
        return qValue * 100;
    }

    /**
     * Choose best action using epsilon-greedy policy
     */
    public chooseBestAction(features: StateFeatures, epsilon?: number): ActionType {
        const eps = epsilon ?? this.epsilon;

        // Exploration
        if (Math.random() < eps) {
            return ACTION_TYPES[Math.floor(Math.random() * ACTION_TYPES.length)];
        }

        // Exploitation
        let bestAction = ACTION_TYPES[0];
        let bestValue = -Infinity;

        for (const action of ACTION_TYPES) {
            const value = this.getQValue(features, action);
            if (value > bestValue) {
                bestValue = value;
                bestAction = action;
            }
        }

        return bestAction;
    }

    /**
     * Convert features object to array
     */
    private featuresToArray(features: StateFeatures): number[] {
        return [
            features.myPieceCount,
            features.enemyPieceCount,
            features.myHighValuePieces,
            features.enemyHighValuePieces,
            features.myFlagThreatLevel,
            features.enemyFlagThreatLevel,
            features.distanceToEnemyFlag,
            features.piecesNearMyFlag,
            features.isEndgame,
            features.enemiesRemaining,
            features.teammateStrength,
        ];
    }

    /**
     * Update weights using TD learning
     */
    public update(
        state: StateFeatures,
        action: ActionType,
        reward: number,
        nextState: StateFeatures | null,
        done: boolean
    ): void {
        const currentQ = this.getQValue(state, action);

        let targetQ: number;
        if (done || !nextState) {
            targetQ = reward;
        } else {
            // Find max Q for next state
            let maxNextQ = -Infinity;
            for (const a of ACTION_TYPES) {
                maxNextQ = Math.max(maxNextQ, this.getQValue(nextState, a));
            }
            targetQ = reward + this.gamma * maxNextQ;
        }

        const tdError = targetQ - currentQ;

        // Update weights for this action
        const featureArray = this.featuresToArray(state);
        for (let i = 0; i < FEATURE_COUNT; i++) {
            this.weights[action][i] += this.alpha * tdError * featureArray[i];
        }

        this.totalReward += reward;
    }

    /**
     * Record end of game
     */
    public endGame(won: boolean): void {
        this.gamesPlayed++;

        // Save periodically
        if (this.gamesPlayed % 10 === 0) {
            this.saveToLocalStorage();
        }
    }

    /**
     * Get training statistics
     */
    public getStats(): { gamesPlayed: number; avgReward: number } {
        return {
            gamesPlayed: this.gamesPlayed,
            avgReward: this.gamesPlayed > 0 ? this.totalReward / this.gamesPlayed : 0,
        };
    }

    /**
     * Save weights to localStorage
     */
    public saveToLocalStorage(): void {
        const win = (typeof window !== 'undefined') ? window : (typeof global !== 'undefined' ? (global as any).window : null);
        if (!win || !win.localStorage) return;

        try {
            const data = {
                weights: this.weights,
                gamesPlayed: this.gamesPlayed,
                totalReward: this.totalReward,
                version: 1,
            };
            win.localStorage.setItem('junqi_qlearning_weights', JSON.stringify(data));
        } catch (e) {
            console.warn('Failed to save Q-Learning weights:', e);
        }
    }

    /**
     * Load weights from localStorage
     */
    public loadFromLocalStorage(): void {
        const win = (typeof window !== 'undefined') ? window : (typeof global !== 'undefined' ? (global as any).window : null);
        if (!win || !win.localStorage) return;

        try {
            const saved = win.localStorage.getItem('junqi_qlearning_weights');
            if (saved) {
                const data = JSON.parse(saved);
                if (data.version === 1 && data.weights) {
                    this.weights = data.weights;
                    this.gamesPlayed = data.gamesPlayed || 0;
                    this.totalReward = data.totalReward || 0;
                    console.log(`Q-Learning: Loaded weights from ${this.gamesPlayed} games`);
                }
            }
        } catch (e) {
            console.warn('Failed to load Q-Learning weights:', e);
        }
    }

    /**
     * Reset weights (for fresh training)
     */
    public reset(): void {
        for (const action of ACTION_TYPES) {
            this.weights[action] = new Array(FEATURE_COUNT).fill(0).map(() => Math.random() * 0.1 - 0.05);
        }
        this.gamesPlayed = 0;
        this.totalReward = 0;
        this.saveToLocalStorage();
    }

    /**
     * Adjust hyperparameters
     */
    public setHyperparameters(alpha?: number, gamma?: number, epsilon?: number): void {
        if (alpha !== undefined) this.alpha = alpha;
        if (gamma !== undefined) this.gamma = gamma;
        if (epsilon !== undefined) this.epsilon = epsilon;
    }
}

// Singleton instance for global use
let _qLearningAgent: QLearningAgent | null = null;

export function getQLearningAgent(): QLearningAgent {
    if (!_qLearningAgent) {
        _qLearningAgent = new QLearningAgent();
    }
    return _qLearningAgent;
}
