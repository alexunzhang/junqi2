
import * as tf from '@tensorflow/tfjs';
import { BoardNode, Piece, PieceType } from '../types';
import { BOARD_ROWS, BOARD_COLS } from '../constants';

// Hyperparameters
const LEARNING_RATE = 0.00001; // Very slow learning for stability (10x slower than before)
const INPUT_SHAPE = [BOARD_ROWS, BOARD_COLS, 7]; // 7 Channels (Added Camp, HQ)
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
            const buffer = tf.buffer([1, BOARD_ROWS, BOARD_COLS, 7]);

            for (let r = 0; r < BOARD_ROWS; r++) {
                for (let c = 0; c < BOARD_COLS; c++) {
                    const node = board[r][c];

                    // Channel 4: Board Features (Static)
                    // Simplified: just 0.5 (placeholder) or specific rail map if needed
                    buffer.set(node?.isRailway ? 1 : 0, 0, r, c, 4);
                    // Channel 5: Campsite
                    buffer.set(node?.type === 'campsite' ? 1 : 0, 0, r, c, 5);
                    // Channel 6: Headquarters
                    buffer.set(node?.type === 'hq' ? 1 : 0, 0, r, c, 6);

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
    // Save/Load
    public async save(path: string, options?: { fileSystem?: any, nativePath?: any }) {
        // Detect Node.js environment reliably (ignoring fake window polyfills)
        const isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;

        if (isNode) {
            // Node.js Environment (File System)
            try {
                // Try standard tfjs-node file:// scheme first
                await this.model.save(`file://${path}`);
            } catch (e: any) {
                // Determine if we need to use custom FS handler (if tfjs-node missing)
                if (e.message && e.message.includes('save handlers')) {
                    // Fallback: Use options or global registry (set by train_dqn.ts in Node)
                    const fs = options?.fileSystem || (globalThis as any).__junqi_fs;
                    const nodePath = options?.nativePath || (globalThis as any).__junqi_path;

                    if (!fs || !nodePath) {
                        console.warn("Cannot fallback to custom FS saver: fs/path modules not provided and not in global registry.");
                        throw e;
                    }
                    console.warn("Retrying save to FS using custom handler...");

                    await this.model.save(tf.io.withSaveHandler(async (artifacts) => {
                        const dirPath = path;
                        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

                        // 1. Save model.json
                        const modelJson = {
                            modelTopology: artifacts.modelTopology,
                            format: artifacts.format,
                            generatedBy: artifacts.generatedBy,
                            convertedBy: artifacts.convertedBy,
                            weightsManifest: [{
                                paths: ['./weights.bin'],
                                weights: artifacts.weightSpecs
                            }]
                        };
                        fs.writeFileSync(nodePath.join(dirPath, 'model.json'), JSON.stringify(modelJson, null, 2));

                        // 2. Save weights.bin
                        if (artifacts.weightData) {
                            // weightData can be ArrayBuffer or ArrayBuffer[]. Standard save produces one buffer.
                            const weightBuffer = artifacts.weightData instanceof ArrayBuffer ? artifacts.weightData : (Array.isArray(artifacts.weightData) ? artifacts.weightData[0] : null);
                            if (weightBuffer) {
                                fs.writeFileSync(nodePath.join(dirPath, 'weights.bin'), Buffer.from(weightBuffer));
                            }
                        }

                        return {
                            modelArtifactsInfo: {
                                dateSaved: new Date(),
                                modelTopologyType: 'JSON',
                                weightDataBytes: artifacts.weightData instanceof ArrayBuffer ? artifacts.weightData.byteLength : 0
                            }
                        };
                    }));
                } else {
                    throw e;
                }
            }
        } else {
            // Browser Environment (LocalStorage)
            await this.model.save(`localstorage://${path}`);
        }
    }

    public async load(path: string) {
        const isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
        try {
            if (isNode) {
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

            // Re-compile model to ensure optimizer/loss are set (critical for resuming training)
            this.model.compile({
                optimizer: tf.train.adam(LEARNING_RATE),
                loss: 'meanSquaredError'
            });

        } catch (e) {
            console.warn("No saved model found at", path, ". Using initialized random model.");
            // Keep the random model created in constructor
        }
    }
}
