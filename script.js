/**
 * ANI//NEXUS - Protocol v35.0 (FULL FIX)
 * State persistence, better UI, h-anime listing, more movie providers
 */

const NEXUS_CONFIG = {
    ANILIST: 'https://graphql.anilist.co/',
    BACKEND_API: 'https://anime-nexus-api.livelyisland-018542b8.southeastasia.azurecontainerapps.io/api',
    EMBED_PROVIDERS: [
        { name: 'VidNest', url: (id, ep, lang) => `https://vidnest.fun/anime/${id}/${ep}/${lang}` },
        { name: 'DropFile', url: (id, ep, lang) => `https://dropfile.cc/player/tv/anilist-${id}/1/${ep}` },
    ],
    MOVIE_PROVIDERS: [
        { name: 'VidSrc', url: (id) => `https://vidsrc.to/embed/movie/${id}` },
        { name: 'NetMirror', url: (id) => `https://netmirror.app/embed/movie/${id}` },
        { name: 'VidPlay', url: (id) => `https://vidplay.site/embed/movie/${id}` },
        { name: 'SuperEmbed', url: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1` },
    ],
    TV_PROVIDERS: [
        { name: 'VidSrc', url: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}` },
        { name: 'NetMirror', url: (id, s, e) => `https://netmirror.app/embed/tv/${id}/${s}/${e}` },
    ]
};

const query = {
    trending: `query { Page(page: 1, perPage: 24) { media(type: ANIME, sort: TRENDING_DESC) {
        id idMal title { romaji english } coverImage { extraLarge large } status averageScore episodes format seasonYear
        nextAiringEpisode { episode airingAt }
        relations { edges { relationType node { id idMal title { romaji english } type status format } } }
    } } }`,
    details: `query ($id: Int) { Media(id: $id) {
        id idMal title { romaji english } description status averageScore episodes format seasonYear
        nextAiringEpisode { episode airingAt }
        relations { edges { relationType node { id idMal title { romaji english } type status format } } }
    } }`,
    search: `query ($s: String) { Page(page: 1, perPage: 12) { media(search: $s, type: ANIME) {
        id idMal title { romaji english } coverImage { extraLarge large } status averageScore episodes format } } }`,
    hAnimeSearch: `query ($s: String) { Page(page: 1, perPage: 20) { media(search: $s, type: ANIME, genre_in: ["Hentai"]) {
        id idMal title { romaji english } coverImage { extraLarge large } status averageScore episodes format } } }`
};

// ==================== CACHING ====================
const Cache = {
    _store: {},
    TTL: 3600000,
    get(key) {
        const item = this._store[key];
        if (item && (Date.now() - item.timestamp) < this.TTL) return item.data;
        if (item) delete this._store[key];
        return null;
    },
    set(key, data) { this._store[key] = { data, timestamp: Date.now() }; }
};

async function callAniList(q, vars = {}) {
    const cacheKey = JSON.stringify({ q, vars });
    const cached = Cache.get(cacheKey);
    if (cached) return cached;
    try {
        const res = await fetch(NEXUS_CONFIG.ANILIST, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: q, variables: vars })
        });
        const json = await res.json();
        if (json.data) Cache.set(cacheKey, json.data);
        return json.data;
    } catch (e) { console.error('AniList error:', e); return null; }
}

class AnimeNexus {
    constructor() {
        this.currentAnime = null;
        this.currentEp = 1;
        this.totalEps = 0;
        this.currentLang = 'sub';
        this.activeProviderIdx = 0;
        this.currentTab = 'home';
        this.epPage = 1;
        this.epPageSize = 200;
        this.init();
    }

