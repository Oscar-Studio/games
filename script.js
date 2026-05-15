        'use strict';

const cardContainer = document.getElementById('cardContainer');
const backdrop = document.getElementById('backdrop');
const settingsBtn = document.getElementById('settingsBtn');
const settingsDropdown = document.getElementById('settingsDropdown');
const qualityRadios = document.querySelectorAll('input[name="quality"]');

// Script cache for plasma mode
const loadedScripts = new Set();

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
            // Load particle engine scripts with caching
            const coreSrc = 'particle-engine/particle-core.js';
            const uiSrc = 'particle-engine/particle-ui.js';

            const loadCore = () => {
                return new Promise((resolve, reject) => {
                    if (loadedScripts.has(coreSrc)) {
                        resolve();
                        return;
                    }
                    const coreScript = document.createElement('script');
                    coreScript.src = coreSrc;
                    coreScript.onload = () => {
                        loadedScripts.add(coreSrc);
                        resolve();
                    };
                    coreScript.onerror = reject;
                    document.head.appendChild(coreScript);
                });
            };

            const loadUI = () => {
                return new Promise((resolve, reject) => {
                    if (loadedScripts.has(uiSrc)) {
                        resolve();
                        return;
                    }
                    const uiScript = document.createElement('script');
                    uiScript.src = uiSrc;
                    uiScript.onload = () => {
                        loadedScripts.add(uiSrc);
                        resolve();
                    };
                    uiScript.onerror = reject;
                    document.head.appendChild(uiScript);
                });
            };

            loadCore().then(loadUI).then(() => {
                particleUI = new ParticleUI(document.body, {
                    particleCount: 200,
                    quality: 'plasma'
                });
                setupParticleUIHandlers();
            }).catch(err => {
                console.error('Failed to load particle UI:', err);
            });
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

        // Load tools with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        fetch('tools-config.json', { signal: controller.signal })
            .then(response => {
                clearTimeout(timeoutId);
                return response.json();
            })
            .then(data => {
                tools = data.tools || [];
                tools.sort((a, b) => {
                    if (a.featured !== b.featured) return b.featured ? 1 : -1;
                    return a.name.localeCompare(b.name);
                });
                renderCards(tools);
            })
            .catch(error => {
                clearTimeout(timeoutId);
                console.error('加载工具配置失败:', error);
                cardContainer.innerHTML = '<p class="no-results">加载工具失败</p>';
            });

        function escapeHtml(str) {
            if (!str) return '';
            return String(str).replace(/[&<>"']/g, c => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[c]));
        }

        function renderCards(toolsToRender) {
            cardContainer.innerHTML = '';
            if (toolsToRender.length === 0) {
                cardContainer.innerHTML = '<p class="no-results">没有找到匹配的工具</p>';
                return;
            }

            toolsToRender.forEach(tool => {
                const card = document.createElement('div');
                card.className = 'card';
                // Use textContent for safe rendering
                const iconSpan = document.createElement('span');
                iconSpan.className = 'card-icon';
                iconSpan.textContent = tool.icon || '🎮';
                const nameSpan = document.createElement('span');
                nameSpan.className = 'card-name';
                nameSpan.textContent = tool.name;
                const headerDiv = document.createElement('div');
                headerDiv.className = 'card-header';
                headerDiv.appendChild(iconSpan);
                headerDiv.appendChild(nameSpan);

                const tagsDiv = document.createElement('div');
                tagsDiv.className = 'card-tags';
                if (tool.tags) {
                    tool.tags.slice(0, 3).forEach(t => {
                        const tagSpan = document.createElement('span');
                        tagSpan.className = 'card-tag';
                        tagSpan.textContent = t;
                        tagsDiv.appendChild(tagSpan);
                    });
                }

                card.appendChild(headerDiv);
                card.appendChild(tagsDiv);
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

            // Create morph card at card's position using safe DOM methods
            morphCard = document.createElement('div');
            morphCard.className = 'morph-card compact';

            const headerDiv = document.createElement('div');
            headerDiv.className = 'morph-header';
            const iconSpan = document.createElement('span');
            iconSpan.className = 'morph-icon';
            iconSpan.textContent = tool.icon || '🎮';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'morph-name';
            nameSpan.textContent = tool.name;
            headerDiv.appendChild(iconSpan);
            headerDiv.appendChild(nameSpan);

            const tagsDiv = document.createElement('div');
            tagsDiv.className = 'morph-tags';
            if (tool.tags) {
                tool.tags.slice(0, 3).forEach(t => {
                    const tagSpan = document.createElement('span');
                    tagSpan.className = 'morph-tag';
                    tagSpan.textContent = t;
                    tagsDiv.appendChild(tagSpan);
                });
            }

            const contentDiv = document.createElement('div');
            contentDiv.className = 'morph-content';
            const bigIcon = document.createElement('div');
            bigIcon.className = 'morph-big-icon';
            bigIcon.textContent = tool.icon || '🎮';
            const title = document.createElement('h2');
            title.textContent = tool.name;
            const desc = document.createElement('p');
            desc.textContent = tool.description || '';
            const link = document.createElement('a');
            link.href = tool.demoFile || `${tool.name}/index.html`;
            link.className = 'btn-explore';
            link.textContent = '进入演示';

            contentDiv.appendChild(bigIcon);
            contentDiv.appendChild(title);
            contentDiv.appendChild(desc);
            contentDiv.appendChild(link);

            const closeBtn = document.createElement('button');
            closeBtn.className = 'close-btn';
            closeBtn.textContent = '×';

            morphCard.appendChild(headerDiv);
            morphCard.appendChild(tagsDiv);
            morphCard.appendChild(contentDiv);
            morphCard.appendChild(closeBtn);

            morphCard.style.left = rect.left + 'px';
            morphCard.style.top = rect.top + 'px';
            morphCard.style.width = rect.width + 'px';
            morphCard.style.minHeight = rect.height + 'px';
            document.body.appendChild(morphCard);

            // Don't hide original card yet - let it morph into the card
            // Keep original card visible until animation completes

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
                    // Now hide original card as morph card starts moving
                    cardElement.style.opacity = '0';
                    cardElement.style.transition = 'opacity 0.3s ease';

                    morphCard.style.transition = 'all 750ms cubic-bezier(0.34, 1.4, 0.64, 1)';
                    morphCard.style.left = targetLeft + 'px';
                    morphCard.style.top = targetTop + 'px';
                    morphCard.style.width = targetWidth + 'px';
                    morphCard.style.minHeight = targetHeight + 'px';
                });
            } else {
                cardElement.style.display = 'none';
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
                    card.style.opacity = '';
                });
            } else {
                // Start returning all cards (from bottom to top)
                requestAnimationFrame(() => {
                    hidingCards.reverse().forEach((card, i) => {
                        card.classList.remove('hiding', 'returning');
                        card.style.transform = 'translateY(-100vh)';
                        card.style.opacity = '0';
                        card.getBoundingClientRect();
                        setTimeout(() => {
                            card.classList.add('returning');
                        }, i * 40);
                    });
                });

            // 立即清除 selectedCard 的所有样式，防止残留
            if (selectedCard) {
                selectedCard.style.transition = 'none';
                selectedCard.style.transform = '';
                selectedCard.style.opacity = '';
            }

            setTimeout(() => {
                if (morphCard) {
                    morphCard.remove();
                    morphCard = null;
                }
                backdrop.classList.remove('active');
                backdrop.style.opacity = '';

                if (selectedCard) {
                    selectedCard.style.opacity = '';
                }

                if (!isLowQuality) {
                    // Clean up after animation - remove class and clear inline styles
                    setTimeout(() => {
                        hidingCards.forEach(card => {
                            card.classList.remove('hiding', 'returning');
                            card.style.transform = '';
                            card.style.opacity = '';
                        });
                        if (selectedCard) {
                            selectedCard.style.opacity = '';
                        }
                    }, 750);
                }

                selectedCard = null;
                selectedTool = null;
            }, isLowQuality ? 0 : 750);
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
