/**
 * Core types, geometry math, and vector rendering for Asteroids
 */

export type GameState = 'START' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type AsteroidSize = 'large' | 'medium' | 'small';

export interface Point {
  x: number;
  y: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  length?: number;
  angle?: number;
  color?: string;
  isLine?: boolean;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface Asteroid {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: AsteroidSize;
  radius: number;
  angle: number;
  spin: number;
  // Normalized vertex radius offsets (e.g. 0.7 to 1.3)
  offsets: number[];
  numPoints: number;
  pointsValue: number;
}

export interface FlyingSaucer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  shootCooldown: number;
  directionYTimer: number;
  isSmall: boolean;
  pointsValue: number;
}

export interface Ship {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number; // in radians
  radius: number;
  isThrusting: boolean;
  invulnerableTime: number; // in seconds
  exhaustFlicker: number;
}

export interface GameSettings {
  colorTheme: 'classic' | 'phosphor' | 'cyan' | 'amber';
  enableCRT: boolean;
  enableSound: boolean;
  showTouchControls: boolean;
}

export const THEMES = {
  classic: {
    name: 'Classic White',
    stroke: '#FFFFFF',
    glow: 'rgba(255, 255, 255, 0.75)',
    accent: '#FF4444',
    dim: 'rgba(255, 255, 255, 0.35)',
  },
  phosphor: {
    name: 'Phosphor Green',
    stroke: '#39FF14',
    glow: 'rgba(57, 255, 20, 0.8)',
    accent: '#FFD700',
    dim: 'rgba(57, 255, 20, 0.35)',
  },
  cyan: {
    name: 'Vector Cyan',
    stroke: '#00F0FF',
    glow: 'rgba(0, 240, 255, 0.8)',
    accent: '#FF0055',
    dim: 'rgba(0, 240, 255, 0.35)',
  },
  amber: {
    name: 'Retro Amber',
    stroke: '#FFB000',
    glow: 'rgba(255, 176, 0, 0.8)',
    accent: '#FF3300',
    dim: 'rgba(255, 176, 0, 0.35)',
  },
};
