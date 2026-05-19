import { createContext, useContext, useState, useEffect } from 'react';
import { obtenerPerfil } from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    if (token) {
      obtenerPerfil()
        .then(res => setUsuario(res.data.usuario))
        .catch(() => sessionStorage.removeItem('token'))
        .finally(() => setCargando(false));
    } else {
      setCargando(false);
    }
  }, []);

  const cerrarSesion = () => {
    sessionStorage.removeItem('token');
    setUsuario(null);
  };

  return (
    <AuthContext.Provider value={{ usuario, setUsuario, cerrarSesion, cargando }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);