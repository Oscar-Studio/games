/**
 * Particle Core Engine
 * 粒子核心引擎 - 等离子态界面
 * 支持粒子池复用，减少GC压力
 */

class Particle {
    constructor() {
        // Properties will be set by reset()
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.size = 3;
        this.baseSize = 3;
        this.color = '#FF6B35';
        this.alpha = 1;
        this.life = 1;
        this.maxLife = 1;
        this.temperature = 1;
        this.friction = 0.98;
        this.gravity = 0;
        this.targetX = null;
        this.targetY = null;
        this.isAttracting = false;
        this.isOrbiting = false;
        this.orbitCenterX = 0;
        this.orbitCenterY = 0;
        this.orbitRadius = 0;
        this.orbitAngle = 0;
        this.orbitSpeed = 0;
        this.isForming = false;
        this.formProgress = 0;
        this.baseX = 0;
        this.baseY = 0;
        this.toolIndex = -1;
        this.cardCenterX = 0;
        this.cardCenterY = 0;
        this.cardWidth = 0;
        this.cardHeight = 0;
    }

    reset(x, y, config = {}) {
        this.x = x;
        this.y = y;
        this.vx = config.vx !== undefined ? config.vx : (Math.random() - 0.5) * 2;
        this.vy = config.vy !== undefined ? config.vy : (Math.random() - 0.5) * 2;
        this.size = config.size || 3;
        this.baseSize = this.size;
        this.alpha = config.alpha || 1;
        this.life = config.life || 1;
        this.maxLife = this.life;
        this.temperature = config.temperature || 1;
        this.friction = 0.98;
        this.gravity = 0;
        this.targetX = null;
        this.targetY = null;
        this.isAttracting = false;
        this.isOrbiting = false;
        this.orbitCenterX = 0;
        this.orbitCenterY = 0;
        this.orbitRadius = 0;
        this.orbitAngle = 0;
        this.orbitSpeed = 0;
        this.isForming = false;
        this.formProgress = 0;
        this.baseX = config.baseX !== undefined ? config.baseX : x;
        this.baseY = config.baseY !== undefined ? config.baseY : y;
        this.toolIndex = config.toolIndex !== undefined ? config.toolIndex : -1;
        this.cardCenterX = config.cardCenterX || 0;
        this.cardCenterY = config.cardCenterY || 0;
        this.cardWidth = config.cardWidth || 0;
        this.cardHeight = config.cardHeight || 0;
        return this;
    }

    update(deltaTime, forces = []) {
        // Apply forces
        forces.forEach(force => {
            if (force.type === 'attract' && this.isAttracting) {
                const dx = force.x - this.x;
                const dy = force.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 1) {
                    this.vx += (dx / dist) * force.strength * 0.1;
                    this.vy += (dy / dist) * force.strength * 0.1;
                }
            } else if (force.type === 'repel') {
                const dx = this.x - force.x;
                const dy = this.y - force.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < force.radius && dist > 1) {
                    const strength = (force.radius - dist) / force.radius * force.strength * 0.2;
                    this.vx += (dx / dist) * strength;
                    this.vy += (dy / dist) * strength;
                }
            } else if (force.type === 'wind') {
                this.vx += force.strength * 0.1;
            }
        });

        // Apply gravity
        this.vy += this.gravity;

        // Apply friction (less friction when attracting for faster movement)
        const frictionMult = this.isAttracting ? 0.96 : 0.98;
        this.vx *= frictionMult;
        this.vy *= frictionMult;

        // Update position
        this.x += this.vx;
        this.y += this.vy;

        // Update temperature (cooling) - only when above threshold
        if (this.temperature > 0.5) {
            this.temperature *= 0.99;
        }

        // Update size based on temperature (simplified)
        this.size = this.baseSize * (0.5 + this.temperature * 0.5);

        // Orbiting particles
        if (this.isOrbiting) {
            this.orbitAngle += this.orbitSpeed;
            this.x = this.orbitCenterX + Math.cos(this.orbitAngle) * this.orbitRadius;
            this.y = this.orbitCenterY + Math.sin(this.orbitAngle) * this.orbitRadius;
            // Temperature pulse for orbiting
            this.temperature = 0.7 + Math.sin(this.orbitAngle * 2) * 0.3;
        }

        // Update life
        if (this.maxLife < 1) {
            this.life -= 0.016;
        }
    }

    draw(ctx) {
        const size = this.size;
        const temp = this.temperature;

        // Determine color based on temperature (cached)
        let color;
        if (temp > 0.8) {
            color = '#FF6B35';
        } else if (temp > 0.5) {
            color = '#FFB347';
        } else if (temp > 0.3) {
            color = '#00D4FF';
        } else {
            color = '#FFFFFF';
        }

        // Draw glow (simple circle, no gradient)
        ctx.globalAlpha = 0.3 * temp;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, size * 2, 0, Math.PI * 2);
        ctx.fill();

        // Draw core
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, size, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
    }

    isDead() {
        return this.life <= 0 || this.alpha <= 0;
    }
}

