        const cardContainer = document.getElementById('cardContainer');
        const backdrop = document.getElementById('backdrop');
        const settingsBtn = document.getElementById('settingsBtn');
        const settingsDropdown = document.getElementById('settingsDropdown');
        const qualityRadios = document.querySelectorAll('input[name="quality"]');

        // Settings - Quality
        const currentQuality = localStorage.getItem('quality') || 'normal';
        if (currentQuality === 'low') {
            document.body.classList.add('low-quality');
            document.querySelector('input[value="low"]').checked = true;
        } else if (currentQuality === 'plasma') {
            document.body.classList.add('plasma-quality');
            document.querySelector('input[value="plasma"]').checked = true;
        } else {
            document.querySelector('input[value="normal"]').checked = true;
        }

        // Initialize Particle UI if plasma quality
        let particleUI = null;
        if (currentQuality === 'plasma') {
            initParticleUI();
        }

        function initParticleUI() {
            if (particleUI) return;
            // Load particle engine scripts
            const coreScript = document.createElement('script');
            coreScript.src = 'particle-engine/particle-core.js';
            coreScript.onload = () => {
                const uiScript = document.createElement('script');
                uiScript.src = 'particle-engine/particle-ui.js';
                uiScript.onload = () => {
                    particleUI = new ParticleUI(document.body, {
                        particleCount: 200,
                        quality: 'plasma'
                    });
                    setupParticleUIHandlers();
                };
                document.head.appendChild(uiScript);
            };
            document.head.appendChild(coreScript);
        }

        function setupParticleUIHandlers() {
            if (!particleUI) return;

            // Override card click to use particle UI
            const originalSelectCard = selectCard;
            // Don't override, let particle UI handle its own cards
        }

        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsDropdown.classList.toggle('open');
            settingsBtn.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!settingsDropdown.contains(e.target) && e.target !== settingsBtn) {
                settingsDropdown.classList.remove('open');
                settingsBtn.classList.remove('active');
            }
        });

        qualityRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                const quality = document.querySelector('input[name="quality"]:checked').value;
                localStorage.setItem('quality', quality);
                if (quality === 'low') {
                    document.body.classList.add('low-quality');
                    document.body.classList.remove('plasma-quality');
                    if (particleUI) {
                        particleUI.destroy();
                        particleUI = null;
                    }
                } else if (quality === 'plasma') {
                    document.body.classList.remove('low-quality');
                    document.body.classList.add('plasma-quality');
                    if (!particleUI) {
                        initParticleUI();
                    }
                } else {
                    document.body.classList.remove('low-quality');
                    document.body.classList.remove('plasma-quality');
                    if (particleUI) {
                        particleUI.destroy();
                        particleUI = null;
                    }
                }
            });
        });

        let tools = [];
        let morphCard = null;
        let selectedTool = null;
        let selectedCard = null;

        // Load tools
        fetch('tools-config.json')
            .then(response => response.json())
            .then(data => {
                tools = data.tools || [];
                tools.sort((a, b) => {
                    if (a.featured !== b.featured) return b.featured ? 1 : -1;
                    return a.name.localeCompare(b.name);
                });
                renderCards(tools);
            })
            .catch(error => {
                cardContainer.innerHTML = '<p class="no-results">加载工具失败</p>';
            });

        function renderCards(toolsToRender) {
            cardContainer.innerHTML = '';
            if (toolsToRender.length === 0) {
                cardContainer.innerHTML = '<p class="no-results">没有找到匹配的工具</p>';
                return;
            }

            toolsToRender.forEach(tool => {
                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = `
                    <div class="card-header">
                        <span class="card-icon">${tool.icon || '🎮'}</span>
                        <span class="card-name">${tool.name}</span>
                    </div>
                    <div class="card-tags">
                        ${tool.tags ? tool.tags.slice(0, 3).map(t => `<span class="card-tag">${t}</span>`).join('') : ''}
                    </div>
                `;
                card.addEventListener('click', () => selectCard(card, tool));
                cardContainer.appendChild(card);
            });
        }

        function selectCard(cardElement, tool) {
            if (morphCard) return;

            // In plasma mode, let particle UI handle card clicks
            if (document.body.classList.contains('plasma-quality')) {
                return;
            }

            selectedTool = tool;
            selectedCard = cardElement;
            const isLowQuality = document.body.classList.contains('low-quality');

            const rect = cardElement.getBoundingClientRect();

            // Create morph card at card's position
            morphCard = document.createElement('div');
            morphCard.className = 'morph-card compact';
            const demoUrl = tool.demoFile || `${tool.name}/index.html`;
            morphCard.innerHTML = `
                <div class="morph-header">
                    <span class="morph-icon">${tool.icon || '🎮'}</span>
                    <span class="morph-name">${tool.name}</span>
                </div>
                <div class="morph-tags">
                    ${tool.tags ? tool.tags.slice(0, 3).map(t => `<span class="morph-tag">${t}</span>`).join('') : ''}
                </div>
                <div class="morph-content">
                    <div class="morph-big-icon">${tool.icon || '🎮'}</div>
                    <h2>${tool.name}</h2>
                    <p>${tool.description}</p>
                    <a href="${demoUrl}" class="btn-explore">进入演示</a>
                </div>
                <button class="close-btn">&times;</button>
            `;

            morphCard.style.left = rect.left + 'px';
            morphCard.style.top = rect.top + 'px';
            morphCard.style.width = rect.width + 'px';
            morphCard.style.minHeight = rect.height + 'px';
            document.body.appendChild(morphCard);

            // Hide original card
            cardElement.style.visibility = 'hidden';

            // Show backdrop
            backdrop.classList.add('active');

            // Calculate target position
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const targetWidth = Math.min(450, viewportWidth * 0.9);
            const targetHeight = 340;
            const targetLeft = (viewportWidth - targetWidth) / 2;
            const targetTop = (viewportHeight - targetHeight) / 2;

            // Animate to center
            if (!isLowQuality) {
                requestAnimationFrame(() => {
                    morphCard.style.transition = 'all 750ms cubic-bezier(0.34, 1.4, 0.64, 1)';
                    morphCard.style.left = targetLeft + 'px';
                    morphCard.style.top = targetTop + 'px';
                    morphCard.style.width = targetWidth + 'px';
                    morphCard.style.minHeight = targetHeight + 'px';
                });
            } else {
                morphCard.style.left = targetLeft + 'px';
                morphCard.style.top = targetTop + 'px';
                morphCard.style.width = targetWidth + 'px';
                morphCard.style.minHeight = targetHeight + 'px';
            }

            // Other cards hide
            const allCards = Array.from(cardContainer.querySelectorAll('.card'));
            allCards.forEach(card => {
                if (card === cardElement) return;
                if (isLowQuality) {
                    card.style.display = 'none';
                } else {
                    const cardRect = card.getBoundingClientRect();
                    const delay = Math.max(0, ((viewportHeight - cardRect.top) / viewportHeight) * 120);
                    card.style.animationDelay = `${delay}ms`;
                    card.classList.add('hiding');
                }
            });

            // Expand to show content
            if (!isLowQuality) {
                setTimeout(() => {
                    morphCard.classList.add('expanded');
                }, 200);
            } else {
                morphCard.classList.add('expanded');
            }

            // Close handlers
            morphCard.querySelector('.close-btn').addEventListener('click', closeMorphCard);
            backdrop.addEventListener('click', closeMorphCard);
        }

        function closeMorphCard() {
            if (!morphCard || !selectedCard) return;
            const isLowQuality = document.body.classList.contains('low-quality');

            const originalRect = selectedCard.getBoundingClientRect();

            // Get all hiding cards
            const hidingCards = Array.from(cardContainer.querySelectorAll('.card.hiding'));

            // Start fading backdrop immediately
            backdrop.style.opacity = '0';

            // Shrink morphCard back to original position
            morphCard.classList.remove('expanded');
            if (!isLowQuality) {
                morphCard.style.transition = 'all 750ms cubic-bezier(0.34, 1.4, 0.64, 1)';
            }
            morphCard.style.left = originalRect.left + 'px';
            morphCard.style.top = originalRect.top + 'px';
            morphCard.style.width = originalRect.width + 'px';
            morphCard.style.minHeight = originalRect.height + 'px';

            if (isLowQuality) {
                // Immediately show all cards
                cardContainer.querySelectorAll('.card').forEach(card => {
                    card.style.display = '';
                });
            } else {
                // Start returning all cards (from bottom to top)
                requestAnimationFrame(() => {
                    hidingCards.reverse().forEach((card, i) => {
                        card.classList.remove('hiding');
                        card.style.transform = 'translateY(-100vh)';
                        card.style.opacity = '0';
                        card.getBoundingClientRect();
                        setTimeout(() => {
                            card.classList.add('returning');
                        }, i * 40);
                    });
                });
            }

            setTimeout(() => {
                if (morphCard) {
                    morphCard.remove();
                    morphCard = null;
                }
                backdrop.classList.remove('active');
                backdrop.style.opacity = '';

                if (selectedCard) {
                    selectedCard.style.visibility = 'visible';
                }

                if (!isLowQuality) {
                    // Clean up after animation
                    setTimeout(() => {
                        hidingCards.forEach(card => {
                            card.classList.remove('returning');
                            card.style.transform = '';
                            card.style.opacity = '';
                        });
                    }, 800);
                }

                selectedCard = null;
                selectedTool = null;
            }, isLowQuality ? 0 : 800);
        }

        // Keyboard escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && morphCard) closeMorphCard();
        });

        // Search
        searchInput.addEventListener('focus', () => {
            document.querySelector('.search-box').classList.add('searching');
        });

        searchInput.addEventListener('blur', () => {
            document.querySelector('.search-box').classList.remove('searching');
        });

        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            if (term) {
                renderCards(tools.filter(t =>
                    t.name.toLowerCase().includes(term) ||
                    (t.tags && t.tags.some(tag => tag.toLowerCase().includes(term))) ||
                    t.description.toLowerCase().includes(term)
                ));
            } else {
                renderCards(tools);
            }
        });
