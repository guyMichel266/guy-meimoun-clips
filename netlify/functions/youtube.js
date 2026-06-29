// =====================================================
// PROXY NETLIFY — La clé API ne quitte jamais ce fichier
// Elle est stockée dans les variables d'environnement Netlify
// =====================================================

exports.handler = async function (event) {
    const API_KEY = process.env.YOUTUBE_API_KEY;
    const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;

    // Headers CORS pour autoriser ton site à appeler cette fonction
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600' // Cache 1h pour économiser les quotas
    };

    if (!API_KEY || !CHANNEL_ID) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Variables d\'environnement manquantes.' })
        };
    }

    try {
        // 1. Récupère l'ID de la playlist "Uploads"
        const channelRes = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${CHANNEL_ID}&key=${API_KEY}`
        );
        const channelData = await channelRes.json();

        if (!channelData.items || channelData.items.length === 0) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Chaîne introuvable.' })
            };
        }

        const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;

        // 2. Récupère toutes les vidéos (pagination)
        let allVideos = [];
        let nextPageToken = '';

        do {
            const playlistRes = await fetch(
                `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50&pageToken=${nextPageToken}&key=${API_KEY}`
            );
            const playlistData = await playlistRes.json();
            if (playlistData.items) allVideos = allVideos.concat(playlistData.items);
            nextPageToken = playlistData.nextPageToken || '';
        } while (nextPageToken);

        // 3. Récupère les stats (vues) par batch de 50
        const videoIds = allVideos.map(i => i.snippet.resourceId.videoId).join(',');
        const statsRes = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds}&key=${API_KEY}`
        );
        const statsData = await statsRes.json();

        const statsMap = {};
        if (statsData.items) {
            statsData.items.forEach(item => {
                statsMap[item.id] = parseInt(item.statistics?.viewCount || 0);
            });
        }

        // 4. Construit la liste finale triée par vues
        const videos = allVideos
            .map(item => ({
                id: item.snippet.resourceId.videoId,
                title: item.snippet.title,
                thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url || '',
                views: statsMap[item.snippet.resourceId.videoId] || 0
            }))
            .sort((a, b) => b.views - a.views);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ videos, total: videos.length })
        };

    } catch (err) {
        console.error('Erreur proxy YouTube:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Erreur serveur.' })
        };
    }
};
