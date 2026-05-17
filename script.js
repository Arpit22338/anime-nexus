/**
 * ANI//NEXUS - Protocol v32.0 (RESTORED + WORKING EMBEDS)
 * Based on original Claude Opus structure with working embed providers
 */

const NEXUS_CONFIG = {
    ANILIST: 'https://graphql.anilist.co/',
    BACKEND_API: 'https://anime-nexus-api.livelyisland-018542b8.southeastasia.azurecontainerapps.io/api',
    // Working anime embed providers
    EMBED_PROVIDERS: [
        { name: 'VidNest', url: (id, ep) => `https://vidnest.fun/anime/${id}/${ep}/sub` },
        { name: 'SpenEmbed', url: (id, ep) => `https://spencerdevs.xyz/anime/${id}/${ep}` },
        { name: 'DropFile', url: (id, ep) => `https://dropfile.cc/player/tv/anilist-${id}/1/${ep}` },
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
        id idMal title { romaji english } coverImage { extraLarge large } status averageScore episodes format } } }`
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
        console.error('AniList error:', e);
        return null; 
    }
};

class AnimeNexus {
    constructor() {
        this.currentAnime = null;
        this.currentEp = 1;
        this.totalEps = 0;
        this.activeProviderIdx = 0;
        this.currentTab = 'home';
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
            grid.innerHTML = '<div class="error">Failed to load trending</div>';
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
                    <div class="card-media">
                        <img src="${image}" alt="${title}" loading="lazy">
                    </div>
                    <div class="card-info">
                        <h3>${title}</h3>
                        <p>${anime.format || ''} ${eps !== '??' ? `• ${eps} eps` : ''}</p>
                    </div>
                </div>
            `;
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

            document.getElementById('display-title').textContent = this.currentAnime.title.romaji || this.currentAnime.title.english;
            document.getElementById('display-desc').textContent = this.stripHTML(this.currentAnime.description || 'No description available');

            this.populateSeasons();
            this.populateServers();
            this.loadEpisodes();
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

    populateServers() {
        const container = document.getElementById('server-list');
        container.innerHTML = NEXUS_CONFIG.EMBED_PROVIDERS.map((p, idx) => `
            <button class="server-btn ${idx === 0 ? 'active' : ''}" onclick="Nexus.setProvider(${idx})">
                ${p.name.toUpperCase()}
            </button>
        `).join('');
    }

    setProvider(idx) {
        this.activeProviderIdx = idx;
        document.querySelectorAll('.server-btn').forEach((btn, i) => {
            btn.classList.toggle('active', i === idx);
        });
        this.playEpisode(this.currentEp);
    }

    // ==================== EPISODES ====================
    loadEpisodes() {
        const container = document.getElementById('episode-list');
        const total = this.totalEps || 12;
        
        container.innerHTML = '';
        for (let i = 1; i <= Math.min(total, 1000); i++) {
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

        const provider = NEXUS_CONFIG.EMBED_PROVIDERS[this.activeProviderIdx];
        const embedUrl = provider.url(this.currentAnime.id, episodeNum);
        
        engine.innerHTML = `
            <iframe 
                src="${embedUrl}" 
                allowfullscreen="true" 
                frameborder="0" 
                scrolling="no"
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                style="width: 100%; height: 100%; border: none;"
            ></iframe>
        `;

        this.saveWatchProgress(this.currentAnime.id, {
            title: this.currentAnime.title.romaji || this.currentAnime.title.english,
            thumbnail: this.currentAnime.coverImage.extraLarge,
            episode: episodeNum,
            timestamp: Date.now()
        });
    }

    // ==================== PLAYER CONTROLS ====================
    close() {
        window.history.back();
    }

    doClose() {
        window.history.pushState({}, '', '/');
        this.closeWithoutPush();
    }

    closeWithoutPush() {
        document.getElementById('player-overlay').classList.remove('active');
        document.getElementById('bottom-nav').style.display = 'flex';
        document.getElementById('back-btn').style.display = 'none';
        document.getElementById('video-engine').innerHTML = '';
        this.currentAnime = null;
        this.currentEp = 1;
    }

    goBack() {
        this.close();
    }

    stripHTML(html) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }

    // ==================== FAVORITES ====================
    getFavorites() {
        return JSON.parse(localStorage.getItem('nexus_favorites') || '[]');
    }

    saveFavorites(favorites) {
        localStorage.setItem('nexus_favorites', JSON.stringify(favorites));
    }

    isFavorited(anilistId) {
        return this.getFavorites().some(f => f.id === anilistId);
    }

    toggleFavorite(anime, event) {
        event.stopPropagation();
        let favorites = this.getFavorites();
        const idx = favorites.findIndex(f => f.id === anime.id);
        
        if (idx === -1) {
            favorites.push({
                id: anime.id,
                title: anime.title.romaji || anime.title.english,
                image: anime.coverImage.extraLarge || anime.coverImage.large,
                addedAt: Date.now()
            });
        } else {
            favorites.splice(idx, 1);
        }
        
        this.saveFavorites(favorites);
        this.loadFavorites();
    }

    loadFavorites() {
        const grid = document.getElementById('favorites-grid');
        const favorites = this.getFavorites();
        
        if (favorites.length === 0) {
            grid.innerHTML = '<div class="empty-state">No favorites yet. Click ♡ on any anime to add it.</div>';
            return;
        }
        
        grid.innerHTML = favorites.map(fav => `
            <div class="anime-card" onclick="Nexus.open(${fav.id})">
                <div class="card-media">
                    <img src="${fav.image}" alt="${fav.title}">
                    <button class="fav-btn favorited" onclick="Nexus.toggleFavorite({id: ${fav.id}, title: '${fav.title.replace(/'/g, "\\'")}', coverImage: {extraLarge: '${fav.image}'}}, event)">♥</button>
                </div>
                <div class="card-info">
                    <h3>${fav.title}</h3>
                </div>
            </div>
        `).join('');
    }

    // ==================== CONTINUE WATCHING ====================
    getWatchProgress() {
        return JSON.parse(localStorage.getItem('nexus_progress') || '{}');
    }

    saveWatchProgress(animeId, data) {
        const progress = this.getWatchProgress();
        progress[animeId] = data;
        localStorage.setItem('nexus_progress', JSON.stringify(progress));
    }

    loadContinueWatching() {
        const grid = document.getElementById('continue-grid');
        const progress = this.getWatchProgress();
        const entries = Object.entries(progress).sort((a, b) => b[1].timestamp - a[1].timestamp);
        
        if (entries.length === 0) {
            grid.innerHTML = '<div class="empty-state">No continue watching. Start watching an anime to see it here.</div>';
            return;
        }
        
        grid.innerHTML = entries.slice(0, 20).map(([id, data]) => `
            <div class="anime-card" onclick="Nexus.open(${id})">
                <div class="card-media">
                    <img src="${data.thumbnail}" alt="${data.title}">
                    <div class="ep-badge">EP ${data.episode}</div>
                </div>
                <div class="card-info">
                    <h3>${data.title}</h3>
                    <p>Episode ${data.episode}</p>
                </div>
            </div>
        `).join('');
    }

    // ==================== MOVIES ====================
    async loadMovies() {
        const grid = document.getElementById('movies-grid');
        if (grid.innerHTML.trim()) return;
        
        grid.innerHTML = '<div class="loading">Loading movies...</div>';
        
        try {
            const resp = await fetch(NEXUS_CONFIG.BACKEND_API + '/movies/popular?category=all');
            const data = await resp.json();
            
            if (data.movies && data.movies.length > 0) {
                grid.innerHTML = data.movies.map(m => `
                    <div class="anime-card" onclick="Nexus.openMovie(${m.id})">
                        <div class="card-media">
                            <img src="${m.image}" alt="${m.title}" loading="lazy">
                        </div>
                        <div class="card-info">
                            <h3>${m.title}</h3>
                            <p>${m.year} ${m.rating ? `• ★ ${m.rating}` : ''}</p>
                        </div>
                    </div>
                `).join('');
            } else {
                grid.innerHTML = '<div class="error">No movies found</div>';
            }
        } catch (e) {
            grid.innerHTML = '<div class="error">Failed to load movies</div>';
        }
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
                        <div class="card-media">
                            <img src="${m.image}" alt="${m.title}" loading="lazy">
                        </div>
                        <div class="card-info">
                            <h3>${m.title}</h3>
                            <p>${m.year} ${m.type}</p>
                        </div>
                    </div>
                `).join('');
            } else {
                grid.innerHTML = '<div class="error">No results</div>';
            }
        } catch (e) {
            grid.innerHTML = '<div class="error">Search failed</div>';
        }
    }

    openMovie(movieId) {
        const overlay = document.getElementById('player-overlay');
        overlay.classList.add('active');
        document.getElementById('bottom-nav').style.display = 'none';
        document.getElementById('back-btn').style.display = 'block';
        document.getElementById('display-title').textContent = 'Loading...';
        document.getElementById('display-desc').textContent = '';
        document.getElementById('episode-list').innerHTML = '';
        document.getElementById('server-list').innerHTML = '';
        document.getElementById('season-dropdown').innerHTML = '<option value="">MOVIE</option>';
        
        const engine = document.getElementById('video-engine');
        engine.innerHTML = '<div class="loading">Loading movie...</div>';
        
        const embedUrl = `https://vidsrc.to/embed/movie/${movieId}`;
        engine.innerHTML = `<iframe src="${embedUrl}" allowfullscreen frameborder="0" style="width:100%;height:100%;border:none;"></iframe>`;
    }

    // ==================== HENTAI ====================
    async loadHentai() {
        const grid = document.getElementById('hentai-grid');
        if (grid.innerHTML.trim()) return;
        
        grid.innerHTML = '<div class="loading">Loading providers...</div>';
        
        try {
            const resp = await fetch(NEXUS_CONFIG.BACKEND_API + '/hentai/providers');
            const data = await resp.json();
            
            if (data.providers) {
                grid.innerHTML = data.providers.map(p => `
                    <div class="anime-card" onclick="Nexus.openHentai('${p.id}', '${p.name}', '${p.url}')">
                        <div class="card-media">
                            <img src="https://via.placeholder.com/150x200/1a1a2e/00ff9f?text=18%2B" alt="${p.name}">
                        </div>
                        <div class="card-info">
                            <h3>${p.name}</h3>
                            <p>Click to browse</p>
                        </div>
                    </div>
                `).join('');
            }
        } catch (e) {
            grid.innerHTML = '<div class="error">Failed to load hentai providers</div>';
        }
    }

    openHentai(providerId, providerName, baseUrl) {
        window.open(baseUrl, '_blank');
    }
}

// Initialize
const Nexus = new AnimeNexus();

// Movie search handler
document.addEventListener('DOMContentLoaded', () => {
    const searchBtn = document.getElementById('movie-search-btn');
    const searchInput = document.getElementById('movie-search');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => Nexus.searchMovies());
    }
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') Nexus.searchMovies();
        });
    }
});
