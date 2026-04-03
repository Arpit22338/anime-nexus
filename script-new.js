/**
 * ANIME//NEXUS - Protocol v28.0 (ANIPY-API BACKEND)
 * Uses Railway backend with anipy-api for REAL working streams
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
        }
    }`
};

class AnimeNexus {
    constructor() {
        this.currentAnime = null;
        this.currentLang = 'sub';
        this.episodes = [];
        this.init();
    }

    init() {
        this.loadTrending();
        document.getElementById('search-btn').addEventListener('click', () => this.search());
        document.getElementById('main-search').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.search();
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
                <img src="${anime.coverImage.extraLarge}" alt="${anime.title.romaji}">
                <div class="card-info">
                    <h3>${anime.title.romaji || anime.title.english}</h3>
                    <p>${anime.status} ${anime.episodes ? `• ${anime.episodes} eps` : ''}</p>
                </div>
            </div>
        `).join('');
    }

    async open(anilistId) {
        try {
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

            // Show overlay
            document.getElementById('player-overlay').classList.add('active');
            document.getElementById('display-title').textContent = this.currentAnime.title.romaji;
            document.getElementById('display-desc').textContent = this.stripHTML(this.currentAnime.description || 'No description available');

            // Search backend for this anime
            await this.searchBackend(this.currentAnime.title.romaji);
        } catch (error) {
            console.error('Failed to open anime:', error);
            alert('Failed to load anime');
        }
    }

    async searchBackend(title) {
        try {
            const response = await fetch(`${NEXUS_CONFIG.BACKEND_API}/search?q=${encodeURIComponent(title)}`);
            const data = await response.json();

            if (data.success && data.results.length > 0) {
                // Use first result
                const anime = data.results[0];
                await this.loadEpisodes(anime.id);
            } else {
                document.getElementById('video-engine').innerHTML = `
                    <div style="color: #ff3366; padding: 40px; text-align: center;">
                        <h3>⚠️ NO STREAMS FOUND</h3>
                        <p>This anime is not available on the streaming providers</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Backend search failed:', error);
            alert('Backend is unavailable');
        }
    }

    async loadEpisodes(animeId) {
        try {
            const response = await fetch(`${NEXUS_CONFIG.BACKEND_API}/episodes/${animeId}?lang=${this.currentLang}`);
            const data = await response.json();

            if (data.success) {
                this.episodes = data.episodes;
                this.displayEpisodeList(animeId);
                
                // Auto-play first episode
                if (this.episodes.length > 0) {
                    this.playEpisode(animeId, 1);
                }
            }
        } catch (error) {
            console.error('Failed to load episodes:', error);
        }
    }

    displayEpisodeList(animeId) {
        const container = document.querySelector('.episode-grid');
        if (!container) return;

        container.innerHTML = this.episodes.map(ep => `
            <button class="ep-btn" onclick="Nexus.playEpisode('${animeId}', ${ep.number})">
                EP ${ep.number}
            </button>
        `).join('');
    }

    async playEpisode(animeId, episodeNum) {
        try {
            const response = await fetch(`${NEXUS_CONFIG.BACKEND_API}/stream/${animeId}/${episodeNum}?lang=${this.currentLang}`);
            const data = await response.json();

            if (data.success) {
                document.getElementById('video-engine').innerHTML = `
                    <video controls autoplay style="width: 100%; height: 100%;">
                        <source src="${data.stream_url}" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>
                `;
            } else {
                throw new Error('Stream not available');
            }
        } catch (error) {
            console.error('Failed to load stream:', error);
            document.getElementById('video-engine').innerHTML = `
                <div style="color: #ff3366; padding: 40px; text-align: center;">
                    <h3>⚠️ STREAM ERROR</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }

    close() {
        document.getElementById('player-overlay').classList.remove('active');
        document.getElementById('video-engine').innerHTML = '';
        this.currentAnime = null;
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
