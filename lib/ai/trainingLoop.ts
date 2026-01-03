/**
 * Training Loop for Q-Learning Self-Play
 * Runs games without UI for fast training
 */

import { BoardNode, Piece, PieceType, PlayerId, Position, MoveRecord } from '../types';
import { BOARD_ROWS, BOARD_COLS } from '../constants';
import { createInitialBoard, generateSmartSetup, getPossibleMoves, resolveCombat, checkGameOver } from '../gameLogic';
import { getQLearningAgent, QLearningAgent, StateFeatures, ActionType } from './qlearning';
import { getSetupQLearning, SetupActionType } from './setupLearning';
import { AIEvaluator } from './evaluation';
import { AIPatternLearning } from './learning';
import { AIMemory } from './memory';
import { getNeuralAgent, NeuralAgent } from './neuralAgent';

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
    [PieceType.Engineer]: 25,
    [PieceType.Bomb]: 35,
    [PieceType.Mine]: 20,
    [PieceType.Flag]: 100,
};

export interface TrainingStats {
    gamesPlayed: number;
    team0Wins: number;
    team1Wins: number;
    avgGameLength: number;
    avgReward: number;
}

export interface TrainingConfig {
    numGames: number;
    useQLearning: boolean;
    useNeuralNetwork: boolean;   // NEW: Neural Network flag
    autoLoadModel?: boolean;
    trainOnGames: boolean;
    epsilon: number;
    maxTurnsPerGame: number;
}

const DEFAULT_CONFIG: TrainingConfig = {
    numGames: 100,
    useQLearning: false,        // Default off if NN on
    useNeuralNetwork: true,     // Default on
    autoLoadModel: true,
    trainOnGames: true,
    epsilon: 0.2,
    maxTurnsPerGame: 500,
};

export class TrainingManager {
    private qAgent: QLearningAgent;
    private neuralAgent: NeuralAgent; // NEW
    private stats: TrainingStats;
    private config: TrainingConfig;
    private isTraining: boolean = false;
    private abortTraining: boolean = false;

    private onProgress?: (current: number, total: number, stats: TrainingStats) => void;

    constructor(config?: Partial<TrainingConfig>) {
        this.qAgent = getQLearningAgent();
        this.neuralAgent = getNeuralAgent(); // Init NN Agent
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.stats = {
            gamesPlayed: 0,
            team0Wins: 0,
            team1Wins: 0,
            avgGameLength: 0,
            avgReward: 0,
        };
    }

    public getNeuralAgentInstance(): NeuralAgent {
        return this.neuralAgent;
    }

    public updateConfig(newConfig: Partial<TrainingConfig>) {
        this.config = { ...this.config, ...newConfig };
    }

    public setProgressCallback(callback: (current: number, total: number, stats: TrainingStats) => void) {
        this.onProgress = callback;
    }

