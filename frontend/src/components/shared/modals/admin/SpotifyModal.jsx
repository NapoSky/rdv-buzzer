import React from 'react';

const SpotifyModal = ({
  show,
  spotifyConnected,
  spotifyUser,
  hasDevices,
  onConnect,
  onChangeAccount,
  onDisconnect,
  onClose,
  foundTitle, // Nouvelle prop
  foundArtist, // Nouvelle prop
  onForceShowTitle, // Nouvelle prop
  onForceShowArtist, // Nouvelle prop
  onForceHideTitle, // Nouvelle prop
  onForceHideArtist // Nouvelle prop
}) => {
  if (!show) return null;

  return (
    <div className="modal show">
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="bi bi-spotify me-2"></i>
              Spotify {spotifyConnected ? 'connecté' : 'non connecté'}
            </h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            {spotifyConnected ? (
              <div>
                <div className="alert alert-success">
                  <strong>Spotify connecté</strong>
                  {spotifyUser && (
                    <div className="mt-2">
                      <small>Utilisateur : {spotifyUser.name || spotifyUser.id || 'Inconnu'}</small>
                    </div>
                  )}
                  <div className="mt-2">
                    <small>Appareils disponibles : {hasDevices ? 'Oui' : 'Non'}</small>
                  </div>
                </div>
                <p className="text-muted small">La lecture sera automatiquement mise en pause lorsqu'un joueur buzze.</p>
                {/* Section pour forcer l'affichage/masquage */}
                <div className="mt-3 border-top pt-3">
                  <h6>Forcer l'affichage côté joueurs :</h6>
                  <div className="d-flex justify-content-start gap-2 mt-2">
                    {foundTitle ? (
                      <button className="btn btn-sm btn-outline-secondary" onClick={onForceHideTitle}>
                        Masquer Titre
                      </button>
                    ) : (
                      <button className="btn btn-sm btn-outline-warning" onClick={onForceShowTitle}>
                        Afficher Titre
                      </button>
                    )}
                    {foundArtist ? (
                      <button className="btn btn-sm btn-outline-secondary" onClick={onForceHideArtist}>
                        Masquer Artiste
                      </button>
                    ) : (
                      <button className="btn btn-sm btn-outline-warning" onClick={onForceShowArtist}>
                        Afficher Artiste
                      </button>
                    )}
                  </div>
                  <p className="text-muted small mt-2">Permet de révéler ou cacher manuellement le titre ou l'artiste sur l'écran des joueurs.</p>
                </div>
              </div>
            ) : (
              <div className="alert alert-secondary">
                <p>Connectez Spotify pour bénéficier de la mise en pause automatique lors des buzz.</p>
              </div>
            )}
          </div>
          <div className="modal-footer">
            {!spotifyConnected ? (
              <button className="btn btn-success" onClick={onConnect}>
                <i className="bi bi-spotify me-2"></i>Connecter Spotify
              </button>
            ) : (
              <>
                <button className="btn btn-outline-info" onClick={onChangeAccount}>
                  Changer de compte
                </button>
                <button className="btn btn-outline-danger" onClick={onDisconnect}>
                  Déconnecter
                </button>
              </>
            )}
            <button className="btn btn-secondary" onClick={onClose}>
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpotifyModal;