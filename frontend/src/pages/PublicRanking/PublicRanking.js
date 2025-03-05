// javascript
import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { ThemeContext } from '../../contexts/ThemeContext';
import './PublicRanking.css';
import RankingTable from '../../components/shared/RankingTable';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function PublicRanking() {
  const { isDarkMode } = useContext(ThemeContext);
  const [globalRanking, setGlobalRanking] = useState([]);
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const entriesPerPage = 10;

  const fetchGlobalRanking = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/ranking`);
      setGlobalRanking(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchGlobalRanking();
  }, []);

  const handleFilterRanking = async (e) => {
    e.preventDefault();
    try {
      const params = {};
      if (filterMonth && filterYear) {
        params.month = filterMonth;
        params.year = filterYear;
      } else if (filterYear) {
        params.year = filterYear;
      } else if (filterFrom && filterTo) {
        params.from = filterFrom;
        params.to = filterTo;
      }
      const res = await axios.get(`${BACKEND_URL}/api/ranking`, { params });
      setCurrentPage(1);
      setGlobalRanking(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetFilters = async () => {
    setFilterMonth('');
    setFilterYear('');
    setFilterFrom('');
    setFilterTo('');
    try {
      const res = await axios.get(`${BACKEND_URL}/api/ranking`);
      setCurrentPage(1);
      setGlobalRanking(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const sortedRanking = [...globalRanking].sort((a, b) => b.score - a.score);
  const totalPages = Math.ceil(sortedRanking.length / entriesPerPage);
  const startIndex = (currentPage - 1) * entriesPerPage;
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className={`container ${isDarkMode ? 'dark-mode' : ''}`}>
      <h2 className="mt-3 text-center">Classement global</h2>
        <h6 className="mt-2 text-center text-info fst-italic">Le classement est là. Mais le vrai challenge... C'est d'y rester ! 😏</h6>

      <button 
        className="btn btn-outline-secondary mb-3"
        onClick={() => setShowFilters(prev => !prev)}
      >
        {showFilters ? 'Masquer les filtres' : 'Afficher les filtres'}
      </button>

      {showFilters && (
        <form onSubmit={handleFilterRanking} className="mb-3">
          <div className="row">
            <div className="col-12 mb-1">
              <small>Filtrage par Mois/Année (année obligatoire)</small>
            </div>
            <div className="col-6 mb-2">
              <input 
                type="text" 
                placeholder="Mois (ex: 07)" 
                className="form-control"
                value={filterMonth}
                onChange={e => setFilterMonth(e.target.value)}
              />
            </div>
            <div className="col-6 mb-2">
              <input 
                type="text" 
                placeholder="Année (ex: 2023)" 
                className="form-control"
                value={filterYear}
                onChange={e => setFilterYear(e.target.value)}
              />
            </div>
          </div>
          <div className="row">
            <div className="col-12 mb-1">
              <small>Par intervalle de dates (de... / à...)</small>
            </div>
            <div className="col-6 mb-2">
              <input 
                type="date"
                className="form-control"
                value={filterFrom}
                onChange={e => setFilterFrom(e.target.value)}
              />
            </div>
            <div className="col-6 mb-2">
              <input 
                type="date" 
                className="form-control"
                value={filterTo}
                onChange={e => setFilterTo(e.target.value)}
              />
            </div>
          </div>
          <div className="d-flex">
            <button type="submit" className="btn btn-primary mt-2 me-2">
              Appliquer les filtres
            </button>
            <button 
              type="button" 
              className="btn btn-outline-secondary mt-2"
              onClick={handleResetFilters}
            >
              ❌
            </button>
          </div>
        </form>
      )}

      <div className="ranking-scroll">
        <RankingTable players={sortedRanking.slice(startIndex, startIndex + entriesPerPage)} />
      </div>
      {totalPages > 1 && (
        <div className="d-flex justify-content-end">
          <nav>
            <ul className="pagination">
              {pageNumbers.map(page => (
                <li key={page} className={`page-item ${page === currentPage ? 'active' : ''}`}>
                  <button className="page-link" onClick={() => setCurrentPage(page)}>
                    {page}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </div>
  );
}

export default PublicRanking;