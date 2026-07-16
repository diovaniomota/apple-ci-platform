"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewProject() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    repoUrl: '',
    branch: 'main',
    buildScheme: 'App',
    bundleId: 'com.example.app'
  });

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
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
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

        <button type="submit" className="btn-primary" style={{ marginTop: '16px', justifyContent: 'center' }} disabled={loading}>
          {loading ? 'Creating...' : 'Create Project'}
        </button>
      </form>
    </div>
  );
}
