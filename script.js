/**
 * ANI//NEXUS - Protocol v39.0 (Auto-Fallback System)
 * No manual source selection - cascading auto-failover
 */

const NEXUS_CONFIG = {
    ANILIST: 'https://graphql.anilist.co/',
    BACKEND_API: 'https://anime-nexus-api.livelyisland-018542b8.southeastasia.azurecontainerapps.io/api',
    // Anime providers - ordered by reliability
    ANIME_PROVIDERS: [
        { name: 'VidNest', url: (id, ep, lang) => `https://vidnest.fun/anime/${id}/${ep}/${lang}` },
        { name: 'DropFile', url: (id, ep, lang) => `https://dropfile.cc/player/tv/anilist-${id}/1/${ep}` },
        { name: 'AniEmbed', url: (id, ep, lang) => `https://aniembed.cc/embed/anime/${id}/${ep}?dub=${lang === 'dub' ? 1 : 0}` },
    ],
    // Movie/TV providers - reverse engineered from Cineb, NetMirror, Pikashow, etc.
    MOVIE_PROVIDERS: [
        { name: 'VidSrc', url: (id) => `https://vidsrc.to/embed/movie/${id}` },
        { name: 'VidSrcTMDB', url: (id) => `https://vidsrc.to/embed/tmdb/${id}` },
        { name: '2Embed', url: (id) => `https://www.2embed.cc/embed/${id}` },
        { name: 'VidSrc.in', url: (id) => `https://vidsrc.in/embed/movie/${id}` },
        { name: 'MultiEmbed', url: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1` },
        { name: 'PikaShow', url: (id) => `https://pikashow.bio/embed/movie/${id}` },
        { name: 'SuperEmbed', url: (id) => `https://superembed.cc/embed/${id}` },
        { name: 'StreamTape', url: (id) => `https://streamtape.com/e/${id}` },
        { name: 'DoodStream', url: (id) => `https://doodstream.com/e/${id}` },
        { name: 'Filemoon', url: (id) => `https://filemoon.to/e/${id}` },
    ],
    TV_PROVIDERS: [
        { name: 'VidSrc', url: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}` },
        { name: '2Embed', url: (id, s, e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}` },
        { name: 'EmbedSu', url: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}` },
        { name: 'NetMirror', url: (id, s, e) => `https://netmirror.gg/embed/tv/${id}/${s}/${e}` },
    ],
    // Hentai providers - dedicated sources
    HENTAI_PROVIDERS: [
        { name: 'VidNest', url: (id) => `https://vidnest.fun/anime/${id}/1/sub` },
        { name: 'DropFile', url: (id) => `https://dropfile.cc/player/tv/anilist-${id}/1/1` },
        { name: 'AniEmbed', url: (id) => `https://aniembed.cc/embed/anime/${id}/1` },
    ],
    IFRAME_TIMEOUT: 8000 // ms before considering iframe failed
};

const query = {
    trending: `query { Page(page: 1, perPage: 24) { media(type: ANIME, sort: TRENDING_DESC) {
        id idMal title { romaji english } coverImage { extraLarge large } status averageScore episodes format seasonYear
        nextAiringEpisode { episode airingAt }
        relations { edges { relationType node { id idMal title { romaji english } type status format seasonYear } } }
    } } }`,
    details: `query ($id: Int) { Media(id: $id) {
        id idMal title { romaji english } description status averageScore episodes format seasonYear
        nextAiringEpisode { episode airingAt }
        relations { edges { relationType node { id idMal title { romaji english } type status format seasonYear } } }
    } }`,
    search: `query ($s: String) { Page(page: 1, perPage: 12) { media(search: $s, type: ANIME) {
        id idMal title { romaji english } coverImage { extraLarge large } status averageScore episodes format } } }`,
    hAnime: `query { Page(page: 1, perPage: 30) { media(type: ANIME, format: OVA, genre: "Ecchi", sort: POPULARITY_DESC) {
        id idMal title { romaji english } coverImage { extraLarge large } status averageScore episodes format } } }`
};

