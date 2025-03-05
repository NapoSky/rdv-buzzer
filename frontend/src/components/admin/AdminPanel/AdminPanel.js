// src/components/AdminPanel.js
import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { ThemeContext } from '../../../contexts/ThemeContext';
import './AdminPanel.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const APP_SECRET = process.env.REACT_APP_APP_SECRET;

function AdminPanel() {
  const [sessions, setSessions] = useState({});
  const navigate = useNavigate();
  const { isDarkMode } = useContext(ThemeContext);

  useEffect(() => {
    const adminAuth = localStorage.getItem("localAdminAuthenticated") === "true";
    if (!adminAuth) {
      navigate('/');
    }
  }, [navigate]);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/admin/sessions`, {
        headers: {
          Authorization: `Bearer ${APP_SECRET}`
        }
      });
      setSessions(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className={`admin-panel ${isDarkMode ? 'dark-mode' : ''}`}>
      <AdminPanelContent 
        sessions={sessions} 
        fetchSessions={fetchSessions}
        isDarkMode={isDarkMode}
      />
    </div>
  );
}

function AdminPanelContent({ sessions, fetchSessions, isDarkMode }) {
  const navigate = useNavigate();
  const [expandedSessions, setExpandedSessions] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  // modalAction va indiquer l’action globale en cours ("deletePseudo" ou "modifyEntry" ou "purgeRanking")
  const [modalAction, setModalAction] = useState('');
  // modalStep gère la progression dans le modal
  const [modalStep, setModalStep] = useState('initial'); // 'initial', 'selectPseudo', 'selectEntry', 'inputNewScore', 'confirm'
  const [modalData, setModalData] = useState({});
  const [rankingList, setRankingList] = useState([]);

  // Fonction pour charger la liste globale (endpoint /api/ranking à créer côté backend)
  const fetchRanking = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/ranking?raw=true`, {
        headers: { Authorization: `Bearer ${APP_SECRET}` }
      });
      // Ici, on s'attend à recevoir directement la liste d'entrées détaillées
      setRankingList(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleRejoin = (roomCode) => {
    navigate(`/admin-room?roomCode=${roomCode}&forceOwnership=true`);
  };

  const openCloseRoomModal = (roomCode) => {
    setModalAction('closeRoom');
    setModalStep('confirm');
    setModalData({ roomCode });
    setModalOpen(true);
  };

  const handleCloseRoom = async (roomCode) => {
    try {
      const res = await axios.post(`${BACKEND_URL}/api/admin/closeRoom`, { roomCode }, {
        headers: { Authorization: `Bearer ${APP_SECRET}` }
      });
      if (res.data.success) {
        alert(`Salle ${roomCode} fermée.`);
        await fetchSessions();
      } else {
        alert(res.data.error);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleSessionDetails = (roomCode) => {
    setExpandedSessions(prevState => ({
      ...prevState,
      [roomCode]: !prevState[roomCode]
    }));
  };

  // Ouvrir le modal en définissant l'action et réinitialiser l'étape
  const openModal = (action) => {
    setModalAction(action);
    setModalStep('selectPseudo'); // étape de sélection du pseudo pour delete et modify
    setModalData({});
    setModalOpen(true);
    // Charger la liste du classement
    fetchRanking();
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalAction('');
    setModalStep('initial');
    setModalData({});
  };

  // Valider l'étape de sélection du pseudo
  const handlePseudoSelect = () => {
    if (modalData.pseudo) {
      if (modalAction === 'deletePseudo') {
        // Passage à l'étape de confirmation pour la suppression
        setModalStep('confirm');
      } else if (modalAction === 'modifyEntry') {
        // Filtrer les entrées correspondant au pseudo sélectionné
        const entries = rankingList.filter(entry => entry.pseudo === modalData.pseudo);
        if (entries.length === 0) {
          alert("Aucune entrée trouvée pour ce pseudo.");
          return;
        }
        setModalData(prev => ({ ...prev, entries }));
        setModalStep('selectEntry');
      }
    } else {
      alert("Veuillez sélectionner un pseudo.");
    }
  };

  // Valider la sélection d'une entrée dans le cas de la modification
  const handleEntrySelect = (entryIndex) => {
    setModalData(prev => ({ ...prev, entryIndex }));
    // Proposer de modifier ou supprimer cette entrée
    setModalStep('inputNewScore'); // affichera un champ pour modifier (laisser vide pour supprimer)
  };

  // Valider la saisie d'un nouveau score et passer à la confirmation
  const handleNewScoreSubmit = () => {
    // modalData contient pseudo, entries et entryIndex
    setModalStep('confirm');
  };

  // Confirmer l'action dans le modal
  const confirmAction = async () => {
    switch(modalAction) {
      case 'deletePseudo':
        try {
          const res = await axios.post(`${BACKEND_URL}/api/ranking/deletePseudo`, 
            { pseudo: modalData.pseudo }, {
            headers: { Authorization: `Bearer ${APP_SECRET}` }
          });
          if(res.data.success) {
            // Ici, on passe directement à l'étape résultat
            setModalStep('result');
            setModalData({ message: `Pseudo "${modalData.pseudo}" supprimé avec toutes ses entrées.` });
          } else {
            setModalStep('result');
            setModalData({ message: res.data.error });
          }
        } catch(err) {
          console.error(err);
        }
        break;

      case 'modifyEntry':
        try {
          // Si inputNewScore est vide, on considère que c'est une suppression de l'entrée choisie
          const payload = { 
            pseudo: modalData.pseudo, 
            entryIndex: modalData.entryIndex, 
            score: modalData.newScore 
          };
          const res = await axios.post(`${BACKEND_URL}/api/ranking/modifyEntry`, payload, {
            headers: { Authorization: `Bearer ${APP_SECRET}` }
          });
          if(res.data.success) {
            setModalStep('result');
            setModalData({ message: `Entrée pour "${modalData.pseudo}" modifiée avec succès.` });
          } else {
            setModalStep('result');
            setModalData({ message: res.data.error });
          }
        } catch(err) {
          console.error(err);
        }
        break;

      case 'purgeRanking':
        try {
          const res = await axios.post(`${BACKEND_URL}/api/ranking/purge`, {}, {
            headers: { Authorization: `Bearer ${APP_SECRET}` }
          });
          if(res.data.success) {
            setModalStep('result');
            setModalData({ message: `Le classement a été purgé.` });
          } else {
            setModalStep('result');
            setModalData({ message: res.data.error });
          }
        } catch(err) {
          console.error(err);
        }
        break;

      case 'closeRoom':
        try {
          const res = await axios.post(`${BACKEND_URL}/api/admin/closeRoom`, { roomCode: modalData.roomCode }, {
            headers: { Authorization: `Bearer ${APP_SECRET}` }
          });
          if (res.data.success) {
            // On renvoie les statuts en format objet pour la modale finale
            setModalStep('result');
            setModalData({ 
              roomClosed: true,
              dataSaved: true,
              roomCode: modalData.roomCode
            });
            await fetchSessions();
          } else {
            setModalStep('result');
            setModalData({ 
              roomClosed: false,
              dataSaved: false,
              roomCode: modalData.roomCode
            });
          }
        } catch(err) {
          console.error(err);
          setModalStep('result');
          setModalData({ 
            roomClosed: false,
            dataSaved: false,
            roomCode: modalData.roomCode
          });
        }
        break;

      default:
        break;
    }
  };

  return (
    <div className={`container ${isDarkMode ? 'dark-mode' : ''}`}>
      <h2>Panneau d'administration</h2>
      <h3>Sessions en cours :</h3>
      {Object.keys(sessions).length === 0 ? (
        <p>Aucune session active</p>
      ) : (
        <ul className="list-group">
          {Object.entries(sessions).map(([roomCode, roomData]) => (
            <li key={roomCode} className="list-group-item">
              <strong>Salle : {roomCode}</strong>
              <div className="mt-2">
                <button
                  className="btn btn-primary me-2"
                  onClick={() => handleRejoin(roomCode)}
                >
                  Rejoindre en tant qu'admin
                </button>
                <button
                  className="btn btn-danger me-2"
                  onClick={() => openCloseRoomModal(roomCode)}
                >
                  Fermer la salle
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => toggleSessionDetails(roomCode)}
                >
                  {expandedSessions[roomCode] ? 'Masquer les détails' : 'Afficher les détails'}
                </button>
              </div>
              {expandedSessions[roomCode] && (
                <div className="mt-2 ranking-scroll">
                  <p><strong>État de la salle :</strong> {roomData.paused ? 'En pause' : 'Active'}</p>
                  <h4>Joueurs :</h4>
                  <table className="table table-striped table-hover">
                    <thead>
                      <tr>
                        <th>Pseudo</th>
                        <th>Score</th>
                        <th>Buzzé</th>
                        <th>Déconnecté</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(roomData.players)
                        .filter(([playerId, playerData]) => playerData.pseudo !== 'Admin')
                        .map(([playerId, playerData]) => (
                          <tr key={playerId}>
                            <td>{playerData.pseudo}</td>
                            <td>{playerData.score}</td>
                            <td>{playerData.buzzed ? 'Oui' : 'Non'}</td>
                            <td>{playerData.disconnected ? 'Oui' : 'Non'}</td>
                          </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <hr style={{ borderTop: '1px solid gray' }} />
      {/* Section de gestion du classement Redis */}
      <div className="ranking-management mt-4">
        <h3>Gestion du classement</h3>
        <h6 className="text-danger">🚨 Toute action est irréversible.</h6>
        <button 
          className="btn btn-warning me-2" 
          onClick={() => openModal('deletePseudo')}
        >
          Supprimer un pseudo
        </button>
        <button 
          className="btn btn-info me-2"  
          onClick={() => openModal('modifyEntry')}
        >
          Modifier/Supprimer une entrée
        </button>
        <button 
          className="btn btn-danger" 
          onClick={() => {
            setModalAction('purgeRanking');
            setModalStep('confirm');
            setModalData({});
            setModalOpen(true);
          }}
        >
          Purge du classement
        </button>
      </div>

      {/* Affichage multi-étapes du modal */}
      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            {modalStep === 'selectPseudo' && (
              <>
                <h4>Choisissez un pseudo</h4>
                <select 
                  onChange={(e) => setModalData(prev => ({ ...prev, pseudo: e.target.value }))}
                  defaultValue=""
                >
                  <option value="" disabled>-- Sélectionnez --</option>
                  {/* On déduit la liste des pseudos uniques du ranking */}
                  {[...new Set(rankingList.map(item => item.pseudo))].map(pseudo => (
                    <option key={pseudo} value={pseudo}>{pseudo}</option>
                  ))}
                </select>
                <div className="modal-buttons">
                  <button className="btn btn-success me-2" onClick={handlePseudoSelect}>
                    Suivant
                  </button>
                  <button className="btn btn-secondary" onClick={closeModal}>
                    Annuler
                  </button>
                </div>
              </>
            )}

            {modalStep === 'selectEntry' && (
              <>
                <h4>Choisissez une entrée pour "{modalData.pseudo}"</h4>
                <select 
                  onChange={(e) => handleEntrySelect(Number(e.target.value))}
                  defaultValue=""
                >
                  <option value="" disabled>-- Sélectionnez une entrée --</option>
                  {modalData.entries.map((entry, index) => (
                    <option key={index} value={index}>
                      Score : {entry.score} - Timestamp : {entry.timestamp}
                    </option>
                  ))}
                </select>
                <div className="modal-buttons">
                  <button className="btn btn-secondary me-2" onClick={closeModal}>
                    Annuler
                  </button>
                </div>
              </>
            )}

            {modalStep === 'inputNewScore' && (
              <>
                <h4>Modifier ou supprimer l'entrée</h4>
                <p>
                  Pour supprimer cette entrée, laissez le champ vide.
                </p>
                <input 
                  type="text" 
                  placeholder="Entrez le nouveau score" 
                  onChange={(e) => setModalData(prev => ({ ...prev, newScore: e.target.value }))}
                />
                <div className="modal-buttons">
                  <button className="btn btn-success me-2" onClick={handleNewScoreSubmit}>
                    Suivant
                  </button>
                  <button className="btn btn-secondary" onClick={closeModal}>
                    Annuler
                  </button>
                </div>
              </>
            )}
            
            {modalStep === 'confirm' && (
              <>
                <h4>Confirmation requise</h4>
                <p>
                  {modalAction === 'deletePseudo' && 
                    `Êtes-vous sûr de vouloir supprimer le pseudo "${modalData.pseudo}" et toutes ses entrées ?`}
                  {modalAction === 'modifyEntry' && 
                    <>
                      {modalData.newScore !== undefined
                        ? `Confirmez-vous la modification de l'entrée pour "${modalData.pseudo}" avec le nouveau score : ${modalData.newScore || '[Suppression]'} ?`
                        : `Confirmez-vous la suppression de l'entrée pour "${modalData.pseudo}" ?`
                      }
                    </>}
                  {modalAction === 'purgeRanking' &&
                    "Êtes-vous sûr de vouloir purger l'intégralité du classement ?"
                  }
                  {modalAction === 'closeRoom' &&
                    `Êtes-vous sûr de vouloir fermer la salle "${modalData.roomCode}" ?`
                  }
                </p>
                <div className="modal-buttons">
                  <button className="btn btn-success me-2" onClick={confirmAction}>
                    Confirmer
                  </button>
                  <button className="btn btn-secondary" onClick={closeModal}>
                    Annuler
                  </button>
                </div>
              </>
            )}

            {modalStep === 'result' && (
              <>
                {modalAction === 'closeRoom' ? (
                  <>
                    <h4>Salle fermée</h4>
                    <p>Status de fermeture : {modalData.roomClosed ? '✔️ Salle fermée' : '❌ Salle non fermée'}</p>
                    <p>Status de sauvegarde : {modalData.dataSaved ? '✔️ Données sauvegardées' : '❌ Échec de la sauvegarde'}</p>
                  </>
                ) : (
                  <>
                    <h4>Opération effectuée</h4>
                    <p>{modalData.message}</p>
                  </>
                )}
                <div className="modal-buttons">
                  <button className="btn btn-success" onClick={closeModal}>
                    OK
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPanel;
