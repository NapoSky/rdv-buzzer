import React from 'react';
import './SpotifyDisplay.css';
const defaultAlbumArt = '/default-album-art.png'; // Assurez-vous que ce chemin est correct

const SpotifyDisplay = ({ trackInfo, roomType = 'Standard', foundArtist = false, foundTitle = false, isVisible = true }) => {

  // Si le composant ne doit pas être visible, ne rien rendre
  if (!isVisible) {
    return null;
  }

  // Si aucune information de piste n'est disponible, afficher un état vide ou des placeholders
  if (!trackInfo) {
    return (
      <div className="spotifyDisplayContainer empty">
        <div className="artworkContainer">
          <img
            src={defaultAlbumArt}
            alt="Jaquette par défaut"
            className="artwork hiddenArtwork" // Toujours cachée si pas de trackInfo
          />
        </div>
        <div className="trackInfo">
          <p className="artist">Artiste manquant 😏</p> {/* Fix à l'arrache, ne doit pas être ça au premier catch */}
          <p className="title">En attente de la prochaine piste...</p> {/* Fix à l'arrache, ne doit pas être ça au premier catch */}
        </div>
      </div>
    );
  }

  // --- Logique d'affichage conditionnel ---

  let showArtist = false;
  let showTitle = false;
  let showArtwork = false;

  if (roomType === 'Standard') {
    // En mode Standard, on révèle tout dès que l'un ou l'autre est trouvé
    if (foundArtist || foundTitle) {
      showArtist = true;
      showTitle = true;
      showArtwork = true;
    }
  } else if (roomType === 'Titre/Artiste') {
    // En mode Titre/Artiste, on révèle indépendamment
    if (foundArtist) {
      showArtist = true;
    }
    if (foundTitle) {
      showTitle = true;
    }
    // La jaquette n'est révélée que si les deux sont trouvés
    if (foundArtist && foundTitle) {
      showArtwork = true;
    }
  }

  // Déterminer les valeurs à afficher
  const displayArtist = showArtist ? trackInfo.artist : 'Artiste manquant';
  const displayTitle = showTitle ? trackInfo.title : 'Titre manquant';
  const artworkUrl = showArtwork && trackInfo.artworkUrl ? trackInfo.artworkUrl : defaultAlbumArt;
  const artworkVisibleClass = showArtwork ? 'visibleArtwork' : 'hiddenArtwork';
  const hasPlaylistInfo = trackInfo.playlistInfo && trackInfo.playlistInfo.total > 0;

  return (
    <div className={`spotifyDisplayContainer ${showArtwork ? 'revealed' : ''}`}>
      {/* Badge en coin supérieur droit */}
      {hasPlaylistInfo && (
        <div className="playlist-badge">
          🎵 {trackInfo.playlistInfo.position}/{trackInfo.playlistInfo.total}
        </div>
      )}
      <div className="artworkContainer">
        <img
          src={artworkUrl}
          alt={showArtwork ? `Jaquette de ${trackInfo.title}` : "Jaquette cachée"}
          className={`artwork ${artworkVisibleClass}`}
          // Fallback si l'URL de l'artwork est invalide ou ne charge pas
          onError={(e) => { if (e.target.src !== defaultAlbumArt) e.target.src = defaultAlbumArt; }}
        />
      </div>
      <div className="trackInfo">
        <p className="artist">{displayArtist}</p>
        <p className="title">{displayTitle}</p>
      </div>
    </div>
  );
};

export default SpotifyDisplay;