const Cache = {
    _store: {}, TTL: 3600000,
    get(k) { const i = this._store[k]; if (i && (Date.now() - i.timestamp) < this.TTL) return i.data; if (i) delete this._store[k]; return null; },
    set(k, d) { this._store[k] = { data: d, timestamp: Date.now() }; }
};

async function callAniList(q, vars = {}) {
    const ck = JSON.stringify({ q, vars });
    const c = Cache.get(ck);
    if (c) return c;
    try {
        const res = await fetch(NEXUS_CONFIG.ANILIST, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, variables: vars }) });
        const json = await res.json();
        if (json.data) Cache.set(ck, json.data);
        return json.data;
    } catch (e) { console.error('AniList error:', e); return null; }
}

class AnimeNexus {
    constructor() {
        this.currentAnime = null;
        this.currentEp = 1;
        this.totalEps = 0;
        this.currentLang = 'sub';
        this.currentTab = 'home';
        this.epPage = 1;
        this.epPageSize = 100;
        this.isLoading = false;
        this.moviesLoaded = false;
        this.hentaiLoaded = false;
        this.fallbackTimer = null;
        this.init();
    }

    init() {
        this.loadTrending();
        document.getElementById('search-btn').addEventListener('click', () => this.search());
        document.getElementById('main-search').addEventListener('keypress', (e) => { if (e.key === 'Enter') this.search(); });
        document.getElementById('season-dropdown').addEventListener('change', (e) => { if (e.target.value) this.open(parseInt(e.target.value)); });
        
        // Handle URL parameters
        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');
        
        // Handle /movies or /hentai paths
        const path = window.location.pathname;
        if (path === '/movies') setTimeout(() => this.showTab('movies'), 100);
        else if (path === '/hentai') setTimeout(() => this.showTab('hentai'), 100);
        else if (id) setTimeout(() => this.open(parseInt(id)), 100);
        
        // Handle browser back/forward
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.tab) {
                this.showTab(e.state.tab);
            } else {
                const p = new URLSearchParams(window.location.search);
                const aid = p.get('id');
                if (aid && (!this.currentAnime || this.currentAnime.id !== parseInt(aid))) this.open(parseInt(aid));
                else if (!aid && this.currentAnime) this.goBack();
            }
        });
    }

    showTab(tab) {
        console.log('[NAV] Switching to tab:', tab);
        if (this.isLoading && tab !== 'home') {
            // Allow home tab always
            if (tab !== 'home') return;
        }
        this.currentTab = tab;
        
        // Update nav buttons
        document.querySelectorAll('.nav-tab').forEach(btn => {
            const isActive = btn.dataset.tab === tab;
            btn.classList.toggle('active', isActive);
            console.log('[NAV] Button:', btn.dataset.tab, 'active:', isActive);
        });
        
        // Hide all views first
        const views = ['home', 'favorites', 'continue', 'movies', 'hentai'];
        views.forEach(v => {
            const el = document.getElementById(v + '-view');
            if (el) {
                el.style.display = (v === tab) ? 'block' : 'none';
            }
        });
        
        // Load content
        if (tab === 'favorites') this.loadFavorites();
        if (tab === 'continue') this.loadContinueWatching();
        if (tab === 'movies') { this.moviesLoaded = false; this.loadMovies(); }
        if (tab === 'hentai') { this.hentaiLoaded = false; this.loadHentai(); }
        
        // Update URL without page reload
        const url = tab === 'home' ? '/' : '/' + tab;
        window.history.replaceState({tab}, '', url);
    }

    async loadTrending() {
        const grid = document.getElementById('trending-grid');
        grid.innerHTML = '<div class="loading">[ESTABLISHING_NEURAL_LINK...]</div>';
        const data = await callAniList(query.trending);
        if (data && data.Page && data.Page.media) this.renderGrid(data.Page.media, grid);
        else grid.innerHTML = '<div class="error">Failed to load. Refresh to retry.</div>';
    }

    async search() {
        const searchTerm = document.getElementById('main-search').value.trim();
        if (!searchTerm) return;
        this.showTab('home');
        const grid = document.getElementById('trending-grid');
        grid.innerHTML = '<div class="loading">[SCANNING...]</div>';
        document.querySelector('.section-title').textContent = `RESULTS: ${searchTerm.toUpperCase()}`;
        const data = await callAniList(query.search, { s: searchTerm });
        if (data && data.Page && data.Page.media) this.renderGrid(data.Page.media, grid);
        else grid.innerHTML = '<div class="error">No results found</div>';
    }

    renderGrid(animeList, container) {
        const favs = this.getFavorites();
        container.innerHTML = animeList.map(anime => {
            const title = anime.title.romaji || anime.title.english || 'Unknown';
            const image = anime.coverImage.extraLarge || anime.coverImage.large || '';
            const eps = anime.episodes || '??';
            const isFav = favs.some(f => f.id === anime.id);
            const escapedTitle = title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const escapedImage = image.replace(/'/g, "\\'");
            return `<div class="anime-card" onclick="Nexus.open(${anime.id})">
                <div class="card-media">
                    <img src="${image}" alt="${title}" loading="lazy">
                    <button class="fav-btn ${isFav ? 'favorited' : ''}" onclick="Nexus.toggleFavorite({id:${anime.id},title:'${escapedTitle}',coverImage:{extraLarge:'${escapedImage}'}},event)">♥</button>
                </div>
                <div class="card-info"><h3>${title}</h3><p>${anime.format || ''} ${eps !== '??' ? `• ${eps} eps` : ''}</p></div>
            </div>`;
        }).join('');
    }

    async open(anilistId, startEpisode = 1) {
        if (this.isLoading) return;
        this.isLoading = true;
        this.clearFallbackTimer();
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
            if (!data || !data.Media) { document.getElementById('video-engine').innerHTML = '<div class="error">Failed to load anime</div>'; return; }
            this.currentAnime = data.Media;
            this.totalEps = this.currentAnime.episodes || (this.currentAnime.status === 'RELEASING' ? 1200 : 0);
            this.currentEp = startEpisode || 1;
            this.epPage = 1;
            document.getElementById('display-title').textContent = this.currentAnime.title.romaji || this.currentAnime.title.english;
            document.getElementById('display-desc').textContent = this.stripHTML(this.currentAnime.description || 'No description available');
            this.populateSeasons();
            this.populateControls();
            this.loadEpisodes();
            this.playEpisode(this.currentEp);
        } catch (error) {
            console.error('Failed to open anime:', error);
            document.getElementById('video-engine').innerHTML = `<div class="error">Error: ${error.message}</div>`;
        } finally { this.isLoading = false; }
    }

    populateSeasons() {
        const dropdown = document.getElementById('season-dropdown');
        dropdown.innerHTML = '';
        let allSeasons = [{ id: this.currentAnime.id, title: this.currentAnime.title.romaji || this.currentAnime.title.english, year: this.currentAnime.seasonYear || 9999, relationType: 'CURRENT' }];
        if (this.currentAnime.relations && this.currentAnime.relations.edges) {
            const related = this.currentAnime.relations.edges
                .filter(e => ['SEQUEL', 'PREQUEL', 'PARENT', 'CHILD'].includes(e.relationType))
                .filter(e => e.node.format === 'TV' || e.node.format === 'OVA' || e.node.format === 'ONA')
                .map(e => ({ id: e.node.id, title: e.node.title.romaji || e.node.title.english, year: e.node.seasonYear || 9999, relationType: e.relationType }));
            allSeasons = allSeasons.concat(related);
        }
        allSeasons.sort((a, b) => a.year - b.year);
        const seen = new Set();
        allSeasons = allSeasons.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
        allSeasons.forEach(season => {
            const option = document.createElement('option');
            option.value = season.id;
            option.textContent = `${season.title} (${season.year})`;
            if (season.id === this.currentAnime.id) option.selected = true;
            dropdown.appendChild(option);
        });
    }

    populateControls() {
        const container = document.getElementById('server-list');
        container.innerHTML = `
            <div>
                <div style="font-size: 0.65rem; color: #666; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Language</div>
                <div style="display: flex; gap: 4px;">
                    <button class="server-btn ${this.currentLang === 'sub' ? 'active' : ''}" onclick="Nexus.setLanguage('sub')" style="flex: 1; padding: 6px 4px; font-size: 0.75rem;">SUB</button>
                    <button class="server-btn ${this.currentLang === 'dub' ? 'active' : ''}" onclick="Nexus.setLanguage('dub')" style="flex: 1; padding: 6px 4px; font-size: 0.75rem;">DUB</button>
                </div>
            </div>
        `;
    }

    setLanguage(lang) { this.currentLang = lang; this.populateControls(); this.playEpisode(this.currentEp); }

    loadEpisodes() {
        const container = document.getElementById('episode-list');
        const total = this.totalEps || 12;
        const totalPages = Math.ceil(total / this.epPageSize);
        const start = (this.epPage - 1) * this.epPageSize + 1;
        const end = Math.min(this.epPage * this.epPageSize, total);
        
        let html = '';
        
        // Page navigation - full width row
        if (totalPages > 1) {
            html += '<div style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;grid-column:1/-1;">';
            for (let p = 1; p <= totalPages; p++) {
                const s = (p-1) * this.epPageSize + 1;
                const e = Math.min(p * this.epPageSize, total);
                const bg = p === this.epPage ? 'var(--accent)' : 'rgba(255,255,255,0.05)';
                const border = p === this.epPage ? 'var(--accent)' : 'rgba(255,255,255,0.1)';
                const color = p === this.epPage ? '#000' : '#888';
                html += `<button onclick="Nexus.epPage=${p};Nexus.loadEpisodes();" style="font-size:0.6rem;padding:3px 8px;background:${bg};border:1px solid ${border};color:${color};cursor:pointer;border-radius:2px;">${s}-${e}</button>`;
            }
            html += '</div>';
        }
        
        // Episode buttons
        for (let i = start; i <= end; i++) {
            html += `<button class="ep-btn ${i === this.currentEp ? 'active' : ''}" onclick="Nexus.playEpisode(${i})">${i}</button>`;
        }
        
        container.innerHTML = html;
    }

    clearFallbackTimer() {
        if (this.fallbackTimer) { clearTimeout(this.fallbackTimer); this.fallbackTimer = null; }
    }

    // Smart auto-fallback: tries providers in order, detects iframe load failure
    async playWithFallback(providers, getEmbedUrl, engine) {
        this.clearFallbackTimer();

        for (let i = 0; i < providers.length; i++) {
            const provider = providers[i];
            const embedUrl = getEmbedUrl(provider);

            engine.innerHTML = `<div class="loading">Trying ${provider.name}... (${i + 1}/${providers.length})</div>`;

            const result = await new Promise((resolve) => {
                const iframe = document.createElement('iframe');
                iframe.src = embedUrl;
                iframe.allowFullscreen = true;
                iframe.frameBorder = 0;
                iframe.scrolling = 'no';
                iframe.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
                iframe.style.cssText = 'width:100%;height:100%;border:none;';

                let resolved = false;

                // Success: iframe loaded
                iframe.onload = () => {
                    if (!resolved) { resolved = true; this.clearFallbackTimer(); resolve({ success: true, iframe, provider }); }
                };

                // Timeout fallback
                this.fallbackTimer = setTimeout(() => {
                    if (!resolved) { resolved = true; resolve({ success: false, provider }); }
                }, NEXUS_CONFIG.IFRAME_TIMEOUT);

                engine.appendChild(iframe);
            });

            if (result.success) {
                engine.innerHTML = '';
                engine.appendChild(result.iframe);
                console.log(`[AUTO-FALLBACK] ${provider.name} loaded successfully`);
                return true;
            }

            // Remove failed iframe
            const iframes = engine.querySelectorAll('iframe');
            iframes.forEach(f => f.remove());
            console.log(`[AUTO-FALLBACK] ${provider.name} failed, trying next...`);
        }

        return false;
    }

    async playEpisode(episodeNum) {
        this.currentEp = episodeNum;
        document.querySelectorAll('.ep-btn').forEach(btn => btn.classList.toggle('active', parseInt(btn.textContent) === episodeNum));
        const engine = document.getElementById('video-engine');

        const getEmbedUrl = (p) => p.url(this.currentAnime.id, episodeNum, this.currentLang);
        const success = await this.playWithFallback(NEXUS_CONFIG.ANIME_PROVIDERS, getEmbedUrl, engine);

        if (!success) {
            engine.innerHTML = '<div class="error">All sources offline. Try again later.</div>';
        }

        this.saveWatchProgress(this.currentAnime.id, {
            title: this.currentAnime.title.romaji || this.currentAnime.title.english,
            thumbnail: this.currentAnime.coverImage.extraLarge,
            episode: episodeNum,
            timestamp: Date.now()
        });
    }

    close() { 
        this.clearFallbackTimer(); 
        this.saveProgressOnClose(); 
        this.closeWithoutPush(); 
        window.history.replaceState({}, '', '/');
        this.showTab('home'); 
    }
    doClose() { this.clearFallbackTimer(); this.saveProgressOnClose(); this.closeWithoutPush(); window.history.replaceState({}, '', '/'); this.showTab('home'); }
    saveProgressOnClose() {
        if (this.currentAnime && this.currentEp > 0) {
            this.saveWatchProgress(this.currentAnime.id, {
                title: this.currentAnime.title.romaji || this.currentAnime.title.english,
                thumbnail: this.currentAnime.coverImage.extraLarge || this.currentAnime.coverImage.large || '',
                episode: this.currentEp,
                timestamp: Date.now()
            });
        }
    }
    closeWithoutPush() {
        this.clearFallbackTimer();
        document.getElementById('player-overlay').classList.remove('active');
        document.getElementById('bottom-nav').style.display = 'flex';
        document.getElementById('back-btn').style.display = 'none';
        document.getElementById('video-engine').innerHTML = '';
        this.currentAnime = null; this.currentEp = 1; this.isLoading = false;
    }
    goBack() { 
        this.closeWithoutPush(); 
        window.history.replaceState({}, '', '/'); 
        this.showTab('home'); 
    }
    stripHTML(html) { const tmp = document.createElement('div'); tmp.innerHTML = html; return tmp.textContent || tmp.innerText || ''; }

    getFavorites() { return JSON.parse(localStorage.getItem('nexus_favorites') || '[]'); }
    saveFavorites(f) { localStorage.setItem('nexus_favorites', JSON.stringify(f)); }
    isFavorited(id) { return this.getFavorites().some(f => f.id === id); }
    toggleFavorite(anime, event) {
        event.stopPropagation();
        let favs = this.getFavorites();
        const idx = favs.findIndex(f => f.id === anime.id);
        if (idx === -1) favs.push({ id: anime.id, title: anime.title.romaji || anime.title.english, image: anime.coverImage.extraLarge || anime.coverImage.large, addedAt: Date.now() });
        else favs.splice(idx, 1);
        this.saveFavorites(favs); this.loadFavorites();
    }
    loadFavorites() {
        const grid = document.getElementById('favorites-grid');
        const favs = this.getFavorites();
        if (favs.length === 0) { grid.innerHTML = '<div class="empty-state">No favorites yet.</div>'; return; }
        grid.innerHTML = favs.map(f => `<div class="anime-card" onclick="Nexus.open(${f.id})">
            <div class="card-media"><img src="${f.image}" alt="${f.title}"><button class="fav-btn favorited" onclick="Nexus.toggleFavorite({id:${f.id},title:'${f.title.replace(/'/g,"\\'")}',coverImage:{extraLarge:'${f.image}'}},event)">♥</button></div>
            <div class="card-info"><h3>${f.title}</h3></div>
        </div>`).join('');
    }

    getWatchProgress() { return JSON.parse(localStorage.getItem('nexus_progress') || '{}'); }
    saveWatchProgress(id, data) {
        try {
            const p = this.getWatchProgress();
            p[id] = {
                title: data.title || 'Unknown',
                thumbnail: data.thumbnail || '',
                episode: data.episode || 1,
                timestamp: data.timestamp || Date.now()
            };
            localStorage.setItem('nexus_progress', JSON.stringify(p));
        } catch (e) { console.error('Failed to save progress:', e); }
    }
    loadContinueWatching() {
        const grid = document.getElementById('continue-grid');
        const progress = this.getWatchProgress();
        const entries = Object.entries(progress).sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
        if (entries.length === 0) { grid.innerHTML = '<div class="empty-state">No continue watching yet. Start watching anime!</div>'; return; }
        grid.innerHTML = entries.slice(0, 20).map(([id, data]) => {
            const title = data.title || 'Unknown';
            const thumb = data.thumbnail || '';
            const ep = data.episode || 1;
            return `<div class="anime-card" onclick="Nexus.open(${id}, ${ep})">
                <div class="card-media"><img src="${thumb}" alt="${title}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 450%22><rect fill=%22%23111%22 width=%22300%22 height=%22450%22/><text x=%22150%22 y=%22225%22 fill=%22%23666%22 text-anchor=%22middle%22 font-size=%2220%22>No Image</text></svg>'"><div class="ep-badge">EP ${ep}</div></div>
                <div class="card-info"><h3>${title}</h3><p>Episode ${ep}</p></div>
            </div>`;
        }).join('');
    }

    async loadMovies() {
        if (this.moviesLoaded) return;
        this.moviesLoaded = true;
        const grid = document.getElementById('movies-grid');
        grid.innerHTML = '<div class="loading">Loading movies...</div>';
        try {
            const resp = await fetch(NEXUS_CONFIG.BACKEND_API + '/movies/popular?category=all');
            const data = await resp.json();
            if (data.movies && data.movies.length > 0) {
                grid.innerHTML = data.movies.map(m => {
                    const escapedTitle = (m.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    const escapedImage = (m.image || '').replace(/'/g, "\\'");
                    const tmdbId = m.tmdb_id ? String(m.tmdb_id) : '';
                    const imdbId = m.imdb_id ? String(m.imdb_id) : '';
                    return `<div class="anime-card" onclick="Nexus.openMovie(${m.id}, '${escapedTitle}', '${tmdbId}', '${imdbId}')">
                        <div class="card-media">
                            <img src="${m.image}" alt="${m.title}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 450%22><rect fill=%22%23111%22 width=%22300%22 height=%22450%22/><text x=%22150%22 y=%22225%22 fill=%22%23666%22 text-anchor=%22middle%22 font-size=%2220%22>No Image</text></svg>'">
                        </div>
                        <div class="card-info"><h3>${m.title}</h3><p>${m.year} ${m.rating ? `• ★ ${m.rating}` : ''}</p></div>
                    </div>`;
                }).join('');
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
                grid.innerHTML = data.results.map(m => `<div class="anime-card" onclick="Nexus.openMovie(${m.id}, '${(m.title || '').replace(/'/g, "\\'")}', '${m.tmdb_id || ''}', '${m.imdb_id || ''}')">
                    <div class="card-media"><img src="${m.image}" alt="${m.title}" loading="lazy" onerror="this.style.display='none'"></div>
                    <div class="card-info"><h3>${m.title}</h3><p>${m.year} ${m.type}</p></div>
                </div>`).join('');
            } else { grid.innerHTML = '<div class="error">No results</div>'; }
        } catch (e) { grid.innerHTML = '<div class="error">Search failed</div>'; }
    }

    async resolveMovieIds(tvmazeId) {
        try {
            const resp = await fetch(`https://api.tvmaze.com/shows/${tvmazeId}`);
            if (!resp.ok) return { tmdb: null, imdb: null };
            const data = await resp.json();
            const externals = data.externals || {};
            const tmdb = externals.tmdb ? String(externals.tmdb) : null;
            const imdb = externals.imdb ? String(externals.imdb) : null;
            return { tmdb, imdb };
        } catch (e) {
            return { tmdb: null, imdb: null };
        }
    }

    async openMovie(movieId, title, tmdbId = '', imdbId = '') {
        if (this.isLoading) return;
        this.isLoading = true;
        this.clearFallbackTimer();
        document.getElementById('player-overlay').classList.add('active');
        document.getElementById('bottom-nav').style.display = 'none';
        document.getElementById('back-btn').style.display = 'block';
        document.getElementById('display-title').textContent = title || 'Loading...';
        document.getElementById('display-desc').textContent = '';
        document.getElementById('episode-list').innerHTML = '';
        document.getElementById('season-dropdown').innerHTML = '<option value="">MOVIE</option>';
        document.getElementById('server-list').innerHTML = '';

        const engine = document.getElementById('video-engine');
        engine.innerHTML = '<div class="loading">Resolving movie source...</div>';

        // Resolve TMDB/IMDB if backend provided TVMaze ids
        let resolvedTmdb = tmdbId || '';
        let resolvedImdb = imdbId || '';
        
        console.log('[MOVIE] movieId:', movieId, 'tmdbId:', tmdbId, 'imdbId:', imdbId);
        
        if (!resolvedTmdb && !resolvedImdb && movieId) {
            // Try to treat movieId as TMDB if it looks like one (numeric and > 1000)
            if (movieId > 1000) {
                resolvedTmdb = String(movieId);
                console.log('[MOVIE] Using movieId as TMDB:', resolvedTmdb);
            }
        }

        const candidates = [];
        if (resolvedTmdb) candidates.push({ id: resolvedTmdb, label: 'TMDB' });
        if (resolvedImdb) candidates.push({ id: resolvedImdb, label: 'IMDB' });
        if (candidates.length === 0) candidates.push({ id: String(movieId), label: 'RAW' });

        console.log('[MOVIE] Candidates:', candidates);

        const providers = [];
        candidates.forEach(c => {
            NEXUS_CONFIG.MOVIE_PROVIDERS.forEach(p => {
                const url = p.url(c.id);
                console.log('[MOVIE] Provider:', p.name, 'URL:', url);
                providers.push({ name: `${p.name}-${c.label}`, url: () => url });
            });
        });

        const success = await this.playWithFallback(providers, (p) => p.url(), engine);
        if (!success) engine.innerHTML = '<div class="error">All movie sources offline</div>';
        this.isLoading = false;
    }

    async loadHentai() {
        if (this.hentaiLoaded) return;
        this.hentaiLoaded = true;
        const grid = document.getElementById('hentai-grid');
        grid.innerHTML = '<div class="loading">Loading 18+ content...</div>';
        console.log('[HENTAI] Starting to load...');
        try {
            const data = await callAniList(query.hAnime);
            console.log('[HENTAI] Received data:', data);
            if (data && data.Page && data.Page.media && data.Page.media.length > 0) {
                const favs = this.getFavorites();
                grid.innerHTML = data.Page.media.map(anime => {
                    const title = anime.title.romaji || anime.title.english || 'Unknown';
                    const image = anime.coverImage.extraLarge || anime.coverImage.large || '';
                    const eps = anime.episodes || '??';
                    const isFav = favs.some(f => f.id === anime.id);
                    const escapedTitle = title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    const escapedImage = image.replace(/'/g, "\\'");
                    const malId = anime.idMal || '';
                    return `<div class="anime-card" onclick="Nexus.openHentai(${anime.id}, ${malId || 'null'}, '${escapedTitle}')">
                        <div class="card-media">
                            <img src="${image}" alt="${title}" loading="lazy">
                            <button class="fav-btn ${isFav ? 'favorited' : ''}" onclick="Nexus.toggleFavorite({id:${anime.id},title:'${escapedTitle}',coverImage:{extraLarge:'${escapedImage}'}},event)">♥</button>
                        </div>
                        <div class="card-info"><h3>${title}</h3><p>${anime.format || ''} ${eps !== '??' ? `• ${eps} eps` : ''}</p></div>
                    </div>`;
                }).join('');
                return;
            }
        } catch (e) {
            console.error('[HENTAI] Error loading:', e);
            console.warn('AniList hentai failed, falling back to Hanime list');
        }

        // Fallback: scrape Hanime listing for slugs
        try {
            const resp = await fetch('https://r.jina.ai/http://hanime.tv/videos/hentai');
            const text = await resp.text();
            const slugs = Array.from(new Set((text.match(/\/videos\/hentai\/([a-z0-9\-]+)/g) || [])
                .map(s => s.replace('/videos/hentai/', '')))).slice(0, 40);
            if (slugs.length === 0) throw new Error('No slugs found');

            grid.innerHTML = slugs.map(slug => {
                const title = slug.replace(/-/g, ' ');
                return `<div class="anime-card" onclick="Nexus.openHentaiSlug('${slug}', '${title.replace(/'/g, "\\'")}')">
                    <div class="card-media"><img src="https://hanime-cdn.com/posters/${slug}.jpg" alt="${title}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 450%22><rect fill=%22%23111%22 width=%22300%22 height=%22450%22/><text x=%22150%22 y=%22225%22 fill=%22%23666%22 text-anchor=%22middle%22 font-size=%2220%22>No Image</text></svg>'"></div>
                    <div class="card-info"><h3>${title}</h3><p>Hanime</p></div>
                </div>`;
            }).join('');
        } catch (e) {
            grid.innerHTML = '<div class="error">No content found</div>';
        }
    }

    async openHentai(anilistId, malId, title) {
        if (this.isLoading) return;
        this.isLoading = true;
        this.clearFallbackTimer();
        document.getElementById('player-overlay').classList.add('active');
        document.getElementById('bottom-nav').style.display = 'none';
        document.getElementById('back-btn').style.display = 'block';
        document.getElementById('display-title').textContent = title || 'Loading...';
        document.getElementById('display-desc').textContent = '';
        document.getElementById('episode-list').innerHTML = '';
        document.getElementById('season-dropdown').innerHTML = '<option value="">18+</option>';
        document.getElementById('server-list').innerHTML = '';

        const engine = document.getElementById('video-engine');
        const ids = [anilistId];
        if (malId) ids.push(malId);

        const providers = [];
        ids.forEach(id => {
            NEXUS_CONFIG.HENTAI_PROVIDERS.forEach(p => {
                providers.push({ name: `${p.name}-${id}`, url: () => p.url(id) });
            });
        });

        const success = await this.playWithFallback(providers, (p) => p.url(), engine);
        if (!success) engine.innerHTML = '<div class="error">All sources offline</div>';
        this.isLoading = false;
    }

    async openHentaiSlug(slug, title) {
        this.clearFallbackTimer();
        document.getElementById('player-overlay').classList.add('active');
        document.getElementById('bottom-nav').style.display = 'none';
        document.getElementById('back-btn').style.display = 'block';
        document.getElementById('display-title').textContent = title || 'Loading...';
        document.getElementById('display-desc').textContent = '';
        document.getElementById('episode-list').innerHTML = '';
        document.getElementById('season-dropdown').innerHTML = '<option value="">18+</option>';
        document.getElementById('server-list').innerHTML = '';

        const engine = document.getElementById('video-engine');
        const url = `https://hanime.tv/videos/hentai/${slug}`;
        engine.innerHTML = `<iframe src="${url}" allowfullscreen frameborder="0" style="width:100%;height:100%;border:none;"></iframe>`;
    }
}

const Nexus = new AnimeNexus();

document.addEventListener('DOMContentLoaded', () => {
    const searchBtn = document.getElementById('movie-search-btn');
    const searchInput = document.getElementById('movie-search');
    if (searchBtn) searchBtn.addEventListener('click', () => Nexus.searchMovies());
    if (searchInput) searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') Nexus.searchMovies(); });
});
