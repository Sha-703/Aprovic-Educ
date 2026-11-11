import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Inscription from './pages/Inscription.jsx';
import Espace from './pages/Espace.jsx';
import Classes from './pages/Classes.jsx';
import Contenus from './pages/Contenus.jsx';
import MesContenus from './pages/MesContenus.jsx';
import Devoirs from './pages/Devoirs.jsx';
import DevoirsEleve from './pages/DevoirsEleve.jsx';
import Recherche from './pages/Recherche.jsx';
import Stats from './pages/Stats.jsx';
import Reglages from './pages/Reglages.jsx';
import { getToken } from './api.js';
import { demarrerPresence } from './presence.js';

function Protegee({ children }) {
  return getToken() ? children : <Navigate to="/" replace />;
}

export default function App() {
  // Presence : temps passe dans l'application (heartbeat toutes les 30 s)
  useEffect(() => {
    if (getToken()) demarrerPresence();
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/inscription" element={<Inscription />} />
      <Route
        path="/espace"
        element={
          <Protegee>
            <Espace />
          </Protegee>
        }
      />
      <Route
        path="/classes"
        element={
          <Protegee>
            <Classes />
          </Protegee>
        }
      />
      <Route
        path="/contenus"
        element={
          <Protegee>
            <Contenus />
          </Protegee>
        }
      />
      <Route
        path="/mes-contenus"
        element={
          <Protegee>
            <MesContenus />
          </Protegee>
        }
      />
      <Route
        path="/devoirs"
        element={
          <Protegee>
            <Devoirs />
          </Protegee>
        }
      />
      <Route
        path="/mes-devoirs"
        element={
          <Protegee>
            <DevoirsEleve />
          </Protegee>
        }
      />
      <Route
        path="/stats"
        element={
          <Protegee>
            <Stats />
          </Protegee>
        }
      />
      <Route
        path="/recherche"
        element={
          <Protegee>
            <Recherche />
          </Protegee>
        }
      />
      <Route
        path="/reglages"
        element={
          <Protegee>
            <Reglages />
          </Protegee>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
