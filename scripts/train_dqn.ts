
import * as fs from 'fs';
import * as path from 'path';
import { getTrainingManager } from '../lib/ai/trainingLoop';
import { DQNModel } from '../lib/ai/neuralNet';
import { getNeuralAgent } from '../lib/ai/neuralAgent';

// Polyfill for Node environment
if (typeof (global as any).window === 'undefined') {
    (global as any).window = {};
    (global as any).localStorage = { getItem: () => null, setItem: () => { }, removeItem: () => { } };
}

// Register FS modules globally for neuralNet fallback saving
(globalThis as any).__junqi_fs = fs;
(globalThis as any).__junqi_path = path;

// Helper to ensure model dir exists
function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function main() {
    console.log("=== Junqi AI Cloud Trainer (Auto-Evolving) ===");

    // 1. Try to load @tensorflow/tfjs-node for acceleration
    try {
        require('@tensorflow/tfjs-node');
        console.log("TensorFlow.js Node backend loaded.");
    } catch (e) {
        console.warn("WARNING: @tensorflow/tfjs-node not found. Training will be slow (CPU).");
        console.warn("Please 'npm install @tensorflow/tfjs-node' for speed.");
    }

    const MODELS_DIR = path.resolve(__dirname, '../public/models');
    ensureDir(MODELS_DIR);

    const CHAMPION_PATH = path.join(MODELS_DIR, 'junqi_dqn_v1'); // production model
    const CANDIDATE_PATH = path.resolve(__dirname, '../temp_candidate');
    ensureDir(CANDIDATE_PATH);

    // 2. Load Champion (if exists) or init new
    console.log("Loading Champion Model...");
    const trainer = getTrainingManager({
        numGames: 100,
        useNeuralNetwork: true,
        autoLoadModel: false, // We load manually
        trainOnGames: true
    });

    // The trainer uses the Singleton NeuralAgent. 
    // We will use this singleton as the "Candidate" that evolves.
    const candidateAgent = trainer.getNeuralAgentInstance();

    // Try to load existing champion execution to continue training
    await candidateAgent.load(CHAMPION_PATH);

    // 3. Train Candidate (Self-Play)
    // DIAGNOSTIC TEST #2: Verify alternateStartPlayer fix with identical models
    // Expected result: ~50% for Candidate (proving turn order fix works)
    console.log("\n--- Phase 1: Training Candidate (SKIPPED - Diagnostic Test) ---");
    trainer.updateConfig({ numGames: 0 }); // Skip training entirely

    await trainer.runTraining(); // This trains candidateAgent via update() loops

    console.log("Training complete. Saving Candidate...");
    await candidateAgent.save(CANDIDATE_PATH, { fileSystem: fs, nativePath: path });

    // 4. Arena: Candidate vs Champion
    console.log("\n--- Phase 2: The Arena (Candidate vs Champion) ---");

    // Load Champion Model for comparison
    const championModel = new DQNModel();
    let championExists = false;
    try {
        // Champion path is directory. Check model.json
        if (fs.existsSync(path.join(CHAMPION_PATH, 'model.json'))) {
            await championModel.load(CHAMPION_PATH);
            console.log("Champion loaded for Arena.");
            championExists = true;
        } else {
            console.log("No existing champion model found. First run?");
            console.log("No Champion to fight. Candidate wins by default.");
            await candidateAgent.save(CHAMPION_PATH, { fileSystem: fs, nativePath: path });

            // Initialize Version File
            const versionData = {
                version: `v1.0.${Date.now()}`,
                updated: new Date().toISOString(),
                winRate: 'N/A (First Run)'
            };
            fs.writeFileSync(path.join(MODELS_DIR, 'version.json'), JSON.stringify(versionData, null, 2));
            console.log("New Champion saved to:", CHAMPION_PATH);
            console.log("Initialized Version:", versionData.version);
            return; // Exit main function as candidate is now champion
        }
    } catch (e) {
        console.log("Error loading champion:", e);
        console.log("No Champion to fight due to load error. Candidate wins by default.");
        await candidateAgent.save(CHAMPION_PATH, { fileSystem: fs, nativePath: path });

        // Initialize Version File
        const versionData = {
            version: `v1.0.${Date.now()}`,
            updated: new Date().toISOString(),
            winRate: 'N/A (First Run - Error)'
        };
        fs.writeFileSync(path.join(MODELS_DIR, 'version.json'), JSON.stringify(versionData, null, 2));
        console.log("New Champion saved to:", CHAMPION_PATH);
        console.log("Initialized Version:", versionData.version);
        return; // Exit main function as candidate is now champion
    }

    // Load Candidate Model into a fresh instance for the Arena logic verification
    const candidateModelToCheck = new DQNModel();
    await candidateModelToCheck.load(CANDIDATE_PATH);

    // Setup Arena: P0/P2 use Candidate, P1/P3 use Champion
    candidateAgent.setArenaMode(candidateModelToCheck, championModel);

    // Run Evaluation Games (No Training)
    // IMPORTANT: forceNew=true to get fresh stats (not carry over from Training Phase)
    const arenaTrainer = getTrainingManager({
        numGames: 50, // 50 games for verification
        useNeuralNetwork: true,
        autoLoadModel: false,
        trainOnGames: false, // Important: No learning during Exam
        epsilon: 0.05, // Low exploration
        alternateStartPlayer: true // CRITICAL: Alternate who moves first for fair comparison
    }, true); // forceNew = true

    // Run Duel
    // We intercept progress to enable logging
    arenaTrainer.setProgressCallback((curr, total, stats) => {
        process.stdout.write(`\rArena Game ${curr}/${total}: Cand Wins=${stats.team0Wins} Champ Wins=${stats.team1Wins} Draws=${stats.team0Wins + stats.team1Wins - curr}`);
    });

    const stats = await arenaTrainer.runTraining();

    // Reset Arena Mode
    candidateAgent.clearArenaMode();

    console.log(`\nArena Result: Candidate ${stats.team0Wins} - ${stats.team1Wins} Champion (Draws ${stats.gamesPlayed - stats.team0Wins - stats.team1Wins})`);

    // 5. Decision
    const totalDecisive = stats.team0Wins + stats.team1Wins;
    const candidateWinRate = totalDecisive > 0 ? stats.team0Wins / totalDecisive : 0;

    // Criteria: > 55% Win Rate excluding draws, OR just more wins if games > 10
    if (candidateWinRate > 0.55 && stats.team0Wins > stats.team1Wins) {
        console.log(`\n🎉 New Champion! (Win Rate ${(candidateWinRate * 100).toFixed(1)}%)`);
        console.log("Promoting Candidate to Champion...");
        await candidateModelToCheck.save(CHAMPION_PATH, { fileSystem: fs, nativePath: path });

        // Update Version File
        const versionData = {
            version: `v1.0.${Date.now()}`,
            updated: new Date().toISOString(),
            winRate: (candidateWinRate * 100).toFixed(1) + '%'
        };
        fs.writeFileSync(path.join(MODELS_DIR, 'version.json'), JSON.stringify(versionData, null, 2));
        console.log("Updated Version:", versionData.version);
    } else {
        console.log(`\n❌ Candidate rejected. (Win Rate ${(candidateWinRate * 100).toFixed(1)}%)`);
    }

    // FINAL CHECK: Ensure version file exists (for Vercel display)
    const versionPath = path.join(MODELS_DIR, 'version.json');
    if (!fs.existsSync(versionPath)) {
        console.log("⚠️ No version.json found. Creating initial version file...");
        const initialVersion = {
            version: `v1.0.${Date.now()}`,
            updated: new Date().toISOString(),
            winRate: '0% (Initializing)'
        };
        fs.writeFileSync(versionPath, JSON.stringify(initialVersion, null, 2));
    }
}

if (require.main === module) {
    main().catch(console.error);
}
