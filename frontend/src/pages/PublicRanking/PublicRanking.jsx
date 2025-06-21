import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import * as Collapsible from '@radix-ui/react-collapsible';
import * as Tabs from '@radix-ui/react-tabs';
import * as Tooltip from '@radix-ui/react-tooltip';
import { 
  CalendarIcon, 
  ChevronDownIcon, 
  MagnifyingGlassIcon, 
  ClockIcon, 
  ChevronLeftIcon, 
  ChevronRightIcon,
  CaretSortIcon,
  StarFilledIcon,
} from '@radix-ui/react-icons';
import { ThemeContext } from '../../contexts/ThemeContext';
import './PublicRanking.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

function PublicRanking() {
  const { isDarkMode } = useContext(ThemeContext);
  const [globalRanking, setGlobalRanking] = useState([]);
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterType, setFilterType] = useState('monthly');
  const [isLoading, setIsLoading] = useState(true);
  const [totalEntries, setTotalEntries] = useState(0);
  const [uniquePlayers, setUniquePlayers] = useState(0);
  const [statsDate, setStatsDate] = useState('');
  const entriesPerPage = 10;

  // Récupérer le classement global
  const fetchGlobalRanking = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${BACKEND_URL}/api/ranking`);
      
      console.log("Données reçues du backend:", res.data);
      
      // S'assurer que res.data est un tableau
      const rankingData = Array.isArray(res.data) ? res.data : [];
      
      // Examiner la structure du premier élément
      if (rankingData.length > 0) {
        console.log("Premier élément:", rankingData[0]);
      }
      
      setGlobalRanking(rankingData);
      setTotalEntries(rankingData.length);
      
      // Calculer le nombre de joueurs uniques
      const uniquePseudos = new Set(rankingData.map(entry => entry.pseudo));
      setUniquePlayers(uniquePseudos.size);
      
      // Date de statistiques
      setStatsDate(new Date().toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }));
    } catch (err) {
      console.error("Erreur lors du chargement du classement:", err);
      setGlobalRanking([]);
      setTotalEntries(0);
      setUniquePlayers(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGlobalRanking();
  }, []);

  // Gérer le filtrage du classement
const handleFilterRanking = async (e) => {
  e.preventDefault();
  setIsLoading(true);
  setCurrentPage(1);
  
  try {
    const params = {};
    
    if (filterType === 'monthly' && filterMonth && filterYear) {
      // Format adéquat pour correspondre au format attendu par le backend
      const monthString = String(filterMonth).padStart(2, '0');
      const yearString = String(filterYear);
      params.month = monthString;
      params.year = yearString;
    } else if (filterType === 'dateRange' && filterFrom && filterTo) {
      // Format ISO pour les dates: YYYY-MM-DD
      // Ce format est directement fourni par l'input type="date"
      params.from = filterFrom;  // déjà au format YYYY-MM-DD
      params.to = filterTo;      // déjà au format YYYY-MM-DD
      
    }
    
    const res = await axios.get(`${BACKEND_URL}/api/ranking`, { params });
    
    // Vérifier si res.data est un tableau
    const rankingData = Array.isArray(res.data) ? res.data : [];
    
    setGlobalRanking(rankingData);
    
    // Mettre à jour les stats
    setTotalEntries(rankingData.length);
    const uniquePseudos = new Set(rankingData.map(entry => entry.pseudo));
    setUniquePlayers(uniquePseudos.size);
  } catch (err) {
    console.error("Erreur lors du filtrage:", err);
    setGlobalRanking([]);
    setTotalEntries(0);
    setUniquePlayers(0);
  } finally {
    setIsLoading(false);
  }
};

  // Fonction helper pour formater les dates au format attendu par le backend
  const formatDateForBackend = (date) => {
    try {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = String(date.getFullYear()).substring(2); // Prendre seulement les 2 derniers chiffres
      
      const formattedDate = `${day}-${month}-${year}`;
      
      return formattedDate;
    } catch (error) {
      console.error("Erreur de formatage pour backend:", error);
      return "";
    }
  };

  // Réinitialiser les filtres
  const handleResetFilters = () => {
    setFilterMonth('');
    setFilterYear('');
    setFilterFrom('');
    setFilterTo('');
    setFilterType('monthly');
    fetchGlobalRanking();
  };

  // Pagination
  const indexOfLastEntry = currentPage * entriesPerPage;
  const indexOfFirstEntry = indexOfLastEntry - entriesPerPage;
  const currentEntries = globalRanking.slice(indexOfFirstEntry, indexOfLastEntry);
  const totalPages = Math.ceil(globalRanking.length / entriesPerPage);

  const handlePageChange = (pageNumber) => {
    if (pageNumber > 0 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Générer les années pour le dropdown
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  // Remplacer votre fonction formatDate par celle-ci :
const formatDate = (dateString) => {
  // En cas d'absence de date
  if (!dateString) {
    return "Date inconnue";
  }
  
  // Traitement spécifique selon le format
  try {
    // Si la chaîne a le format "JJ-MM-AA"
    if (typeof dateString === 'string' && /^\d{2}-\d{2}-\d{2}$/.test(dateString)) {
      const [day, month, yearShort] = dateString.split('-');
      
      // Table de correspondance des mois en français
      const monthNames = [
        'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
        'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'
      ];
      
      // Calculer le mois (0-indexed)
      const monthIndex = parseInt(month, 10) - 1;
      if (monthIndex < 0 || monthIndex > 11) {
        return dateString; // Retourner la date originale si le mois est invalide
      }
      
      const monthName = monthNames[monthIndex];
      const fullYear = 2000 + parseInt(yearShort, 10); // Ajouter 2000 à l'année à 2 chiffres
      
      return `${parseInt(day, 10)} ${monthName} ${fullYear}`;
    } 
    // Autres formats de date possibles
    else {
      return String(dateString);
    }
  } catch (error) {
    console.error("Erreur de formatage de date:", error);
    return String(dateString); // En cas d'erreur, retourner la chaîne d'origine
  }
};

  return (
    <div className={`ranking-container ${isDarkMode ? 'dark-mode' : ''}`}>
      {/* Header section avec le slogan */}
      <div className="ranking-header-section">
        <h1 className="ranking-title">Classement Général</h1>
        <p className="ranking-quote">
          Le classement est là... Mais le <span className="quote-emphasis">vrai challenge</span>, c'est d'y rester
          <span className="quote-emoji">🏆</span>
        </p>
      </div>
      
      {/* Section de filtres collapsible */}
      <Collapsible.Root 
        open={showFilters} 
        onOpenChange={setShowFilters}
        className="filter-collapsible"
      >
        <div className="filter-trigger-container">
          <Collapsible.Trigger asChild>
            <button className="filter-trigger">
              <span className="filter-icon">
                <MagnifyingGlassIcon />
              </span>
              Filtrer le classement
              <span className={`filter-chevron ${showFilters ? 'open' : ''}`}>
                <ChevronDownIcon />
              </span>
            </button>
          </Collapsible.Trigger>
          
          <div className="ranking-stats">
            <div className="stats-item">
              <CaretSortIcon />
              <span>Entrées: <span className="stats-value">{totalEntries}</span></span>
            </div>
            <div className="stats-item">
              <StarFilledIcon />
              <span>Joueurs: <span className="stats-value">{uniquePlayers}</span></span>
            </div>
            <div className="stats-item">
              <ClockIcon />
              <span>Au {statsDate}</span>
            </div>
          </div>
        </div>
        
        <Collapsible.Content className="filter-content">
          <Tabs.Root 
            defaultValue="monthly" 
            value={filterType}
            onValueChange={setFilterType}
            className="filter-tabs"
          >
            <Tabs.List className="filter-tab-list">
              <Tabs.Trigger value="monthly" className="filter-tab">
                <span className="tab-icon"><CalendarIcon /></span>
                Par mois
              </Tabs.Trigger>
              <Tabs.Trigger value="dateRange" className="filter-tab">
                <span className="tab-icon"><ClockIcon /></span>
                Plage de dates
              </Tabs.Trigger>
            </Tabs.List>
            
            <Tabs.Content value="monthly" className="filter-tab-content">
              <form onSubmit={handleFilterRanking} className="filter-form">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="month-select">Mois</label>
                    <select
                      id="month-select"
                      className="form-select"
                      value={filterMonth}
                      onChange={(e) => setFilterMonth(e.target.value)}
                    >
                      <option value="">-- Sélectionnez --</option>
                      <option value="1">Janvier</option>
                      <option value="2">Février</option>
                      <option value="3">Mars</option>
                      <option value="4">Avril</option>
                      <option value="5">Mai</option>
                      <option value="6">Juin</option>
                      <option value="7">Juillet</option>
                      <option value="8">Août</option>
                      <option value="9">Septembre</option>
                      <option value="10">Octobre</option>
                      <option value="11">Novembre</option>
                      <option value="12">Décembre</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="year-select">Année</label>
                    <select
                      id="year-select"
                      className="form-select"
                      value={filterYear}
                      onChange={(e) => setFilterYear(e.target.value)}
                    >
                      <option value="">-- Sélectionnez --</option>
                      {years.map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div className="form-actions">
                  <button 
                    type="submit" 
                    className="btn-apply"
                    disabled={!filterMonth || !filterYear}
                  >
                    Appliquer
                  </button>
                  <button 
                    type="button" 
                    className="btn-reset"
                    onClick={handleResetFilters}
                  >
                    Réinitialiser
                  </button>
                </div>
              </form>
            </Tabs.Content>
            
            <Tabs.Content value="dateRange" className="filter-tab-content">
              <form onSubmit={handleFilterRanking} className="filter-form">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="date-from">Du</label>
                    <input
                      id="date-from"
                      type="date"
                      className="form-input"
                      value={filterFrom}
                      onChange={(e) => setFilterFrom(e.target.value)}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="date-to">Au</label>
                    <input
                      id="date-to"
                      type="date"
                      className="form-input"
                      value={filterTo}
                      onChange={(e) => setFilterTo(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="form-actions">
                  <button 
                    type="submit" 
                    className="btn-apply"
                    disabled={!filterFrom || !filterTo}
                  >
                    Appliquer
                  </button>
                  <button 
                    type="button" 
                    className="btn-reset"
                    onClick={handleResetFilters}
                  >
                    Réinitialiser
                  </button>
                </div>
              </form>
            </Tabs.Content>
          </Tabs.Root>
        </Collapsible.Content>
      </Collapsible.Root>
      
     
      {/* Affichage du classement */}
      {isLoading ? (
        <div className="ranking-loading">
          <div className="loading-spinner"></div>
          <p>Chargement du classement...</p>
        </div>
      ) : globalRanking.length === 0 ? (
        <div className="empty-ranking">
          <div className="empty-icon">🏅</div>
          <h2>Aucune entrée trouvée</h2>
          <p className="empty-subtitle">
            Aucun résultat ne correspond à votre recherche ou le classement est vide
          </p>
        </div>
      ) : (
        <>
          <div className="ranking-table-container">
            <table className="ranking-table">
              <thead>
                <tr>
                  <th className="rank-column">Rang</th>
                  <th className="pseudo-column">Pseudo</th>
                  <th className="score-column">Score</th>
                </tr>
              </thead>
              <tbody>
                {currentEntries.map((entry, index) => {
                  const actualRank = indexOfFirstEntry + index + 1;
                  let rowClass = '';
                  
                  if (actualRank === 1) rowClass = 'top-1';
                  else if (actualRank === 2) rowClass = 'top-2';
                  else if (actualRank === 3) rowClass = 'top-3';
                  
                  return (
                    <tr key={index} className={`ranking-row ${rowClass}`}>
                      <td>
                        {actualRank <= 3 ? (
                          <div className="rank-medal">
                            {actualRank === 1 ? '🥇' : actualRank === 2 ? '🥈' : '🥉'}
                          </div>
                        ) : (
                          <div className="rank-number">
                            <span className="rank-badge">{actualRank}</span>
                          </div>
                        )}
                      </td>
                      <td>{entry.pseudo}</td>
                      <td>
                        <Tooltip.Provider>
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <span className="score-value">{entry.score}</span>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content className="score-tooltip" side="top">
                                Score obtenu par {entry.pseudo}
                                <Tooltip.Arrow className="tooltip-arrow" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        </Tooltip.Provider>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination-container">
              <button 
                className="pagination-button page-nav-button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeftIcon />
              </button>
              
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                
                return (
                  <button
                    key={i}
                    className={`pagination-button ${currentPage === pageNum ? 'active' : ''}`}
                    onClick={() => handlePageChange(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              })}
              
              <button 
                className="pagination-button page-nav-button"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <ChevronRightIcon />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default PublicRanking;