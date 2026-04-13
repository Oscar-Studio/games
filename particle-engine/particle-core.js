/**
 * Particle Core Engine
 * 粒子核心引擎 - 等离子态界面
 */

class Particle {
    constructor(x, y, config = {}) {
        this.x = x;
        this.y = y;
        this.vx = config.vx || (Math.random() - 0.5) * 2;
        this.vy = config.vy || (Math.random() - 0.5) * 2;
        this.size = config.size || 3;
        this.baseSize = this.size;
        this.color = config.color || '#FF6B35';
        this.alpha = config.alpha || 1;
        this.life = config.life || 1;
        this.maxLife = this.life;
        this.temperature = config.temperature || 1;
        this.friction = 0.98;
        this.gravity = 0;
        this.targetX = null;
        this.targetY = null;
        this.isAttracting = false;
        this.trail = [];
        this.maxTrailLength = config.maxTrailLength || 0;
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
        if (this.isOrbiting && this.orbitCenterX !== undefined) {
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
        // Skip trail drawing for performance - too expensive with many particles
        // Simple solid circle with glow effect instead of gradient
        const size = this.size;
        const temp = this.temperature;

        // Determine color based on temperature (cached, not computed per draw)
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

class ParticleSystem {
    constructor(canvas, config = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
        this.forces = [];
        this.config = {
            particleCount: config.particleCount || 200,
            friction: config.friction || 0.98,
            gravity: config.gravity || 0,
            maxTrailLength: config.maxTrailLength || 8,
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
        return new Particle(x, y, {
            ...this.config,
            ...config,
            maxTrailLength: this.config.maxTrailLength
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
            this.particles.push(particle);
        }
    }

    emitExplosion(x, y, config = {}) {
        const count = config.count || 100;
        const particles = [];

        // Main explosion
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = config.speed || (5 + Math.random() * 15);
            const particle = this.createParticle(x, y, {
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 2 + Math.random() * 6,
                temperature: 1,
                life: 0.8 + Math.random() * 0.2,
                ...config
            });
            particles.push(particle);
            this.particles.push(particle);
        }

        // Sparks
        for (let i = 0; i < count * 0.5; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 10 + Math.random() * 20;
            const particle = this.createParticle(x, y, {
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 1 + Math.random() * 2,
                temperature: 1.2,
                life: 0.5 + Math.random() * 0.3,
                maxTrailLength: 15,
                ...config
            });
            particles.push(particle);
            this.particles.push(particle);
        }

        return particles;
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
                    this.particles.push(particle);
                }
            }
        }

        return particles;
    }

    attractToPoint(x, y, strength = 5) {
        this.particles.forEach(p => {
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
        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

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
                    // Stronger attraction for faster convergence
                    p.vx += (dx / dist) * 0.3;
                    p.vy += (dy / dist) * 0.3;
                }
            }

            p.update(deltaTime, this.forces);

            // Remove dead particles
            if (p.isDead()) {
                this.particles.splice(i, 1);
            }
        }

        // Clean up forces that are done
        this.forces = this.forces.filter(f => !f.isDone);
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Skip sorting for performance - visual difference is minimal
        this.particles.forEach(p => p.draw(this.ctx));
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
        this.particles = [];
    }

    getParticleCount() {
        return this.particles.length;
    }
}

// Export
window.ParticleSystem = ParticleSystem;
window.Particle = Particle;
