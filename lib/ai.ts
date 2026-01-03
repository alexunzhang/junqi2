import { BoardNode, Piece as PieceModel, PieceType, PlayerId, Position, MoveRecord } from './types';
import { BOARD_ROWS, BOARD_COLS } from './constants';
import { getPossibleMoves, getPieceRank } from './gameLogic';
import { AIEvaluator } from './ai/evaluation';
import { AIPatternLearning } from './ai/learning';
import { AIMemory } from './ai/memory';

export { AIMemory } from './ai/memory';
// Compatibility alias if Board expects AIMemoryStore
export { AIMemory as AIMemoryStore } from './ai/memory';

export class SmartAI {
    private memory: AIMemory;
    private board: BoardNode[][];
    private me: PlayerId;
    private evaluator: AIEvaluator;
    private persona: 'AGGRESSIVE' | 'OFFENSIVE' | 'BALANCED' | 'TEAMMATE_SUPPORT';

    constructor(
        board: BoardNode[][],
        me: PlayerId,
        memory: AIMemory,
        persona: 'AGGRESSIVE' | 'OFFENSIVE' | 'BALANCED' | 'TEAMMATE_SUPPORT' = 'BALANCED'
    ) {
        this.board = board;
        this.me = me;
        this.memory = memory;

        // Instantiate Evaluator
        // Note: AIEvaluator needs PatternLearning.
        // We instantiate it here. Ideally it should be persistent, but for now this works.
        const learning = new AIPatternLearning();
        this.evaluator = new AIEvaluator(learning);
        this.persona = persona;
    }

    public async getBestMove(history: MoveRecord[]): Promise<{ from: Position, to: Position, score: number } | null> {
        const possibleMoves: { from: Position, to: Position }[] = [];

        for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
                const node = this.board[r][c];
                if (node?.piece && node.piece.player === this.me) {
                    const moves = getPossibleMoves(this.board, { x: r, y: c });
                    moves.forEach(to => {
                        possibleMoves.push({ from: { x: r, y: c }, to });
                    });
                }
            }
        }

        if (possibleMoves.length === 0) return null;

        // Use Minimax with Alpha-Beta Pruning + Neural Network (Hybrid)
        const minimaxResult = await this.evaluator.getBestMoveWithMinimax(
            this.board,
            possibleMoves,
            this.memory,
            this.me,
            this.persona,
            true // Enable Neural Network
        );

        // If Minimax found a move, use it
        if (minimaxResult.move) {
            return { from: minimaxResult.move.from, to: minimaxResult.move.to, score: minimaxResult.score };
        }

        // Fallback to greedy search
        const greedyResult = await this.evaluator.getBestMove(
            this.board,
            possibleMoves,
            this.memory,
            this.me,
            this.persona,
            history,
            true // Enable Neural Network
        );

        if (greedyResult.move) {
            return { from: greedyResult.move.from, to: greedyResult.move.to, score: greedyResult.score };
        }

        return null;
    }
}