class ParticlePool {
    constructor(initialSize = 500) {
        this.pool = [];
        this.activeCount = 0;

        // Pre-allocate particles
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(new Particle());
        }
    }

    get(x, y, config = {}) {
        let particle;

        // Find a dead particle from pool
        if (this.activeCount < this.pool.length) {
            // Use existing particle from pool
            particle = this.pool[this.activeCount];
            particle.reset(x, y, config);
        } else {
            // Pool exhausted, create new particle
            particle = new Particle();
            particle.reset(x, y, config);
            this.pool.push(particle);
        }

        this.activeCount++;
        return particle;
    }

    release(particle) {
        // Move it to the inactive part of the pool
        // For simplicity, we just swap with the last active particle
        const idx = this.pool.indexOf(particle);
        if (idx !== -1 && idx < this.activeCount) {
            const lastActive = this.pool[this.activeCount - 1];
            this.pool[idx] = lastActive;
            this.pool[this.activeCount - 1] = particle;
            this.activeCount--;
            // Reset the released particle
            particle.reset(0, 0, {});
        }
    }

    releaseAll() {
        for (let i = 0; i < this.activeCount; i++) {
            this.pool[i].reset(0, 0, {});
        }
        this.activeCount = 0;
    }

    getActive() {
        return this.pool.slice(0, this.activeCount);
    }

    getActiveCount() {
        return this.activeCount;
    }
}

class ParticleSystem {
    constructor(canvas, config = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.pool = new ParticlePool(config.poolSize || 3000); // Pre-allocate 3000 particles
        this.forces = [];
        this.config = {
            particleCount: config.particleCount || 200,
            friction: config.friction || 0.98,
            gravity: config.gravity || 0,
            maxTrailLength: config.maxTrailLength || 0,
            ...config
        };

        this.isRunning = false;
        this.animationId = null;
        this.lastTime = 0;
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    addForce(force) {
        this.forces.push(force);
    }

    removeForce(type) {
        this.forces = this.forces.filter(f => f.type !== type);
    }

    clearForces() {
        this.forces = [];
    }

    createParticle(x, y, config = {}) {
        return this.pool.get(x, y, {
            ...this.config,
            ...config
        });
    }

    emit(x, y, count, config = {}) {
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
            const speed = config.speed || (3 + Math.random() * 5);
            const particle = this.createParticle(x, y, {
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: config.size || (2 + Math.random() * 4),
                temperature: 1,
                ...config
            });
        }
    }

    emitExplosion(x, y, config = {}) {
        const count = config.count || 100;

        // Main explosion
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = config.speed || (5 + Math.random() * 15);
            this.createParticle(x, y, {
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 2 + Math.random() * 6,
                temperature: 1,
                life: 0.8 + Math.random() * 0.2,
                ...config
            });
        }

        // Sparks
        for (let i = 0; i < count * 0.5; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 10 + Math.random() * 20;
            this.createParticle(x, y, {
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 1 + Math.random() * 2,
                temperature: 1.2,
                life: 0.5 + Math.random() * 0.3,
                ...config
            });
        }
    }

    emitText(text, x, y, config = {}) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = this.canvas.width;
        canvas.height = this.canvas.height;

        ctx.font = config.font || 'bold 72px Segoe UI';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const particles = [];
        const gap = config.gap || 4;

        for (let py = 0; py < canvas.height; py += gap) {
            for (let px = 0; px < canvas.width; px += gap) {
                const index = (py * canvas.width + px) * 4;
                if (data[index + 3] > 128) {
                    const particle = this.createParticle(px, py, {
                        vx: (Math.random() - 0.5) * 2,
                        vy: (Math.random() - 0.5) * 2,
                        size: 2 + Math.random() * 3,
                        temperature: 0.7 + Math.random() * 0.3,
                        baseX: px,
                        baseY: py,
                        life: 1,
                        ...config
                    });
                    particle.isForming = true;
                    particle.formProgress = 0;
                    particles.push(particle);
                }
            }
        }

        return particles;
    }

    attractToPoint(x, y, strength = 5) {
        this.pool.getActive().forEach(p => {
            p.isAttracting = true;
            p.targetX = x;
            p.targetY = y;
        });
        this.addForce({ type: 'attract', x, y, strength });
    }

    repelFromPoint(x, y, strength = 5, radius = 100) {
        this.addForce({ type: 'repel', x, y, strength, radius });
    }

    update(deltaTime) {
        const activeParticles = this.pool.getActive();

        // Update particles
        for (let i = 0; i < activeParticles.length; i++) {
            const p = activeParticles[i];

            // Form maintaining particles
            if (p.isForming && p.baseX !== undefined) {
                p.formProgress = Math.min(1, (p.formProgress || 0) + 0.05);
                const targetX = p.baseX + (Math.random() - 0.5) * 20 * (1 - p.formProgress);
                const targetY = p.baseY + (Math.random() - 0.5) * 20 * (1 - p.formProgress);
                p.vx += (targetX - p.x) * 0.1;
                p.vy += (targetY - p.y) * 0.1;
            }

            // Attracting particles (for card convergence)
            if (p.isAttracting && p.targetX !== undefined && !p.isOrbiting) {
                const dx = p.targetX - p.x;
                const dy = p.targetY - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 2) {
                    p.vx += (dx / dist) * 0.3;
                    p.vy += (dy / dist) * 0.3;
                }
            }

            p.update(deltaTime, this.forces);

            // Remove dead particles - return to pool
            if (p.isDead()) {
                this.pool.release(p);
            }
        }

        // Clean up forces that are done
        this.forces = this.forces.filter(f => !f.isDone);
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const activeParticles = this.pool.getActive();
        for (let i = 0; i < activeParticles.length; i++) {
            activeParticles[i].draw(this.ctx);
        }
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastTime = performance.now();
        this.animate();
    }

    stop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }

    animate() {
        if (!this.isRunning) return;

        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        this.update(deltaTime);
        this.render();

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    clear() {
        this.pool.releaseAll();
    }

    getParticleCount() {
        return this.pool.getActiveCount();
    }
}

// Export
window.ParticleSystem = ParticleSystem;
window.Particle = Particle;
window.ParticlePool = ParticlePool;