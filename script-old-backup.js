/**
 * ANIME//NEXUS - Protocol v26.0 (NEURAL_HYBRID_ENGINE)
 * Load-Balanced Scraper Array & Airing Status Guard
 */

const NEXUS_CONFIG = {
    ANILIST: 'https://graphql.anilist.co/',
    // High-Availability Bridge Array
    BRIDGES: [
        'https://consumet-api.vercel.app/meta/anilist/',
        'https://api-consumet-org-five.vercel.app/meta/anilist/',
        'https://api.consumet.org/meta/anilist/'
    ],
    // Emergency Direct Mirrors
    MIRRORS: [
        { name: 'STATION_ALPHA', url: (id, ep) => `https://vidsrc.to/embed/anime/${id}/${ep}` },
        { name: 'STATION_BRAVO', url: (id, ep) => `https://vidlink.pro/embed/anime/${id}/${ep}` }
    ]
};

const query = {
    trending: `query { Page(page: 1, perPage: 24) { media(type: ANIME, sort: TRENDING_DESC) {
        id idMal title { romaji english } coverImage { extraLarge } status averageScore episodes } } }`,
    details: `query ($id: Int) { Media(id: $id) {
        id idMal title { romaji english } description status averageScore episodes seasonYear
        nextAiringEpisode { episode airingAt }
        relations { edges { relationType node { id idMal title { romaji english } type status } } }
    } }`,
    search: `query ($s: String) { Page(page: 1, perPage: 12) { media(search: $s, type: ANIME) {
        id idMal title { romaji english } coverImage { extraLarge } status averageScore episodes } } }`
};

const callAniList = async (q, vars = {}) => {
    try {
        const res = await fetch(NEXUS_CONFIG.ANILIST, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, variables: vars }) });
        return (await res.json()).data;
    } catch (e) { return null; }
};

