// src/components/AdminPanel.js
import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { ThemeContext } from '../../../contexts/ThemeContext';
import { AdminAuthContext } from '../../../contexts/AdminAuthContext';
import * as Tabs from '@radix-ui/react-tabs';
import * as Dialog from '@radix-ui/react-dialog';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import './AdminPanel.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const APP_SECRET = import.meta.env.VITE_APP_SECRET;

function AdminPanel() {
  const [sessions, setSessions] = useState({});
  const navigate = useNavigate();
  const { isDarkMode } = useContext(ThemeContext); 
  const { isFullAdmin } = useContext(AdminAuthContext);

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
        headers: { Authorization: `Bearer ${APP_SECRET}` }
      });
      setSessions(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className={`admin-panel-container ${isDarkMode ? 'dark-mode' : ''}`}>
      <AdminPanelContent 
        sessions={sessions} 
        fetchSessions={fetchSessions}
        isFullAdmin={isFullAdmin}
      />
    </div>
  );
}

function AdminPanelContent({ sessions, fetchSessions, isFullAdmin }) {
  // Récupérer directement du contexte si nécessaire
  const navigate = useNavigate();
  const [expandedSessions, setExpandedSessions] = useState({});
  const [rankingList, setRankingList] = useState([]);
  
  // États pour les dialogs Radix UI
  const [selectedPseudo, setSelectedPseudo] = useState("");
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [newScore, setNewScore] = useState("");
  const [modalAction, setModalAction] = useState("");
  const [operationResult, setOperationResult] = useState(null);
  const [selectedRoomCode, setSelectedRoomCode] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [modifyDialogOpen, setModifyDialogOpen] = useState(false);

  // Fetch ranking data
  const fetchRanking = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/ranking?raw=true`, {
        headers: { Authorization: `Bearer ${APP_SECRET}` }
      });
      setRankingList(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    // Charger les données du classement au démarrage
    fetchRanking();
  }, []);

  const handleRejoin = (roomCode) => {
    navigate(`/admin-room?roomCode=${roomCode}&forceOwnership=true`);
  };

  const toggleSessionDetails = (roomCode) => {
    setExpandedSessions(prev => ({
      ...prev,
      [roomCode]: !prev[roomCode]
    }));
  };

  // Actions de gestion du classement
  const handleDeletePseudo = async () => {
    try {
      const res = await axios.post(`${BACKEND_URL}/api/ranking/deletePseudo`, 
        { pseudo: selectedPseudo }, {
        headers: { Authorization: `Bearer ${APP_SECRET}` }
      });
      
      // Afficher le résultat
      setOperationResult({
        success: res.data.success,
        message: res.data.success 
          ? `Pseudo "${selectedPseudo}" supprimé avec toutes ses entrées.` 
          : res.data.error
      });
      
      // Pas besoin de fermer manuellement le dialogue parent
      // Cela sera géré par onOpenChange dans le dialogue de résultat
    } catch (err) {
      console.error(err);
      setOperationResult({
        success: false,
        message: "Une erreur est survenue lors de la suppression."
      });
    }
  };

  const handleModifyEntry = async () => {
    try {
      const payload = { 
        pseudo: selectedPseudo, 
        entryIndex: selectedEntry, 
        score: newScore 
      };
      
      const res = await axios.post(`${BACKEND_URL}/api/ranking/modifyEntry`, payload, {
        headers: { Authorization: `Bearer ${APP_SECRET}` }
      });
      
      // Afficher le résultat
      setOperationResult({
        success: res.data.success,
        message: res.data.success 
          ? `Entrée pour "${selectedPseudo}" modifiée avec succès.` 
          : res.data.error
      });
      
      // Pas besoin de fermer manuellement le dialogue parent
      // Cela sera géré par onOpenChange dans le dialogue de résultat
    } catch (err) {
      console.error(err);
      setOperationResult({
        success: false,
        message: "Une erreur est survenue lors de la modification."
      });
    }
  };

  const handlePurgeRanking = async () => {
    try {
      const res = await axios.post(`${BACKEND_URL}/api/ranking/purge`, {}, {
        headers: { Authorization: `Bearer ${APP_SECRET}` }
      });
      
      setOperationResult({
        success: res.data.success,
        message: res.data.success 
          ? "Le classement a été purgé." 
          : res.data.error
      });
    } catch (err) {
      console.error(err);
      setOperationResult({
        success: false,
        message: "Une erreur est survenue lors de la purge."
      });
    }
  };

  const handleCloseRoom = async (roomCodeToClose) => {
    const roomCode = roomCodeToClose || selectedRoomCode;
    try {
      // NOUVEAU : Récupérer l'option saveRoom de la session avant fermeture
      const session = sessions[roomCode];
      const saveRequested = session?.options?.saveRoom ?? true; // Par défaut true si inconnu
      
      const res = await axios.post(`${BACKEND_URL}/api/admin/closeRoom`, 
        { roomCode: roomCode }, {
        headers: { Authorization: `Bearer ${APP_SECRET}` }
      });
      
      setOperationResult({
        success: res.data.success,
        roomClosed: res.data.success,
        dataSaved: res.data.dataSaved,
        saveRequested: saveRequested, // AJOUTER l'intention
        roomCode: roomCode
      });
      
      if (res.data.success) {
        await fetchSessions();
      }
    } catch (err) {
      console.error(err);
      setOperationResult({
        success: false,
        roomClosed: false,
        dataSaved: false,
        saveRequested: true, // Par défaut, on suppose que l'intention était de sauvegarder
        roomCode: roomCode
      });
    }
  };

  // Fonction pour gérer la fermeture du dialogue de résultat
  const handleResultDialogClose = () => {
    // Nettoyer les états
    setOperationResult(null);
    
    // Fermer les dialogues parents selon l'action
    if (operationResult && operationResult.success) {
      fetchRanking();
      if (modalAction === 'closeRoom') {
        fetchSessions();
      }
      
      // Fermer les dialogues APRÈS confirmation
      if (modalAction === 'deletePseudo') {
        setDeleteDialogOpen(false);
      } else if (modalAction === 'modifyEntry') {
        setModifyDialogOpen(false);
      }
    }
    
    // Réinitialiser les états
    setSelectedPseudo("");
    setSelectedEntry(null);
    setNewScore("");
    setModalAction("");
  };

  // Préparer les données pour un Dialog
  const openDeletePseudoDialog = () => {
    setModalAction("deletePseudo");
    fetchRanking();
  };

  const openModifyEntryDialog = () => {
    setModalAction("modifyEntry");
    fetchRanking();
  };

  const openCloseRoomDialog = (roomCode) => {
    setSelectedRoomCode(roomCode);
    setModalAction("closeRoom");
  };

  // Ajouter cette fonction pour exporter le classement
  const exportRanking = () => {
    // Vérifier si des données sont disponibles
    if (rankingList.length === 0) {
      fetchRanking();
      setTimeout(() => performExport(), 500); // Tentative après court délai
      return;
    }
    
    performExport();
  };

  const performExport = () => {
    try {
      // Convertir les données en CSV
      const csvContent = "data:text/csv;charset=utf-8," + 
        "Pseudo,Score,Date\n" + 
        rankingList.map(item => 
          `"${item.pseudo}",${item.score},"${item.timestamp || ''}"`
        ).join("\n");
      
      // Créer un lien de téléchargement
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `ranking_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      
      // Déclencher le téléchargement
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Échec de l'exportation", error);
      setOperationResult({
        success: false,
        message: "Une erreur est survenue lors de l'exportation des données."
      });
    }
  };

  return (
    <div className="admin-panel-content">
      <h1 className="panel-title">Panneau d'administration</h1>
      
      <Tabs.Root defaultValue="sessions" className="admin-tabs">
        <Tabs.List className="tabs-list" aria-label="Gérer votre espace administrateur">
          <Tabs.Trigger className="tab-trigger" value="sessions">Sessions en cours</Tabs.Trigger>
          {isFullAdmin && isFullAdmin() && (
            <Tabs.Trigger className="tab-trigger" value="ranking">Gestion du classement</Tabs.Trigger>
          )}
        </Tabs.List>
        
        <Tabs.Content className="tab-content" value="sessions">
          {Object.keys(sessions).length === 0 ? (
            <div className="empty-state">
              <p>Aucune session active</p>
              <div className="empty-state-icon">🔍</div>
            </div>
          ) : (
            <ul className="session-list">
              {Object.entries(sessions).map(([roomCode, roomData]) => (
                <li key={roomCode} className="session-item">
                  <div className="session-header">
                    <h3 
                      className="room-code room-code--clickable" 
                      onClick={() => navigate(`/room/${roomCode}/analytics`)}
                      title="Cliquer pour voir les analytics"
                    >
                      Salle : {roomCode} 📊
                    </h3>
                    <div className="session-actions">
                      <button
                        className="btn btn-primary"
                        onClick={() => handleRejoin(roomCode)}
                      >
                        <span className="btn-icon">👑</span>
                        Rejoindre
                      </button>
                      
                      {isFullAdmin && isFullAdmin() && (
                        <AlertDialog.Root>
                          <AlertDialog.Trigger asChild>
                            <button className="btn btn-danger">
                              <span className="btn-icon">🔒</span>
                              Fermer
                            </button>
                          </AlertDialog.Trigger>
                          <AlertDialog.Portal>
                            <AlertDialog.Overlay className="alert-overlay" />
                            <AlertDialog.Content className="alert-content">
                              <AlertDialog.Title className="alert-title">
                                Fermeture de salle
                              </AlertDialog.Title>
                              <AlertDialog.Description className="alert-description">
                                Êtes-vous sûr de vouloir fermer la salle "{roomCode}" ?
                                Cette action est irréversible.
                              </AlertDialog.Description>
                              <div className="alert-buttons">
                                <AlertDialog.Cancel asChild>
                                  <button className="btn btn-secondary">Annuler</button>
                                </AlertDialog.Cancel>
                                <AlertDialog.Action asChild>
                                  <button
                                    className="btn btn-danger"
                                    onClick={() => {
                                      setSelectedRoomCode(roomCode);
                                      handleCloseRoom(roomCode);
                                    }}
                                  >
                                    Fermer la salle
                                  </button>
                                </AlertDialog.Action>
                              </div>
                            </AlertDialog.Content>
                          </AlertDialog.Portal>
                        </AlertDialog.Root>
                      )}
                      
                      <button
                        className="btn btn-secondary"
                        onClick={() => toggleSessionDetails(roomCode)}
                      >
                        {expandedSessions[roomCode] ? 'Masquer' : 'Détails'}
                      </button>
                    </div>
                  </div>
                  
                  {expandedSessions[roomCode] && (
                    <div className="session-details">
                      <div className="session-status">
                        <span className={`status-indicator ${roomData.paused ? 'paused' : 'active'}`}></span>
                        <span>État de la salle : {roomData.paused ? 'En pause' : 'Active'}</span>
                      </div>
                      
                      <h4>Joueurs connectés</h4>
                      <div className="players-table-container">
                        <table className="players-table">
                          <thead>
                            <tr>
                              <th>Pseudo</th>
                              <th>Score</th>
                              <th>Buzzé</th>
                              <th>État</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(roomData.players)
                              .filter(([playerId, playerData]) => playerData.pseudo !== 'Admin')
                              .map(([playerId, playerData]) => (
                                <tr key={playerId}>
                                  <td>{playerData.pseudo}</td>
                                  <td>{playerData.score}</td>
                                  <td>
                                    <span className={`buzz-indicator ${playerData.buzzed ? 'active' : 'inactive'}`}>
                                      {playerData.buzzed ? '🔔' : '—'}
                                    </span>
                                  </td>
                                  <td>
                                    <span className={`connection-status ${playerData.disconnected ? 'disconnected' : 'connected'}`}>
                                      {playerData.disconnected ? 'Déconnecté' : 'Connecté'}
                                    </span>
                                  </td>
                                </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Tabs.Content>
        
        {isFullAdmin && isFullAdmin() && (
          <Tabs.Content className="tab-content" value="ranking">
            <div className="ranking-management">
            <div className="warning-notice">
              <span className="warning-icon">⚠️</span>
              <span>Ces actions sont irréversibles et affectent le classement global.</span>
            </div>
            
            <div className="ranking-actions">
              <Tooltip.Provider delayDuration={300}>
                <div className="actions-group">
                  <div className="actions-category">
                    <h3 className="actions-title">Actions courantes</h3>
                    <div className="actions-buttons">
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <button 
                            className="btn btn-action btn-edit"
                            onClick={() => {
                              fetchRanking();
                              setModalAction("modifyEntry"); // Définir l'action ici aussi
                              setModifyDialogOpen(true);
                            }}
                          >
                            <span className="btn-icon">✏️</span>
                            <span className="btn-text">Modifier une entrée</span>
                          </button>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content className="tooltip-content" side="bottom">
                            <p>Modifier le score d'une entrée spécifique</p>
                            <Tooltip.Arrow className="tooltip-arrow" />
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                      
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <button 
                            className="btn btn-action btn-delete"
                            onClick={() => {
                              fetchRanking();
                              setModalAction("deletePseudo"); // Définir l'action ici aussi
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <span className="btn-icon">🗑️</span>
                            <span className="btn-text">Supprimer un pseudo</span>
                          </button>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content className="tooltip-content" side="bottom">
                            <p>Supprimer toutes les entrées associées à un pseudo</p>
                            <Tooltip.Arrow className="tooltip-arrow" />
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    </div>
                  </div>
                  
                  <div className="actions-category danger-category">
                    <h3 className="actions-title">Actions avancées</h3>
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button className="btn btn-action btn-advanced">
                          <span className="btn-icon">⚙️</span>
                          <span className="btn-text">Actions administratives</span>
                          <span className="dropdown-indicator">▼</span>
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content className="dropdown-content" sideOffset={5}>
                          <DropdownMenu.Item className="dropdown-item warning-item" onSelect={() => exportRanking()}>
                            <span className="item-icon">📊</span>
                            <span>Exporter les données</span>
                          </DropdownMenu.Item>
                          
                          <DropdownMenu.Separator className="dropdown-separator" />
                          
                          <DropdownMenu.Item className="dropdown-item danger-item" 
                            onSelect={() => {
                              setModalAction("purgeRanking"); // Ajouter cette action
                              // Afficher le dialogue de purge
                              const purgeButton = document.querySelector('.purge-trigger');
                              if (purgeButton) purgeButton.click();
                            }}
                          >
                            <span className="item-icon">💥</span>
                            <span>Purge du classement</span>
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </div>
                </div>
              </Tooltip.Provider>
              
              {/* Bouton caché pour déclencher la purge */}
              <AlertDialog.Root>
                <AlertDialog.Trigger asChild>
                  <button className="hidden purge-trigger">Purge</button>
                </AlertDialog.Trigger>
                <AlertDialog.Portal>
                  <AlertDialog.Overlay className="alert-overlay" />
                  <AlertDialog.Content className="alert-content danger-alert">
                    <AlertDialog.Title className="alert-title danger-title">
                      <span className="alert-icon">⚠️</span>
                      Purge du classement
                    </AlertDialog.Title>
                    <AlertDialog.Description className="alert-description">
                      Vous êtes sur le point de supprimer <strong>toutes les données</strong> du classement.
                      <br /><br />
                      Cette action est <strong>irréversible</strong> et ne peut pas être annulée.
                      <br /><br />
                      Êtes-vous absolument certain de vouloir continuer ?
                    </AlertDialog.Description>
                    <div className="alert-buttons">
                      <AlertDialog.Cancel asChild>
                        <button className="btn btn-secondary">Annuler</button>
                      </AlertDialog.Cancel>
                      <AlertDialog.Action asChild>
                        <button 
                          className="btn btn-danger confirm-purge"
                          onClick={handlePurgeRanking}
                        >
                          Confirmer la purge
                        </button>
                      </AlertDialog.Action>
                    </div>
                  </AlertDialog.Content>
                </AlertDialog.Portal>
              </AlertDialog.Root>
              
              {/* Dialogue pour supprimer un pseudo */}
              <Dialog.Root 
                open={deleteDialogOpen}
                onOpenChange={(open) => {
                  setDeleteDialogOpen(open);
                  if (open) {
                    setModalAction("deletePseudo");
                    fetchRanking();
                  }
                }}
              >
                <Dialog.Portal>
                  <Dialog.Overlay className="dialog-overlay" />
                  <Dialog.Content className="dialog-content">
                    <Dialog.Title className="dialog-title">Supprimer un pseudo</Dialog.Title>
                    <Dialog.Description className="dialog-description">
                      Choisissez le pseudo à supprimer. Cette action supprimera toutes les entrées associées à ce pseudo.
                    </Dialog.Description>
                    
                    <div className="form-field">
                      <label htmlFor="pseudo-select" className="field-label">Pseudo</label>
                      <select 
                        id="pseudo-select"
                        className="field-select"
                        value={selectedPseudo}
                        onChange={(e) => setSelectedPseudo(e.target.value)}
                      >
                        <option value="" disabled>-- Sélectionnez --</option>
                        {[...new Set(rankingList.map(item => item.pseudo))].map(pseudo => (
                          <option key={pseudo} value={pseudo}>{pseudo}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="dialog-buttons">
                      <Dialog.Close asChild>
                        <button className="btn btn-secondary">Annuler</button>
                      </Dialog.Close>
                      <AlertDialog.Root>
                        <AlertDialog.Trigger asChild>
                          <button 
                            className="btn btn-danger"
                            disabled={!selectedPseudo}
                          >
                            Supprimer
                          </button>
                        </AlertDialog.Trigger>
                        <AlertDialog.Portal>
                          <AlertDialog.Overlay className="alert-overlay" />
                          <AlertDialog.Content className="alert-content">
                            <AlertDialog.Title className="alert-title">
                              Confirmation de suppression
                            </AlertDialog.Title>
                            <AlertDialog.Description className="alert-description">
                              Êtes-vous sûr de vouloir supprimer le pseudo "{selectedPseudo}" et toutes ses entrées ?
                            </AlertDialog.Description>
                            <div className="alert-buttons">
                              <AlertDialog.Cancel asChild>
                                <button className="btn btn-secondary">Annuler</button>
                              </AlertDialog.Cancel>
                              <AlertDialog.Action asChild>
                                <button 
                                  className="btn btn-danger"
                                  onClick={handleDeletePseudo}
                                >
                                  Confirmer
                                </button>
                              </AlertDialog.Action>
                            </div>
                          </AlertDialog.Content>
                        </AlertDialog.Portal>
                      </AlertDialog.Root>
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>

              {/* Dialogue pour modifier une entrée */}
              <Dialog.Root 
                open={modifyDialogOpen}
                onOpenChange={(open) => {
                  setModifyDialogOpen(open);
                  if (open) openModifyEntryDialog();
                }}
              >
                <Dialog.Portal>
                  <Dialog.Overlay className="dialog-overlay" />
                  <Dialog.Content className="dialog-content">
                    <Dialog.Title className="dialog-title">Modifier une entrée</Dialog.Title>
                    <Dialog.Description className="dialog-description">
                      Choisissez le pseudo et l'entrée à modifier. Vous pouvez également supprimer une entrée en laissant le champ de score vide.
                    </Dialog.Description>
                    
                    <div className="form-field">
                      <label htmlFor="pseudo-select" className="field-label">Pseudo</label>
                      <select 
                        id="pseudo-select"
                        className="field-select"
                        value={selectedPseudo}
                        onChange={(e) => setSelectedPseudo(e.target.value)}
                      >
                        <option value="" disabled>-- Sélectionnez --</option>
                        {[...new Set(rankingList.map(item => item.pseudo))].map(pseudo => (
                          <option key={pseudo} value={pseudo}>{pseudo}</option>
                        ))}
                      </select>
                    </div>
                    
                    {selectedPseudo && (
                      <>
                        <div className="form-field">
                          <label htmlFor="entry-select" className="field-label">Entrée</label>
                          <select 
                            id="entry-select"
                            className="field-select"
                            value={selectedEntry === null ? "" : selectedEntry}
                            onChange={(e) => setSelectedEntry(Number(e.target.value))}
                          >
                            <option value="" disabled>-- Sélectionnez une entrée --</option>
                            {rankingList
                              .filter(entry => entry.pseudo === selectedPseudo)
                              .map((entry, index) => (
                                <option key={index} value={index}>
                                  Score : {entry.score} - {entry.timestamp || "Date Inconnue"}
                                </option>
                            ))}
                          </select>
                        </div>
                        
                        {selectedEntry !== null && (
                          <div className="form-field">
                            <label htmlFor="score-input" className="field-label">
                              Nouveau score (laisser vide pour supprimer)
                            </label>
                            <input 
                              id="score-input"
                              type="text" 
                              className="field-input"
                              placeholder="Entrez le nouveau score" 
                              value={newScore}
                              onChange={(e) => setNewScore(e.target.value)}
                            />
                          </div>
                        )}
                      </>
                    )}
                    
                    <div className="dialog-buttons">
                      <Dialog.Close asChild>
                        <button className="btn btn-secondary">Annuler</button>
                      </Dialog.Close>
                      {selectedEntry !== null && (
                        <AlertDialog.Root>
                          <AlertDialog.Trigger asChild>
                            <button className="btn btn-primary">
                              {newScore === "" ? "Supprimer" : "Modifier"}
                            </button>
                          </AlertDialog.Trigger>
                          <AlertDialog.Portal>
                            <AlertDialog.Overlay className="alert-overlay" />
                            <AlertDialog.Content className="alert-content">
                              <AlertDialog.Title className="alert-title">
                                Confirmation
                              </AlertDialog.Title>
                              <AlertDialog.Description className="dialog-description">
                                {newScore === "" 
                                  ? `Êtes-vous sûr de vouloir supprimer l'entrée pour "${selectedPseudo}" ?`
                                  : `Confirmez-vous la modification de l'entrée pour "${selectedPseudo}" avec le nouveau score : ${newScore} ?`
                                }
                              </AlertDialog.Description>
                              <div className="alert-buttons">
                                <AlertDialog.Cancel asChild>
                                  <button className="btn btn-secondary">Annuler</button>
                                </AlertDialog.Cancel>
                                <AlertDialog.Action asChild>
                                  <button 
                                    className="btn btn-primary"
                                    onClick={handleModifyEntry}
                                  >
                                    Confirmer
                                  </button>
                                </AlertDialog.Action>
                              </div>
                            </AlertDialog.Content>
                          </AlertDialog.Portal>
                        </AlertDialog.Root>
                      )}
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </div>
          </div>
        </Tabs.Content>
        )}
      </Tabs.Root>
      
      {/* Dialog pour afficher les résultats d'opération */}
      {operationResult && (
        <Dialog.Root 
          open={!!operationResult} 
          onOpenChange={(open) => {
            if (!open) {
              handleResultDialogClose();
            }
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="dialog-content result-dialog">
              <Dialog.Title className="dialog-title">
                {operationResult.success ? "Opération réussie" : "Échec de l'opération"}
              </Dialog.Title>
              
              {modalAction === 'closeRoom' ? (
                <div className="result-details">
                  <p className={`result-status ${operationResult.roomClosed ? 'success' : 'error'}`}>
                    {operationResult.roomClosed ? '✅ Salle fermée' : '❌ Échec de fermeture'}
                  </p>
                  <p className={`result-status ${operationResult.dataSaved ? 'success' : 'error'}`}>
                    {operationResult.dataSaved ? '✅ Données sauvegardées' : '❌ Échec de sauvegarde'}
                  </p>
                </div>
              ) : (
                <Dialog.Description className="dialog-description">
                  {operationResult.message}
                </Dialog.Description>
              )}
              
              <div className="dialog-buttons">
                <Dialog.Close asChild>
                  <button className="btn btn-primary">OK</button>
                </Dialog.Close>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </div>
  );
}

export default AdminPanel;
