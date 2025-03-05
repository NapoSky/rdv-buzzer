const SpotifyWebApi = require('spotify-web-api-node');

const spotifyConfig = {
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI || `http://localhost:3001/api/spotify/callback`
};

const createSpotifyApi = () => {
  return new SpotifyWebApi(spotifyConfig);
};

module.exports = {
  config: spotifyConfig,
  createApi: createSpotifyApi
};