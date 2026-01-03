
import * as tf from '@tensorflow/tfjs';
import { BoardNode, Piece, PieceType } from '../types';
import { BOARD_ROWS, BOARD_COLS } from '../constants';

// Hyperparameters
const LEARNING_RATE = 0.001;
const INPUT_SHAPE = [BOARD_ROWS, BOARD_COLS, 5]; // 5 Channels
const REPLAY_CAPACITY = 10000;
const BATCH_SIZE = 32;

// Experience Tuple
interface Experience {
    state: (BoardNode | null)[][];
    playerId: number;
    targetValue: number; // For V(s) learning, target is Reward + Gamma * Value(NextState)
}

/**
 * Deep Q-Network for Junqi
 * Implementing Value Network V(s) -> Score
 */
export class DQNModel {
    public model: tf.LayersModel;
    private replayBuffer: Experience[] = [];

    constructor() {
        this.model = this.createModel();
    }

    // Define CNN Architecture
    private createModel(): tf.LayersModel {
        const model = tf.sequential();

        // Conv Layer 1
        model.add(tf.layers.conv2d({
            inputShape: INPUT_SHAPE,
            filters: 32,
            kernelSize: 3,
            activation: 'relu',
            padding: 'same'
        }));

        // Conv Layer 2
        model.add(tf.layers.conv2d({
            filters: 64,
            kernelSize: 3,
            activation: 'relu',
            padding: 'same'
        }));

        // Flatten
        model.add(tf.layers.flatten());

        // Dense Layers
        model.add(tf.layers.dense({ units: 128, activation: 'relu' }));
        model.add(tf.layers.dense({ units: 1, activation: 'linear' })); // Output: Board Value

        // Compile
        model.compile({
            optimizer: tf.train.adam(LEARNING_RATE),
            loss: 'meanSquaredError'
        });

        return model;
    }

    // Convert Board State to Tensor [1, 17, 17, 5]
    public stateToTensor(board: (BoardNode | null)[][], playerId: number): tf.Tensor {
        return tf.tidy(() => {
            const buffer = tf.buffer([1, BOARD_ROWS, BOARD_COLS, 5]);

            for (let r = 0; r < BOARD_ROWS; r++) {
                for (let c = 0; c < BOARD_COLS; c++) {
                    const node = board[r][c];

                    // Channel 4: Board Features (Static)
                    // Simplified: just 0.5 (placeholder) or specific rail map if needed
                    buffer.set(node?.isRailway ? 1 : 0, 0, r, c, 4);

                    if (node?.piece) {
                        const p = node.piece;
                        const isMe = p.player === playerId;
                        const rankVal = this.getNormalizedRank(p.type);

                        if (isMe) {
                            buffer.set(1, 0, r, c, 0); // My Presence
                            buffer.set(rankVal, 0, r, c, 1); // My Rank
                        } else {
                            buffer.set(1, 0, r, c, 2); // Enemy Presence
                            // Enemy Rank: Only if revealed or known (simplified fog)
                            if (p.isRevealed) {
                                buffer.set(rankVal, 0, r, c, 3);
                            } else {
                                buffer.set(0.5, 0, r, c, 3); // Average/Unknown
                            }
                        }
                    }
                }
            }
            return buffer.toTensor(); // Returns 4D tensor
        });
    }

    // Normalize Rank (Commander=40 -> 1.0, Engineer=32 -> 0.x)
    private getNormalizedRank(type: PieceType): number {
        if (type === PieceType.Flag) return 1.0;
        if (type === PieceType.Mine) return 0.2;
        if (type === PieceType.Bomb) return 0.8;
        return type / 40.0;
    }

    // Predict Value for a single state (V(s))
    public async predict(board: (BoardNode | null)[][], playerId: number): Promise<number> {
        const tensor = this.stateToTensor(board, playerId);
        const prediction = this.model.predict(tensor) as tf.Tensor;
        const data = await prediction.data();
        const value = data[0];

        tensor.dispose();
        prediction.dispose();

        return value;
    }

    // Add experience to replay buffer
    public remember(board: (BoardNode | null)[][], playerId: number, targetValue: number) {
        // Deep clone board to avoid reference issues
        // In full impl, optimize by storing diffs or FEN-like string
        // For simplicity, we reference assuming caller handles cloning or we do simplistic copy
        // Or better: Serialize to simple structural representation?
        // Let's assume passed board is safe or small enough in RAM for now (10k items)

        // LIMITATION: Storing 10k deep-cloned boards is heavy. 17x17 objects.
        // We will perform deep clone here to be safe.
        const boardClone = board.map(row => row.map(node => node ? { ...node, piece: node.piece ? { ...node.piece } : null } : null));

        this.replayBuffer.push({ state: boardClone, playerId, targetValue });
        if (this.replayBuffer.length > REPLAY_CAPACITY) {
            this.replayBuffer.shift();
        }
    }

    // Train on a random batch
    public async trainOnBatch(batchSize: number = BATCH_SIZE): Promise<number> {
        if (this.replayBuffer.length < batchSize) return 0;

        // Sample random batch
        const batch: Experience[] = [];
        const indices = new Set<number>();
        while (batch.length < batchSize) {
            const idx = Math.floor(Math.random() * this.replayBuffer.length);
            if (!indices.has(idx)) {
                indices.add(idx);
                batch.push(this.replayBuffer[idx]);
            }
        }

        // Prepare Inputs (X) and Targets (Y)
        // Note: stateToTensor runs inside tidy, returns tensor. We must manage scope.
        // But map() array of tensors won't autodipose.

        const xTensor = tf.tidy(() => {
            const tensors = batch.map(e => this.stateToTensor(e.state, e.playerId));
            return tf.concat(tensors); // Values will be stacked along axis 0
        });

        const yTensor = tf.tensor1d(batch.map(e => e.targetValue));

        // Train
        const history = await this.model.fit(xTensor, yTensor, {
            epochs: 1,
            batchSize: batchSize,
            verbose: 0
        });

        const loss = history.history.loss[0] as number;

        // Cleanup
        xTensor.dispose();
        yTensor.dispose();

        return loss;
    }

    // Save/Load
    // Save/Load
    public async save(path: string) {
        if (typeof window === 'undefined') {
            // Node.js Environment (File System)
            // Path should be absolute or relative to cwd. 
            // tfjs-node saves as directory containing model.json + weights
            await this.model.save(`file://${path}`);
        } else {
            // Browser Environment (LocalStorage)
            await this.model.save(`localstorage://${path}`);
        }
    }

    public async load(path: string) {
        try {
            if (typeof window === 'undefined') {
                // Node.js: Load from filesystem
                // path is directory. tfjs-node expects path/model.json
                this.model = await tf.loadLayersModel(`file://${path}/model.json`);
                console.log("Model loaded from filesystem:", path);
            } else {
                // Browser: Priority 1 - Static File (Deployment)
                try {
                    this.model = await tf.loadLayersModel(`/models/${path}/model.json`);
                    console.log("Model loaded from server:", path);
                } catch (e) {
                    // Priority 2 - LocalStorage (Local Training)
                    console.log("Server model not found, trying LocalStorage...");
                    this.model = await tf.loadLayersModel(`localstorage://${path}`);
                    console.log("Model loaded from LocalStorage:", path);
                }
            }
        } catch (e) {
            console.warn("No saved model found at", path, ". Using initialized random model.");
            // Keep the random model created in constructor
        }
    }
}
