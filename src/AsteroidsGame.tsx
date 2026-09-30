import React, { useEffect, useRef, useState, useCallback } from 'react';
import { sounds } from './audio';
import {
  GameState,
  Asteroid,
  AsteroidSize,
  Bullet,
  Particle,
  Ship,
  FlyingSaucer,
  THEMES,
  GameSettings,
} from './gameTypes';
import {
  Volume2,
  VolumeX,
  Tv,
  RotateCcw,
  Sparkles,
  Gamepad2,
  Share2,
  Check,
  Play,
  Pause,
  Info,
} from 'lucide-react';

const SHIP_RADIUS = 16;
const SHIP_THRUST = 450;
const SHIP_ROTATION_SPEED = 5.2; // radians per second
const SHIP_FRICTION = 0.985;
const SHIP_MAX_SPEED = 520;
const BULLET_SPEED = 700;
const BULLET_MAX_LIFE = 1.35; // seconds
const BULLET_MAX_COUNT = 6;
const INVULNERABLE_DURATION = 3.0; // seconds

export default function AsteroidsGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Settings State
  const [settings, setSettings] = useState<GameSettings>({
    colorTheme: 'classic',
    enableCRT: true,
    enableSound: true,
    showTouchControls: false,
  });

  // UI States
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      return parseInt(localStorage.getItem('asteroids_vector_highscore') || '0', 10);
    } catch {
      return 0;
    }
  });
  const [lives, setLives] = useState<number>(3);
  const [wave, setWave] = useState<number>(1);
  const [waveClearBanner, setWaveClearBanner] = useState<boolean>(false);
  const [showCodeModal, setShowCodeModal] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);

  // References for Game Loop (avoiding stale closures)
  const gameStateRef = useRef<GameState>('START');
  const scoreRef = useRef<number>(0);
  const highScoreRef = useRef<number>(highScore);
  const livesRef = useRef<number>(3);
  const waveRef = useRef<number>(1);
  const nextExtraLifeRef = useRef<number>(10000);

  // World entities
  const shipRef = useRef<Ship | null>(null);
  const asteroidsRef = useRef<Asteroid[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const saucerBulletsRef = useRef<Bullet[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const saucerRef = useRef<FlyingSaucer | null>(null);

  // Beat tempo tracker
  const beatTimerRef = useRef<number>(0);
  const saucerTimerRef = useRef<number>(20); // Time until first saucer

  // Keys active
  const keysRef = useRef<{
    left: boolean;
    right: boolean;
    up: boolean;
    space: boolean;
    down: boolean;
  }>({
    left: false,
    right: false,
    up: false,
    space: false,
    down: false,
  });

  // Keep refs in sync
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    highScoreRef.current = highScore;
  }, [highScore]);

  useEffect(() => {
    livesRef.current = lives;
  }, [lives]);

  useEffect(() => {
    waveRef.current = wave;
  }, [wave]);

  // Audio mute sync
  useEffect(() => {
    sounds.setMuted(!settings.enableSound);
  }, [settings.enableSound]);

  // Detect touch device for default touch controls
  useEffect(() => {
    if (typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
      setSettings(prev => ({ ...prev, showTouchControls: true }));
    }
  }, []);

  // Helper: Create jagged asteroid
  const createAsteroid = (
    x: number,
    y: number,
    size: AsteroidSize,
    speedMultiplier: number = 1
  ): Asteroid => {
    let radius = 48;
    let pointsValue = 20;
    let baseSpeed = 45;

    if (size === 'medium') {
      radius = 26;
      pointsValue = 50;
      baseSpeed = 80;
    } else if (size === 'small') {
      radius = 14;
      pointsValue = 100;
      baseSpeed = 130;
    }

    const moveAngle = Math.random() * Math.PI * 2;
    const speed = (baseSpeed * (0.8 + Math.random() * 0.4)) * speedMultiplier;

    // Generate 10-12 random polygon vertex offsets for authentic jagged Asteroids silhouette
    const numPoints = 10 + Math.floor(Math.random() * 4);
    const offsets: number[] = [];
    for (let i = 0; i < numPoints; i++) {
      // Offset between 0.72 and 1.28
      offsets.push(0.72 + Math.random() * 0.56);
    }

    return {
      id: Math.random(),
      x,
      y,
      vx: Math.cos(moveAngle) * speed,
      vy: Math.sin(moveAngle) * speed,
      size,
      radius,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 1.8,
      offsets,
      numPoints,
      pointsValue,
    };
  };

  // Helper: Spawn new asteroid wave
  const spawnAsteroidWave = (waveNum: number, width: number, height: number, safeShipX: number, safeShipY: number) => {
    const count = Math.min(3 + waveNum, 11);
    const speedMult = 1 + (waveNum - 1) * 0.08;
    const list: Asteroid[] = [];

    for (let i = 0; i < count; i++) {
      let x = 0;
      let y = 0;
      let dist = 0;

      // Spawn away from ship
      let attempts = 0;
      do {
        x = Math.random() * width;
        y = Math.random() * height;
        const dx = x - safeShipX;
        const dy = y - safeShipY;
        dist = Math.sqrt(dx * dx + dy * dy);
        attempts++;
      } while (dist < 220 && attempts < 100);

      list.push(createAsteroid(x, y, 'large', speedMult));
    }
    asteroidsRef.current = list;
  };

  // Helper: Create particle explosion
  const createExplosionParticles = (x: number, y: number, count: number, maxSpeed: number, isLine: boolean = true) => {
    const list: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * maxSpeed + 25;
      const life = 0.4 + Math.random() * 0.5;
      list.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        length: isLine ? 4 + Math.random() * 8 : undefined,
        angle: Math.random() * Math.PI * 2,
        isLine,
      });
    }
    particlesRef.current.push(...list);
  };

  // Helper: Create ship breaking into 4 line segments
  const createShipDeathParticles = (ship: Ship) => {
    const angles = [ship.angle, ship.angle + 2, ship.angle - 2, ship.angle + Math.PI];
    for (let i = 0; i < 4; i++) {
      const dir = angles[i];
      const speed = 70 + Math.random() * 80;
      particlesRef.current.push({
        x: ship.x,
        y: ship.y,
        vx: ship.vx * 0.4 + Math.cos(dir) * speed,
        vy: ship.vy * 0.4 + Math.sin(dir) * speed,
        life: 1.8,
        maxLife: 1.8,
        length: 12 + Math.random() * 6,
        angle: dir,
        isLine: true,
      });
    }
    createExplosionParticles(ship.x, ship.y, 25, 180, false);
  };

  // Helper: Reset/Respawn Ship
  const spawnShip = (width: number, height: number): Ship => {
    return {
      x: width / 2,
      y: height / 2,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2, // Points straight up
      radius: SHIP_RADIUS,
      isThrusting: false,
      invulnerableTime: INVULNERABLE_DURATION,
      exhaustFlicker: 0,
    };
  };

  // Hyperspace Teleport Handler
  const triggerHyperspace = useCallback(() => {
    if (gameStateRef.current !== 'PLAYING' || !shipRef.current || shipRef.current.invulnerableTime > 2.5) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    sounds.playHyperspace();

    // Create warp particle burst at current position
    createExplosionParticles(shipRef.current.x, shipRef.current.y, 20, 240, false);

    // Pick random location
    const margin = 80;
    shipRef.current.x = margin + Math.random() * (canvas.width - margin * 2);
    shipRef.current.y = margin + Math.random() * (canvas.height - margin * 2);
    shipRef.current.vx = 0;
    shipRef.current.vy = 0;
    shipRef.current.invulnerableTime = 1.0; // Short shield after warp

    // Warp flash at new location
    createExplosionParticles(shipRef.current.x, shipRef.current.y, 20, 200, false);
  }, []);

  // Fire Bullet Handler
  const fireBullet = useCallback(() => {
    if (gameStateRef.current !== 'PLAYING' || !shipRef.current) return;
    if (bulletsRef.current.length >= BULLET_MAX_COUNT) return;

    const ship = shipRef.current;
    sounds.playLaser();

    // Spawn at ship nose
    const noseX = ship.x + Math.cos(ship.angle) * ship.radius;
    const noseY = ship.y + Math.sin(ship.angle) * ship.radius;

    bulletsRef.current.push({
      x: noseX,
      y: noseY,
      vx: Math.cos(ship.angle) * BULLET_SPEED + ship.vx * 0.25,
      vy: Math.sin(ship.angle) * BULLET_SPEED + ship.vy * 0.25,
      life: BULLET_MAX_LIFE,
    });
  }, []);

  // Start / Restart Game
  const startNewGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setScore(0);
    setLives(3);
    setWave(1);
    setWaveClearBanner(false);
    nextExtraLifeRef.current = 10000;

    scoreRef.current = 0;
    livesRef.current = 3;
    waveRef.current = 1;

    bulletsRef.current = [];
    saucerBulletsRef.current = [];
    particlesRef.current = [];
    saucerRef.current = null;
    saucerTimerRef.current = 25;

    const ship = spawnShip(canvas.width, canvas.height);
    shipRef.current = ship;

    spawnAsteroidWave(1, canvas.width, canvas.height, ship.x, ship.y);
    setGameState('PLAYING');
    gameStateRef.current = 'PLAYING';
  }, []);

  // Pause / Resume
  const togglePause = useCallback(() => {
    if (gameStateRef.current === 'PLAYING') {
      sounds.stopThrust();
      setGameState('PAUSED');
    } else if (gameStateRef.current === 'PAUSED') {
      setGameState('PLAYING');
    }
  }, []);

  // Keyboard Event Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent scrolling with arrows/space
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }

      if (e.key === ' ' || e.code === 'Space') {
        if (gameStateRef.current === 'START' || gameStateRef.current === 'GAME_OVER') {
          startNewGame();
          return;
        }
        if (gameStateRef.current === 'PLAYING' && !keysRef.current.space) {
          keysRef.current.space = true;
          fireBullet();
        }
      }

      if (e.key === 'Enter') {
        if (gameStateRef.current === 'START' || gameStateRef.current === 'GAME_OVER') {
          startNewGame();
          return;
        }
      }

      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        togglePause();
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keysRef.current.left = true;
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keysRef.current.right = true;
      }
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        keysRef.current.up = true;
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        if (!keysRef.current.down) {
          keysRef.current.down = true;
          triggerHyperspace();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keysRef.current.left = false;
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keysRef.current.right = false;
      }
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        keysRef.current.up = false;
      }
      if (e.key === ' ' || e.code === 'Space') {
        keysRef.current.space = false;
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        keysRef.current.down = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [fireBullet, startNewGame, togglePause, triggerHyperspace]);

  // Main Canvas & Simulation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    // Resize Canvas to fit container with high DPI sharpness
    const handleResize = () => {
      if (!containerRef.current || !canvas) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      // If in start mode and no asteroids, create a few ambient background asteroids
      if (gameStateRef.current === 'START' && asteroidsRef.current.length === 0) {
        spawnAsteroidWave(1, rect.width, rect.height, rect.width / 2, rect.height / 2);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Initial ambient asteroids for Title screen
    if (asteroidsRef.current.length === 0) {
      const rect = containerRef.current?.getBoundingClientRect();
      const w = rect?.width || 800;
      const h = rect?.height || 600;
      spawnAsteroidWave(1, w, h, w / 2, h / 2);
    }

    // Wrap-around coordinate helper
    const wrapCoordinates = (x: number, y: number, margin: number = 0, width: number, height: number) => {
      let nx = x;
      let ny = y;
      if (nx < -margin) nx += width + margin * 2;
      else if (nx > width + margin) nx -= width + margin * 2;
      if (ny < -margin) ny += height + margin * 2;
      else if (ny > height + margin) ny -= height + margin * 2;
      return { x: nx, y: ny };
    };

    // Vector drawing helper: Draw with screen wrap continuity
    const drawWrapped = (
      x: number,
      y: number,
      radius: number,
      width: number,
      height: number,
      drawFn: (ox: number, oy: number) => void
    ) => {
      // Primary
      drawFn(x, y);

      // Draw ghost copies if crossing screen borders
      const nearLeft = x < radius;
      const nearRight = x > width - radius;
      const nearTop = y < radius;
      const nearBottom = y > height - radius;

      if (nearLeft) drawFn(x + width, y);
      if (nearRight) drawFn(x - width, y);
      if (nearTop) drawFn(x, y + height);
      if (nearBottom) drawFn(x, y - height);

      // Corners
      if (nearLeft && nearTop) drawFn(x + width, y + height);
      if (nearLeft && nearBottom) drawFn(x + width, y - height);
      if (nearRight && nearTop) drawFn(x - width, y + height);
      if (nearRight && nearBottom) drawFn(x - width, y - height);
    };

    // Game loop step
    const gameLoop = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.05); // cap delta
      lastTime = currentTime;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      const theme = THEMES[settings.colorTheme];

      // 1. UPDATE SIMULATION
      if (gameStateRef.current === 'PLAYING') {
        const ship = shipRef.current;

        // Thrust sound & physics
        if (ship) {
          // Rotation
          if (keysRef.current.left) {
            ship.angle -= SHIP_ROTATION_SPEED * dt;
          }
          if (keysRef.current.right) {
            ship.angle += SHIP_ROTATION_SPEED * dt;
          }

          // Thrust
          if (keysRef.current.up) {
            ship.isThrusting = true;
            ship.exhaustFlicker = (ship.exhaustFlicker + 1) % 6;
            ship.vx += Math.cos(ship.angle) * SHIP_THRUST * dt;
            ship.vy += Math.sin(ship.angle) * SHIP_THRUST * dt;
            sounds.startThrust();
          } else {
            ship.isThrusting = false;
            sounds.stopThrust();
          }

          // Realistic inertial friction
          const friction = Math.pow(SHIP_FRICTION, dt * 60);
          ship.vx *= friction;
          ship.vy *= friction;

          // Clamp max speed
          const speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
          if (speed > SHIP_MAX_SPEED) {
            const ratio = SHIP_MAX_SPEED / speed;
            ship.vx *= ratio;
            ship.vy *= ratio;
          }

          // Move
          ship.x += ship.vx * dt;
          ship.y += ship.vy * dt;

          // Screen Wrap
          const wrapped = wrapCoordinates(ship.x, ship.y, 0, width, height);
          ship.x = wrapped.x;
          ship.y = wrapped.y;

          // Invulnerability timer
          if (ship.invulnerableTime > 0) {
            ship.invulnerableTime = Math.max(0, ship.invulnerableTime - dt);
          }
        }

        // Saucer spawning & logic
        saucerTimerRef.current -= dt;
        if (saucerTimerRef.current <= 0 && !saucerRef.current && waveRef.current >= 2) {
          const isSmall = waveRef.current >= 4 && Math.random() > 0.4;
          const fromLeft = Math.random() > 0.5;
          const radius = isSmall ? 12 : 20;
          const speed = isSmall ? 160 : 110;
          saucerRef.current = {
            x: fromLeft ? -radius : width + radius,
            y: 80 + Math.random() * (height - 160),
            vx: fromLeft ? speed : -speed,
            vy: (Math.random() - 0.5) * 60,
            radius,
            shootCooldown: 1.8,
            directionYTimer: 2.0,
            isSmall,
            pointsValue: isSmall ? 1000 : 200,
          };
          saucerTimerRef.current = 28 + Math.random() * 15;
        }

        // Update Flying Saucer
        if (saucerRef.current) {
          const saucer = saucerRef.current;
          saucer.x += saucer.vx * dt;
          saucer.y += saucer.vy * dt;

          saucer.directionYTimer -= dt;
          if (saucer.directionYTimer <= 0) {
            saucer.vy = (Math.random() - 0.5) * 80;
            saucer.directionYTimer = 1.5 + Math.random();
          }

          // Saucer shooting
          saucer.shootCooldown -= dt;
          if (saucer.shootCooldown <= 0) {
            let shootAngle = Math.random() * Math.PI * 2;
            // Small saucer aims roughly towards ship
            if (saucer.isSmall && ship) {
              const dx = ship.x - saucer.x;
              const dy = ship.y - saucer.y;
              shootAngle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.4;
            }
            saucerBulletsRef.current.push({
              x: saucer.x,
              y: saucer.y,
              vx: Math.cos(shootAngle) * (BULLET_SPEED * 0.65),
              vy: Math.sin(shootAngle) * (BULLET_SPEED * 0.65),
              life: BULLET_MAX_LIFE * 1.1,
            });
            sounds.playLaser();
            saucer.shootCooldown = saucer.isSmall ? 1.6 : 2.2;
          }

          // Off screen removal
          if (
            (saucer.vx > 0 && saucer.x > width + 50) ||
            (saucer.vx < 0 && saucer.x < -50)
          ) {
            saucerRef.current = null;
          }
        }

        // Beat rhythm sound (Atari heartbeat accelerates as asteroid count drops)
        const totalAsteroids = asteroidsRef.current.length;
        const beatInterval = Math.max(0.28, Math.min(1.4, totalAsteroids * 0.12));
        beatTimerRef.current += dt;
        if (beatTimerRef.current >= beatInterval) {
          beatTimerRef.current = 0;
          sounds.playBeat();
        }

        // Check if wave is completed
        if (asteroidsRef.current.length === 0 && !waveClearBanner) {
          setWaveClearBanner(true);
          sounds.playWaveCleared();
          const nextWave = waveRef.current + 1;
          setWave(nextWave);
          waveRef.current = nextWave;

          setTimeout(() => {
            if (gameStateRef.current === 'PLAYING') {
              const currentShip = shipRef.current;
              spawnAsteroidWave(
                nextWave,
                width,
                height,
                currentShip ? currentShip.x : width / 2,
                currentShip ? currentShip.y : height / 2
              );
              setWaveClearBanner(false);
            }
          }, 2400);
        }
      } else {
        sounds.stopThrust();
      }

      // Update Asteroids (even on Title Screen for cinematic background)
      const currentAsteroids = asteroidsRef.current;
      for (let i = 0; i < currentAsteroids.length; i++) {
        const ast = currentAsteroids[i];
        ast.x += ast.vx * dt;
        ast.y += ast.vy * dt;
        ast.angle += ast.spin * dt;
        const wrapped = wrapCoordinates(ast.x, ast.y, ast.radius, width, height);
        ast.x = wrapped.x;
        ast.y = wrapped.y;
      }

      // Update Bullets
      const activeBullets: Bullet[] = [];
      for (let i = 0; i < bulletsRef.current.length; i++) {
        const b = bulletsRef.current[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        const wrapped = wrapCoordinates(b.x, b.y, 0, width, height);
        b.x = wrapped.x;
        b.y = wrapped.y;
        if (b.life > 0) {
          activeBullets.push(b);
        }
      }
      bulletsRef.current = activeBullets;

      // Update Saucer Bullets
      const activeSaucerBullets: Bullet[] = [];
      for (let i = 0; i < saucerBulletsRef.current.length; i++) {
        const sb = saucerBulletsRef.current[i];
        sb.x += sb.vx * dt;
        sb.y += sb.vy * dt;
        sb.life -= dt;
        const wrapped = wrapCoordinates(sb.x, sb.y, 0, width, height);
        sb.x = wrapped.x;
        sb.y = wrapped.y;
        if (sb.life > 0) {
          activeSaucerBullets.push(sb);
        }
      }
      saucerBulletsRef.current = activeSaucerBullets;

      // Update Particles
      const activeParticles: Particle[] = [];
      for (let i = 0; i < particlesRef.current.length; i++) {
        const p = particlesRef.current[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.isLine && p.angle !== undefined) {
          p.angle += 3.5 * dt;
        }
        if (p.life > 0) {
          activeParticles.push(p);
        }
      }
      particlesRef.current = activeParticles;

      // 2. COLLISIONS (ONLY WHEN PLAYING)
      if (gameStateRef.current === 'PLAYING') {
        const ship = shipRef.current;
        const newAsteroids: Asteroid[] = [];
        const destroyedAsteroidIds = new Set<number>();
        const hitBulletIndices = new Set<number>();

        // Player Bullets vs Asteroids
        for (let bi = 0; bi < bulletsRef.current.length; bi++) {
          const b = bulletsRef.current[bi];
          for (let ai = 0; ai < currentAsteroids.length; ai++) {
            const ast = currentAsteroids[ai];
            if (destroyedAsteroidIds.has(ast.id)) continue;

            const dx = b.x - ast.x;
            const dy = b.y - ast.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < ast.radius * ast.radius) {
              // Asteroid Hit!
              hitBulletIndices.add(bi);
              destroyedAsteroidIds.add(ast.id);

              // Sound
              sounds.playExplosion(ast.size);

              // Update Score
              const gainedPoints = ast.pointsValue;
              const newScore = scoreRef.current + gainedPoints;
              setScore(newScore);
              scoreRef.current = newScore;

              if (newScore > highScoreRef.current) {
                setHighScore(newScore);
                highScoreRef.current = newScore;
                try {
                  localStorage.setItem('asteroids_vector_highscore', newScore.toString());
                } catch {
                  // LocalStorage might be disabled
                }
              }

              // Extra life check
              if (newScore >= nextExtraLifeRef.current) {
                sounds.playExtraLife();
                const newLives = livesRef.current + 1;
                setLives(newLives);
                livesRef.current = newLives;
                nextExtraLifeRef.current += 10000;
              }

              // Splitting mechanics
              if (ast.size === 'large') {
                createExplosionParticles(ast.x, ast.y, 16, 120);
                newAsteroids.push(createAsteroid(ast.x - 10, ast.y, 'medium', 1.15));
                newAsteroids.push(createAsteroid(ast.x + 10, ast.y, 'medium', 1.15));
              } else if (ast.size === 'medium') {
                createExplosionParticles(ast.x, ast.y, 12, 140);
                newAsteroids.push(createAsteroid(ast.x - 6, ast.y, 'small', 1.3));
                newAsteroids.push(createAsteroid(ast.x + 6, ast.y, 'small', 1.3));
              } else {
                // Small asteroid eliminated with particle dust
                createExplosionParticles(ast.x, ast.y, 18, 170);
              }
              break;
            }
          }
        }

        // Player Bullets vs Flying Saucer
        if (saucerRef.current) {
          const saucer = saucerRef.current;
          for (let bi = 0; bi < bulletsRef.current.length; bi++) {
            if (hitBulletIndices.has(bi)) continue;
            const b = bulletsRef.current[bi];
            const dx = b.x - saucer.x;
            const dy = b.y - saucer.y;
            if (dx * dx + dy * dy < saucer.radius * saucer.radius) {
              hitBulletIndices.add(bi);
              sounds.playExplosion('large');
              createExplosionParticles(saucer.x, saucer.y, 22, 190);

              const gained = saucer.pointsValue;
              const newScore = scoreRef.current + gained;
              setScore(newScore);
              scoreRef.current = newScore;

              saucerRef.current = null;
              break;
            }
          }
        }

        // Filter out spent bullets
        if (hitBulletIndices.size > 0) {
          bulletsRef.current = bulletsRef.current.filter((_, idx) => !hitBulletIndices.has(idx));
        }

        // Keep surviving asteroids + new split pieces
        asteroidsRef.current = currentAsteroids
          .filter(a => !destroyedAsteroidIds.has(a.id))
          .concat(newAsteroids);

        // Ship Collisions (Asteroids, Saucer, Saucer Bullets)
        if (ship && ship.invulnerableTime <= 0) {
          let shipDestroyed = false;

          // Check Asteroids
          for (let i = 0; i < asteroidsRef.current.length; i++) {
            const ast = asteroidsRef.current[i];
            const dx = ship.x - ast.x;
            const dy = ship.y - ast.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            // Generous collision circle
            if (dist < ast.radius + ship.radius * 0.72) {
              shipDestroyed = true;
              break;
            }
          }

          // Check Saucer collision
          if (!shipDestroyed && saucerRef.current) {
            const saucer = saucerRef.current;
            const dx = ship.x - saucer.x;
            const dy = ship.y - saucer.y;
            if (Math.sqrt(dx * dx + dy * dy) < saucer.radius + ship.radius * 0.7) {
              shipDestroyed = true;
            }
          }

          // Check Saucer Bullets
          if (!shipDestroyed) {
            for (let i = 0; i < saucerBulletsRef.current.length; i++) {
              const sb = saucerBulletsRef.current[i];
              const dx = ship.x - sb.x;
              const dy = ship.y - sb.y;
              if (Math.sqrt(dx * dx + dy * dy) < ship.radius * 0.8) {
                shipDestroyed = true;
                saucerBulletsRef.current.splice(i, 1);
                break;
              }
            }
          }

          // Handle Ship Death
          if (shipDestroyed) {
            sounds.stopThrust();
            sounds.playExplosion('ship');
            createShipDeathParticles(ship);
            shipRef.current = null;

            const remainingLives = livesRef.current - 1;
            setLives(remainingLives);
            livesRef.current = remainingLives;

            if (remainingLives <= 0) {
              setTimeout(() => {
                setGameState('GAME_OVER');
                gameStateRef.current = 'GAME_OVER';
              }, 1200);
            } else {
              // Respawn ship in center after delay
              setTimeout(() => {
                if (gameStateRef.current === 'PLAYING') {
                  shipRef.current = spawnShip(width, height);
                }
              }, 1500);
            }
          }
        }
      }

      // 3. RENDER VECTOR GRAPHICS
      ctx.clearRect(0, 0, width, height);

      // Black deep-space backdrop
      ctx.fillStyle = '#020205';
      ctx.fillRect(0, 0, width, height);

      // Optional Glow bloom
      ctx.save();
      ctx.shadowBlur = settings.enableCRT ? 7 : 3;
      ctx.shadowColor = theme.glow;
      ctx.strokeStyle = theme.stroke;
      ctx.fillStyle = theme.stroke;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Draw Asteroids
      for (let i = 0; i < asteroidsRef.current.length; i++) {
        const ast = asteroidsRef.current[i];
        drawWrapped(ast.x, ast.y, ast.radius, width, height, (ox, oy) => {
          ctx.beginPath();
          for (let p = 0; p < ast.numPoints; p++) {
            const angle = ast.angle + (p * Math.PI * 2) / ast.numPoints;
            const r = ast.radius * ast.offsets[p];
            const px = ox + Math.cos(angle) * r;
            const py = oy + Math.sin(angle) * r;
            if (p === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        });
      }

      // Draw Flying Saucer
      if (saucerRef.current) {
        const s = saucerRef.current;
        drawWrapped(s.x, s.y, s.radius, width, height, (ox, oy) => {
          const r = s.radius;
          ctx.beginPath();
          // Saucer body
          ctx.moveTo(ox - r, oy);
          ctx.lineTo(ox + r, oy);
          ctx.lineTo(ox + r * 0.6, oy + r * 0.45);
          ctx.lineTo(ox - r * 0.6, oy + r * 0.45);
          ctx.closePath();

          // Saucer dome
          ctx.moveTo(ox - r * 0.5, oy);
          ctx.lineTo(ox - r * 0.25, oy - r * 0.45);
          ctx.lineTo(ox + r * 0.25, oy - r * 0.45);
          ctx.lineTo(ox + r * 0.5, oy);
          ctx.stroke();
        });
      }

      // Draw Bullets
      for (let i = 0; i < bulletsRef.current.length; i++) {
        const b = bulletsRef.current[i];
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw Saucer Bullets
      if (saucerBulletsRef.current.length > 0) {
        ctx.save();
        ctx.strokeStyle = theme.accent;
        ctx.fillStyle = theme.accent;
        ctx.shadowColor = theme.accent;
        for (let i = 0; i < saucerBulletsRef.current.length; i++) {
          const sb = saucerBulletsRef.current[i];
          ctx.beginPath();
          ctx.arc(sb.x, sb.y, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Draw Ship
      const ship = shipRef.current;
      if (ship) {
        // Flash if invulnerable
        const shouldDrawShip = ship.invulnerableTime <= 0 || Math.floor(ship.invulnerableTime * 12) % 2 === 0;

        if (shouldDrawShip) {
          drawWrapped(ship.x, ship.y, ship.radius, width, height, (ox, oy) => {
            ctx.save();
            ctx.translate(ox, oy);
            ctx.rotate(ship.angle);

            const r = ship.radius;
            // Classic Asteroids triangular hull with notched aft
            ctx.beginPath();
            ctx.moveTo(r, 0); // Nose
            ctx.lineTo(-r * 0.85, -r * 0.65); // Left aft
            ctx.lineTo(-r * 0.48, 0); // Inset notch
            ctx.lineTo(-r * 0.85, r * 0.65); // Right aft
            ctx.closePath();
            ctx.stroke();

            // Thrust engine flame flicker
            if (ship.isThrusting && ship.exhaustFlicker > 1) {
              ctx.beginPath();
              ctx.moveTo(-r * 0.5, -r * 0.3);
              const flameLen = r * (1.1 + Math.random() * 0.55);
              ctx.lineTo(-flameLen, 0);
              ctx.lineTo(-r * 0.5, r * 0.3);
              ctx.stroke();
            }

            // Safe shield visual ring if invulnerable
            if (ship.invulnerableTime > 0) {
              ctx.beginPath();
              ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
              ctx.strokeStyle = theme.dim;
              ctx.stroke();
            }

            ctx.restore();
          });
        }
      }

      // Draw Particles & Debris
      for (let i = 0; i < particlesRef.current.length; i++) {
        const p = particlesRef.current[i];
        const alpha = Math.max(0, p.life / p.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha;
        if (p.isLine && p.length && p.angle !== undefined) {
          const hx = Math.cos(p.angle) * (p.length / 2);
          const hy = Math.sin(p.angle) * (p.length / 2);
          ctx.beginPath();
          ctx.moveTo(p.x - hx, p.y - hy);
          ctx.lineTo(p.x + hx, p.y + hy);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      ctx.restore(); // Restore shadow settings

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      sounds.stopThrust();
    };
  }, [settings.colorTheme, settings.enableCRT]);

  // Copy Single-File HTML to Clipboard
  const handleCopyCode = async () => {
    const standaloneHtml = generateStandaloneHtml();
    try {
      await navigator.clipboard.writeText(standaloneHtml);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      // Fallback
    }
  };

  // Download Standalone index.html
  const handleDownloadCode = () => {
    const standaloneHtml = generateStandaloneHtml();
    const blob = new Blob([standaloneHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'asteroids.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative w-screen h-screen bg-black text-white overflow-hidden flex flex-col font-mono select-none">
      {/* Top Arcade Navigation & Status Bar */}
      <header className="z-20 flex items-center justify-between px-4 py-2.5 bg-black/80 border-b border-white/10 backdrop-blur-sm text-xs tracking-wider">
        {/* Brand / Game Title */}
        <div className="flex items-center gap-3">
          <span className="text-base font-bold tracking-widest text-white flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 bg-white shadow-[0_0_8px_#ffffff]"></span>
            ASTEROIDS
          </span>
          <span className="hidden sm:inline text-white/40">·</span>
          <span className="hidden sm:inline text-white/50 text-[11px]">1979 VECTOR SYSTEM</span>
        </div>

        {/* Live HUD (when in game or title) */}
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
            <span className="text-white/40 text-[10px] uppercase">Score</span>
            <span className="text-sm font-bold tracking-widest tabular-nums text-white">
              {score.toString().padStart(5, '0')}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
            <span className="text-white/40 text-[10px] uppercase">High</span>
            <span className="text-sm font-bold tracking-widest tabular-nums text-emerald-400">
              {highScore.toString().padStart(5, '0')}
            </span>
          </div>

          {gameState === 'PLAYING' && (
            <div className="hidden md:flex items-center gap-2">
              <span className="text-white/40 text-[10px] uppercase">Wave</span>
              <span className="text-sm font-bold tracking-widest tabular-nums text-cyan-400">
                {wave}
              </span>
            </div>
          )}
        </div>

        {/* Settings & Utility Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Audio Toggle */}
          <button
            onClick={() => setSettings(s => ({ ...s, enableSound: !s.enableSound }))}
            aria-label="Toggle Sound"
            className="p-1.5 rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title={settings.enableSound ? 'Mute Web Audio' : 'Unmute Web Audio'}
          >
            {settings.enableSound ? <Volume2 size={16} /> : <VolumeX size={16} className="text-red-400" />}
          </button>

          {/* CRT Scanline Toggle */}
          <button
            onClick={() => setSettings(s => ({ ...s, enableCRT: !s.enableCRT }))}
            aria-label="Toggle CRT Phosphor Effect"
            className={`p-1.5 rounded transition-colors ${
              settings.enableCRT ? 'text-cyan-400 bg-cyan-950/40' : 'text-white/40 hover:text-white hover:bg-white/10'
            }`}
            title="Toggle CRT Vector Glow"
          >
            <Tv size={16} />
          </button>

          {/* Color Palette Switcher */}
          <div className="relative group">
            <button
              aria-label="Theme Color"
              className="p-1.5 rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors flex items-center"
              title="Vector Color Theme"
            >
              <Sparkles size={16} />
            </button>
            <div className="absolute right-0 mt-1 py-1 w-36 bg-neutral-900 border border-white/20 rounded shadow-xl hidden group-hover:block group-focus-within:block z-50">
              {(Object.keys(THEMES) as Array<keyof typeof THEMES>).map(k => (
                <button
                  key={k}
                  onClick={() => setSettings(s => ({ ...s, colorTheme: k }))}
                  className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center justify-between hover:bg-white/10 ${
                    settings.colorTheme === k ? 'text-cyan-400 font-bold' : 'text-white/70'
                  }`}
                >
                  {THEMES[k].name}
                  {settings.colorTheme === k && <Check size={12} />}
                </button>
              ))}
            </div>
          </div>

          {/* Touch Controls Toggle */}
          <button
            onClick={() => setSettings(s => ({ ...s, showTouchControls: !s.showTouchControls }))}
            aria-label="Toggle On-Screen Touch Controls"
            className={`p-1.5 rounded transition-colors ${
              settings.showTouchControls ? 'text-amber-400 bg-amber-950/40' : 'text-white/40 hover:text-white hover:bg-white/10'
            }`}
            title="Toggle Touch Controls"
          >
            <Gamepad2 size={16} />
          </button>

          {/* Single-File HTML Exporter Button */}
          <button
            onClick={() => setShowCodeModal(true)}
            aria-label="View Single-File HTML"
            className="p-1.5 rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Get Single-File index.html Code"
          >
            <Share2 size={16} />
          </button>

          {/* Help Modal */}
          <button
            onClick={() => setShowHelpModal(true)}
            aria-label="Game Info"
            className="p-1.5 rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Controls & Rules"
          >
            <Info size={16} />
          </button>

          {/* Pause / Play */}
          {gameState === 'PLAYING' && (
            <button
              onClick={togglePause}
              aria-label="Pause Game"
              className="p-1.5 rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Pause size={16} />
            </button>
          )}
          {gameState === 'PAUSED' && (
            <button
              onClick={togglePause}
              aria-label="Resume Game"
              className="p-1.5 rounded text-emerald-400 hover:bg-white/10 transition-colors"
            >
              <Play size={16} />
            </button>
          )}
        </div>
      </header>

      {/* Main Canvas Workspace */}
      <div ref={containerRef} className="relative flex-1 w-full h-full overflow-hidden bg-black">
        <canvas ref={canvasRef} className="w-full h-full block cursor-crosshair" />

        {/* CRT Scanline Overlay */}
        {settings.enableCRT && <div className="absolute inset-0 crt-overlay pointer-events-none" />}

        {/* Lives Counter (Rendered as mini vector ships in top-left) */}
        {gameState === 'PLAYING' && (
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 pointer-events-none">
            {Array.from({ length: Math.max(0, lives) }).map((_, i) => (
              <svg key={i} width="16" height="20" viewBox="0 0 16 20" className="stroke-white fill-none drop-shadow-[0_0_4px_#fff]">
                <polygon points="8,1 15,18 8,14 1,18" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            ))}
          </div>
        )}

        {/* Wave Clear Banner */}
        {waveClearBanner && (
          <div className="absolute inset-x-0 top-1/4 z-20 flex flex-col items-center justify-center pointer-events-none animate-pulse">
            <span className="text-xl sm:text-2xl font-bold tracking-[0.3em] text-cyan-400 drop-shadow-[0_0_12px_#00f0ff]">
              WAVE {wave - 1} CLEARED
            </span>
            <span className="text-xs text-white/70 tracking-widest mt-1">
              PREPARING SECTOR {wave}...
            </span>
          </div>
        )}

        {/* START SCREEN OVERLAY */}
        {gameState === 'START' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-black/60 backdrop-blur-[2px]">
            <div className="max-w-md w-full text-center flex flex-col items-center">
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-[0.25em] text-white drop-shadow-[0_0_16px_rgba(255,255,255,0.85)] mb-2">
                ASTEROIDS
              </h1>
              <p className="text-xs sm:text-sm text-white/60 tracking-widest mb-8">
                AUTHENTIC VECTOR ARCADE EXPERIENCE
              </p>

              {/* Controls card */}
              <div className="w-full bg-white/5 border border-white/20 p-5 rounded-lg mb-8 text-left text-xs leading-relaxed space-y-2.5">
                <div className="text-[11px] font-bold text-white/40 tracking-wider uppercase mb-2">
                  Flight Navigation Controls
                </div>
                <div className="flex justify-between items-center text-white/90">
                  <span className="text-white/60">Rotate Ship:</span>
                  <span className="font-semibold text-cyan-400">LEFT / RIGHT ARROWS</span>
                </div>
                <div className="flex justify-between items-center text-white/90">
                  <span className="text-white/60">Thrust Engine:</span>
                  <span className="font-semibold text-cyan-400">UP ARROW</span>
                </div>
                <div className="flex justify-between items-center text-white/90">
                  <span className="text-white/60">Fire Lasers:</span>
                  <span className="font-semibold text-cyan-400">SPACEBAR</span>
                </div>
                <div className="flex justify-between items-center text-white/90">
                  <span className="text-white/60">Hyperspace Warp:</span>
                  <span className="font-semibold text-cyan-400">DOWN ARROW</span>
                </div>
              </div>

              {/* Launch CTA */}
              <button
                onClick={startNewGame}
                className="w-full py-3.5 px-6 bg-white text-black font-bold tracking-[0.2em] text-sm uppercase rounded hover:bg-neutral-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.4)] hover:shadow-[0_0_30px_rgba(255,255,255,0.8)] active:scale-[0.98]"
              >
                Start Mission [ Space ]
              </button>
            </div>
          </div>
        )}

        {/* PAUSED OVERLAY */}
        {gameState === 'PAUSED' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-black/75 backdrop-blur-sm">
            <h2 className="text-3xl font-bold tracking-[0.3em] text-white drop-shadow-[0_0_12px_#fff] mb-4">
              PAUSED
            </h2>
            <p className="text-xs text-white/60 tracking-widest mb-6">
              PRESS P OR ESC TO RESUME
            </p>
            <button
              onClick={togglePause}
              className="py-2.5 px-6 border border-white text-white font-bold tracking-widest text-xs uppercase hover:bg-white hover:text-black transition-all"
            >
              Resume Flight
            </button>
          </div>
        )}

        {/* GAME OVER OVERLAY */}
        {gameState === 'GAME_OVER' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-black/75 backdrop-blur-sm">
            <div className="max-w-sm w-full text-center flex flex-col items-center">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-[0.25em] text-red-500 drop-shadow-[0_0_16px_rgba(239,68,68,0.8)] mb-2">
                GAME OVER
              </h2>
              <p className="text-xs text-white/50 tracking-widest mb-6">
                ALL RECON CRAFT DESTROYED
              </p>

              <div className="w-full bg-white/5 border border-white/20 p-4 rounded-lg mb-6 space-y-2 text-xs">
                <div className="flex justify-between items-center text-white/70">
                  <span>FINAL SCORE:</span>
                  <span className="text-sm font-bold text-white tracking-widest tabular-nums">
                    {score.toString().padStart(5, '0')}
                  </span>
                </div>
                <div className="flex justify-between items-center text-white/70">
                  <span>SECTOR REACHED:</span>
                  <span className="text-sm font-bold text-cyan-400 tracking-widest tabular-nums">
                    WAVE {wave}
                  </span>
                </div>
                <div className="flex justify-between items-center text-white/70">
                  <span>RECORD HIGH:</span>
                  <span className="text-sm font-bold text-emerald-400 tracking-widest tabular-nums">
                    {highScore.toString().padStart(5, '0')}
                  </span>
                </div>
                {score >= highScore && score > 0 && (
                  <div className="pt-2 text-center text-emerald-400 font-bold text-[11px] tracking-wider animate-pulse">
                    ★ NEW RECORD ESTABLISHED ★
                  </div>
                )}
              </div>

              <button
                onClick={startNewGame}
                className="w-full py-3.5 px-6 bg-white text-black font-bold tracking-[0.2em] text-xs uppercase rounded hover:bg-neutral-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.4)] active:scale-[0.98]"
              >
                Play Again [ Space ]
              </button>
            </div>
          </div>
        )}

        {/* ON-SCREEN TOUCH CONTROLS (for mobile or touch users) */}
        {settings.showTouchControls && gameState === 'PLAYING' && (
          <div className="absolute inset-x-0 bottom-4 px-4 z-30 pointer-events-none flex items-end justify-between max-w-2xl mx-auto">
            {/* Steering D-Pad */}
            <div className="flex items-center gap-3 pointer-events-auto">
              <button
                onTouchStart={() => (keysRef.current.left = true)}
                onTouchEnd={() => (keysRef.current.left = false)}
                onMouseDown={() => (keysRef.current.left = true)}
                onMouseUp={() => (keysRef.current.left = false)}
                className="w-14 h-14 rounded-full bg-white/10 active:bg-white/30 border border-white/20 text-white flex items-center justify-center text-lg backdrop-blur-sm shadow-lg active:scale-95 transition-transform"
                aria-label="Rotate Left"
              >
                ◀
              </button>
              <button
                onTouchStart={() => (keysRef.current.right = true)}
                onTouchEnd={() => (keysRef.current.right = false)}
                onMouseDown={() => (keysRef.current.right = true)}
                onMouseUp={() => (keysRef.current.right = false)}
                className="w-14 h-14 rounded-full bg-white/10 active:bg-white/30 border border-white/20 text-white flex items-center justify-center text-lg backdrop-blur-sm shadow-lg active:scale-95 transition-transform"
                aria-label="Rotate Right"
              >
                ▶
              </button>
            </div>

            {/* Hyperspace Button (Center bottom) */}
            <div className="pointer-events-auto pb-1">
              <button
                onTouchStart={triggerHyperspace}
                onClick={triggerHyperspace}
                className="px-4 py-2.5 rounded-lg bg-indigo-900/60 active:bg-indigo-700/80 border border-indigo-400/40 text-indigo-200 text-[10px] font-bold tracking-widest backdrop-blur-sm shadow-lg active:scale-95 transition-transform"
                aria-label="Hyperspace"
              >
                HYPER
              </button>
            </div>

            {/* Action Buttons: Thrust & Fire */}
            <div className="flex items-center gap-3 pointer-events-auto">
              <button
                onTouchStart={() => (keysRef.current.up = true)}
                onTouchEnd={() => (keysRef.current.up = false)}
                onMouseDown={() => (keysRef.current.up = true)}
                onMouseUp={() => (keysRef.current.up = false)}
                className="w-14 h-14 rounded-full bg-cyan-950/60 active:bg-cyan-700/80 border border-cyan-400/50 text-cyan-300 flex items-center justify-center text-xs font-bold tracking-wider backdrop-blur-sm shadow-lg active:scale-95 transition-transform"
                aria-label="Thrust"
              >
                THRUST
              </button>
              <button
                onTouchStart={fireBullet}
                onClick={fireBullet}
                className="w-16 h-16 rounded-full bg-red-950/70 active:bg-red-700/80 border border-red-400/50 text-red-200 flex items-center justify-center text-xs font-bold tracking-wider backdrop-blur-sm shadow-lg active:scale-95 transition-transform"
                aria-label="Fire Lasers"
              >
                FIRE
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SINGLE-FILE CODE EXPORT MODAL */}
      {showCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="max-w-2xl w-full bg-neutral-950 border border-white/20 rounded-lg p-5 flex flex-col max-h-[85vh] shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white tracking-wider">
                  SINGLE-FILE INDEX.HTML CODE
                </h3>
                <p className="text-[11px] text-white/50">
                  Ready-to-run standalone Asteroids game (zero build steps, runs anywhere).
                </p>
              </div>
              <button
                onClick={() => setShowCodeModal(false)}
                className="text-white/60 hover:text-white text-base px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-black p-3 rounded border border-white/10 mb-4 text-[10px] leading-relaxed text-white/80 font-mono select-all">
              <pre><code>{generateStandaloneHtml()}</code></pre>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={handleCopyCode}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                {copiedCode ? <Check size={14} className="text-emerald-400" /> : <Share2 size={14} />}
                {copiedCode ? 'Copied to Clipboard!' : 'Copy Code'}
              </button>
              <button
                onClick={handleDownloadCode}
                className="px-4 py-2 bg-white text-black hover:bg-neutral-200 rounded text-xs font-bold transition-colors"
              >
                Download index.html
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HELP / RULES MODAL */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="max-w-md w-full bg-neutral-950 border border-white/20 rounded-lg p-5 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="text-sm font-bold text-white tracking-wider">
                ASTEROIDS BRIEFING
              </h3>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-white/60 hover:text-white text-base px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs leading-relaxed text-white/80 mb-6">
              <div>
                <h4 className="font-bold text-cyan-400 mb-1">Target Scoring</h4>
                <ul className="list-disc pl-4 space-y-1 text-white/70">
                  <li>Large Asteroid: 20 points</li>
                  <li>Medium Asteroid: 50 points</li>
                  <li>Small Asteroid: 100 points</li>
                  <li>Large Flying Saucer: 200 points</li>
                  <li>Small Flying Saucer: 1,000 points</li>
                  <li>Bonus Craft: Awarded every 10,000 points</li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-cyan-400 mb-1">Inertial Physics</h4>
                <p className="text-white/70">
                  Your ship maintains momentum through zero-gravity space. Tap thrust to accelerate,
                  and reverse heading to brake. All projectiles, craft, and asteroids seamlessly loop
                  across the boundaries of the radar grid.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-cyan-400 mb-1">Hyperspace Drive</h4>
                <p className="text-white/70">
                  When cornered, trigger Hyperspace (Down Arrow) to jump through subspace.
                  You will reappear instantly at a random coordinate with momentary shield protection.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowHelpModal(false)}
              className="w-full py-2.5 bg-white text-black font-bold text-xs uppercase rounded hover:bg-neutral-200 transition-colors"
            >
              Back to Game
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Generates the complete, self-contained, single-file index.html application code
 * containing HTML, embedded CSS, Web Audio synthesizer, and canvas game script.
 */
function generateStandaloneHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Asteroids - Classic Vector Arcade</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-user-select: none; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; color: #fff; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; touch-action: none; }
    #game-container { position: relative; width: 100vw; height: 100vh; display: flex; flex-direction: column; background: #000; }
    #hud { position: absolute; top: 0; left: 0; right: 0; height: 48px; display: flex; justify-content: space-between; align-items: center; padding: 0 16px; pointer-events: none; z-index: 10; font-size: 13px; letter-spacing: 2px; }
    .hud-stat { display: flex; align-items: center; gap: 8px; }
    .stat-label { color: rgba(255,255,255,0.4); font-size: 10px; }
    .stat-value { font-weight: bold; }
    #lives-box { position: absolute; top: 56px; left: 16px; display: flex; gap: 8px; z-index: 10; pointer-events: none; }
    canvas { width: 100%; height: 100%; display: block; cursor: crosshair; }
    .crt-overlay { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.03), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.03)); background-size: 100% 3px, 6px 100%; z-index: 5; }
    .overlay { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; background: rgba(0,0,0,0.7); backdrop-filter: blur(2px); z-index: 20; padding: 24px; text-align: center; }
    .overlay h1 { font-size: 42px; letter-spacing: 8px; margin-bottom: 8px; text-shadow: 0 0 16px #fff; }
    .overlay p { font-size: 12px; color: rgba(255,255,255,0.6); letter-spacing: 2px; margin-bottom: 24px; }
    .btn { background: #fff; color: #000; border: none; padding: 12px 28px; font-weight: bold; letter-spacing: 3px; font-family: inherit; font-size: 12px; cursor: pointer; text-transform: uppercase; border-radius: 2px; box-shadow: 0 0 16px rgba(255,255,255,0.4); }
    .btn:hover { background: #e0e0e0; }
    .controls-box { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.2); padding: 16px; border-radius: 4px; max-width: 360px; width: 100%; text-align: left; font-size: 11px; line-height: 1.8; margin-bottom: 24px; }
    .controls-box div { display: flex; justify-content: space-between; }
    .controls-box span:first-child { color: rgba(255,255,255,0.5); }
    .touch-controls { position: absolute; bottom: 16px; left: 16px; right: 16px; display: flex; justify-content: space-between; z-index: 15; pointer-events: none; }
    .touch-btn { pointer-events: auto; width: 56px; height: 56px; border-radius: 50%; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.3); color: #fff; font-family: inherit; font-size: 12px; font-weight: bold; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
    .touch-btn:active { background: rgba(255,255,255,0.35); }
  </style>
</head>
<body>
  <div id="game-container">
    <div id="hud">
      <div class="hud-stat"><span class="stat-label">SCORE</span><span id="score-val" class="stat-value">00000</span></div>
      <div class="hud-stat"><span class="stat-label">HIGH</span><span id="high-val" class="stat-value">00000</span></div>
    </div>
    <div id="lives-box"></div>
    <canvas id="gameCanvas"></canvas>
    <div class="crt-overlay"></div>

    <div id="start-screen" class="overlay">
      <h1>ASTEROIDS</h1>
      <p>1979 VECTOR SYSTEM</p>
      <div class="controls-box">
        <div><span>ROTATE:</span><span>LEFT / RIGHT ARROWS</span></div>
        <div><span>THRUST:</span><span>UP ARROW</span></div>
        <div><span>FIRE:</span><span>SPACEBAR</span></div>
        <div><span>HYPERSPACE:</span><span>DOWN ARROW</span></div>
      </div>
      <button id="start-btn" class="btn">START MISSION</button>
    </div>

    <div id="game-over-screen" class="overlay" style="display:none;">
      <h1 style="color:#ef4444; text-shadow:0 0 16px #ef4444;">GAME OVER</h1>
      <p>ALL RECON CRAFT DESTROYED</p>
      <div class="controls-box">
        <div><span>FINAL SCORE:</span><span id="final-score">00000</span></div>
        <div><span>HIGH SCORE:</span><span id="final-high">00000</span></div>
      </div>
      <button id="restart-btn" class="btn">PLAY AGAIN</button>
    </div>

    <div class="touch-controls" id="touch-controls">
      <div style="display:flex; gap:12px;">
        <button class="touch-btn" id="t-left">◀</button>
        <button class="touch-btn" id="t-right">▶</button>
      </div>
      <div style="display:flex; gap:12px;">
        <button class="touch-btn" id="t-hyper" style="border-radius:8px; width:48px; font-size:10px;">HYPER</button>
        <button class="touch-btn" id="t-thrust">THRUST</button>
        <button class="touch-btn" id="t-fire" style="background:rgba(239,68,68,0.2); border-color:#ef4444;">FIRE</button>
      </div>
    </div>
  </div>

  <script>
    // --- Web Audio Synthesizer ---
    let audioCtx = null;
    let noiseBuffer = null;
    let thrustGain = null;
    let thrustOsc = null;
    let isThrustPlaying = false;
    let beatPitch = false;

    function initAudio() {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const bufSize = audioCtx.sampleRate * 2;
        noiseBuffer = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < bufSize; i++) {
          const white = Math.random() * 2 - 1;
          data[i] = (last + (0.02 * white)) / 1.02;
          last = data[i];
          data[i] *= 3.5;
        }
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    function playLaser() {
      if (!audioCtx) return;
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.12);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(t); osc.stop(t + 0.12);
    }

    function startThrust() {
      if (!audioCtx || !noiseBuffer || isThrustPlaying) return;
      isThrustPlaying = true;
      const t = audioCtx.currentTime;
      const noise = audioCtx.createBufferSource();
      noise.buffer = noiseBuffer; noise.loop = true;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.setValueAtTime(220, t);
      const osc = audioCtx.createOscillator();
      osc.type = 'triangle'; osc.frequency.setValueAtTime(65, t);
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.05);
      noise.connect(filter); filter.connect(gain);
      osc.connect(gain); gain.connect(audioCtx.destination);
      noise.start(t); osc.start(t);
      thrustGain = gain; thrustOsc = osc;
    }

    function stopThrust() {
      if (!isThrustPlaying || !audioCtx || !thrustGain) { isThrustPlaying = false; return; }
      const t = audioCtx.currentTime;
      thrustGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      setTimeout(() => { try { thrustOsc && thrustOsc.stop(); } catch(e){} }, 90);
      isThrustPlaying = false; thrustGain = null; thrustOsc = null;
    }

    function playExplosion(size) {
      if (!audioCtx || !noiseBuffer) return;
      const t = audioCtx.currentTime;
      const noise = audioCtx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = audioCtx.createBiquadFilter();
      const gain = audioCtx.createGain();
      let duration = size === 'small' ? 0.18 : size === 'medium' ? 0.35 : 0.65;
      let startFreq = size === 'small' ? 700 : size === 'medium' ? 450 : 250;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(startFreq, t);
      filter.frequency.exponentialRampToValueAtTime(30, t + duration);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      noise.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
      noise.start(t); noise.stop(t + duration);
    }

    function playHyperspace() {
      if (!audioCtx) return;
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(950, t + 0.15);
      osc.frequency.exponentialRampToValueAtTime(180, t + 0.35);
      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(0.25, t + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(t); osc.stop(t + 0.35);
    }

    function playBeat() {
      if (!audioCtx) return;
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(beatPitch ? 105 : 92, t);
      beatPitch = !beatPitch;
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(t); osc.stop(t + 0.08);
    }

    // --- Game Engine ---
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    let width = window.innerWidth;
    let height = window.innerHeight;

    function resize() {
      width = window.innerWidth; height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr; canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    }
    window.addEventListener('resize', resize);
    resize();

    let gameState = 'START';
    let score = 0;
    let highScore = parseInt(localStorage.getItem('asteroids_high') || '0', 10);
    let lives = 3;
    let wave = 1;
    let beatTimer = 0;

    const keys = { left: false, right: false, up: false, down: false, space: false };
    let ship = null;
    let asteroids = [];
    let bullets = [];
    let particles = [];

    function updateHud() {
      document.getElementById('score-val').textContent = score.toString().padStart(5, '0');
      document.getElementById('high-val').textContent = highScore.toString().padStart(5, '0');
      const box = document.getElementById('lives-box');
      box.innerHTML = '';
      for (let i = 0; i < lives; i++) {
        box.innerHTML += '<svg width="14" height="18" viewBox="0 0 16 20" stroke="#fff" fill="none"><polygon points="8,1 15,18 8,14 1,18" stroke-width="1.5"/></svg>';
      }
    }
    updateHud();

    function createAsteroid(x, y, size) {
      let radius = size === 'large' ? 48 : size === 'medium' ? 26 : 14;
      let baseSpeed = size === 'large' ? 45 : size === 'medium' ? 80 : 130;
      let angle = Math.random() * Math.PI * 2;
      let numPoints = 10 + Math.floor(Math.random() * 4);
      let offsets = [];
      for (let i = 0; i < numPoints; i++) offsets.push(0.75 + Math.random() * 0.5);
      return {
        id: Math.random(), x, y,
        vx: Math.cos(angle) * (baseSpeed * (0.8 + Math.random() * 0.4)),
        vy: Math.sin(angle) * (baseSpeed * (0.8 + Math.random() * 0.4)),
        size, radius, angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 1.8, offsets, numPoints
      };
    }

    function spawnWave(w) {
      asteroids = [];
      const count = Math.min(3 + w, 11);
      for (let i = 0; i < count; i++) {
        let x, y;
        do {
          x = Math.random() * width; y = Math.random() * height;
        } while (ship && Math.hypot(x - ship.x, y - ship.y) < 200);
        asteroids.push(createAsteroid(x, y, 'large'));
      }
    }

    function spawnShip() {
      return {
        x: width / 2, y: height / 2, vx: 0, vy: 0,
        angle: -Math.PI / 2, radius: 16,
        isThrusting: false, invulnerable: 3.0, exhaust: 0
      };
    }

    function createParticles(x, y, count, speed, isLine) {
      for (let i = 0; i < count; i++) {
        let a = Math.random() * Math.PI * 2;
        let s = Math.random() * speed + 20;
        particles.push({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: 0.5 + Math.random() * 0.5, maxLife: 0.5 + Math.random() * 0.5,
          isLine: isLine, angle: a, length: 6 + Math.random() * 6
        });
      }
    }

    function triggerHyperspace() {
      if (gameState !== 'PLAYING' || !ship) return;
      playHyperspace();
      createParticles(ship.x, ship.y, 16, 200, false);
      ship.x = 80 + Math.random() * (width - 160);
      ship.y = 80 + Math.random() * (height - 160);
      ship.vx = 0; ship.vy = 0;
      ship.invulnerable = 1.0;
      createParticles(ship.x, ship.y, 16, 200, false);
    }

    function fireBullet() {
      if (gameState !== 'PLAYING' || !ship || bullets.length >= 6) return;
      playLaser();
      bullets.push({
        x: ship.x + Math.cos(ship.angle) * ship.radius,
        y: ship.y + Math.sin(ship.angle) * ship.radius,
        vx: Math.cos(ship.angle) * 700 + ship.vx * 0.2,
        vy: Math.sin(ship.angle) * 700 + ship.vy * 0.2,
        life: 1.35
      });
    }

    function startGame() {
      initAudio();
      score = 0; lives = 3; wave = 1;
      bullets = []; particles = [];
      ship = spawnShip();
      spawnWave(1);
      updateHud();
      gameState = 'PLAYING';
      document.getElementById('start-screen').style.display = 'none';
      document.getElementById('game-over-screen').style.display = 'none';
    }

    document.getElementById('start-btn').onclick = startGame;
    document.getElementById('restart-btn').onclick = startGame;

    // Keyboard
    window.addEventListener('keydown', e => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (e.key === ' ' || e.code === 'Space') {
        if (gameState === 'START' || gameState === 'GAME_OVER') startGame();
        else if (gameState === 'PLAYING') fireBullet();
      }
      if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true;
      if (e.key === 'ArrowUp' || e.key === 'w') keys.up = true;
      if (e.key === 'ArrowDown' || e.key === 's') triggerHyperspace();
    });
    window.addEventListener('keyup', e => {
      if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false;
      if (e.key === 'ArrowUp' || e.key === 'w') keys.up = false;
    });

    // Touch Controls
    const tL = document.getElementById('t-left'), tR = document.getElementById('t-right'),
          tTh = document.getElementById('t-thrust'), tF = document.getElementById('t-fire'),
          tHy = document.getElementById('t-hyper');
    tL.ontouchstart = () => keys.left = true; tL.ontouchend = () => keys.left = false;
    tR.ontouchstart = () => keys.right = true; tR.ontouchend = () => keys.right = false;
    tTh.ontouchstart = () => keys.up = true; tTh.ontouchend = () => keys.up = false;
    tF.ontouchstart = (e) => { e.preventDefault(); fireBullet(); };
    tHy.ontouchstart = (e) => { e.preventDefault(); triggerHyperspace(); };

    // Initial ambient asteroids
    spawnWave(1);

    // Main Loop
    let lastTime = performance.now();
    function loop(now) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // Update
      if (gameState === 'PLAYING') {
        if (ship) {
          if (keys.left) ship.angle -= 5.2 * dt;
          if (keys.right) ship.angle += 5.2 * dt;
          if (keys.up) {
            ship.isThrusting = true; ship.exhaust = (ship.exhaust + 1) % 6;
            ship.vx += Math.cos(ship.angle) * 450 * dt;
            ship.vy += Math.sin(ship.angle) * 450 * dt;
            startThrust();
          } else {
            ship.isThrusting = false; stopThrust();
          }
          ship.vx *= Math.pow(0.985, dt * 60); ship.vy *= Math.pow(0.985, dt * 60);
          ship.x = (ship.x + ship.vx * dt + width) % width;
          ship.y = (ship.y + ship.vy * dt + height) % height;
          if (ship.invulnerable > 0) ship.invulnerable -= dt;
        }

        beatTimer += dt;
        let beatInterval = Math.max(0.3, Math.min(1.4, asteroids.length * 0.12));
        if (beatTimer >= beatInterval) { beatTimer = 0; playBeat(); }

        if (asteroids.length === 0) {
          wave++; spawnWave(wave);
        }
      }

      // Asteroids
      for (let a of asteroids) {
        a.x = (a.x + a.vx * dt + width) % width;
        a.y = (a.y + a.vy * dt + height) % height;
        a.angle += a.spin * dt;
      }

      // Bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x = (b.x + b.vx * dt + width) % width;
        b.y = (b.y + b.vy * dt + height) % height;
        b.life -= dt;
        if (b.life <= 0) bullets.splice(i, 1);
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
      }

      // Collisions
      if (gameState === 'PLAYING') {
        let newAsteroids = [];
        for (let bi = bullets.length - 1; bi >= 0; bi--) {
          let b = bullets[bi];
          for (let ai = asteroids.length - 1; ai >= 0; ai--) {
            let a = asteroids[ai];
            if (Math.hypot(b.x - a.x, b.y - a.y) < a.radius) {
              bullets.splice(bi, 1);
              asteroids.splice(ai, 1);
              playExplosion(a.size);
              score += a.size === 'large' ? 20 : a.size === 'medium' ? 50 : 100;
              if (score > highScore) { highScore = score; localStorage.setItem('asteroids_high', highScore); }
              updateHud();

              if (a.size === 'large') {
                createParticles(a.x, a.y, 14, 120, true);
                newAsteroids.push(createAsteroid(a.x, a.y, 'medium'), createAsteroid(a.x, a.y, 'medium'));
              } else if (a.size === 'medium') {
                createParticles(a.x, a.y, 10, 140, true);
                newAsteroids.push(createAsteroid(a.x, a.y, 'small'), createAsteroid(a.x, a.y, 'small'));
              } else {
                createParticles(a.x, a.y, 16, 160, false);
              }
              break;
            }
          }
        }
        asteroids.push(...newAsteroids);

        // Ship collision
        if (ship && ship.invulnerable <= 0) {
          for (let a of asteroids) {
            if (Math.hypot(ship.x - a.x, ship.y - a.y) < a.radius + ship.radius * 0.7) {
              stopThrust();
              playExplosion('large');
              createParticles(ship.x, ship.y, 24, 180, true);
              ship = null;
              lives--;
              updateHud();
              if (lives <= 0) {
                setTimeout(() => {
                  gameState = 'GAME_OVER';
                  document.getElementById('final-score').textContent = score.toString().padStart(5, '0');
                  document.getElementById('final-high').textContent = highScore.toString().padStart(5, '0');
                  document.getElementById('game-over-screen').style.display = 'flex';
                }, 1000);
              } else {
                setTimeout(() => { if (gameState === 'PLAYING') ship = spawnShip(); }, 1400);
              }
              break;
            }
          }
        }
      }

      // Render
      ctx.fillStyle = '#020205'; ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.shadowBlur = 6; ctx.shadowColor = 'rgba(255,255,255,0.7)';
      ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 1.8;

      // Asteroids
      for (let a of asteroids) {
        ctx.beginPath();
        for (let p = 0; p < a.numPoints; p++) {
          let ang = a.angle + (p * Math.PI * 2) / a.numPoints;
          let r = a.radius * a.offsets[p];
          let px = a.x + Math.cos(ang) * r, py = a.y + Math.sin(ang) * r;
          if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.stroke();
      }

      // Bullets
      for (let b of bullets) {
        ctx.beginPath(); ctx.arc(b.x, b.y, 2.2, 0, Math.PI * 2); ctx.fill();
      }

      // Ship
      if (ship && (ship.invulnerable <= 0 || Math.floor(ship.invulnerable * 12) % 2 === 0)) {
        ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(ship.angle);
        const r = ship.radius;
        ctx.beginPath();
        ctx.moveTo(r, 0); ctx.lineTo(-r * 0.85, -r * 0.65);
        ctx.lineTo(-r * 0.48, 0); ctx.lineTo(-r * 0.85, r * 0.65);
        ctx.closePath(); ctx.stroke();
        if (ship.isThrusting && ship.exhaust > 1) {
          ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.3);
          ctx.lineTo(-r * (1.1 + Math.random() * 0.5), 0);
          ctx.lineTo(-r * 0.5, r * 0.3); ctx.stroke();
        }
        ctx.restore();
      }

      // Particles
      for (let p of particles) {
        ctx.save(); ctx.globalAlpha = p.life / p.maxLife;
        if (p.isLine) {
          ctx.beginPath(); ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 4, p.y); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }

      ctx.restore();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  </script>
</body>
</html>`;
}
