import './globals.css';
import { Layers, Settings } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: 'Apple CI/CD Platform',
  description: 'Self-hosted CI/CD for iOS Apps',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <nav className="header-nav">
          <Link href="/" className="header-brand">
            <Layers color="#3b82f6" />
            <span>Apple CI Platform</span>
          </Link>
          <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
            <Link href="/" className="nav-link">
              Projects
            </Link>
            <Link href="/settings" className="nav-link" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Settings size={16} />
              Settings
            </Link>
            <span className="status-badge status-SUCCESS">Mac Mini Online</span>
          </div>
        </nav>
        <main className="container">
          {children}
        </main>
      </body>
    </html>
  );
}

