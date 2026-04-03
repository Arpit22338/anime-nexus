/**
 * ANIME//NEXUS - Protocol v29.0 (ANIPY-API BACKEND)
 * Full-featured anime streaming with season, language, and episode selectors
 */

const NEXUS_CONFIG = {
    ANILIST: 'https://graphql.anilist.co/',
    BACKEND_API: 'https://web-production-9bda3.up.railway.app/api'
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
        this.currentAnime = null;       // AniList anime data
        this.currentBackendName = null; // Backend provider anime NAME (for API calls)
        this.currentLang = 'sub';
        this.episodes = [];
        this.relatedSeasons = [];
        this.episodePageSize = 100;      // Show 100 episodes per page
        this.currentEpisodePage = 0;     // Current page index
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
        grid.innerHTML = animeList.map(anime => `
            <div class="anime-card" onclick="Nexus.open(${anime.id})">
                <div class="card-media">
                    <img src="${anime.coverImage.extraLarge}" alt="${anime.title.romaji}">
                </div>
                <div class="card-info">
                    <h3>${anime.title.romaji || anime.title.english}</h3>
                    <p>${anime.status} ${anime.episodes ? `• ${anime.episodes} eps` : ''}</p>
                </div>
            </div>
        `).join('');
    }

    async open(anilistId) {
        try {
            // Show loading state
            document.getElementById('player-overlay').classList.add('active');
            document.getElementById('display-title').textContent = 'LOADING...';
            document.getElementById('display-desc').textContent = 'Connecting to stream...';
            document.getElementById('video-engine').innerHTML = '<div class="loading">ESTABLISHING_LINK...</div>';
            document.getElementById('episode-list').innerHTML = '';
            document.getElementById('server-list').innerHTML = '';

            // Get anime details from AniList
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

            // Update UI
            document.getElementById('display-title').textContent = this.currentAnime.title.romaji || this.currentAnime.title.english;
            document.getElementById('display-desc').textContent = this.stripHTML(this.currentAnime.description || 'No description available');

            // Populate seasons dropdown
            this.populateSeasons();

            // Populate language/server selector
            this.populateServers();

            // Search backend for this anime
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
        dropdown.innerHTML = '<option value="">SELECT_SEASON</option>';

        // Add current anime
        const currentOption = document.createElement('option');
        currentOption.value = this.currentAnime.id;
        currentOption.textContent = `${this.currentAnime.title.romaji} (${this.currentAnime.seasonYear || 'N/A'})`;
        currentOption.selected = true;
        dropdown.appendChild(currentOption);

        // Add related seasons (sequels, prequels, etc.)
        if (this.currentAnime.relations && this.currentAnime.relations.edges) {
            const relatedAnime = this.currentAnime.relations.edges
                .filter(edge => ['SEQUEL', 'PREQUEL', 'PARENT', 'SIDE_STORY'].includes(edge.relationType))
                .filter(edge => edge.node.format === 'TV' || edge.node.format === 'OVA')
                .sort((a, b) => (a.node.seasonYear || 0) - (b.node.seasonYear || 0));

            relatedAnime.forEach(edge => {
                const option = document.createElement('option');
                option.value = edge.node.id;
                option.textContent = `${edge.node.title.romaji || edge.node.title.english} (${edge.node.seasonYear || edge.relationType})`;
                dropdown.appendChild(option);
            });
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
        
        // Reload episodes with new language
        if (this.currentBackendName) {
            this.loadEpisodes(this.currentBackendName);
        }
    }

    async searchBackend(title) {
        try {
            document.getElementById('video-engine').innerHTML = '<div class="loading">SCANNING_FREQUENCIES...</div>';
            
            // Use AbortController with 2 minute timeout for large anime
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);
            
            const response = await fetch(
                `${NEXUS_CONFIG.BACKEND_API}/episodes/${encodeURIComponent(title)}?language=${this.currentLang}`,
                { signal: controller.signal }
            );
            clearTimeout(timeoutId);
            
            const data = await response.json();

            if (data.success && data.episodes.length > 0) {
                this.currentBackendName = data.anime.name;  // Store NAME, not ID
                this.episodes = data.episodes;
                this.currentEpisodePage = 0;  // Reset to first page
                this.displayEpisodeList();
                
                // Auto-play first episode
                this.playEpisode(1);
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

        // Pagination for large episode lists
        const totalEps = this.episodes.length;
        const pageSize = this.episodePageSize;
        const totalPages = Math.ceil(totalEps / pageSize);
        const startIdx = this.currentEpisodePage * pageSize;
        const endIdx = Math.min(startIdx + pageSize, totalEps);
        const pageEpisodes = this.episodes.slice(startIdx, endIdx);

        let html = '';
        
        // Page selector for anime with many episodes
        if (totalPages > 1) {
            html += '<div class="ep-pagination" style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;">';
            for (let i = 0; i < totalPages; i++) {
                const start = i * pageSize + 1;
                const end = Math.min((i + 1) * pageSize, totalEps);
                const active = i === this.currentEpisodePage ? 'active' : '';
                html += `<button class="ep-page-btn ${active}" onclick="Nexus.setEpisodePage(${i})" style="font-size:0.6rem;padding:4px 8px;background:${active ? 'var(--accent)' : 'rgba(255,255,255,0.05)'};border:1px solid ${active ? 'var(--accent)' : 'rgba(255,255,255,0.1)'};color:${active ? '#000' : '#888'};cursor:pointer;">${start}-${end}</button>`;
            }
            html += '</div>';
        }

        // Episode buttons for current page
        html += '<div class="ep-grid">';
        html += pageEpisodes.map(ep => `
            <button class="ep-btn" onclick="Nexus.playEpisode(${ep.number})" data-ep="${ep.number}">
                ${ep.number}
            </button>
        `).join('');
        html += '</div>';

        container.innerHTML = html;
    }

    setEpisodePage(pageNum) {
        this.currentEpisodePage = pageNum;
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

            // Use AbortController with 90 second timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 90000);

            const response = await fetch(
                `${NEXUS_CONFIG.BACKEND_API}/stream/${encodeURIComponent(this.currentBackendName)}/${episodeNum}?language=${this.currentLang}`,
                { signal: controller.signal }
            );
            clearTimeout(timeoutId);
            
            const data = await response.json();

            if (data.success && data.stream_url) {
                // Use proxy to bypass referrer restrictions
                const proxyUrl = `${NEXUS_CONFIG.BACKEND_API}/proxy?url=${encodeURIComponent(data.stream_url)}&referer=${encodeURIComponent(data.referrer || 'https://allanime.day')}`;
                
                document.getElementById('video-engine').innerHTML = `
                    <video controls autoplay style="width: 100%; height: 100%; background: #000;">
                        <source src="${proxyUrl}" type="video/mp4">
                        Your browser does not support HTML5 video.
                    </video>
                    <p style="color: var(--accent); font-size: 0.7rem; margin-top: 5px;">${data.resolution || 1080}p • ${this.currentLang.toUpperCase()}</p>
                `;
            } else {
                throw new Error(data.error || 'Stream not available');
            }
        } catch (error) {
            console.error('Failed to load stream:', error);
            const errMsg = error.name === 'AbortError' ? 'Request timed out - try again' : error.message;
            document.getElementById('video-engine').innerHTML = `
                <div style="color: #ff3366; padding: 40px; text-align: center;">
                    <h3>⚠️ STREAM ERROR</h3>
                    <p>Episode ${episodeNum} could not be loaded</p>
                    <p style="font-size: 12px; opacity: 0.7;">${errMsg}</p>
                </div>
            `;
        }
    }

    close() {
        document.getElementById('player-overlay').classList.remove('active');
        document.getElementById('video-engine').innerHTML = '';
        document.getElementById('episode-list').innerHTML = '';
        document.getElementById('server-list').innerHTML = '';
        document.getElementById('season-dropdown').innerHTML = '<option value="">SELECT_SEASON</option>';
        this.currentAnime = null;
        this.currentBackendName = null;
        this.episodes = [];
    }

    stripHTML(html) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }
}

// Initialize
const Nexus = new AnimeNexus();