    init() {
        this.loadTrending();
        document.getElementById('search-btn').addEventListener('click', () => this.search());
        document.getElementById('main-search').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.search();
        });
        document.getElementById('season-dropdown').addEventListener('change', (e) => {
            if (e.target.value) this.open(parseInt(e.target.value));
        });

        // Restore state from URL on load/refresh
        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');
        if (id && window.location.pathname.includes('animeplayer')) {
            this.open(parseInt(id));
        }

        // Handle browser back/forward
        window.addEventListener('popstate', () => {
            const p = new URLSearchParams(window.location.search);
            const aid = p.get('id');
            if (aid && this.currentAnime && this.currentAnime.id !== parseInt(aid)) {
                this.open(parseInt(aid));
            } else if (!aid && this.currentAnime) {
                this.closeWithoutPush();
            }
        });
    }

    // ==================== TAB NAVIGATION ====================
    showTab(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.nav-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        document.getElementById('home').style.display = tab === 'home' ? 'block' : 'none';
        document.getElementById('favorites-view').style.display = tab === 'favorites' ? 'block' : 'none';
        document.getElementById('continue-view').style.display = tab === 'continue' ? 'block' : 'none';
        document.getElementById('movies-view').style.display = tab === 'movies' ? 'block' : 'none';
        document.getElementById('hentai-view').style.display = tab === 'hentai' ? 'block' : 'none';
        
        if (tab === 'favorites') this.loadFavorites();
        if (tab === 'continue') this.loadContinueWatching();
        if (tab === 'movies') this.loadMovies();
        if (tab === 'hentai') this.loadHentai();
    }

    // ==================== TRENDING & SEARCH ====================
    async loadTrending() {
        const grid = document.getElementById('trending-grid');
        grid.innerHTML = '<div class="loading">[ESTABLISHING_NEURAL_LINK...]</div>';
        const data = await callAniList(query.trending);
        if (data && data.Page && data.Page.media) {
            this.renderGrid(data.Page.media, grid);
        } else {
            grid.innerHTML = '<div class="error">Failed to load. Refresh to retry.</div>';
        }
    }

    async search() {
        const searchTerm = document.getElementById('main-search').value.trim();
        if (!searchTerm) return;
        this.showTab('home');
        const grid = document.getElementById('trending-grid');
        grid.innerHTML = '<div class="loading">[SCANNING...]</div>';
        document.querySelector('.section-title').textContent = `RESULTS: ${searchTerm.toUpperCase()}`;
        const data = await callAniList(query.search, { s: searchTerm });
        if (data && data.Page && data.Page.media) {
            this.renderGrid(data.Page.media, grid);
        } else {
            grid.innerHTML = '<div class="error">No results found</div>';
        }
    }

    renderGrid(animeList, container) {
        container.innerHTML = animeList.map(anime => {
            const title = anime.title.romaji || anime.title.english || 'Unknown';
            const image = anime.coverImage.extraLarge || anime.coverImage.large || '';
            const eps = anime.episodes || '??';
            return `
                <div class="anime-card" onclick="Nexus.open(${anime.id})">
                    <div class="card-media"><img src="${image}" alt="${title}" loading="lazy"></div>
                    <div class="card-info"><h3>${title}</h3><p>${anime.format || ''} ${eps !== '??' ? `• ${eps} eps` : ''}</p></div>
                </div>`;
        }).join('');
    }

    // ==================== OPEN ANIME ====================
    async open(anilistId) {
        try {
            window.history.pushState({}, '', `/animeplayer?id=${anilistId}`);
            document.getElementById('player-overlay').classList.add('active');
            document.getElementById('bottom-nav').style.display = 'none';
            document.getElementById('display-title').textContent = 'LOADING...';
            document.getElementById('display-desc').textContent = 'Connecting to stream...';
            document.getElementById('video-engine').innerHTML = '<div class="loading">ESTABLISHING_LINK...</div>';
            document.getElementById('episode-list').innerHTML = '';
            document.getElementById('server-list').innerHTML = '';
            document.getElementById('back-btn').style.display = 'block';

            const data = await callAniList(query.details, { id: anilistId });
            if (!data || !data.Media) {
                document.getElementById('video-engine').innerHTML = '<div class="error">Failed to load anime</div>';
                return;
            }
            
            this.currentAnime = data.Media;
            this.totalEps = this.currentAnime.episodes || 0;
            this.currentEp = 1;
            this.activeProviderIdx = 0;
            this.epPage = 1;

            document.getElementById('display-title').textContent = this.currentAnime.title.romaji || this.currentAnime.title.english;
            document.getElementById('display-desc').textContent = this.stripHTML(this.currentAnime.description || 'No description available');

            this.populateSeasons();
            this.populateSources();
            this.loadEpisodes();
            this.playEpisode(1);
        } catch (error) {
            console.error('Failed to open anime:', error);
            document.getElementById('video-engine').innerHTML = `<div class="error">Error: ${error.message}</div>`;
        }
    }

    populateSeasons() {
        const dropdown = document.getElementById('season-dropdown');
        dropdown.innerHTML = '';
        let allSeasons = [{
            id: this.currentAnime.id,
            title: this.currentAnime.title.romaji || this.currentAnime.title.english,
            year: this.currentAnime.seasonYear || 9999,
            relationType: 'CURRENT'
        }];
        if (this.currentAnime.relations && this.currentAnime.relations.edges) {
            const related = this.currentAnime.relations.edges
                .filter(edge => ['SEQUEL', 'PREQUEL', 'PARENT', 'SIDE_STORY'].includes(edge.relationType))
                .filter(edge => edge.node.format === 'TV' || edge.node.format === 'OVA' || edge.node.format === 'ONA')
                .map(edge => ({
                    id: edge.node.id,
                    title: edge.node.title.romaji || edge.node.title.english,
                    year: edge.node.seasonYear || 9999,
                    relationType: edge.relationType
                }));
            allSeasons = allSeasons.concat(related);
        }
        allSeasons.sort((a, b) => a.year - b.year);
        allSeasons.forEach(season => {
            const option = document.createElement('option');
            option.value = season.id;
            option.textContent = `${season.title} (${season.year})`;
            if (season.id === allSeasons[0].id) option.selected = true;
            dropdown.appendChild(option);
        });
    }

    populateSources() {
        const container = document.getElementById('server-list');
        container.innerHTML = `
            <div style="display:flex;gap:6px;margin-bottom:8px;">
                <button class="server-btn ${this.currentLang === 'sub' ? 'active' : ''}" onclick="Nexus.setLanguage('sub')" style="flex:1;">SUB</button>
                <button class="server-btn ${this.currentLang === 'dub' ? 'active' : ''}" onclick="Nexus.setLanguage('dub')" style="flex:1;">DUB</button>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${NEXUS_CONFIG.EMBED_PROVIDERS.map((p, idx) => `
                    <button class="server-btn ${idx === 0 ? 'active' : ''}" onclick="Nexus.setSource(${idx})" style="flex:1;min-width:80px;">${p.name.toUpperCase()}</button>
                `).join('')}
            </div>
        `;
    }

    setLanguage(lang) {
        this.currentLang = lang;
        this.populateSources();
        this.playEpisode(this.currentEp);
    }

    setSource(idx) {
        this.activeProviderIdx = idx;
        this.populateSources();
        this.playEpisode(this.currentEp);
    }

    // ==================== EPISODES (PAGINATED) ====================
    loadEpisodes() {
        const container = document.getElementById('episode-list');
        const total = this.totalEps || 12;
        const totalPages = Math.ceil(total / this.epPageSize);
        const start = (this.epPage - 1) * this.epPageSize + 1;
        const end = Math.min(this.epPage * this.epPageSize, total);
        
        container.innerHTML = '';
        
        // Page selector
        if (totalPages > 1) {
            const pageDiv = document.createElement('div');
            pageDiv.style.cssText = 'display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;';
            for (let p = 1; p <= totalPages; p++) {
                const btn = document.createElement('button');
                btn.textContent = `${(p-1)*this.epPageSize+1}-${Math.min(p*this.epPageSize,total)}`;
                btn.style.cssText = `font-size:0.6rem;padding:3px 8px;background:${p === this.epPage ? 'var(--accent)' : 'rgba(255,255,255,0.05)'};border:1px solid ${p === this.epPage ? 'var(--accent)' : 'rgba(255,255,255,0.1)'};color:${p === this.epPage ? '#000' : '#888'};cursor:pointer;border-radius:2px;`;
                btn.onclick = () => { this.epPage = p; this.loadEpisodes(); };
                pageDiv.appendChild(btn);
            }
            container.appendChild(pageDiv);
        }
        
        for (let i = start; i <= end; i++) {
            const btn = document.createElement('button');
            btn.className = `ep-btn ${i === this.currentEp ? 'active' : ''}`;
            btn.textContent = i;
            btn.onclick = () => this.playEpisode(i);
            container.appendChild(btn);
        }
    }

    async playEpisode(episodeNum) {
        this.currentEp = episodeNum;
        document.querySelectorAll('.ep-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.textContent) === episodeNum);
        });

        const engine = document.getElementById('video-engine');
        engine.innerHTML = '<div class="loading">LOADING_STREAM...</div>';

        for (let i = 0; i < NEXUS_CONFIG.EMBED_PROVIDERS.length; i++) {
            const idx = (this.activeProviderIdx + i) % NEXUS_CONFIG.EMBED_PROVIDERS.length;
            const provider = NEXUS_CONFIG.EMBED_PROVIDERS[idx];
            const embedUrl = provider.url(this.currentAnime.id, episodeNum, this.currentLang);
            
            try {
                const resp = await fetch(embedUrl, { method: 'HEAD', mode: 'no-cors' });
                engine.innerHTML = `<iframe src="${embedUrl}" allowfullscreen="true" frameborder="0" scrolling="no" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" style="width: 100%; height: 100%; border: none;"></iframe>`;
                this.activeProviderIdx = idx;
                return;
            } catch (e) {
                console.log(`${provider.name} failed, trying next...`);
            }
        }
        engine.innerHTML = '<div class="error">All sources offline. Try again later.</div>';

        this.saveWatchProgress(this.currentAnime.id, {
            title: this.currentAnime.title.romaji || this.currentAnime.title.english,
            thumbnail: this.currentAnime.coverImage.extraLarge,
            episode: episodeNum,
            timestamp: Date.now()
        });
    }

    // ==================== PLAYER CONTROLS ====================
    close() { window.history.back(); }
    doClose() { window.history.pushState({}, '', '/'); this.closeWithoutPush(); }
    closeWithoutPush() {
        document.getElementById('player-overlay').classList.remove('active');
        document.getElementById('bottom-nav').style.display = 'flex';
        document.getElementById('back-btn').style.display = 'none';
        document.getElementById('video-engine').innerHTML = '';
        this.currentAnime = null;
        this.currentEp = 1;
    }
    goBack() {
        if (this.currentAnime) {
            this.closeWithoutPush();
            window.history.pushState({}, '', '/');
        } else {
            window.location.href = '/';
        }
    }
    stripHTML(html) { const tmp = document.createElement('div'); tmp.innerHTML = html; return tmp.textContent || tmp.innerText || ''; }

    // ==================== FAVORITES ====================
    getFavorites() { return JSON.parse(localStorage.getItem('nexus_favorites') || '[]'); }
    saveFavorites(f) { localStorage.setItem('nexus_favorites', JSON.stringify(f)); }
    isFavorited(id) { return this.getFavorites().some(f => f.id === id); }
    toggleFavorite(anime, event) {
        event.stopPropagation();
        let favs = this.getFavorites();
        const idx = favs.findIndex(f => f.id === anime.id);
        if (idx === -1) favs.push({ id: anime.id, title: anime.title.romaji || anime.title.english, image: anime.coverImage.extraLarge || anime.coverImage.large, addedAt: Date.now() });
        else favs.splice(idx, 1);
        this.saveFavorites(favs);
        this.loadFavorites();
    }
    loadFavorites() {
        const grid = document.getElementById('favorites-grid');
        const favs = this.getFavorites();
        if (favs.length === 0) { grid.innerHTML = '<div class="empty-state">No favorites yet.</div>'; return; }
        grid.innerHTML = favs.map(f => `
            <div class="anime-card" onclick="Nexus.open(${f.id})">
                <div class="card-media"><img src="${f.image}" alt="${f.title}"><button class="fav-btn favorited" onclick="Nexus.toggleFavorite({id:${f.id},title:'${f.title.replace(/'/g,"\\'")}',coverImage:{extraLarge:'${f.image}'}},event)">♥</button></div>
                <div class="card-info"><h3>${f.title}</h3></div>
            </div>`).join('');
    }

    // ==================== CONTINUE WATCHING ====================
    getWatchProgress() { return JSON.parse(localStorage.getItem('nexus_progress') || '{}'); }
    saveWatchProgress(id, data) { const p = this.getWatchProgress(); p[id] = data; localStorage.setItem('nexus_progress', JSON.stringify(p)); }
    loadContinueWatching() {
        const grid = document.getElementById('continue-grid');
        const progress = this.getWatchProgress();
        const entries = Object.entries(progress).sort((a, b) => b[1].timestamp - a[1].timestamp);
        if (entries.length === 0) { grid.innerHTML = '<div class="empty-state">No continue watching.</div>'; return; }
        grid.innerHTML = entries.slice(0, 20).map(([id, data]) => `
            <div class="anime-card" onclick="Nexus.open(${id})">
                <div class="card-media"><img src="${data.thumbnail}" alt="${data.title}"><div class="ep-badge">EP ${data.episode}</div></div>
                <div class="card-info"><h3>${data.title}</h3><p>Episode ${data.episode}</p></div>
            </div>`).join('');
    }

    // ==================== MOVIES ====================
    async loadMovies() {
        const grid = document.getElementById('movies-grid');
        if (grid.innerHTML.trim() && !grid.innerHTML.includes('Loading')) return;
        grid.innerHTML = '<div class="loading">Loading movies...</div>';
        try {
            const resp = await fetch(NEXUS_CONFIG.BACKEND_API + '/movies/popular?category=all');
            const data = await resp.json();
            if (data.movies && data.movies.length > 0) {
                grid.innerHTML = data.movies.map(m => `
                    <div class="anime-card" onclick="Nexus.openMovie(${m.id})">
                        <div class="card-media"><img src="${m.image}" alt="${m.title}" loading="lazy"></div>
                        <div class="card-info"><h3>${m.title}</h3><p>${m.year} ${m.rating ? `• ★ ${m.rating}` : ''}</p></div>
                    </div>`).join('');
            } else { grid.innerHTML = '<div class="error">No movies found</div>'; }
        } catch (e) { grid.innerHTML = '<div class="error">Failed to load movies</div>'; }
    }
    async searchMovies() {
        const q = document.getElementById('movie-search').value.trim();
        if (!q) return;
        const grid = document.getElementById('movies-grid');
        grid.innerHTML = '<div class="loading">Searching...</div>';
        try {
            const resp = await fetch(NEXUS_CONFIG.BACKEND_API + '/movies/search?q=' + encodeURIComponent(q));
            const data = await resp.json();
            if (data.results && data.results.length > 0) {
                grid.innerHTML = data.results.map(m => `
                    <div class="anime-card" onclick="Nexus.openMovie(${m.id})">
                        <div class="card-media"><img src="${m.image}" alt="${m.title}" loading="lazy"></div>
                        <div class="card-info"><h3>${m.title}</h3><p>${m.year} ${m.type}</p></div>
                    </div>`).join('');
            } else { grid.innerHTML = '<div class="error">No results</div>'; }
        } catch (e) { grid.innerHTML = '<div class="error">Search failed</div>'; }
    }
    openMovie(movieId) {
        document.getElementById('player-overlay').classList.add('active');
        document.getElementById('bottom-nav').style.display = 'none';
        document.getElementById('back-btn').style.display = 'block';
        document.getElementById('display-title').textContent = 'Loading...';
        document.getElementById('display-desc').textContent = '';
        document.getElementById('episode-list').innerHTML = '';
        document.getElementById('season-dropdown').innerHTML = '<option value="">MOVIE</option>';
        
        const container = document.getElementById('server-list');
        container.innerHTML = NEXUS_CONFIG.MOVIE_PROVIDERS.map((p, idx) => `
            <button class="server-btn ${idx === 0 ? 'active' : ''}" onclick="Nexus.setMovieSource(${idx}, ${movieId})" style="flex:1;min-width:80px;">${p.name.toUpperCase()}</button>
        `).join('');
        
        this.playMovieSource(0, movieId);
    }
    setMovieSource(idx, movieId) {
        this.playMovieSource(idx, movieId);
    }
    playMovieSource(idx, movieId) {
        const provider = NEXUS_CONFIG.MOVIE_PROVIDERS[idx];
        document.getElementById('video-engine').innerHTML = `<iframe src="${provider.url(movieId)}" allowfullscreen frameborder="0" style="width:100%;height:100%;border:none;"></iframe>`;
        document.querySelectorAll('.server-btn').forEach((btn, i) => btn.classList.toggle('active', i === idx));
    }

    // ==================== HENTAI ====================
    async loadHentai() {
        const grid = document.getElementById('hentai-grid');
        if (grid.innerHTML.trim() && !grid.innerHTML.includes('Loading') && !grid.innerHTML.includes('error')) return;
        grid.innerHTML = '<div class="loading">Loading hentai...</div>';
        try {
            // Search for hentai anime using AniList
            const data = await callAniList(query.hAnimeSearch, { s: '' });
            if (data && data.Page && data.Page.media && data.Page.media.length > 0) {
                grid.innerHTML = data.Page.media.map(anime => {
                    const title = anime.title.romaji || anime.title.english || 'Unknown';
                    const image = anime.coverImage.extraLarge || anime.coverImage.large || '';
                    const eps = anime.episodes || '??';
                    return `
                        <div class="anime-card" onclick="Nexus.open(${anime.id})">
                            <div class="card-media"><img src="${image}" alt="${title}" loading="lazy"></div>
                            <div class="card-info"><h3>${title}</h3><p>${anime.format || ''} ${eps !== '??' ? `• ${eps} eps` : ''}</p></div>
                        </div>`;
                }).join('');
            } else {
                // Fallback: show providers
                const resp = await fetch(NEXUS_CONFIG.BACKEND_API + '/hentai/providers');
                const pData = await resp.json();
                if (pData.providers && pData.providers.length > 0) {
                    grid.innerHTML = pData.providers.map(p => `
                        <div class="anime-card" onclick="window.open('${p.url}', '_blank')">
                            <div class="card-media"><img src="https://via.placeholder.com/150x200/1a1a2e/00ff9f?text=18%2B" alt="${p.name}"></div>
                            <div class="card-info"><h3>${p.name}</h3><p>Click to browse</p></div>
                        </div>`).join('');
                } else {
                    grid.innerHTML = '<div class="error">No content found</div>';
                }
            }
        } catch (e) {
            grid.innerHTML = '<div class="error">Failed to load</div>';
        }
    }
}

const Nexus = new AnimeNexus();

document.addEventListener('DOMContentLoaded', () => {
    const searchBtn = document.getElementById('movie-search-btn');
    const searchInput = document.getElementById('movie-search');
    if (searchBtn) searchBtn.addEventListener('click', () => Nexus.searchMovies());
    if (searchInput) searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') Nexus.searchMovies(); });
});
