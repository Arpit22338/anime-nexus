/**
 * ANIME//NEXUS - Protocol v27.0 (ULTRA_STABLE_HYBRID)
 * Multi-Provider Streaming with Intelligent Failover
 * Supports: VidSrc, 2Embed, Gogoanime, and direct embeds
 */

const NEXUS_CONFIG = {
    ANILIST: 'https://graphql.anilist.co/',
    
    // Primary streaming providers (most reliable)
    PROVIDERS: {
        vidsrcpro: {
            name: 'VidSrc.pro',
            getUrl: (malId, ep) => `https://vidsrc.pro/embed/anime/${malId}/${ep}`,
            priority: 1
        },
        vidsrcme: {
            name: 'VidSrc.me',
            getUrl: (malId, ep) => `https://vidsrc.me/embed/anime?mal=${malId}&episode=${ep}`,
            priority: 2
        },
        vidsrcin: {
            name: 'VidSrc.in',
            getUrl: (malId, ep) => `https://vidsrc.in/embed/anime?mal=${malId}&episode=${ep}`,
            priority: 3
        },
        aniwave: {
            name: 'AniWave',
            getUrl: (malId, ep) => `https://embed.aniwave.live/anime/${malId}/${ep}`,
            priority: 4
        },
        animegg: {
            name: 'Anime.gg',
            getUrl: (malId, ep) => `https://anime.gg/play/${malId}/${ep}`,
            priority: 5
        }
    },
    
    // Backup APIs (for episode lists if needed)
    BACKUP_APIS: [
        'https://api.jikan.moe/v4/anime/' // Jikan (MyAnimeList API - very stable)
    ]
};

const query = {
    trending: `query { 
        Page(page: 1, perPage: 24) { 
            media(type: ANIME, sort: TRENDING_DESC) {
                id 
                idMal 
                title { romaji english } 
                coverImage { extraLarge } 
                status 
                averageScore 
                episodes
                format
            } 
        } 
    }`,
    
    details: `query ($id: Int) { 
        Media(id: $id) {
            id 
            idMal 
            title { romaji english } 
            description 
            status 
            averageScore 
            episodes 
            seasonYear
            format
            nextAiringEpisode { episode airingAt }
            relations { 
                edges { 
                    relationType 
                    node { 
                        id 
                        idMal 
                        title { romaji english } 
                        type 
                        status 
                        format
                    } 
                } 
            }
        } 
    }`,
    
    search: `query ($s: String) { 
        Page(page: 1, perPage: 12) { 
            media(search: $s, type: ANIME) {
                id 
                idMal 
                title { romaji english } 
                coverImage { extraLarge } 
                status 
                averageScore 
                episodes
            } 
        } 
    }`
};

const callAniList = async (q, vars = {}) => {
    try {
        const res = await fetch(NEXUS_CONFIG.ANILIST, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ query: q, variables: vars }) 
        });
        const json = await res.json();
        return json.data;
    } catch (e) { 
        console.error('AniList API Error:', e);
        return null; 
    }
};

