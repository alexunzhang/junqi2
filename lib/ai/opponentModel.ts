/**
 * Opponent Modeling - Track player habits and patterns
 * Uses localStorage to persist data across sessions
 */

import { PlayerId, Position } from '../types';

interface OpponentProfile {
    // Commander placement heatmap (normalized to player's zone)
    commanderHeatmap: number[][]; // 5x6 grid for each player's zone

    // Average turns before flag is exposed
    avgTurnsToFlagExposure: number;
    gamesPlayed: number;

    // Opening tendencies
    firstMoveColumn: number[]; // Count of which column the first attack came from
}

const STORAGE_KEY = 'junqi_opponent_model';

export class OpponentModel {
    private profiles: Record<PlayerId, OpponentProfile>;

    constructor() {
        this.profiles = this.loadProfiles();
    }

    private loadProfiles(): Record<PlayerId, OpponentProfile> {
        if (typeof window === 'undefined') {
            return this.createDefaultProfiles();
        }

        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.warn('Failed to load opponent profiles:', e);
        }

        return this.createDefaultProfiles();
    }

    private createDefaultProfiles(): Record<PlayerId, OpponentProfile> {
        const defaultProfile = (): OpponentProfile => ({
            commanderHeatmap: Array(5).fill(null).map(() => Array(6).fill(0)),
            avgTurnsToFlagExposure: 50,
            gamesPlayed: 0,
            firstMoveColumn: Array(5).fill(0)
        });

        return {
            0: defaultProfile(),
            1: defaultProfile(),
            2: defaultProfile(),
            3: defaultProfile()
        };
    }

    private saveProfiles(): void {
        if (typeof window === 'undefined') return;

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profiles));
        } catch (e) {
            console.warn('Failed to save opponent profiles:', e);
        }
    }

    // Record where the player placed their Commander at game start
    recordCommanderPosition(playerId: PlayerId, pos: Position): void {
        const profile = this.profiles[playerId];

        // Normalize position to 5x6 zone grid
        // Player 0 (Bottom): rows 11-16, cols 6-11
        // Player 2 (Top): rows 0-5, cols 6-11
        // Player 1 (Right): cols 11-16, rows 6-11
        // Player 3 (Left): cols 0-5, rows 6-11

        let zoneR = 0, zoneC = 0;

        if (playerId === 0) {
            zoneR = pos.x - 11;
            zoneC = pos.y - 6;
        } else if (playerId === 2) {
            zoneR = pos.x;
            zoneC = pos.y - 6;
        } else if (playerId === 1) {
            zoneR = pos.y - 11;
            zoneC = pos.x - 6;
        } else if (playerId === 3) {
            zoneR = pos.y;
            zoneC = pos.x - 6;
        }

        if (zoneR >= 0 && zoneR < 5 && zoneC >= 0 && zoneC < 6) {
            profile.commanderHeatmap[zoneR][zoneC]++;
        }

        this.saveProfiles();
    }

    // Record how many turns until flag was exposed (Commander died)
    recordFlagExposure(playerId: PlayerId, turnCount: number): void {
        const profile = this.profiles[playerId];
        const total = profile.avgTurnsToFlagExposure * profile.gamesPlayed + turnCount;
        profile.gamesPlayed++;
        profile.avgTurnsToFlagExposure = total / profile.gamesPlayed;

        this.saveProfiles();
    }

    // Get likelihood of Commander being in a specific zone position
    getCommanderProbability(playerId: PlayerId, zoneR: number, zoneC: number): number {
        const profile = this.profiles[playerId];

        if (zoneR < 0 || zoneR >= 5 || zoneC < 0 || zoneC >= 6) return 0;

        const totalPlacements = profile.commanderHeatmap.flat().reduce((a, b) => a + b, 0);
        if (totalPlacements === 0) return 1 / 30; // Uniform prior

        return profile.commanderHeatmap[zoneR][zoneC] / totalPlacements;
    }

    // Check if player tends to be aggressive (early flag exposure)
    isAggressivePlayer(playerId: PlayerId): boolean {
        const profile = this.profiles[playerId];
        return profile.gamesPlayed > 3 && profile.avgTurnsToFlagExposure < 40;
    }

    // Get a summary for debugging
    getProfileSummary(playerId: PlayerId): string {
        const profile = this.profiles[playerId];
        return `Games: ${profile.gamesPlayed}, Avg Flag Exposure: ${profile.avgTurnsToFlagExposure.toFixed(1)} turns`;
    }
}
