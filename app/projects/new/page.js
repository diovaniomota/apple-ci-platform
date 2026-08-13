"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NewProject() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [appleAccounts, setAppleAccounts] = useState([]);
  
  const [formData, setFormData] = useState({
    name: '',
    repoUrl: '',
    repoUsername: '',
    repoPassword: '',
    branch: 'main',
    buildScheme: 'App',
    bundleId: 'com.example.app',
    appleAccountId: ''
  });

  useEffect(() => {
    fetch('/api/apple-accounts')
      .then(r => r.json())
      .then(data => setAppleAccounts(data))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    if (res.ok) {
      router.push('/');
      router.refresh();
    } else {
      alert('Failed to create project');
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', paddingBottom: '60px' }}>
      <h1 style={{ marginBottom: '24px' }}>Create New Project</h1>
      <form onSubmit={handleSubmit} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Project Name</label>
          <input 
            type="text" 
            required
            value={formData.name}
            onChange={e => setFormData({...formData, name: e.target.value})}
            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(15, 23, 42, 0.5)', color: 'white' }}
            placeholder="My Awesome iOS App"
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Git Repository URL (HTTPS)</label>
          <input 
            type="text" 
            required
            value={formData.repoUrl}
            onChange={e => setFormData({...formData, repoUrl: e.target.value})}
            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(15, 23, 42, 0.5)', color: 'white' }}
            placeholder="https://github.com/user/repo.git"
          />
        </div>

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '16px' }}>
          <label style={{ display: 'block', marginBottom: '10px', color: '#e2e8f0', fontWeight: 600, fontSize: '0.9rem' }}>
            🔑 Credenciais Git (para repositórios privados)
          </label>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px', marginTop: 0 }}>
            Preencha caso o repositório exija autenticação HTTPS (GitHub Personal Token, Azure DevOps, Bitbucket, etc.)
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Username</label>
              <input 
                type="text"
                value={formData.repoUsername}
                onChange={e => setFormData({...formData, repoUsername: e.target.value})}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: '0.85rem' }}
                placeholder="diovanio.mota"
                autoComplete="off"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Password / Token</label>
              <input 
                type="password"
                value={formData.repoPassword}
                onChange={e => setFormData({...formData, repoPassword: e.target.value})}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: '0.85rem' }}
                placeholder="ghp_xxxx ou token"
                autoComplete="new-password"
              />
            </div>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Branch</label>
          <input 
            type="text" 
            required
            value={formData.branch}
            onChange={e => setFormData({...formData, branch: e.target.value})}
            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(15, 23, 42, 0.5)', color: 'white' }}
            placeholder="main"
          />
        </div>
        
        <div style={{ display: 'flex', gap: '16px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Xcode Scheme</label>
            <input 
              type="text" 
              required
              value={formData.buildScheme}
              onChange={e => setFormData({...formData, buildScheme: e.target.value})}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(15, 23, 42, 0.5)', color: 'white' }}
              placeholder="App"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Bundle ID</label>
            <input 
              type="text" 
              required
              value={formData.bundleId}
              onChange={e => setFormData({...formData, bundleId: e.target.value})}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(15, 23, 42, 0.5)', color: 'white' }}
              placeholder="com.example.app"
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>
            Conta de Desenvolvedor Apple
          </label>
          <select
            value={formData.appleAccountId}
            onChange={e => setFormData({ ...formData, appleAccountId: e.target.value })}
            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(15, 23, 42, 0.9)', color: 'white', fontSize: '0.9rem' }}
          >
            <option value="">-- Usar Conta Padrão das Configurações --</option>
            {appleAccounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                🔐 {acc.name} (Team ID: {acc.teamId})
              </option>
            ))}
          </select>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Selecione qual conta de desenvolvedor assinará e enviará este projeto para a Apple.
          </p>
        </div>

        <button type="submit" className="btn-primary" style={{ marginTop: '16px', justifyContent: 'center' }} disabled={loading}>
          {loading ? 'Creating...' : 'Create Project'}
        </button>
      </form>
    </div>
  );
}