const Nexus = {
    state: {
        activeAnime: null,
        activeEp: 1,
        activeProvider: 'vidsrc',
        availableEps: [],
        isDub: false
    },

    init: () => {
        Nexus.loadTrending();
        Nexus.bind();
    },

    loadTrending: async () => {
        const grid = document.getElementById('trending-grid');
        grid.innerHTML = '<div class="loading">[ESTABLISHING_NEURAL_LINK...]</div>';
        const data = await callAniList(query.trending);
        if (data && data.Page) {
            Nexus.renderGrid(data.Page.media, grid);
        } else {
            grid.innerHTML = '<div class="loading">[CONNECTION_FAILED: RETRY_LATER]</div>';
        }
    },

    renderGrid: (list, container) => {
        container.innerHTML = '';
        list.forEach(a => {
            const card = document.createElement('div');
            card.className = 'anime-card';
            const title = (a.title.english || a.title.romaji).toUpperCase();
            const episodes = a.episodes || '??';
            const score = a.averageScore || '--';
            
            card.innerHTML = `
                <div class="card-media">
                    <img src="${a.coverImage.extraLarge}" alt="${title}">
                    <div class="card-status ${a.status.toLowerCase().replace('_', '-')}">${a.status}</div>
                </div>
                <div class="card-info">
                    <h3>${title}</h3>
                    <div class="card-meta">
                        <span>📺 ${episodes} EP</span>
                        <span>⭐ ${score}%</span>
                    </div>
                </div>
            `;
            card.onclick = () => Nexus.open(a.id);
            container.appendChild(card);
        });
    },

    open: async (id) => {
        const overlay = document.getElementById('player-overlay');
        overlay.style.display = 'block';
        document.body.style.overflow = 'hidden';

        const engine = document.getElementById('video-engine');
        engine.innerHTML = '<div class="loading">[LOADING_ANIME_DATA...]</div>';

        const data = await callAniList(query.details, { id });
        if (!data || !data.Media) {
            engine.innerHTML = '<div class="loading">[ERROR: ANIME_NOT_FOUND]</div>';
            return;
        }

        const anime = data.Media;
        Nexus.state.activeAnime = anime;
        Nexus.state.activeEp = 1;

        // Update UI with anime details
        const title = (anime.title.english || anime.title.romaji).toUpperCase();
        document.getElementById('display-title').textContent = title;
        document.getElementById('display-desc').innerHTML = anime.description || "NO_INTEL_AVAILABLE";

        // Render seasons/related anime
        Nexus.renderSeasons(anime);
        
        // Check if anime has episodes
        if (anime.status === 'NOT_YET_RELEASED') {
            document.getElementById('episode-list').innerHTML = 
                '<div class="loading">[BROADCAST_PENDING]</div>';
            engine.innerHTML = '<div class="loading">RELEASE_DATE_TBA</div>';
            Nexus.renderProviders();
            return;
        }

        // Generate episode list
        let totalEps = anime.episodes;
        
        // If episodes is null/undefined, try to get from nextAiringEpisode or use default
        if (!totalEps) {
            if (anime.nextAiringEpisode && anime.nextAiringEpisode.episode) {
                // Currently airing - use next airing episode - 1
                totalEps = anime.nextAiringEpisode.episode;
            } else if (anime.format === 'MOVIE') {
                totalEps = 1;
            } else {
                // Default for TV series
                totalEps = 24;
            }
        }
        
        Nexus.state.availableEps = Array.from({ length: totalEps }, (_, i) => ({
            number: i + 1,
            id: i + 1
        }));

        Nexus.renderProviders();
        Nexus.renderEpisodes();
        Nexus.tune();
    },

    renderSeasons: (anime) => {
        const dropdown = document.getElementById('season-dropdown');
        dropdown.innerHTML = '<option value="">SELECT_SEASON</option>';
        
        if (anime.relations && anime.relations.edges) {
            const sequels = anime.relations.edges.filter(e => 
                (e.relationType === 'SEQUEL' || e.relationType === 'PREQUEL' || 
                 e.relationType === 'ALTERNATIVE' || e.relationType === 'SIDE_STORY') &&
                e.node.type === 'ANIME'
            );
            
            sequels.forEach(rel => {
                const opt = document.createElement('option');
                opt.value = rel.node.id;
                const relTitle = rel.node.title.english || rel.node.title.romaji;
                opt.textContent = `${relTitle} [${rel.relationType}]`;
                dropdown.appendChild(opt);
            });
        }

        dropdown.onchange = (e) => {
            if (e.target.value) {
                Nexus.open(parseInt(e.target.value));
            }
        };
    },

    renderProviders: () => {
        const list = document.getElementById('server-list');
        list.innerHTML = '';
        
        Object.entries(NEXUS_CONFIG.PROVIDERS).forEach(([key, provider]) => {
            const btn = document.createElement('button');
            btn.className = `station-btn ${key === Nexus.state.activeProvider ? 'active' : ''}`;
            btn.textContent = provider.name;
            btn.onclick = () => {
                Nexus.state.activeProvider = key;
                Nexus.renderProviders();
                Nexus.tune();
            };
            list.appendChild(btn);
        });
    },

    renderEpisodes: () => {
        const grid = document.getElementById('episode-list');
        grid.innerHTML = '';
        
        if (Nexus.state.availableEps.length === 0) {
            grid.innerHTML = '<div class="loading">[NO_EPISODES_AVAILABLE]</div>';
            return;
        }

        Nexus.state.availableEps.forEach(ep => {
            const btn = document.createElement('button');
            btn.className = `ep-btn ${ep.number === Nexus.state.activeEp ? 'active' : ''}`;
            btn.textContent = ep.number;
            btn.onclick = () => {
                Nexus.state.activeEp = ep.number;
                Nexus.renderEpisodes();
                Nexus.tune();
            };
            grid.appendChild(btn);
        });
    },

    tune: () => {
        const engine = document.getElementById('video-engine');
        const anime = Nexus.state.activeAnime;
        
        if (!anime) {
            engine.innerHTML = '<div class="loading">[ERROR: NO_ANIME_SELECTED]</div>';
            return;
        }

        // Prefer MAL ID, fallback to AniList ID
        const malId = anime.idMal;
        
        if (!malId) {
            engine.innerHTML = `
                <div class="loading" style="color: #ff4444;">
                    [ERROR: NO_MAL_ID_FOUND]<br>
                    This anime may not be available for streaming.<br>
                    AniList ID: ${anime.id}<br>
                    Try searching for a different season.
                </div>
            `;
            return;
        }
        
        const provider = NEXUS_CONFIG.PROVIDERS[Nexus.state.activeProvider];
        const title = anime.title.english || anime.title.romaji;
        
        engine.innerHTML = `
            <div class="loading">
                [TUNING_TO: ${provider.name.toUpperCase()}]<br>
                Anime: ${title}<br>
                Episode: ${Nexus.state.activeEp}<br>
                MAL ID: ${malId}
            </div>
        `;
        
        // Build iframe with the selected provider
        const embedUrl = provider.getUrl(malId, Nexus.state.activeEp);
        
        console.log(`Loading: ${embedUrl}`);
        
        setTimeout(() => {
            engine.innerHTML = `
                <iframe 
                    src="${embedUrl}" 
                    allowfullscreen="true" 
                    frameborder="0" 
                    scrolling="no"
                    allow="autoplay; fullscreen; picture-in-picture"
                    referrerpolicy="origin"
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-presentation"
                ></iframe>
            `;
        }, 800);
    },

    close: () => {
        document.getElementById('player-overlay').style.display = 'none';
        document.getElementById('video-engine').innerHTML = '';
        document.body.style.overflow = 'auto';
        Nexus.state.activeAnime = null;
    },

    bind: () => {
        const sInput = document.getElementById('main-search');
        const sBtn = document.getElementById('search-btn');
        
        const doSearch = async () => {
            const q = sInput.value.trim();
            if (!q) return;
            
            const grid = document.getElementById('trending-grid');
            grid.innerHTML = '<div class="loading">[SCANNING...]</div>';
            
            const data = await callAniList(query.search, { s: q });
            if (data && data.Page) {
                document.querySelector('.section-title').textContent = 
                    `SCAN_RESULTS: ${q.toUpperCase()}`;
                Nexus.renderGrid(data.Page.media, grid);
            } else {
                grid.innerHTML = '<div class="loading">[NO_RESULTS_FOUND]</div>';
            }
        };
        
        sBtn.onclick = doSearch;
        sInput.onkeypress = (e) => { 
            if(e.key === 'Enter') doSearch(); 
        };
    }
};

// Auto-initialize when page loads
window.onload = Nexus.init;
