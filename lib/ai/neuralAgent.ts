
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

    // Public getter to access the internal model (for training setup)
    public getModel(): DQNModel {
        return this.model;
    }

    public setArenaMode(candidate: DQNModel, champion: DQNModel) {
        this.candidateModel = candidate;
        this.championModel = champion;
    }

    public clearArenaMode() {
        this.candidateModel = null;
        this.championModel = null;
        this.swapTeams = false;
    }

    // Swap which team uses which model for fair Arena comparison
    public swapTeams: boolean = false;
    public setSwapTeams(swap: boolean) {
        this.swapTeams = swap;
    }

    private getModelForPlayer(pid: number): DQNModel {
        if (this.candidateModel && this.championModel) {
            // Normally: Team 0 (pid 0,2) uses Candidate, Team 1 (pid 1,3) uses Champion
            // When swapTeams=true: Team 0 uses Champion, Team 1 uses Candidate
            const isTeam0 = (pid % 2 === 0);
            const usesCandidateModel = this.swapTeams ? !isTeam0 : isTeam0;

            // DEBUG: Log first call per game to verify Arena mode is active
            if (pid === 0 && !this._debugLogged) {
                const team0Model = this.swapTeams ? 'Champion' : 'Candidate';
                const team1Model = this.swapTeams ? 'Candidate' : 'Champion';
                console.log(`[Arena Debug] Arena Mode ACTIVE. Team0=${team0Model}, Team1=${team1Model}`);
                this._debugLogged = true;
            }
            return usesCandidateModel ? this.candidateModel : this.championModel;
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
        // Multiplier: 10000 gives NN strong influence on decisions (increased from 5000).
        return value * 10000;
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
