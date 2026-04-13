/**
 * Particle UI - 粒子态界面UI集成
 * 负责卡片聚拢、爆发动画等UI交互
 */

class ParticleUI {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        this.options = {
            particleCount: options.particleCount || 150,
            quality: options.quality || 'normal',
            cardParticleCount: options.cardParticleCount || 80,
            ...options
        };

        this.canvas = null;
        this.ctx = null;
        this.ps = null;
        this.heroText = '探索';
        this.heroTextParticles = [];
        this.cardParticles = [];
        this.isInitialized = false;
        this.currentState = 'hero'; // 'hero', 'cards', 'modal'
        this.selectedCard = null;
        this.selectedCardParticles = null;
        this.allCardElements = [];
        this.modal = null;

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
            maxTrailLength: this.options.quality === 'low' ? 0 : 8
        });

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.isInitialized = true;
        this.ps.start();

        // Create hero text particles after a delay
        setTimeout(() => this.createHeroText(), 800);

        // Add continuous ambient particles
        this.startAmbientEffect();
    }

    resize() {
        if (this.canvas) {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
    }

    createHeroText() {
        if (this.currentState !== 'hero') return;

        const hero = document.querySelector('.hero');
        if (!hero) return;

        const rect = hero.getBoundingClientRect();
        const centerX = window.innerWidth / 2;
        const centerY = rect.top + rect.height / 2;

        // Clear existing particles
        this.heroTextParticles.forEach(p => p.life = 0);
        this.heroTextParticles = [];

        // Create text particles
        this.heroTextParticles = this.ps.emitText(this.heroText, centerX, centerY, {
            gap: 6,
            font: 'bold 72px Segoe UI'
        });

        // Add hover effect to hero button
        const heroBtn = hero.querySelector('.btn-primary');
        if (heroBtn) {
            heroBtn.addEventListener('mouseenter', () => this.onHeroHover(true));
            heroBtn.addEventListener('mouseleave', () => this.onHeroHover(false));
            heroBtn.addEventListener('click', (e) => this.onHeroClick(e));
        }
    }

    onHeroHover(isHovering) {
        this.heroTextParticles.forEach(p => {
            if (isHovering) {
                p.temperature = Math.min(1.2, p.temperature + 0.1);
                p.friction = 0.95;
            } else {
                p.friction = 0.98;
            }
        });
    }

    onHeroClick(e) {
        if (this.currentState !== 'hero') return;

        const rect = e.target.getBoundingClientRect();
        const clickX = rect.left + rect.width / 2;
        const clickY = rect.top + rect.height / 2;

        // Explosion effect from click point
        this.ps.emitExplosion(clickX, clickY, {
            count: 200,
            speed: 15,
            maxTrailLength: 12
        });

        // Scatter hero text particles
        this.heroTextParticles.forEach(p => {
            const dx = p.x - clickX;
            const dy = p.y - clickY;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = Math.max(0, 1 - dist / 300) * 30;
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
            p.temperature = 1.2;
            p.isForming = false;
        });

        // Transition to cards state
        setTimeout(() => this.transitionToCards(), 800);
        this.currentState = 'transitioning';
    }

    transitionToCards() {
        this.currentState = 'cards';

        // Clear hero particles
        this.heroTextParticles.forEach(p => {
            p.life = 0;
        });
        this.heroTextParticles = [];

        // Hide hero section
        const hero = document.querySelector('.hero');
        if (hero) {
            hero.style.opacity = '0';
            hero.style.transition = 'opacity 0.8s ease';
        }

        // Wait for cards to render, then create card particles
        setTimeout(() => this.waitForCards(), 300);
    }

    waitForCards() {
        const checkCards = () => {
            const cardContainer = document.getElementById('cardContainer');
            const cards = cardContainer ? cardContainer.querySelectorAll('.card') : [];
            if (cards.length > 0) {
                this.createCardParticles(cardContainer);
            } else {
                setTimeout(checkCards, 100);
            }
        };
        checkCards();
    }

    createCardParticles(cardContainer) {
        const cards = cardContainer.querySelectorAll('.card');
        this.allCardElements = Array.from(cards);
        this.cardParticles = [];

        cards.forEach((card, index) => {
            const rect = card.getBoundingClientRect();
            const particleCount = Math.floor(this.options.cardParticleCount / cards.length);

            // Create particles forming card shape
            for (let i = 0; i < particleCount; i++) {
                const x = rect.left + Math.random() * rect.width;
                const y = rect.top + Math.random() * rect.height;

                const particle = this.ps.createParticle(x, y, {
                    vx: (Math.random() - 0.5) * 10,
                    vy: (Math.random() - 0.5) * 10,
                    size: 2 + Math.random() * 4,
                    temperature: 0.5 + Math.random() * 0.5,
                    life: 1,
                    maxTrailLength: 6
                });

                particle.targetCard = card;
                particle.cardRect = {
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height,
                    centerX: rect.left + rect.width / 2,
                    centerY: rect.top + rect.height / 2
                };
                particle.offsetX = x - rect.left - rect.width / 2;
                particle.offsetY = y - rect.top - rect.height / 2;
                particle.baseX = rect.left + rect.width / 2 + particle.offsetX;
                particle.baseY = rect.top + rect.height / 2 + particle.offsetY;
                particle.isForming = true;
                particle.formProgress = 0;

                this.cardParticles.push(particle);
                this.ps.particles.push(particle);
            }

            // Add click handler
            card.addEventListener('click', () => this.onCardClick(card));
        });
    }

    onCardClick(card) {
        if (this.currentState !== 'cards' || this.selectedCard) return;

        this.selectedCard = card;
        this.currentState = 'modal-opening';

        const rect = card.getBoundingClientRect();
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        // Particles from all cards converge to center
        this.cardParticles.forEach((p, i) => {
            const delay = i * 3;
            setTimeout(() => {
                p.isAttracting = true;
                p.isForming = false;
                p.targetX = centerX;
                p.targetY = centerY;
                p.orbitAngle = Math.random() * Math.PI * 2;
                p.orbitRadius = Math.sqrt(Math.pow(p.x - centerX, 2) + Math.pow(p.y - centerY, 2)) * 0.3;
                p.orbitSpeed = 0.02 + Math.random() * 0.02;
            }, delay);
        });

        // After convergence, show modal
        setTimeout(() => this.showModal(card), 1000);
    }

    showModal(card) {
        // Get tool data from card
        const cardName = card.querySelector('.card-name')?.textContent;
        const cardIcon = card.querySelector('.card-icon')?.textContent;
        const cardTags = Array.from(card.querySelectorAll('.card-tag')).map(t => t.textContent);
        const toolDescription = this.getToolDescription(cardName);

        // Find tool info from global tools if available
        let demoUrl = `${cardName}/index.html`;
        if (window.toolsData) {
            const tool = window.toolsData.find(t => t.name === cardName);
            if (tool) {
                demoUrl = tool.demoFile || `${tool.name}/index.html`;
            }
        }

        // Create modal
        this.modal = document.createElement('div');
        this.modal.className = 'particle-modal';
        this.modal.innerHTML = `
            <div class="particle-modal-content">
                <button class="particle-modal-close">&times;</button>
                <div class="particle-modal-icon">${cardIcon || '🎮'}</div>
                <h2>${cardName}</h2>
                <p>${toolDescription}</p>
                <div class="particle-modal-tags">
                    ${cardTags.map(t => `<span class="tag">${t}</span>`).join('')}
                </div>
                <a href="${demoUrl}" class="btn-explore">进入演示</a>
            </div>
        `;

        document.body.appendChild(this.modal);

        // Animate modal in
        requestAnimationFrame(() => {
            this.modal.classList.add('active');
        });

        // Add orbiting particles
        this.createModalParticles();

        // Close handler
        this.modal.querySelector('.particle-modal-close').addEventListener('click', () => this.closeModal());
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.closeModal();
        });
    }

    createModalParticles() {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        this.selectedCardParticles = [];

        // Add orbiting particles around center
        for (let i = 0; i < 40; i++) {
            const angle = (Math.PI * 2 / 40) * i;
            const radius = 180 + Math.random() * 80;

            const particle = this.ps.createParticle(
                centerX + Math.cos(angle) * radius,
                centerY + Math.sin(angle) * radius,
                {
                    vx: 0,
                    vy: 0,
                    size: 2 + Math.random() * 3,
                    temperature: 0.6 + Math.random() * 0.4,
                    life: 1,
                    maxTrailLength: 5
                }
            );

            particle.orbitCenterX = centerX;
            particle.orbitCenterY = centerY;
            particle.orbitRadius = radius;
            particle.orbitAngle = angle;
            particle.orbitSpeed = 0.015 + Math.random() * 0.01;
            particle.isOrbiting = true;

            this.ps.particles.push(particle);
            this.selectedCardParticles.push(particle);
        }
    }

    closeModal() {
        if (!this.modal) return;

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        // Remove orbiting particles
        this.ps.particles = this.ps.particles.filter(p => !p.isOrbiting);

        // Scatter particles back to cards
        this.cardParticles.forEach((p, i) => {
            if (p.targetCard && p.targetCard.parentNode) {
                const cardRect = p.targetCard.getBoundingClientRect();
                setTimeout(() => {
                    p.isForming = true;
                    p.targetX = cardRect.left + cardRect.width / 2 + p.offsetX;
                    p.targetY = cardRect.top + cardRect.height / 2 + p.offsetY;
                    p.isAttracting = true;
                }, i * 2);
            }
        });

        // Animate modal out
        this.modal.classList.remove('active');

        setTimeout(() => {
            if (this.modal) {
                this.modal.remove();
                this.modal = null;
            }
            this.selectedCard = null;
            this.currentState = 'cards';
        }, 500);
    }

    getToolDescription(name) {
        const descriptions = {
            '2048': '经典2048滑动合并游戏，数字爱好者必玩。',
            '国际象棋': '经典国际象棋，支持王车易位、吃过路兵、兵升变。',
            '五子棋': '简约风格五子棋，人机对弈。',
            '单词翻翻乐': '中英文单词记忆匹配游戏，支持自定义词库。',
            '二十四点': '用4个数字通过加减乘除得到24。',
            '中国象棋': '中国象棋棋盘，支持双人同屏对弈。',
            '技能五子棋': '增强版五子棋，加入技能系统。',
            '罚分游戏': '根据给出数字计算目标值，差值越大扣分越多。',
            '舒尔特方格': '训练专注力和数字敏感度。'
        };
        return descriptions[name] || '一款有趣的益智游戏。';
    }

    startAmbientEffect() {
        // Continuous ambient particles
        setInterval(() => {
            if (this.currentState === 'hero' || this.currentState === 'cards') {
                const x = Math.random() * window.innerWidth;
                const y = window.innerHeight + 20;
                this.ps.emit(x, y, 2, {
                    vy: -2 - Math.random() * 3,
                    vx: (Math.random() - 0.5) * 2,
                    size: 1 + Math.random() * 2,
                    temperature: 0.4 + Math.random() * 0.3,
                    life: 0.8,
                    maxTrailLength: 5
                });
            }
        }, 100);
    }

    setQuality(quality) {
        this.options.quality = quality;
        if (this.ps) {
            this.ps.config.maxTrailLength = quality === 'low' ? 0 : 8;
        }
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