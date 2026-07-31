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
        this.extraEmittedParticles = []; // Extra particles emitted on Explore click
        this.exploreBounds = null;
        this.exploreBtn = null;
        this.lastClickX = 0;
        this.lastClickY = 0;
        this.particleShortfall = 0; // How many extra particles needed

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
        // Create particles forming "益智游戏集" text - more particles for cards
        const text = '益智游戏集';
        this.heroTextParticles = this.ps.emitText(text, centerX, centerY, {
            gap: 3,
            font: 'bold 90px Segoe UI',
            particleSize: 2.5
        });

        this.heroTextParticles.forEach(p => {
            p.isForming = true;
            p.formProgress = 0;
        });

        // Create "Explore" particle button below the title - more particles
        const exploreY = centerY + 150;
        this.exploreParticles = this.ps.emitText('Explore', centerX, exploreY, {
            gap: 3,
            font: 'bold 50px Segoe UI',
            particleSize: 2.5
        });

        this.exploreParticles.forEach(p => {
            p.isForming = true;
            p.formProgress = 0;
        });

        // Add elliptical border around Explore button
        this.createExploreEllipseBorder(centerX, exploreY);

        // Store clickable bounds (approximate text width for 50px "Explore")
        this.exploreBounds = { x: centerX, y: exploreY, hw: 120, hh: 40 };
    }

    createExploreEllipseBorder(cx, cy) {
        const rx = 150; // horizontal radius
        const ry = 50;  // vertical radius
        const particleCount = 120; // number of particles on the ellipse

        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 / particleCount) * i;
            const x = cx + Math.cos(angle) * rx;
            const y = cy + Math.sin(angle) * ry;

            const particle = this.ps.createParticle(x, y, {
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                size: 3 + Math.random() * 2,
                temperature: 0.8 + Math.random() * 0.2,
                life: 1,
                baseX: x,
                baseY: y
            });
            particle.isForming = true;
            particle.formProgress = 0;
            this.exploreParticles.push(particle);
        }
    }

    onExploreClick() {
        if (this.currentState !== 'hero') return;

        const clickX = this.exploreBounds ? this.exploreBounds.x : window.innerWidth / 2;
        const clickY = this.exploreBounds ? this.exploreBounds.y : window.innerHeight / 2;

        // Disable canvas hero click
        this.canvas.onclick = null;
        this.canvas.onmousemove = null;
        this.canvas.style.cursor = 'default';

        // Store click position for later emission if needed
        this.lastClickX = clickX;
        this.lastClickY = clickY;

        // Scatter hero text particles outward with strong force
        const allHeroParticles = [...this.heroTextParticles, ...this.exploreParticles];
        allHeroParticles.forEach(p => {
            const dx = p.x - clickX;
            const dy = p.y - clickY;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = Math.max(0, 1 - dist / 400) * 60;
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

        // Immediately start card particle convergence (particles will converge as they fly)
        setTimeout(() => this.startCardConvergence(), 100);
    }

    startCardConvergence() {
        this.currentState = 'cards';
        this.canvas.style.pointerEvents = 'auto';
        this.canvas.onclick = null; // Will be set by enableCardClicks()

        // Keep hero particles - they will converge to form cards
        // Don't clear them here

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
        const centerX = viewportWidth / 2;
        const centerY = viewportHeight / 2;

        // Calculate total hero particles
        const heroParticles = [...this.heroTextParticles, ...this.exploreParticles];
        const heroCount = heroParticles.length;

        // Calculate total particles needed for cards
        const cols = 3;
        const cardWidth = 360;
        const cardHeight = 100;
        const gapX = 50;
        const gapY = 40;
        const startX = (viewportWidth - (cols * cardWidth + (cols - 1) * gapX)) / 2;
        const rows = Math.ceil(this.toolsData.length / cols);
        const totalHeight = rows * cardHeight + (rows - 1) * gapY;
        const startY = (viewportHeight - totalHeight) / 2;

        let totalNeeded = 0;
        const cardInfo = []; // Store card info for later use
        const textGap = 5; // Consistent gap for both counting and rendering

        this.toolsData.forEach((tool, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const cX = startX + col * (cardWidth + gapX) + cardWidth / 2;
            const cY = startY + row * (cardHeight + gapY) + cardHeight / 2;

            // Count text particles for this card
            const textCanvas = document.createElement('canvas');
            const textCtx = textCanvas.getContext('2d');
            textCanvas.width = viewportWidth;
            textCanvas.height = viewportHeight;
            textCtx.font = 'bold 48px Segoe UI';
            textCtx.fillStyle = '#FFFFFF';
            textCtx.textAlign = 'center';
            textCtx.textBaseline = 'middle';
            textCtx.fillText(tool.name, cX, cY);

            const imageData = textCtx.getImageData(0, 0, textCanvas.width, textCanvas.height);
            const data = imageData.data;
            const textPositions = [];
            for (let py = 0; py < textCanvas.height; py += textGap) {
                for (let px = 0; px < textCanvas.width; px += textGap) {
                    const idx = (py * textCanvas.width + px) * 4;
                    if (data[idx + 3] > 128) {
                        totalNeeded++;
                        textPositions.push({ px, py });
                    }
                }
            }

            // Add border particles (120 per card)
            totalNeeded += 120;

            cardInfo.push({ tool, centerX: cX, centerY: cY, borderCount: 120, textPositions });
        });

        // Calculate shortfall and emit that many particles from click point
        const shortfall = Math.max(0, totalNeeded - heroCount);
        this.extraEmittedParticles = [];

        if (shortfall > 0) {
            for (let i = 0; i < shortfall; i++) {
                // Emit with same force calculation as hero particles
                const dx = (Math.random() - 0.5) * 400;
                const dy = (Math.random() - 0.5) * 400;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = Math.max(0, 1 - dist / 400) * 60;
                const speed = force / 10;

                const angle = Math.atan2(dy, dx);
                const p = this.ps.createParticle(this.lastClickX, this.lastClickY, {
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    size: 2 + Math.random() * 2,
                    temperature: 1.3,
                    life: 1
                });
                p.isForming = false;
                p.isAttracting = false;
                this.extraEmittedParticles.push(p);
            }
        }

        // Reuse hero particles + extra emitted particles that are currently flying outward
        const existingParticles = [...heroParticles, ...this.extraEmittedParticles];
        const totalExisting = existingParticles.length;

        // Extra particles go to screen edge halo (only real extra, not shortfall补足)
        const extraParticles = [];
        const haloRadius = Math.min(viewportWidth, viewportHeight) * 0.45;

        // Assign existing particles to card positions
        let particleIndex = 0;

        cardInfo.forEach(({ tool, centerX: cX, centerY: cY, borderCount, textPositions }) => {
            const index = this.toolsData.indexOf(tool);

            // Border particles
            const perimeter = 2 * (cardWidth + cardHeight);
            const topLen = cardWidth;
            const rightLen = cardHeight;
            const bottomLen = cardWidth;
            const topEnd = topLen / perimeter;
            const rightEnd = topEnd + rightLen / perimeter;
            const bottomEnd = rightEnd + bottomLen / perimeter;

            for (let i = 0; i < borderCount; i++) {
                const t = i / borderCount;
                let x, y;

                if (t < topEnd) {
                    const localT = t / topEnd;
                    x = cX - cardWidth/2 + localT * cardWidth;
                    y = cY - cardHeight/2;
                } else if (t < rightEnd) {
                    const localT = (t - topEnd) / (rightEnd - topEnd);
                    x = cX + cardWidth/2;
                    y = cY - cardHeight/2 + localT * cardHeight;
                } else if (t < bottomEnd) {
                    const localT = (t - rightEnd) / (bottomEnd - rightEnd);
                    x = cX + cardWidth/2 - localT * cardWidth;
                    y = cY + cardHeight/2;
                } else {
                    const localT = (t - bottomEnd) / (1 - bottomEnd);
                    x = cX - cardWidth/2;
                    y = cY + cardHeight/2 - localT * cardHeight;
                }

                // Reuse existing particle, or create new one if exhausted
                let particle;
                if (particleIndex < existingParticles.length) {
                    particle = existingParticles[particleIndex++];
                    // Hero particle: fly to card border
                    particle.targetX = x + (Math.random() - 0.5) * 8;
                    particle.targetY = y + (Math.random() - 0.5) * 8;
                    particle.baseX = particle.targetX;
                    particle.baseY = particle.targetY;
                    particle.isForming = false;
                    particle.isAttracting = true;
                    particle.toolIndex = index;
                    particle.cardCenterX = cX;
                    particle.cardCenterY = cY;
                    particle.cardWidth = cardWidth;
                    particle.cardHeight = cardHeight;
                    this.cardParticles.push(particle);
                } else {
                    // New particle: goes to card border (not halo)
                    const jitterX = x + (Math.random() - 0.5) * 8;
                    const jitterY = y + (Math.random() - 0.5) * 8;
                    particle = this.ps.createParticle(jitterX, jitterY, {
                        size: 2 + Math.random() * 3,
                        temperature: 0.8 + Math.random() * 0.2,
                        life: 1,
                        vx: 0,
                        vy: 0
                    });
                    particle.isForming = false;
                    particle.isAttracting = true;
                    particle.targetX = jitterX;
                    particle.targetY = jitterY;
                    particle.baseX = jitterX;
                    particle.baseY = jitterY;
                    particle.toolIndex = index;
                    particle.cardCenterX = cX;
                    particle.cardCenterY = cY;
                    particle.cardWidth = cardWidth;
                    particle.cardHeight = cardHeight;
                    this.cardParticles.push(particle);
                }
            }

            // Text particles - use pre-calculated positions
            textPositions.forEach(({ px, py }) => {
                // Reuse existing particle, or create new one if exhausted
                let particle;
                if (particleIndex < existingParticles.length) {
                    particle = existingParticles[particleIndex++];
                    // Hero particle: fly to card text
                    particle.targetX = px;
                    particle.targetY = py;
                    particle.baseX = px;
                    particle.baseY = py;
                    particle.isForming = false;
                    particle.isAttracting = true;
                    particle.isTextParticle = true;
                    particle.toolIndex = index;
                    particle.cardCenterX = cX;
                    particle.cardCenterY = cY;
                    particle.cardWidth = cardWidth;
                    particle.cardHeight = cardHeight;
                    this.cardParticles.push(particle);
                } else {
                    // New particle: goes to card text (not halo)
                    particle = this.ps.createParticle(px, py, {
                        size: 2 + Math.random() * 1.5,
                        temperature: 0.7 + Math.random() * 0.3,
                        life: 1,
                        vx: 0,
                        vy: 0
                    });
                    particle.isForming = false;
                    particle.isAttracting = true;
                    particle.targetX = px;
                    particle.targetY = py;
                    particle.baseX = px;
                    particle.baseY = py;
                    particle.isTextParticle = true;
                    particle.toolIndex = index;
                    particle.cardCenterX = cX;
                    particle.cardCenterY = cY;
                    particle.cardWidth = cardWidth;
                    particle.cardHeight = cardHeight;
                    this.cardParticles.push(particle);
                }
            });
        });

        // Handle extra particles (those not needed for cards) - send to halo orbit
        while (particleIndex < existingParticles.length) {
            const p = existingParticles[particleIndex++];
            const angle = Math.random() * Math.PI * 2;
            const r = haloRadius + (Math.random() - 0.5) * 100;
            p.targetX = centerX + Math.cos(angle) * r;
            p.targetY = centerY + Math.sin(angle) * r;
            p.baseX = p.targetX;
            p.baseY = p.targetY;
            p.isForming = false;
            p.isAttracting = true;
            p.isOrbiting = false; // Will orbit after reaching target
            p.toolIndex = -1; // Mark as halo particle
            p.orbitCenterX = centerX;
            p.orbitCenterY = centerY;
            p.orbitRadius = r;
            p.orbitAngle = angle;
            p.orbitSpeed = 0.001 + Math.random() * 0.002;
            p.orbitKeepCool = true;
            p.temperature = 0.2 + Math.random() * 0.1; // White
            extraParticles.push(p);
        }

        // After convergence, start halo rotation for extra particles
        setTimeout(() => {
            extraParticles.forEach(p => {
                if (p.toolIndex === -1) {
                    // Calculate current distance to center and set orbit radius accordingly
                    const dx = p.x - p.orbitCenterX;
                    const dy = p.y - p.orbitCenterY;
                    const currentDist = Math.sqrt(dx * dx + dy * dy);
                    if (currentDist > 30) {
                        p.orbitRadius = currentDist;
                        p.orbitAngle = Math.atan2(dy, dx);
                    }
                    p.isAttracting = false;
                    p.isOrbiting = true;
                }
            });
        }, 2000);

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
        // Validate demoUrl to prevent path traversal
        let demoUrl = tool.demoFile || `${tool.name}/index.html`;
        // Only allow relative paths starting with / or containing ./
        if (!/^(\/|.\/)/.test(demoUrl) || demoUrl.includes('..')) {
            demoUrl = '#';
        }

        this.modal = document.createElement('div');
        this.modal.className = 'particle-modal';

        // Build modal content safely using DOM methods
        const content = document.createElement('div');
        content.className = 'particle-modal-content';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'particle-modal-close';
        closeBtn.textContent = '×';

        const iconDiv = document.createElement('div');
        iconDiv.className = 'particle-modal-icon';
        iconDiv.textContent = tool.icon || '🎮';

        const title = document.createElement('h2');
        title.textContent = tool.name;

        const desc = document.createElement('p');
        desc.textContent = tool.description || '一款有趣的益智游戏。';

        const tagsDiv = document.createElement('div');
        tagsDiv.className = 'particle-modal-tags';
        if (tool.tags) {
            tool.tags.slice(0, 3).forEach(t => {
                const tag = document.createElement('span');
                tag.className = 'tag';
                tag.textContent = t;
                tagsDiv.appendChild(tag);
            });
        }

        const link = document.createElement('a');
        link.href = demoUrl;
        link.className = 'btn-explore';
        link.textContent = '进入演示';

        content.appendChild(closeBtn);
        content.appendChild(iconDiv);
        content.appendChild(title);
        content.appendChild(desc);
        content.appendChild(tagsDiv);
        content.appendChild(link);
        this.modal.appendChild(content);

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

        // Stop orbiting, return card particles to original positions
        this.cardParticles.forEach((p) => {
            p.isOrbiting = false;
            p.isAttracting = true;
            p.targetX = p.baseX;
            p.targetY = p.baseY;
            p.temperature = 0.85;
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