    public async runTraining(numGames?: number): Promise<TrainingStats> {
        const gamesToRun = numGames ?? this.config.numGames;
        this.isTraining = true;
        this.abortTraining = false;

        let totalTurns = 0;
        let totalReward = 0;

        // Load NN weights if exists (and configured to do so)
        if (this.config.useNeuralNetwork && this.config.autoLoadModel) {
            await this.neuralAgent.load();
        }

        for (let i = 0; i < gamesToRun && !this.abortTraining; i++) {
            const result = await this.runSingleGame(); // UPDATE: await

            this.stats.gamesPlayed++;
            totalTurns += result.turns;
            totalReward += result.totalReward;

            if (result.winner === 0) {
                this.stats.team0Wins++;
            } else if (result.winner === 1) {
                this.stats.team1Wins++;
            }

            this.stats.avgGameLength = totalTurns / this.stats.gamesPlayed;
            this.stats.avgReward = totalReward / this.stats.gamesPlayed;

            // Report progress every game (for smoother UI in NN training mode which is slower)
            if (this.onProgress) {
                this.onProgress(i + 1, gamesToRun, { ...this.stats });
            }

            // Train NN Model every game (or every N steps)
            if (this.config.useNeuralNetwork && this.config.trainOnGames) {
                const loss = await this.neuralAgent.train();
                console.log(`Game ${i + 1}: Training Loss = ${loss.toFixed(5)}`);
                await this.neuralAgent.save(); // Save periodically
            }

            // Yield to event loop
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        this.qAgent.saveToLocalStorage();
        this.isTraining = false;

        return { ...this.stats };
    }

    // ... (stopTraining, isRunning)

    /**
     * Run a single training game
     */
    private async runSingleGame(): Promise<{ winner: number; turns: number; totalReward: number }> {
        // Initialize board
        const board = createInitialBoard();

        // ... (Setup Logic same)
        const setupLearning = getSetupQLearning();
        const setupsUsed: Record<number, SetupActionType> = {};
        for (let pid = 0; pid < 4; pid++) {
            const recommendedSetup = setupLearning.chooseBestSetup(0.2);
            setupsUsed[pid] = recommendedSetup;
            generateSmartSetup(board, pid as PlayerId, recommendedSetup);
        }

        const deadPlayers: PlayerId[] = [];
        let currentPlayer: PlayerId = 0;
        let turns = 0;
        let totalReward = 0;

        const previousBoards: Map<PlayerId, (BoardNode | null)[][]> = new Map(); // Store board snapshot for NN

        // ... (AI Components same)
        const learning = new AIPatternLearning();
        const evaluator = new AIEvaluator(learning);
        const memory = new AIMemory();

        // ... (Memory Init same)
        const allPieces: Piece[] = [];
        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                if (board[r]?.[c]?.piece) allPieces.push(board[r][c]!.piece!);
            }
        }
        memory.reset(allPieces);
        const history: MoveRecord[] = [];

