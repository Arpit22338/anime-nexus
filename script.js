/**
 * ANI//NEXUS - Protocol v31.0 (FIXED + FEATURES)
 * Bug fixes: One Piece mismatch, Season 1 default, Jigokuraku redirect
 * Features: Favorites, Continue Watching, Bottom Nav
 */

const NEXUS_CONFIG = {
    ANILIST: 'https://graphql.anilist.co/',
    BACKEND_API: 'https://anime-nexus-api.livelyisland-018542b8.southeastasia.azurecontainerapps.io/api'
};

// Known sequels that should redirect to Season 1
const SEQUEL_TO_SEASON1 = {
    // AniList ID of sequel -> AniList ID of Season 1
    170890: 113415,  // Jigokuraku Season 2 -> Season 1
    145064: 101922,  // Kimetsu S2 -> S1
    142838: 113415,  // Hell's Paradise Part 2 -> Part 1
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
    
    search: `query($search: String) {
        Page(page: 1, perPage: 15) {
            media(type: ANIME, search: $search) {
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
    
    details: `query($id: Int) {
        Media(id: $id) {
            id
            idMal
            title { romaji english native }
            description
            coverImage { extraLarge large }
            bannerImage
            episodes
            status
            averageScore
            genres
            format
            season
            seasonYear
            relations {
                edges {
                    relationType
                    node {
                        id
                        title { romaji english }
                        format
                        episodes
                        status
                        seasonYear
                    }
                }
            }
        }
    }`
};

class AnimeNexus {
    constructor() {
        this.currentAnime = null;
        this.currentBackendName = null;
        this.currentBackendId = null;
        this.currentLang = 'sub';
        this.episodes = [];
        this.relatedSeasons = [];
        this.episodePageSize = 100;
        this.currentEpisodePage = 0;
        this.currentTab = 'home';
        this.init();
    }

    init() {
        this.loadTrending();
        document.getElementById('search-btn').addEventListener('click', () => this.search());
        document.getElementById('main-search').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.search();
        });
        
        // Season dropdown listener
        document.getElementById('season-dropdown').addEventListener('change', (e) => {
            if (e.target.value) {
                this.open(parseInt(e.target.value));
            }
        });

        // Handle browser back/forward
        window.addEventListener('popstate', () => {
            const params = new URLSearchParams(window.location.search);
            const id = params.get('id');
            if (id && window.location.pathname.includes('animeplayer')) {
                if (!this.currentAnime || this.currentAnime.id !== parseInt(id)) {
                    this.openWithoutPush(parseInt(id));
                }
            } else {
                this.closeWithoutPush();
            }
        });

        // Restore state from URL
        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');
        if (id && window.location.pathname.includes('animeplayer')) {
            this.openWithoutPush(parseInt(id));
        }
    }

    // ==================== TAB NAVIGATION ====================
    showTab(tab) {
        this.currentTab = tab;
        
        // Update nav buttons
        document.querySelectorAll('.nav-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        
        // Show/hide views
        document.getElementById('home').style.display = tab === 'home' ? 'block' : 'none';
        document.getElementById('favorites-view').style.display = tab === 'favorites' ? 'block' : 'none';
        document.getElementById('continue-view').style.display = tab === 'continue' ? 'block' : 'none';
        
        if (tab === 'favorites') this.loadFavorites();
        if (tab === 'continue') this.loadContinueWatching();
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
        const favorites = this.getFavorites();
        const idx = favorites.findIndex(f => f.id === anime.id);
        
        if (idx >= 0) {
            favorites.splice(idx, 1);
        } else {
            favorites.push({
                id: anime.id,
                title: anime.title.romaji || anime.title.english,
                thumbnail: anime.coverImage.extraLarge
            });
        }
        
        this.saveFavorites(favorites);
        
        // Update button state
        const btn = event.target;
        btn.classList.toggle('favorited', idx < 0);
        btn.textContent = idx < 0 ? '♥' : '♡';
    }

    loadFavorites() {
        const favorites = this.getFavorites();
        const grid = document.getElementById('favorites-grid');
        
        if (favorites.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <h3>NO_FAVORITES_FOUND</h3>
                    <p>Add anime to favorites by clicking the ♡ button</p>
                </div>
            `;
            return;
        }
        
        grid.innerHTML = favorites.map(fav => `
            <div class="anime-card" onclick="Nexus.open(${fav.id})">
                <div class="card-media">
                    <img src="${fav.thumbnail}" alt="${fav.title}">
                    <button class="fav-btn favorited" onclick="Nexus.removeFavorite(${fav.id}, event)">♥</button>
                </div>
                <div class="card-info">
                    <h3>${fav.title}</h3>
                </div>
            </div>
        `).join('');
    }

    removeFavorite(anilistId, event) {
        event.stopPropagation();
        const favorites = this.getFavorites().filter(f => f.id !== anilistId);
        this.saveFavorites(favorites);
        this.loadFavorites();
    }

    // ==================== CONTINUE WATCHING ====================
    getWatchProgress() {
        return JSON.parse(localStorage.getItem('nexus_progress') || '{}');
    }

    saveWatchProgress(anilistId, data) {
        const progress = this.getWatchProgress();
        progress[anilistId] = {
            ...data,
            lastWatched: Date.now()
        };
        localStorage.setItem('nexus_progress', JSON.stringify(progress));
    }

    loadContinueWatching() {
        const progress = this.getWatchProgress();
        const entries = Object.entries(progress)
            .sort((a, b) => b[1].lastWatched - a[1].lastWatched)
            .slice(0, 20);
        
        const grid = document.getElementById('continue-grid');
        
        if (entries.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <h3>NO_WATCH_HISTORY</h3>
                    <p>Start watching anime to see your progress here</p>
                </div>
            `;
            return;
        }
        
        grid.innerHTML = entries.map(([id, data]) => `
            <div class="anime-card" onclick="Nexus.open(${id})">
                <div class="card-media">
                    <img src="${data.thumbnail}" alt="${data.title}">
                    <div class="progress-badge">EP ${data.episode}</div>
                </div>
                <div class="card-info">
                    <h3>${data.title}</h3>
                    <p>Episode ${data.episode}</p>
                </div>
            </div>
        `).join('');
    }

    // ==================== ANIME LOADING ====================
    async openWithoutPush(anilistId) {
        // Check if this is a sequel that should redirect to Season 1
        if (SEQUEL_TO_SEASON1[anilistId]) {
            anilistId = SEQUEL_TO_SEASON1[anilistId];
        }
        
        try {
            document.getElementById('player-overlay').classList.add('active');
            document.getElementById('bottom-nav').style.display = 'none';
            document.getElementById('display-title').textContent = 'LOADING...';
            document.getElementById('display-desc').textContent = 'Connecting to stream...';
            document.getElementById('video-engine').innerHTML = '<div class="loading">ESTABLISHING_LINK...</div>';
            document.getElementById('episode-list').innerHTML = '';
            document.getElementById('server-list').innerHTML = '';
            document.getElementById('back-btn').style.display = 'block';

            const response = await fetch(NEXUS_CONFIG.ANILIST, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: query.details,
                    variables: { id: anilistId }
                })
            });
            const { data } = await response.json();
            this.currentAnime = data.Media;

            document.getElementById('display-title').textContent = this.currentAnime.title.romaji || this.currentAnime.title.english;
            document.getElementById('display-desc').textContent = this.stripHTML(this.currentAnime.description || 'No description available');

            this.populateSeasons();
            this.populateServers();
            await this.searchBackend(this.currentAnime.title.romaji || this.currentAnime.title.english);
        } catch (error) {
            console.error('Failed to open anime:', error);
            document.getElementById('video-engine').innerHTML = `
                <div style="color: #ff3366; padding: 40px; text-align: center;">
                    <h3>⚠️ CONNECTION FAILED</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }

    closeWithoutPush() {
        document.getElementById('player-overlay').classList.remove('active');
        document.getElementById('bottom-nav').style.display = 'flex';
        document.getElementById('video-engine').innerHTML = '';
        document.getElementById('episode-list').innerHTML = '';
        document.getElementById('server-list').innerHTML = '';
        document.getElementById('season-dropdown').innerHTML = '<option value="">SELECT_SEASON</option>';
        const pagination = document.querySelector('.ep-pagination');
        if (pagination) pagination.remove();
        document.getElementById('back-btn').style.display = 'none';
        this.currentAnime = null;
        this.currentBackendName = null;
        this.currentBackendId = null;
        this.episodes = [];
        this.currentEpisodePage = 0;
    }

    async loadTrending() {
        try {
            const response = await fetch(NEXUS_CONFIG.ANILIST, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query.trending })
            });
            const { data } = await response.json();
            this.displayAnimeGrid(data.Page.media);
        } catch (error) {
            console.error('Failed to load trending:', error);
        }
    }

    async search() {
        const searchTerm = document.getElementById('main-search').value.trim();
        if (!searchTerm) return;

        // Switch to home tab when searching
        this.showTab('home');

        try {
            const response = await fetch(NEXUS_CONFIG.ANILIST, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: query.search,
                    variables: { search: searchTerm }
                })
            });
            const { data } = await response.json();
            this.displayAnimeGrid(data.Page.media);
        } catch (error) {
            console.error('Search failed:', error);
        }
    }

    displayAnimeGrid(animeList) {
        const grid = document.getElementById('trending-grid');
        grid.innerHTML = animeList.map(anime => {
            const isFav = this.isFavorited(anime.id);
            return `
                <div class="anime-card" onclick="Nexus.open(${anime.id})">
                    <div class="card-media">
                        <img src="${anime.coverImage.extraLarge}" alt="${anime.title.romaji}">
                        <button class="fav-btn ${isFav ? 'favorited' : ''}" 
                                onclick="Nexus.toggleFavorite(${JSON.stringify(anime).replace(/"/g, '&quot;')}, event)">
                            ${isFav ? '♥' : '♡'}
                        </button>
                    </div>
                    <div class="card-info">
                        <h3>${anime.title.romaji || anime.title.english}</h3>
                        <p>${anime.status} ${anime.episodes ? `• ${anime.episodes} eps` : ''}</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    async open(anilistId) {
        // Check if this is a sequel that should redirect to Season 1
        if (SEQUEL_TO_SEASON1[anilistId]) {
            anilistId = SEQUEL_TO_SEASON1[anilistId];
        }
        
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

            const response = await fetch(NEXUS_CONFIG.ANILIST, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: query.details,
                    variables: { id: anilistId }
                })
            });
            const { data } = await response.json();
            this.currentAnime = data.Media;

            document.getElementById('display-title').textContent = this.currentAnime.title.romaji || this.currentAnime.title.english;
            document.getElementById('display-desc').textContent = this.stripHTML(this.currentAnime.description || 'No description available');

            this.populateSeasons();
            this.populateServers();
            await this.searchBackend(this.currentAnime.title.romaji || this.currentAnime.title.english);
        } catch (error) {
            console.error('Failed to open anime:', error);
            document.getElementById('video-engine').innerHTML = `
                <div style="color: #ff3366; padding: 40px; text-align: center;">
                    <h3>⚠️ CONNECTION FAILED</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }

    populateSeasons() {
        const dropdown = document.getElementById('season-dropdown');
        dropdown.innerHTML = '';

        // Collect all seasons: current + related
        let allSeasons = [{
            id: this.currentAnime.id,
            title: this.currentAnime.title.romaji || this.currentAnime.title.english,
            year: this.currentAnime.seasonYear || 9999,
            relationType: 'CURRENT'
        }];

        if (this.currentAnime.relations && this.currentAnime.relations.edges) {
            const related = this.currentAnime.relations.edges
                .filter(edge => ['SEQUEL', 'PREQUEL', 'PARENT', 'SIDE_STORY'].includes(edge.relationType))
                .filter(edge => edge.node.format === 'TV' || edge.node.format === 'OVA')
                .map(edge => ({
                    id: edge.node.id,
                    title: edge.node.title.romaji || edge.node.title.english,
                    year: edge.node.seasonYear || 9999,
                    relationType: edge.relationType
                }));
            
            allSeasons = allSeasons.concat(related);
        }

        // Sort by year (earliest first = Season 1 first)
        allSeasons.sort((a, b) => a.year - b.year);

        // Find Season 1 (earliest)
        const season1Id = allSeasons[0].id;

        // Add options, select Season 1 by default
        allSeasons.forEach(season => {
            const option = document.createElement('option');
            option.value = season.id;
            option.textContent = `${season.title} (${season.year === 9999 ? 'N/A' : season.year})`;
            option.selected = (season.id === season1Id);
            dropdown.appendChild(option);
        });

        // If current anime is not Season 1, switch to Season 1
        if (this.currentAnime.id !== season1Id) {
            // Don't auto-switch, just show the dropdown with Season 1 selected
            // User can click to switch if they want the current season
            dropdown.value = this.currentAnime.id; // Actually show current
        }
    }

    populateServers() {
        const container = document.getElementById('server-list');
        container.innerHTML = `
            <button class="server-btn ${this.currentLang === 'sub' ? 'active' : ''}" onclick="Nexus.setLanguage('sub')">
                SUB
            </button>
            <button class="server-btn ${this.currentLang === 'dub' ? 'active' : ''}" onclick="Nexus.setLanguage('dub')">
                DUB
            </button>
        `;
    }

    setLanguage(lang) {
        this.currentLang = lang;
        this.populateServers();
        
        if (this.currentBackendName) {
            this.loadEpisodes(this.currentBackendName).then(() => {
                if (this.episodes.length > 0) {
                    this.playEpisode(1);
                }
            });
        }
    }

    async searchBackend(title) {
        try {
            document.getElementById('video-engine').innerHTML = '<div class="loading">SCANNING_FREQUENCIES...</div>';
            
            // Backend now handles provider ID matching - just send the title
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);
            
            const response = await fetch(
                `${NEXUS_CONFIG.BACKEND_API}/episodes/${encodeURIComponent(title)}?language=${this.currentLang}`,
                { signal: controller.signal }
            );
            clearTimeout(timeoutId);
            
            const data = await response.json();

            if (data.success && data.episodes.length > 0) {
                this.currentBackendName = data.anime.name;
                this.currentBackendId = data.anime.id;
                this.episodes = data.episodes;
                this.currentEpisodePage = 0;
                this.displayEpisodeList();
                
                // Check for saved progress
                const progress = this.getWatchProgress();
                const savedEp = progress[this.currentAnime.id]?.episode || 1;
                this.playEpisode(savedEp);
            } else {
                this.showNoStreams();
            }
        } catch (error) {
            console.error('Backend search failed:', error);
            if (error.name === 'AbortError') {
                this.showNoStreams('Request timed out - try again');
            } else {
                this.showNoStreams(error.message);
            }
        }
    }

    showNoStreams(errorMsg = null) {
        document.getElementById('video-engine').innerHTML = `
            <div style="color: #ff3366; padding: 40px; text-align: center;">
                <h3>⚠️ NO STREAMS FOUND</h3>
                <p>${errorMsg || 'This anime is not available on the streaming provider'}</p>
                <p style="font-size: 12px; opacity: 0.7; margin-top: 10px;">Try a different language or check back later</p>
            </div>
        `;
        document.getElementById('episode-list').innerHTML = '<p style="color: #666; padding: 10px;">No episodes available</p>';
    }

    async loadEpisodes(backendAnimeName) {
        try {
            const response = await fetch(`${NEXUS_CONFIG.BACKEND_API}/episodes/${encodeURIComponent(backendAnimeName)}?language=${this.currentLang}`);
            const data = await response.json();

            if (data.success) {
                this.currentBackendName = data.anime.name;
                this.episodes = data.episodes;
                this.displayEpisodeList();
            }
        } catch (error) {
            console.error('Failed to load episodes:', error);
        }
    }

    displayEpisodeList() {
        const container = document.getElementById('episode-list');
        if (!container) return;

        if (this.episodes.length === 0) {
            container.innerHTML = '<p style="color: #666; padding: 10px;">No episodes found</p>';
            return;
        }

        const totalEps = this.episodes.length;
        const pageSize = this.episodePageSize;
        const totalPages = Math.ceil(totalEps / pageSize);
        const startIdx = this.currentEpisodePage * pageSize;
        const endIdx = Math.min(startIdx + pageSize, totalEps);
        const pageEpisodes = this.episodes.slice(startIdx, endIdx);

        // Page selector for anime with many episodes
        if (totalPages > 1) {
            const existingPagination = document.querySelector('.ep-pagination');
            if (existingPagination) existingPagination.remove();
            
            const paginationDiv = document.createElement('div');
            paginationDiv.className = 'ep-pagination';
            paginationDiv.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;padding:5px 0;';
            
            for (let i = 0; i < totalPages; i++) {
                const start = i * pageSize + 1;
                const end = Math.min((i + 1) * pageSize, totalEps);
                const isActive = i === this.currentEpisodePage;
                const btn = document.createElement('button');
                btn.className = `ep-page-btn ${isActive ? 'active' : ''}`;
                btn.style.cssText = `font-size:0.55rem;padding:3px 6px;background:${isActive ? 'var(--accent)' : 'rgba(255,255,255,0.05)'};border:1px solid ${isActive ? 'var(--accent)' : 'rgba(255,255,255,0.1)'};color:${isActive ? '#000' : '#888'};cursor:pointer;border-radius:2px;`;
                btn.textContent = `${start}-${end}`;
                btn.onclick = () => this.setEpisodePage(i);
                paginationDiv.appendChild(btn);
            }
            
            container.parentNode.insertBefore(paginationDiv, container);
        }

        container.innerHTML = pageEpisodes.map(ep => `
            <button class="ep-btn" onclick="Nexus.playEpisode(${ep.number})" data-ep="${ep.number}">
                ${ep.number}
            </button>
        `).join('');
    }

    setEpisodePage(pageNum) {
        this.currentEpisodePage = pageNum;
        document.querySelectorAll('.ep-page-btn').forEach((btn, idx) => {
            btn.classList.toggle('active', idx === pageNum);
            btn.style.background = idx === pageNum ? 'var(--accent)' : 'rgba(255,255,255,0.05)';
            btn.style.borderColor = idx === pageNum ? 'var(--accent)' : 'rgba(255,255,255,0.1)';
            btn.style.color = idx === pageNum ? '#000' : '#888';
        });
        this.displayEpisodeList();
    }

    async playEpisode(episodeNum) {
        if (!this.currentBackendName) {
            console.error('No backend anime name set');
            return;
        }

        try {
            // Highlight active episode
            document.querySelectorAll('.ep-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelector(`.ep-btn[data-ep="${episodeNum}"]`)?.classList.add('active');

            document.getElementById('video-engine').innerHTML = '<div class="loading">ESTABLISHING_STREAM...</div>';

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 90000);

            const response = await fetch(
                `${NEXUS_CONFIG.BACKEND_API}/stream-by-id/${encodeURIComponent(this.currentBackendId)}/${episodeNum}?language=${this.currentLang}`,
                { signal: controller.signal }
            );
            clearTimeout(timeoutId);
            
            const data = await response.json();

            if (data.success && data.stream_url) {
                const proxyUrl = `${NEXUS_CONFIG.BACKEND_API}/proxy?url=${encodeURIComponent(data.stream_url)}&referer=${encodeURIComponent(data.referrer || 'https://allanime.day')}`;
                
                document.getElementById('video-engine').innerHTML = `
                    <video id="nexus-video" controls autoplay crossorigin="anonymous" style="width: 100%; height: 100%; background: #000;">
                        <source src="${proxyUrl}" type="video/mp4">
                        Your browser does not support HTML5 video.
                    </video>
                `;
                
                // Save watch progress
                this.saveWatchProgress(this.currentAnime.id, {
                    title: this.currentAnime.title.romaji || this.currentAnime.title.english,
                    thumbnail: this.currentAnime.coverImage.extraLarge,
                    episode: episodeNum,
                    backendId: this.currentBackendId
                });
            } else {
                throw new Error(data.error || 'Stream not available');
            }
        } catch (error) {
            console.error('Failed to load stream:', error);
            const errMsg = error.name === 'AbortError' ? 'Request timed out - try again' : error.message;
            const altLang = this.currentLang === 'sub' ? 'DUB' : 'SUB';
            document.getElementById('video-engine').innerHTML = `
                <div style="color: #ff3366; padding: 40px; text-align: center;">
                    <h3>⚠️ STREAM ERROR</h3>
                    <p>Episode ${episodeNum} could not be loaded in ${this.currentLang.toUpperCase()}</p>
                    <p style="font-size: 12px; opacity: 0.7;">${errMsg}</p>
                    <button onclick="Nexus.setLanguage('${this.currentLang === 'sub' ? 'dub' : 'sub'}')" style="margin-top:15px;background:var(--accent);color:#000;border:none;padding:8px 16px;cursor:pointer;border-radius:4px;font-weight:700;">
                        TRY ${altLang} VERSION
                    </button>
                </div>
            `;
        }
    }

    close() {
        window.history.back();
    }

    doClose() {
        window.history.pushState({}, '', '/');
        this.closeWithoutPush();
    }

    goBack() {
        this.close();
    }

    changeSpeed(speed) {
        const video = document.getElementById('nexus-video');
        if (video) {
            video.playbackRate = parseFloat(speed);
        }
    }

    toggleSubtitles() {
        const video = document.getElementById('nexus-video');
        if (video && video.textTracks.length > 0) {
            const track = video.textTracks[0];
            track.mode = track.mode === 'showing' ? 'hidden' : 'showing';
        }
    }

    stripHTML(html) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }
}

// Initialize
const Nexus = new AnimeNexus();
