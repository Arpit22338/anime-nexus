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
    """Return popular movies with TMDB and IMDB IDs for embed providers"""
    # Hardcoded movies with IMDB IDs for reliable playback
    movies = [
        {'id': 'tt0816692', 'tmdb_id': 157336, 'imdb_id': 'tt0816692', 'title': 'Interstellar', 'year': '2014', 'image': 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', 'rating': 8.6},
        {'id': 'tt0468569', 'tmdb_id': 155, 'imdb_id': 'tt0468569', 'title': 'The Dark Knight', 'year': '2008', 'image': 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg', 'rating': 8.5},
        {'id': 'tt1375666', 'tmdb_id': 27205, 'imdb_id': 'tt1375666', 'title': 'Inception', 'year': '2010', 'image': 'https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2C8d0wPOQaX.jpg', 'rating': 8.4},
        {'id': 'tt4154796', 'tmdb_id': 299534, 'imdb_id': 'tt4154796', 'title': 'Avengers: Endgame', 'year': '2019', 'image': 'https://image.tmdb.org/t/p/w500/or06FN3DkaZhzkNKVTo52EbKBPm.jpg', 'rating': 8.4},
        {'id': 'tt0068646', 'tmdb_id': 238, 'imdb_id': 'tt0068646', 'title': 'The Godfather', 'year': '1972', 'image': 'https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsRolD1fZdja1.jpg', 'rating': 8.7},
        {'id': 'tt0111161', 'tmdb_id': 278, 'imdb_id': 'tt0111161', 'title': 'The Shawshank Redemption', 'year': '1994', 'image': 'https://image.tmdb.org/t/p/w500/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg', 'rating': 8.7},
        {'id': 'tt0109830', 'tmdb_id': 13, 'imdb_id': 'tt0109830', 'title': 'Forrest Gump', 'year': '1994', 'image': 'https://image.tmdb.org/t/p/w500/saHP97rTPS5eLmrLQEcANmKrsFl.jpg', 'rating': 8.8},
        {'id': 'tt0169547', 'tmdb_id': 129, 'imdb_id': 'tt0169547', 'title': 'Spirited Away', 'year': '2001', 'image': 'https://image.tmdb.org/t/p/w500/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg', 'rating': 8.5},
        {'id': 'tt1392214', 'tmdb_id': 489, 'imdb_id': 'tt1392214', 'title': 'Prisoners', 'year': '2013', 'image': 'https://image.tmdb.org/t/p/w500/ydDv1XjU4hK2U6A3U1Y5Z2Q1M0C.jpg', 'rating': 8.1},
        {'id': 'tt0435705', 'tmdb_id': 195, 'imdb_id': 'tt0435705', 'title': 'The Matrix', 'year': '1999', 'image': 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg', 'rating': 8.7},
        {'id': 'tt0266697', 'tmdb_id': 155, 'imdb_id': 'tt0266697', 'title': 'Kill Bill Vol 1', 'year': '2003', 'image': 'https://image.tmdb.org/t/p/w500/cG7hZqV1t18Gb4U3x9wqzM2XJJv.jpg', 'rating': 8.2},
        {'id': 'tt0361748', 'tmdb_id': 120, 'imdb_id': 'tt0361748', 'title': 'Inglourious Basterds', 'year': '2009', 'image': 'https://image.tmdb.org/t/p/w500/7LoKEXqK3oW9RwrOGy1bS5h7kT6.jpg', 'rating': 8.3},
        {'id': 'tt0367110', 'tmdb_id': 1124, 'imdb_id': 'tt0367110', 'title': 'Shutter Island', 'year': '2010', 'image': 'https://image.tmdb.org/t/p/w500/6ebCarrL1x112LWgA5Sm1xW6eT.jpg', 'rating': 8.2},
        {'id': 'tt0892769', 'tmdb_id': 496450, 'imdb_id': 'tt0892769', 'title': 'Your Name', 'year': '2016', 'image': 'https://image.tmdb.org/t/p/w500/q719jXXEzOoYaps6babgKnONONX.jpg', 'rating': 8.5},
        {'id': 'tt6723592', 'tmdb_id': 603692, 'imdb_id': 'tt6723592', 'title': 'John Wick 4', 'year': '2023', 'image': 'https://image.tmdb.org/t/p/w500/vZloFAK7NmvMGKE7VkF5RMazJi9.jpg', 'rating': 7.7},
    ]
    return jsonify({'success': True, 'movies': movies})

@app.route('/api/movies/search')
def movies_search():
    """Search movies by title"""
    q = request.args.get('q', '').lower()
    if not q:
        return jsonify({'error': 'Missing query'}), 400
    
    all_movies = [
        {'id': 157336, 'tmdb_id': 157336, 'title': 'Interstellar', 'year': '2014', 'image': 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', 'rating': 8.6, 'type': 'movie'},
        {'id': 155, 'tmdb_id': 155, 'title': 'The Dark Knight', 'year': '2008', 'image': 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg', 'rating': 8.5, 'type': 'movie'},
        {'id': 27205, 'tmdb_id': 27205, 'title': 'Inception', 'year': '2010', 'image': 'https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2C8d0wPOQaX.jpg', 'rating': 8.4, 'type': 'movie'},
        {'id': 299534, 'tmdb_id': 299534, 'title': 'Avengers: Endgame', 'year': '2019', 'image': 'https://image.tmdb.org/t/p/w500/or06FN3DkaZhzkNKVTo52EbKBPm.jpg', 'rating': 8.4, 'type': 'movie'},
        {'id': 238, 'tmdb_id': 238, 'title': 'The Godfather', 'year': '1972', 'image': 'https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsRolD1fZdja1.jpg', 'rating': 8.7, 'type': 'movie'},
        {'id': 278, 'tmdb_id': 278, 'title': 'The Shawshank Redemption', 'year': '1994', 'image': 'https://image.tmdb.org/t/p/w500/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg', 'rating': 8.7, 'type': 'movie'},
        {'id': 424, 'tmdb_id': 424, 'title': 'Schindlers List', 'year': '1993', 'image': 'https://image.tmdb.org/t/p/w500/sF1U4EUQS8YHUYjNl3pMGNIQyr0.jpg', 'rating': 8.6, 'type': 'movie'},
        {'id': 129, 'tmdb_id': 129, 'title': 'Spirited Away', 'year': '2001', 'image': 'https://image.tmdb.org/t/p/w500/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg', 'rating': 8.5, 'type': 'movie'},
        {'id': 372058, 'tmdb_id': 372058, 'title': 'Your Name', 'year': '2016', 'image': 'https://image.tmdb.org/t/p/w500/q719jXXEzOoYaps6babgKnONONX.jpg', 'rating': 8.5, 'type': 'movie'},
        {'id': 603692, 'tmdb_id': 603692, 'title': 'John Wick: Chapter 4', 'year': '2023', 'image': 'https://image.tmdb.org/t/p/w500/vZloFAK7NmvMGKE7VkF5RMazJi9.jpg', 'rating': 7.7, 'type': 'movie'},
        {'id': 569094, 'tmdb_id': 569094, 'title': 'Spider-Man: Across the Spider-Verse', 'year': '2023', 'image': 'https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg', 'rating': 8.5, 'type': 'movie'},
        {'id': 346698, 'tmdb_id': 346698, 'title': 'Barbie', 'year': '2023', 'image': 'https://image.tmdb.org/t/p/w500/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg', 'rating': 7.0, 'type': 'movie'},
        {'id': 533535, 'tmdb_id': 533535, 'title': 'Deadpool & Wolverine', 'year': '2024', 'image': 'https://image.tmdb.org/t/p/w500/rmNnMFlrDkW5MSy6DThnXjKOfh4.jpg', 'rating': 7.8, 'type': 'movie'},
        {'id': 558449, 'tmdb_id': 558449, 'title': 'Twisters', 'year': '2024', 'image': 'https://image.tmdb.org/t/p/w500/6U6oVFLM6nQcXexFOpT8z3L4VGe.jpg', 'rating': 7.0, 'type': 'movie'},
        {'id': 912649, 'tmdb_id': 912649, 'title': 'Venom: The Last Dance', 'year': '2024', 'image': 'https://image.tmdb.org/t/p/w500/pQ6J4E9w6M9Yp5lK3qJw3M8Lv7G.jpg', 'rating': 6.5, 'type': 'movie'},
    ]
    
    results = [m for m in all_movies if q in m['title'].lower()]
    return jsonify({'success': True, 'results': results[:20]})

@app.route('/api/movies/<int:movie_id>')
def movie_detail(movie_id):
    """Get movie details - supports both TMDB and fallback IDs"""
    all_movies = [
        {'id': 157336, 'tmdb_id': 157336, 'title': 'Interstellar', 'year': '2014', 'image': 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', 'rating': 8.6, 'type': 'movie'},
        {'id': 155, 'tmdb_id': 155, 'title': 'The Dark Knight', 'year': '2008', 'image': 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg', 'rating': 8.5, 'type': 'movie'},
        {'id': 27205, 'tmdb_id': 27205, 'title': 'Inception', 'year': '2010', 'image': 'https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2C8d0wPOQaX.jpg', 'rating': 8.4, 'type': 'movie'},
        {'id': 299534, 'tmdb_id': 299534, 'title': 'Avengers: Endgame', 'year': '2019', 'image': 'https://image.tmdb.org/t/p/w500/or06FN3DkaZhzkNKVTo52EbKBPm.jpg', 'rating': 8.4, 'type': 'movie'},
        {'id': 238, 'tmdb_id': 238, 'title': 'The Godfather', 'year': '1972', 'image': 'https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsRolD1fZdja1.jpg', 'rating': 8.7, 'type': 'movie'},
        {'id': 278, 'tmdb_id': 278, 'title': 'The Shawshank Redemption', 'year': '1994', 'image': 'https://image.tmdb.org/t/p/w500/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg', 'rating': 8.7, 'type': 'movie'},
        {'id': 424, 'tmdb_id': 424, 'title': 'Schindlers List', 'year': '1993', 'image': 'https://image.tmdb.org/t/p/w500/sF1U4EUQS8YHUYjNl3pMGNIQyr0.jpg', 'rating': 8.6, 'type': 'movie'},
        {'id': 129, 'tmdb_id': 129, 'title': 'Spirited Away', 'year': '2001', 'image': 'https://image.tmdb.org/t/p/w500/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg', 'rating': 8.5, 'type': 'movie'},
        {'id': 372058, 'tmdb_id': 372058, 'title': 'Your Name', 'year': '2016', 'image': 'https://image.tmdb.org/t/p/w500/q719jXXEzOoYaps6babgKnONONX.jpg', 'rating': 8.5, 'type': 'movie'},
        {'id': 603692, 'tmdb_id': 603692, 'title': 'John Wick: Chapter 4', 'year': '2023', 'image': 'https://image.tmdb.org/t/p/w500/vZloFAK7NmvMGKE7VkF5RMazJi9.jpg', 'rating': 7.7, 'type': 'movie'},
        {'id': 569094, 'tmdb_id': 569094, 'title': 'Spider-Man: Across the Spider-Verse', 'year': '2023', 'image': 'https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg', 'rating': 8.5, 'type': 'movie'},
        {'id': 346698, 'tmdb_id': 346698, 'title': 'Barbie', 'year': '2023', 'image': 'https://image.tmdb.org/t/p/w500/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg', 'rating': 7.0, 'type': 'movie'},
        {'id': 533535, 'tmdb_id': 533535, 'title': 'Deadpool & Wolverine', 'year': '2024', 'image': 'https://image.tmdb.org/t/p/w500/rmNnMFlrDkW5MSy6DThnXjKOfh4.jpg', 'rating': 7.8, 'type': 'movie'},
        {'id': 558449, 'tmdb_id': 558449, 'title': 'Twisters', 'year': '2024', 'image': 'https://image.tmdb.org/t/p/w500/6U6oVFLM6nQcXexFOpT8z3L4VGe.jpg', 'rating': 7.0, 'type': 'movie'},
        {'id': 912649, 'tmdb_id': 912649, 'title': 'Venom: The Last Dance', 'year': '2024', 'image': 'https://image.tmdb.org/t/p/w500/pQ6J4E9w6M9Yp5lK3qJw3M8Lv7G.jpg', 'rating': 6.5, 'type': 'movie'},
    ]
    
    movie = next((m for m in all_movies if m['id'] == movie_id), None)
    if movie:
        return jsonify({'success': True, 'movie': movie})
    return jsonify({'error': 'Movie not found'}), 404

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 3001)))