        while (turns < this.config.maxTurnsPerGame) {
            if (deadPlayers.includes(currentPlayer)) {
                currentPlayer = ((currentPlayer + 1) % 4) as PlayerId;
                continue;
            }

            const possibleMoves: { from: Position; to: Position }[] = [];
            for (let r = 0; r < BOARD_ROWS; r++) {
                for (let c = 0; c < BOARD_COLS; c++) {
                    const piece = board[r]?.[c]?.piece;
                    if (piece?.player === currentPlayer) {
                        const moves = getPossibleMoves(board as BoardNode[][], { x: r, y: c });
                        moves.forEach(to => possibleMoves.push({ from: { x: r, y: c }, to }));
                    }
                }
            }

            if (possibleMoves.length === 0) {
                currentPlayer = ((currentPlayer + 1) % 4) as PlayerId;
                continue;
            }

            // --- Capture State ---
            // For NN, we need exact board state copy if we want to store it in replay buffer
            // We use JSON parse/stringify for safety in this rough implementation
            const currentBoardSnapshot = JSON.parse(JSON.stringify(board));

            // Choose Move
            let bestMove = possibleMoves[0];
            let bestScore = -Infinity;
            const persona = currentPlayer % 2 === 0 ? 'TEAMMATE_SUPPORT' : 'AGGRESSIVE';

            for (const move of possibleMoves) {
                // Evaluator Score (Rules)
                const evalResult = await evaluator.getBestMove(
                    board as (BoardNode | null)[][],
                    [move],
                    memory,
                    currentPlayer,
                    persona as any,
                    history
                );
                let score = evalResult.score;

                // Neural Network Bonus
                if (this.config.useNeuralNetwork) {
                    const nnBonus = await this.neuralAgent.getMoveBonus(board, move.from, move.to, currentPlayer);
                    score += nnBonus;
                }
                // Q-Learning Bonus (Legacy)
                else if (this.config.useQLearning) {
                    const qBonus = this.qAgent.getMoveBonus(board, move.from, move.to, currentPlayer);
                    score += qBonus;
                }

                // Exploration
                if (Math.random() < this.config.epsilon) {
                    score += Math.random() * 500;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestMove = move;
                }
            }

            // Execute Move
            const movingPiece = board[bestMove.from.x]?.[bestMove.from.y]?.piece;
            const targetPiece = board[bestMove.to.x]?.[bestMove.to.y]?.piece;
            if (!movingPiece) { currentPlayer = ((currentPlayer + 1) % 4) as PlayerId; continue; }

            let reward = 0;
            // ... (Combat logic same) ...
            if (targetPiece && targetPiece.player !== currentPlayer) {
                const result = resolveCombat(movingPiece, targetPiece);
                if (result.attackerSurvives && !result.defenderSurvives) {
                    reward += PIECE_VALUES[targetPiece.type] || 10;
                    board[bestMove.to.x]![bestMove.to.y]!.piece = movingPiece;
                    board[bestMove.from.x]![bestMove.from.y]!.piece = null;
                } else if (!result.attackerSurvives && result.defenderSurvives) {
                    reward -= PIECE_VALUES[movingPiece.type] || 10;
                    board[bestMove.from.x]![bestMove.from.y]!.piece = null;
                } else {
                    reward += (PIECE_VALUES[targetPiece.type] || 10) - (PIECE_VALUES[movingPiece.type] || 10);
                    board[bestMove.to.x]![bestMove.to.y]!.piece = null;
                    board[bestMove.from.x]![bestMove.from.y]!.piece = null;
                }
                memory.processBattle(movingPiece, targetPiece, result.details);
            } else {
                board[bestMove.to.x]![bestMove.to.y]!.piece = movingPiece;
                board[bestMove.from.x]![bestMove.from.y]!.piece = null;
            }

            // History Update
            history.push({ turn: turns, player: currentPlayer, from: bestMove.from, to: bestMove.to, piece: movingPiece, capturedPiece: targetPiece ?? undefined });

            const gameOver = checkGameOver(board as BoardNode[][], deadPlayers);
            if (gameOver.newDeadPlayers.length > 0) deadPlayers.push(...gameOver.newDeadPlayers);

            // NN Update
            if (this.config.useNeuralNetwork && this.config.trainOnGames) {
                // Update previous experience
                if (previousBoards.has(currentPlayer)) {
                    // Reward is delayed? No, immediate reward + gamma * next_state_value
                    // We store: (PrevState, Reward, CurrentState)
                    // The 'previousBoard' is from LAST turn? 
                    // No, for simple V(s) learning, we learn V(s) = r + gamma V(s').
                    // But here we need to link State -> Move -> NextState.
                    // This implementation simplifies:
                    // It uses current move's transition.
                    // But 'prevState' is needed.

                    // Actually, let's just use CURRENT transition.
                    // State = currentBoardSnapshot
                    // NextState = board (after move)
                    // Reward = reward.

                    // If we want to capture opponent moves:
                    // Learning V(s) usually implies value of state at START of turn.
                    // So we must wait until NEXT turn to see outcome of opponents?
                    // For now, simplify: Learn from immediate transition.

                    await this.neuralAgent.update(currentBoardSnapshot, reward, board, gameOver.isOver, currentPlayer);
                }
            }

            totalReward += reward;

            if (gameOver.isOver) {
                // Final Rewards
                const winnerTeam = gameOver.winnerTeam!;
                for (let pid = 0; pid < 4; pid++) {
                    const finalReward = (pid % 2 === winnerTeam) ? 1000 : -1000;
                    if (this.config.useNeuralNetwork) {
                        // We can feed a final experience (Last Seen Board -> Result)
                        // But we didn't store last board map perfectly here.
                        // Just ignore final terminal update for this simple v1
                    }
                }
                return { winner: winnerTeam, turns, totalReward };
            }

            turns++;
            currentPlayer = ((currentPlayer + 1) % 4) as PlayerId;
        }

        return { winner: -1, turns, totalReward };
    }

    // ... (rest same)
}

// ... (Singleton same)
// Singleton
let _trainingManager: TrainingManager | null = null;
export function getTrainingManager(config?: Partial<TrainingConfig>, forceNew: boolean = false): TrainingManager {
    if (forceNew) {
        return new TrainingManager(config);
    }
    if (!_trainingManager) {
        _trainingManager = new TrainingManager(config);
    } else if (config) {
        _trainingManager.updateConfig(config);
    }
    return _trainingManager;
}
