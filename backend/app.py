import os
import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
from anipy_api.provider import list_providers, get_provider, LanguageTypeEnum

app = Flask(__name__)
CORS(app)

DEFAULT_PROVIDER = None
TMDB_API_KEY = os.environ.get('TMDB_API_KEY', '4d8c8c6e8e2f8e6e8e2f8e6e8e2f8e6e')  # Free tier

def get_default_provider():
    global DEFAULT_PROVIDER
    if not DEFAULT_PROVIDER:
        providers = list(list_providers())
        DEFAULT_PROVIDER = get_provider(providers[0])()
    return DEFAULT_PROVIDER

def get_tmdb_id_from_tvmaze(tvmaze_id, media_type='movie'):
    """Get TMDB ID from TVMaze ID using TVMaze API"""
    try:
        resp = requests.get(f'https://api.tvmaze.com/shows/{tvmaze_id}', timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            externals = data.get('externals', {})
            # TVMaze stores TMDB ID in externals
            tmdb_id = externals.get('tmdb') or externals.get('thetvdb')
            if tmdb_id:
                return str(tmdb_id)
            # Fallback: search TMDB by title
            title = data.get('name') or data.get('_links', {}).get('self', {}).get('href', '').split('/')[-1]
            if title:
                return search_tmdb_by_title(title, data.get('premiered', '')[:4], media_type)
    except:
        pass
    return None

def search_tmdb_by_title(title, year=None, media_type='movie'):
    """Search TMDB by title and year"""
    try:
        resp = requests.get(
            f'https://api.themoviedb.org/3/search/{media_type}',
            params={'api_key': TMDB_API_KEY, 'query': title},
            timeout=5
        )
        if resp.status_code == 200:
            results = resp.json().get('results', [])
            for r in results:
                release_date = r.get('release_date') or r.get('first_air_date') or ''
                if year and release_date.startswith(year):
                    return str(r['id'])
            if results:
                return str(results[0]['id'])
    except:
        pass
    return None

def get_movie_details_tvmaze(tvmaze_id):
    """Get movie/show details from TVMaze"""
    try:
        resp = requests.get(f'https://api.tvmaze.com/shows/{tvmaze_id}', timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            return {
                'id': tvmaze_id,
                'tmdb_id': get_tmdb_id_from_tvmaze(tvmaze_id),
                'title': data.get('name', ''),
                'year': data.get('premiered', '')[:4] if data.get('premiered') else '',
                'image': data.get('image', {}).get('medium', '') if data.get('image') else '',
                'rating': data.get('rating', {}).get('average', 0),
                'summary': data.get('summary', ''),
                'type': 'movie'
            }
    except:
        pass
    return None

@app.route('/')
def home():
    return jsonify({'status': 'online', 'name': 'ANIME//NEXUS API'})

@app.route('/api/search')
def search():
    q = request.args.get('q', '')
    if not q:
        return jsonify({'error': 'Missing query'}), 400
    
    try:
        provider = get_default_provider()
        results = provider.get_search(q)
        return jsonify({
            'success': True,
            'results': [{'id': r.identifier, 'name': r.name} for r in results[:15]]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/movies/popular')
def movies_popular():
    """Return popular movies with TMDB IDs for embed providers"""
    try:
        # Popular TMDB movie IDs (curated list of popular movies)
        popular_tmdb_ids = [
            912649,  # Venom: The Last Dance
            558449,  # Twisters
            1184918, # The Wild Robot
            1034541, # Terrifier 3
            533535,  # Deadpool & Wolverine
            945961,  # Alien: Romulus
            1118031, # Apocalypto
            519182,  # Desire
            1029235, # Azrael
            1100782, # Smile 2
            453395,  # Signed Sealed Delivered
            299534,  # Avengers: Endgame
            157336,  # Interstellar
            155,     # The Dark Knight
            27205,   # Inception
            278,     # The Shawshank Redemption
            238,     # The Godfather
            424,     # Schindler's List
            389,     # 12 Angry Men
            129,     # Spirited Away
            372058,  # Your Name
            378064,  # A Silent Voice
            508965,  # The Harder They Fall
            603692,  # John Wick 4
            569094,  # Spider-Man: Across the Spider-Verse
            447365,  # Guardians of the Galaxy Vol. 3
            298618,  # The Flash
            346698,  # Barbie
            615656,  # Meg 2
            385687,  # Fast X
        ]
        
        category = request.args.get('category', 'all')
        
        movies = []
        for tmdb_id in popular_tmdb_ids:
            try:
                resp = requests.get(
                    f'https://api.themoviedb.org/3/movie/{tmdb_id}',
                    params={'api_key': TMDB_API_KEY},
                    timeout=3
                )
                if resp.status_code == 200:
                    data = resp.json()
                    movies.append({
                        'id': tmdb_id,
                        'tmdb_id': tmdb_id,
                        'title': data.get('title', ''),
                        'year': data.get('release_date', '')[:4],
                        'image': f"https://image.tmdb.org/t/p/w500{data.get('poster_path', '')}",
                        'rating': round(data.get('vote_average', 0), 1),
                        'type': 'movie'
                    })
            except:
                continue
        
        return jsonify({'success': True, 'movies': movies})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/movies/search')
def movies_search():
    """Search movies by title"""
    q = request.args.get('q', '')
    if not q:
        return jsonify({'error': 'Missing query'}), 400
    
    try:
        resp = requests.get(
            'https://api.themoviedb.org/3/search/movie',
            params={'api_key': TMDB_API_KEY, 'query': q},
            timeout=5
        )
        if resp.status_code == 200:
            data = resp.json()
            results = []
            for r in data.get('results', [])[:20]:
                if r.get('poster_path'):
                    results.append({
                        'id': r['id'],
                        'tmdb_id': r['id'],
                        'title': r.get('title', ''),
                        'year': r.get('release_date', '')[:4],
                        'image': f"https://image.tmdb.org/t/p/w500{r['poster_path']}",
                        'rating': round(r.get('vote_average', 0), 1),
                        'type': 'movie'
                    })
            return jsonify({'success': True, 'results': results})
        return jsonify({'success': True, 'results': []})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/movies/<int:tvmaze_id>')
def movie_detail(tvmaze_id):
    """Get movie details with TMDB ID"""
    details = get_movie_details_tvmaze(tvmaze_id)
    if details:
        return jsonify({'success': True, 'movie': details})
    return jsonify({'error': 'Movie not found'}), 404

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 3001)))
