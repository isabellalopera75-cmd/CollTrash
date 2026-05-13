import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function PrivateRoute({ children, rol }) {
  const { usuario, cargando } = useAuth();

  if (cargando) return <div style={{display:'flex',justifyContent:'center',marginTop:'2rem'}}>Cargando...</div>;
  if (!usuario) return <Navigate to="/login" />;
  if (rol && usuario.rol !== rol) return <Navigate to="/login" />;

  return children;
}