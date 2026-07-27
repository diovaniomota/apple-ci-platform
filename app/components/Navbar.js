"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Layers, Settings, BarChart2, LogOut, User } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    if (pathname !== '/login') {
      fetch('/api/auth/me')
        .then(r => r.json())
        .then(data => {
          if (data.authenticated) {
            setCurrentUser(data.user);
          }
        })
        .catch(() => {});
    }
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (e) {}
  };

  // Hide nav bar on /login page
  if (pathname === '/login') return null;

  return (
    <nav className="header-nav">
      <Link href="/" className="header-brand">
        <Layers color="#3b82f6" />
        <span>Apple CI Platform</span>
      </Link>
      <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
        <Link href="/" className="nav-link">
          Projects
        </Link>
        <Link href="/analytics" className="nav-link" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <BarChart2 size={16} />
          Analytics & Health
        </Link>
        <Link href="/settings" className="nav-link" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Settings size={16} />
          Settings
        </Link>
        <span className="status-badge status-SUCCESS">Mac Mini Active</span>

        {currentUser && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingLeft: '12px', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <User size={14} /> {currentUser.email}
            </span>
            <button
              onClick={handleLogout}
              title="Sair da Plataforma"
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 600
              }}
            >
              <LogOut size={14} /> Sair
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
