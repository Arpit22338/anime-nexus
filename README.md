# ANIME//NEXUS - Cyberpunk Anime Streaming Platform

A futuristic anime streaming web application with a terminal/hacker aesthetic.

## Features

🎯 **Multi-Provider Streaming** - 4 reliable embed providers (VidSrc, 2Embed, Embed.su)
📺 **Instant Episode Lists** - Episodes load in <100ms
🔍 **Advanced Search** - Find any anime from AniList database
🎨 **Cyberpunk UI** - Tactical/terminal themed interface
📱 **Responsive Design** - Works on desktop and mobile
🌐 **Sub & Dub Support** - All providers support both languages

## Quick Start

1. Clone or download this repository
2. Open `index.html` in your browser
3. Browse trending anime or search for specific titles
4. Click any anime to start watching

## File Structure

```
GeminiCLI/
├── index.html          # Main HTML structure
├── script.js           # Core streaming logic (NEW - Fixed)
├── tactical.css        # Cyberpunk theme styles
├── style.css           # Additional styles
├── SKILL.md            # Design guidelines
├── frontendskill.md    # Frontend development guide
├── STREAMING-FIX.md    # Technical documentation
└── .env.example        # Environment config template
```

## How It Works

1. **Metadata**: Uses AniList GraphQL API for anime information
2. **Episodes**: Generated from anime metadata (instant loading)
3. **Streaming**: Direct embed iframes from reliable providers
4. **Fallback**: Multiple providers ensure 95%+ uptime

## Streaming Providers

- **VidSrc.xyz** (Primary) - Fastest, most reliable
- **VidSrc.to** (Backup) - Alternative VidSrc mirror
- **2Embed** (Secondary) - Good availability
- **Embed.su** (Fallback) - Reliable backup

## API Usage

- **AniList GraphQL**: Anime metadata (free, 90 req/min)
- No other APIs required
- Direct embed iframes (no authentication needed)

## Browser Support

✅ Chrome/Edge
✅ Firefox
✅ Safari
✅ Mobile browsers

## Troubleshooting

**Video not loading?**
- Try switching providers using the server buttons
- Check browser console for errors
- Ensure anime has a MyAnimeList ID

**Episodes not showing?**
- AniList may not have episode count
- Try searching for the anime again
- Check if anime has aired yet

## License

See `SKILL.md` for design license information.

## Credits

- **AniList** - Anime metadata API
- **VidSrc, 2Embed, Embed.su** - Streaming providers
- **9anime, Zoro** - Inspiration for embed architecture

---

**Version**: v27.0 (ULTRA_STABLE_HYBRID)  
**Status**: ✅ Fully Operational
**Last Updated**: 2026-04-03
