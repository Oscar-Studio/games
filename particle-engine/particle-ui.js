/**
 * Particle UI - 粒子态界面UI集成
 * 等离子OS：Hero -> 粒子汇聚成卡片 -> 点击卡片粒子展开
 */

class ParticleUI {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        this.options = {
            particleCount: options.particleCount || 200,
            quality: options.quality || 'plasma',
            cardParticleCount: options.cardParticleCount || 2800, // ~310 per card for 9 cards
            ...options
        };

        this.canvas = null;
        this.ctx = null;
        this.ps = null;
        this.isInitialized = false;
        this.currentState = 'hero'; // 'hero', 'transitioning', 'cards', 'modal'
        this.selectedCardIndex = null;
        this.cardParticles = [];
        this.allCardElements = [];
        this.toolsData = [];
        this.modal = null;
        this.heroTextParticles = [];
        this.exploreParticles = [];
        this.exploreBounds = null;
        this.exploreBtn = null;

        this.init();
    }

    init() {
        if (this.isInitialized) return;

        // Create canvas overlay
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'particle-canvas';
        this.canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 50;
        `;
        document.body.appendChild(this.canvas);

        this.ctx = this.canvas.getContext('2d');
        this.ps = new ParticleSystem(this.canvas, {
            particleCount: this.options.particleCount,
            maxTrailLength: 0
        });

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.isInitialized = true;
        this.ps.start();

        // Load tools data first
        this.loadToolsData();

        // Setup after a short delay
        setTimeout(() => this.setupHero(), 500);

        // Ambient particles
        this.startAmbientEffect();
    }

    resize() {
        if (this.canvas) {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
    }

    async loadToolsData() {
        try {
            const response = await fetch('tools-config.json');
            const data = await response.json();
            this.toolsData = data.tools || [];
        } catch (e) {
            this.toolsData = [];
        }
    }

    setupHero() {
        // In plasma mode, hero is hidden, so calculate position from viewport
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2 - 50;

        // Create hero text particles (the title)
        if (this.currentState === 'hero') {
            this.createHeroTextParticles(centerX, centerY);
        }

        // Enable canvas clicks for "Explore" in hero state
        this.canvas.style.pointerEvents = 'auto';
        this.canvas.onmousemove = (e) => {
            if (this.currentState !== 'hero') return;
            const b = this.exploreBounds;
            this.canvas.style.cursor = (b && Math.abs(e.clientX - b.x) < b.hw && Math.abs(e.clientY - b.y) < b.hh)
                ? 'pointer' : 'default';
        };
        this.canvas.onclick = (e) => {
            if (this.currentState !== 'hero') return;
            const b = this.exploreBounds;
            if (b && Math.abs(e.clientX - b.x) < b.hw && Math.abs(e.clientY - b.y) < b.hh) {
                this.onExploreClick();
            }
        };
    }

    createHeroTextParticles(centerX, centerY) {
        // Create particles forming "益智游戏集" text
        const text = '益智游戏集';
        this.heroTextParticles = this.ps.emitText(text, centerX, centerY, {
            gap: 5,
            font: 'bold 60px Segoe UI',
            particleSize: 2.5
        });

        this.heroTextParticles.forEach(p => {
            p.isForming = true;
            p.formProgress = 0;
        });

        // Create "Explore" particle button below the title
        const exploreY = centerY + 130;
        this.exploreParticles = this.ps.emitText('Explore', centerX, exploreY, {
            gap: 5,
            font: 'bold 36px Segoe UI',
            particleSize: 2.5
        });

        this.exploreParticles.forEach(p => {
            p.isForming = true;
            p.formProgress = 0;
        });

        // Store clickable bounds (approximate text width for 36px "Explore")
        this.exploreBounds = { x: centerX, y: exploreY, hw: 95, hh: 30 };
    }

    onExploreClick() {
        if (this.currentState !== 'hero') return;

        const clickX = this.exploreBounds ? this.exploreBounds.x : window.innerWidth / 2;
        const clickY = this.exploreBounds ? this.exploreBounds.y : window.innerHeight / 2;

        // Disable canvas hero click
        this.canvas.onclick = null;
        this.canvas.onmousemove = null;
        this.canvas.style.cursor = 'default';

        // Explosion effect
        this.ps.emitExplosion(clickX, clickY, {
            count: 300,
            speed: 20,
            maxTrailLength: 0
        });

        // Scatter hero text particles
        const allHeroParticles = [...this.heroTextParticles, ...this.exploreParticles];
        allHeroParticles.forEach(p => {
            const dx = p.x - clickX;
            const dy = p.y - clickY;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = Math.max(0, 1 - dist / 400) * 40;
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
            p.temperature = 1.3;
            p.isForming = false;
        });

        // Transition
        this.currentState = 'transitioning';

        // Hide hero
        const hero = document.getElementById('heroSection');
        if (hero) {
            hero.style.opacity = '0';
            hero.style.transition = 'opacity 0.8s ease';
        }

        // After explosion, start card particle convergence
        setTimeout(() => this.startCardConvergence(), 1000);
    }

    startCardConvergence() {
        this.currentState = 'cards';
        this.canvas.style.pointerEvents = 'auto';
        this.canvas.onclick = null; // Will be set by enableCardClicks()

        // Hide the normal card container in plasma mode
        const cardContainer = document.getElementById('cardContainer');
        if (cardContainer) {
            cardContainer.style.display = 'none';
        }

        // Wait for tools data
        const loadCards = () => {
            if (this.toolsData.length === 0) {
                setTimeout(loadCards, 100);
                return;
            }
            this.createCardParticles();
        };
        loadCards();
    }

    createCardParticles() {
        this.cardParticles = [];

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Calculate card positions (3x3 grid)
        const cols = 3;
        const cardWidth = 220;
        const cardHeight = 100;
        const gapX = 30;
        const gapY = 25;
        const startX = (viewportWidth - (cols * cardWidth + (cols - 1) * gapX)) / 2;
        const startY = 180;

        const particleCountPerCard = Math.floor(this.options.cardParticleCount / this.toolsData.length);

        this.toolsData.forEach((tool, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const centerX = startX + col * (cardWidth + gapX) + cardWidth / 2;
            const centerY = startY + row * (cardHeight + gapY) + cardHeight / 2;

            // Create particles distributed along card border (outline)
            const borderParticleCount = Math.floor(particleCountPerCard * 0.2);
            const fillParticleCount = particleCountPerCard - borderParticleCount;

            // Border particles (outline of card)
            for (let i = 0; i < borderParticleCount; i++) {
                const t = i / borderParticleCount;
                let x, y;

                // Distribute along rectangle border
                if (t < 0.25) {
                    // Top edge
                    x = centerX - cardWidth/2 + (t * 4) * cardWidth;
                    y = centerY - cardHeight/2;
                } else if (t < 0.5) {
                    // Right edge
                    x = centerX + cardWidth/2;
                    y = centerY - cardHeight/2 + ((t - 0.25) * 4) * cardHeight;
                } else if (t < 0.75) {
                    // Bottom edge
                    x = centerX + cardWidth/2 - ((t - 0.5) * 4) * cardWidth;
                    y = centerY + cardHeight/2;
                } else {
                    // Left edge
                    x = centerX - cardWidth/2;
                    y = centerY + cardHeight/2 - ((t - 0.75) * 4) * cardHeight;
                }

                // Start from center explosion point
                const startFromX = viewportWidth / 2;
                const startFromY = viewportHeight / 2;

                const particle = this.ps.createParticle(startFromX, startFromY, {
                    vx: (Math.random() - 0.5) * 3,
                    vy: (Math.random() - 0.5) * 3,
                    size: 2.5 + Math.random() * 2,
                    temperature: 0.85,
                    life: 1,
                    maxTrailLength: 0
                });

                particle.targetX = x + (Math.random() - 0.5) * 10;
                particle.targetY = y + (Math.random() - 0.5) * 10;
                particle.baseX = particle.targetX;
                particle.baseY = particle.targetY;
                particle.isForming = false;
                particle.isAttracting = true;
                particle.toolIndex = index;
                particle.cardCenterX = centerX;
                particle.cardCenterY = centerY;
                particle.cardWidth = cardWidth;
                particle.cardHeight = cardHeight;

                this.cardParticles.push(particle);
            }

            // Fill particles (inside card area)
            for (let i = 0; i < fillParticleCount; i++) {
                const startFromX = viewportWidth / 2;
                const startFromY = viewportHeight / 2;

                const particle = this.ps.createParticle(startFromX, startFromY, {
                    vx: (Math.random() - 0.5) * 3,
                    vy: (Math.random() - 0.5) * 3,
                    size: 2 + Math.random() * 2,
                    temperature: 0.75,
                    life: 1,
                    maxTrailLength: 0
                });

                particle.targetX = centerX + (Math.random() - 0.5) * cardWidth * 0.7;
                particle.targetY = centerY + (Math.random() - 0.5) * cardHeight * 0.5;
                particle.baseX = particle.targetX;
                particle.baseY = particle.targetY;
                particle.isForming = false;
                particle.isAttracting = true;
                particle.toolIndex = index;
                particle.cardCenterX = centerX;
                particle.cardCenterY = centerY;
                particle.cardWidth = cardWidth;
                particle.cardHeight = cardHeight;

                this.cardParticles.push(particle);
            }
        });

        // Add click detection after particles converge
        setTimeout(() => this.enableCardClicks(), 2500);
    }

    enableCardClicks() {
        // Set up click detection on canvas
        this.canvas.style.pointerEvents = 'auto';
        this.canvas.onclick = (e) => this.onCanvasClick(e);
    }

    onCanvasClick(e) {
        if (this.currentState !== 'cards') return;

        const clickX = e.clientX;
        const clickY = e.clientY;

        // Find which card was clicked
        for (let i = 0; i < this.cardParticles.length; i++) {
            const p = this.cardParticles[i];
            if (p.toolIndex === undefined) continue;

            const dx = clickX - p.cardCenterX;
            const dy = clickY - p.cardCenterY;

            if (Math.abs(dx) < p.cardWidth / 2 && Math.abs(dy) < p.cardHeight / 2) {
                this.onCardClick(p.toolIndex);
                return;
            }
        }
    }

    onCardClick(toolIndex) {
        if (this.currentState !== 'cards') return;

        this.selectedCardIndex = toolIndex;
        this.currentState = 'modal-opening';

        const tool = this.toolsData[toolIndex];
        if (!tool) return;

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const selectedParticles = this.cardParticles.filter(p => p.toolIndex === toolIndex);
        const otherParticles = this.cardParticles.filter(p => p.toolIndex !== toolIndex);

        // Selected card → scatter randomly around center to form diffuse colorful halo
        selectedParticles.forEach((p) => {
            const angle = Math.random() * Math.PI * 2;
            const r = 150 + Math.random() * 130;
            p.isForming = false;
            p.isAttracting = true;
            p.targetX = centerX + Math.cos(angle) * r;
            p.targetY = centerY + Math.sin(angle) * r;
            p.temperature = 1.0;
        });

        // Other cards → scatter far outward (diffuse halo, original behavior)
        otherParticles.forEach((p, i) => {
            const angle = Math.random() * Math.PI * 2;
            const dist = 600 + Math.random() * 400;
            p.isForming = false;
            p.isAttracting = true;
            p.targetX = centerX + Math.cos(angle) * dist;
            p.targetY = centerY + Math.sin(angle) * dist;
            p.temperature = 0.3;
        });

        // Phase 2: switch selected particles to orbiting — derive from actual position
        setTimeout(() => {
            selectedParticles.forEach(p => {
                const dx = p.x - centerX;
                const dy = p.y - centerY;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                p.isAttracting = false;
                p.orbitCenterX = centerX;
                p.orbitCenterY = centerY;
                p.orbitRadius = dist;
                p.orbitAngle = Math.atan2(dy, dx);
                p.orbitSpeed = 0.015 + Math.random() * 0.015;
                p.isOrbiting = true;
                // No orbitKeepCool — temperature pulse keeps them colorful
            });
        }, 900);

        // Phase 2b: outer halo starts slowly rotating — derive orbit params from actual position
        setTimeout(() => {
            otherParticles.forEach(p => {
                const dx = p.x - centerX;
                const dy = p.y - centerY;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                p.isAttracting = false;
                p.orbitCenterX = centerX;
                p.orbitCenterY = centerY;
                p.orbitRadius = dist;
                p.orbitAngle = Math.atan2(dy, dx);
                p.orbitSpeed = 0.0015 + Math.random() * 0.001;
                p.orbitKeepCool = true;
                p.isOrbiting = true;
            });
        }, 1300);

        // Show modal after rings form
        setTimeout(() => this.showModal(tool), 1200);
    }

    showModal(tool) {
        const demoUrl = tool.demoFile || `${tool.name}/index.html`;

        this.modal = document.createElement('div');
        this.modal.className = 'particle-modal';
        this.modal.innerHTML = `
            <div class="particle-modal-content">
                <button class="particle-modal-close">&times;</button>
                <div class="particle-modal-icon">${tool.icon || '🎮'}</div>
                <h2>${tool.name}</h2>
                <p>${tool.description || '一款有趣的益智游戏。'}</p>
                <div class="particle-modal-tags">
                    ${tool.tags ? tool.tags.slice(0, 3).map(t => `<span class="tag">${t}</span>`).join('') : ''}
                </div>
                <a href="${demoUrl}" class="btn-explore">进入演示</a>
            </div>
        `;

        document.body.appendChild(this.modal);

        // Animate in
        requestAnimationFrame(() => {
            this.modal.classList.add('active');
        });

        // Close handler
        this.modal.querySelector('.particle-modal-close').addEventListener('click', () => this.closeModal());
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.closeModal();
        });

        this.currentState = 'modal';
    }

    closeModal() {
        if (!this.modal) return;

        // Stop orbiting, return all card particles to original card positions
        this.cardParticles.forEach((p, i) => {
            p.isOrbiting = false;
            setTimeout(() => {
                p.isAttracting = true;
                p.targetX = p.baseX;
                p.targetY = p.baseY;
                p.temperature = 0.85;
            }, i * 2);
        });

        // Animate modal out
        this.modal.classList.remove('active');

        // Wait longer for particles to converge back
        setTimeout(() => {
            if (this.modal) {
                this.modal.remove();
                this.modal = null;
            }
            this.selectedCardIndex = null;
            this.currentState = 'cards';
        }, 1500);
    }

    startAmbientEffect() {
        // Rising ambient particles
        setInterval(() => {
            if (this.currentState === 'hero' || this.currentState === 'cards') {
                const x = Math.random() * window.innerWidth;
                const y = window.innerHeight + 20;
                this.ps.emit(x, y, 2, {
                    vy: -1.5 - Math.random() * 2,
                    vx: (Math.random() - 0.5) * 1,
                    size: 1 + Math.random() * 2,
                    temperature: 0.4 + Math.random() * 0.3,
                    life: 0.7,
                    maxTrailLength: 0
                });
            }
        }, 150);
    }

    destroy() {
        if (this.canvas) {
            this.canvas.remove();
        }
        if (this.ps) {
            this.ps.stop();
        }
        this.isInitialized = false;
    }
}

// Export
window.ParticleUI = ParticleUI;