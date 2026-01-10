
import { BoardNode, PlayerId, Position, Piece } from '../types';
import { DQNModel } from './neuralNet';
import { BOARD_ROWS, BOARD_COLS } from '../constants';

export class NeuralAgent {
    private model: DQNModel;
    private gamma: number = 0.99; // Discount factor
    private lastLoss: number = 0;

    private candidateModel: DQNModel | null = null;
    private championModel: DQNModel | null = null;

    constructor() {
        this.model = new DQNModel();
    }

    public setArenaMode(candidate: DQNModel, champion: DQNModel) {
        this.candidateModel = candidate;
        this.championModel = champion;
    }

    public clearArenaMode() {
        this.candidateModel = null;
        this.championModel = null;
    }

    private getModelForPlayer(pid: number): DQNModel {
        if (this.candidateModel && this.championModel) {
            const isCandidate = (pid % 2 === 0);
            // DEBUG: Log first call per game to verify Arena mode is active
            if (pid === 0 && !this._debugLogged) {
                console.log(`[Arena Debug] Arena Mode ACTIVE. P0 uses Candidate, P1 uses Champion.`);
                this._debugLogged = true;
            }
            return isCandidate ? this.candidateModel : this.championModel;
        }
        // DEBUG: Log if Arena mode is NOT active
        if (pid === 0 && !this._debugLoggedFallback) {
            console.log(`[Arena Debug] Arena Mode INACTIVE! All players use default model.`);
            this._debugLoggedFallback = true;
        }
        return this.model;
    }
    private _debugLogged = false;
    private _debugLoggedFallback = false;

    /**
     * Get value prediction for a state
     */
    public async evaluateState(board: (BoardNode | null)[][], playerId: PlayerId): Promise<number> {
        return await this.getModelForPlayer(playerId).predict(board, playerId);
    }

    /**
     * Get bonus score for a specific move
     * Simulates the move and evaluates the resulting board
     */
    public async getMoveBonus(
        board: (BoardNode | null)[][],
        from: Position,
        to: Position,
        playerId: PlayerId
    ): Promise<number> {
        // 1. Simulate Move
        // We need a lightweight simulation that doesn't affect the main board
        // Deep clone is expensive, but necessary for correctness without Side Effects
        const nextBoard = this.simulateMove(board, from, to);
        if (!nextBoard) return -1000; // Invalid move

        // 2. Predict Value
        const value = await this.getModelForPlayer(playerId).predict(nextBoard, playerId);

        // 3. Scale to Rule Engine magnitude
        // DQN outputs ~ -100 to 100 (Reward cumulative)
        // Rule engine uses ~1000 for small things, 1M for big.
        // Multiplier: 5000 gives NN significant influence on decisions.
        return value * 5000;
    }

    /**
     * Update model memory (Experience Replay)
     */
    public async update(
        board: (BoardNode | null)[][],
        reward: number,
        nextBoard: (BoardNode | null)[][] | null,
        done: boolean,
        playerId: PlayerId
    ): Promise<void> {
        let target = reward;

        const model = this.getModelForPlayer(playerId);

        if (!done && nextBoard) {
            const nextValue = await model.predict(nextBoard, playerId);
            target += this.gamma * nextValue;
        }

        model.remember(board, playerId, target);
    }

    /**
     * Trigger training step
     */
    public async train(): Promise<number> {
        const loss = await this.model.trainOnBatch();
        this.lastLoss = loss;
        return loss;
    }

    /**
     * Save/Load
     */
    public async save(path: string = 'junqi_dqn_v1', options?: any) {
        await this.model.save(path, options);
    }

    public async load(path: string = 'junqi_dqn_v1') {
        await this.model.load(path);
    }

    // --- Helpers ---

    private simulateMove(board: (BoardNode | null)[][], from: Position, to: Position): (BoardNode | null)[][] | null {
        // Lightweight clone
        const newBoard = board.map(row => row.map(node => node ? { ...node, piece: node.piece ? { ...node.piece } : null } : null));

        const piece = newBoard[from.x][from.y]?.piece;
        const target = newBoard[to.x][to.y]?.piece;

        if (!piece) return null;

        if (target) {
            // Battle logic simplified for simulation (assume we win or trade? or Unknown?)
            // For V(s) prediction, we assume the move *happened*. 
            // If picking a move, we should know the outcome? 
            // In Junqi, we DON'T know the outcome if hidden.
            // So we should simulate the "Likely" outcome or "Optimistic" outcome?
            // Actually, the Environment (GameLogic) determines the outcome.
            // But 'nextBoard' passed to 'update' is the REAL outcome.
            // Here in 'getMoveBonus', we are estimating "If I make this move".

            // Assume we take the spot (Optimistic) or handle clear wins.
            // For simplicity in Neural prediction: Assume we move successfully.
            newBoard[to.x][to.y]!.piece = piece;
            newBoard[from.x][from.y]!.piece = null;
        } else {
            // Move to empty
            newBoard[to.x][to.y]!.piece = piece;
            newBoard[from.x][from.y]!.piece = null;
        }

        return newBoard;
    }
}

// Singleton
let _neuralAgent: NeuralAgent | null = null;
export function getNeuralAgent(): NeuralAgent {
    if (!_neuralAgent) {
        _neuralAgent = new NeuralAgent();
    }
    return _neuralAgent;
}