const Nexus = {
    state: {
        activeAnime: null,
        activeEp: 1,
        activeBridgeIdx: 0,
        activeServer: 'vidstreaming',
        availableEps: []
    },

    init: () => {
        Nexus.loadTrending();
        Nexus.bind();
    },

    loadTrending: async () => {
        const grid = document.getElementById('trending-grid');
        grid.innerHTML = '<div class="loading">[ESTABLISHING_NEURAL_LINK...]</div>';
        const data = await callAniList(query.trending);
        if (data) Nexus.renderGrid(data.Page.media, grid);
    },

    renderGrid: (list, container) => {
        container.innerHTML = '';
        list.forEach(a => {
            const card = document.createElement('div');
            card.className = 'anime-card';
            card.innerHTML = `
                <div class="card-media"><img src="${a.coverImage.extraLarge}"></div>
                <div class="card-info">
                    <h3>${(a.title.english || a.title.romaji).toUpperCase()}</h3>
                    <div class="card-meta"><span>${a.episodes || '??'} EP</span><span>${a.averageScore || '--'}%</span></div>
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

        const data = await callAniList(query.details, { id });
        if (!data) return;

        const anime = data.Media;
        Nexus.state.activeAnime = anime;
        Nexus.state.activeEp = 1;

        document.getElementById('display-title').textContent = (anime.title.english || anime.title.romaji).toUpperCase();
        document.getElementById('display-desc').innerHTML = anime.description || "NO_INTEL";

        Nexus.renderSeasons(anime);
        
        // STATUS_GUARD: Check if anime has aired
        if (anime.status === 'NOT_YET_RELEASED') {
            document.getElementById('episode-list').innerHTML = '<div class="loading">[BROADCAST_PENDING: RELEASE_SCHEDULED_FOR_FUTURE]</div>';
            document.getElementById('video-engine').innerHTML = '<div class="loading">SATELLITE_WAITING_FOR_SIGNAL...</div>';
            return;
        }

        Nexus.syncSignal(id);
    },

    renderSeasons: (anime) => {
        const dropdown = document.getElementById('season-dropdown');
        dropdown.innerHTML = `<option value="${anime.id}" selected>STATION: ${anime.title.romaji}</option>`;
        anime.relations.edges.filter(e => e.node.type === 'ANIME').forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.node.id;
            opt.textContent = `${r.relationType}: ${r.node.title.romaji}`;
            dropdown.appendChild(opt);
        });
        dropdown.onchange = (e) => { if(e.target.value) Nexus.open(parseInt(e.target.value)); };
    },

    syncSignal: async (id) => {
        const grid = document.getElementById('episode-list');
        grid.innerHTML = '<div class="loading">TUNING_TO_GLOBAL_ARCHIVE...</div>';
        
        // Multi-Bridge Failover Logic
        let success = false;
        for (let i = 0; i < NEXUS_CONFIG.BRIDGES.length; i++) {
            try {
                const res = await fetch(`${NEXUS_CONFIG.BRIDGES[i]}info/${id}`);
                const data = await res.json();
                
                if (data && data.episodes && data.episodes.length > 0) {
                    Nexus.state.availableEps = data.episodes;
                    Nexus.state.activeBridgeIdx = i;
                    Nexus.renderEpisodes();
                    Nexus.renderServers();
                    Nexus.tune();
                    success = true;
                    break;
                }
            } catch (e) { continue; }
        }

        if (!success) {
            // FALLBACK: Emergency direct mirror mode
            const total = Nexus.state.activeAnime.episodes || 12;
            Nexus.state.availableEps = Array.from({ length: total }, (_, i) => ({ id: i + 1, number: i + 1 }));
            Nexus.renderEpisodes(true);
            Nexus.renderServers(true);
            Nexus.tune(true);
        }
    },

    renderServers: (isFallback = false) => {
        const list = document.getElementById('server-list');
        list.innerHTML = '';
        const servers = isFallback ? ['ALPHA', 'BRAVO'] : ['vidstreaming', 'megacloud', 'vidcloud'];
        servers.forEach(s => {
            const btn = document.createElement('button');
            btn.className = `station-btn ${s === Nexus.state.activeServer ? 'active' : ''}`;
            btn.textContent = s.toUpperCase();
            btn.onclick = () => {
                Nexus.state.activeServer = s;
                Nexus.renderServers(isFallback);
                Nexus.tune(isFallback);
            };
            list.appendChild(btn);
        });
    },

    renderEpisodes: (isFallback = false) => {
        const grid = document.getElementById('episode-list');
        grid.innerHTML = '';
        Nexus.state.availableEps.forEach(ep => {
            const btn = document.createElement('button');
            btn.className = `ep-btn ${ep.number === Nexus.state.activeEp ? 'active' : ''}`;
            btn.textContent = ep.number;
            btn.onclick = () => {
                Nexus.state.activeEp = ep.number;
                Nexus.renderEpisodes(isFallback);
                Nexus.tune(isFallback);
            };
            grid.appendChild(btn);
        });
    },

    tune: async (isFallback = false) => {
        const engine = document.getElementById('video-engine');
        const anime = Nexus.state.activeAnime;
        const ep = Nexus.state.availableEps.find(e => e.number === Nexus.state.activeEp);
        
        engine.innerHTML = `<div class="loading">[Establishing Link to ${Nexus.state.activeServer.toUpperCase()}...]</div>`;
        
        if (isFallback) {
            const mirror = NEXUS_CONFIG.MIRRORS[Nexus.state.activeServer === 'ALPHA' ? 0 : 1];
            const id = anime.idMal || anime.id;
            engine.innerHTML = `<iframe src="${mirror.url(id, Nexus.state.activeEp)}" allowfullscreen="true" frameborder="0" scrolling="no"></iframe>`;
            return;
        }

        try {
            const res = await fetch(`${NEXUS_CONFIG.BRIDGES[Nexus.state.activeBridgeIdx]}watch/${ep.id}?server=${Nexus.state.activeServer}`);
            const data = await res.json();
            
            if (data && data.sources && data.sources.length > 0) {
                const source = data.sources.find(s => s.quality === 'default') || data.sources[0];
                // Using high-speed HLS player bridge
                engine.innerHTML = `<iframe src="https://artplayer.org/?url=${encodeURIComponent(source.url)}" allowfullscreen="true" frameborder="0" scrolling="no"></iframe>`;
            } else {
                engine.innerHTML = '<div class="loading">[INVALID SOURCE: SWITCH SERVERS]</div>';
            }
        } catch (e) {
            engine.innerHTML = '<div class="loading">[STATION OFFLINE: RETRYING...]</div>';
        }
    },

    close: () => {
        document.getElementById('player-overlay').style.display = 'none';
        document.getElementById('video-engine').innerHTML = '';
        document.body.style.overflow = 'auto';
    },

    bind: () => {
        const sInput = document.getElementById('main-search');
        const sBtn = document.getElementById('search-btn');
        const doSearch = async () => {
            const q = sInput.value.trim();
            if (!q) return;
            const data = await callAniList(query.search, { s: q });
            if (data) {
                document.querySelector('.section-title').textContent = `SCAN_RESULTS: ${q.toUpperCase()}`;
                Nexus.renderGrid(data.Page.media, document.getElementById('trending-grid'));
            }
        };
        sBtn.onclick = doSearch;
        sInput.onkeypress = (e) => { if(e.key === 'Enter') doSearch(); };
    }
};

window.onload = Nexus.init;
