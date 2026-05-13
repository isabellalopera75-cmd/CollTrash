import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AdminLayout({ children }) {
  return (
    <div className="admin-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar />
        <main className="scroll-area">
          {children}
        </main>
      </div>
    </div>
  );
}
