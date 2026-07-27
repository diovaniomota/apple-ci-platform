import './globals.css';
import Navbar from './components/Navbar';

export const metadata = {
  title: 'Apple CI/CD Platform',
  description: 'Self-hosted CI/CD for iOS Apps',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main className="container">
          {children}
        </main>
      </body>
    </html>
  );
}
