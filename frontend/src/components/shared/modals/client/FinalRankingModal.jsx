import React from 'react';
import RankingTable from '../../RankingTable';

const FinalRankingModal = ({ 
  show,
  finalPlayers,
  pseudo,
  isDarkMode,
  onClose
}) => {
  if (!show) return null;
  
  return (
    <div className="client-container">
      <h2>Partie terminée</h2>
      <div className="modal show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.7)' }}>
        <div className="modal-dialog modal-dialog-centered modal-lg">
          <div className="modal-content">
            <div className="modal-header">
              <h4 className="modal-title">Merci d'avoir participé ! 🎉</h4>
            </div>
            <div className="modal-body">
              <h5>Classement final</h5>
              <small>
                Votre classement : {
                  (() => {
                    const myRank = finalPlayers.findIndex(player => player.pseudo === pseudo);
                    return myRank >= 0 ? myRank + 1 : 'Non classé';
                  })()
                }
              </small>
              <div className="ranking-scroll">
                <RankingTable players={finalPlayers} currentUser={pseudo} />
              </div>
              
              <div className="text-center mt-4 mb-2">
                <div className="social-links">
                  <a 
                    href="https://www.instagram.com/lerdvlille" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className={isDarkMode ? "link-light" : "link-dark"}
                    style={{ display: 'inline-flex', alignItems: 'center' }}
                  >
                    Suivez le RDV sur Instagram
                    <img 
                      src="https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/instagram.png" 
                      alt="Instagram icon" 
                      style={{ height: '1em', width: 'auto', marginLeft: '0.3em', verticalAlign: 'middle' }} 
                    />
                  </a>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-primary" 
                onClick={onClose}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinalRankingModal;