"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Play, Activity, Settings, ArrowLeft, Edit2, X, Save } from 'lucide-react';

export default function ProjectDetails() {
  const { id } = useParams();
  const router = useRouter();
  const [project, setProject] = useState(null);
  const [triggering, setTriggering] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then(res => res.json())
      .then(data => setProject(data));
  }, [id]);

  const triggerBuild = async () => {
    setTriggering(true);
    const res = await fetch('/api/builds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: id })
    });
    const build = await res.json();
    if (build.id) {
      router.push(`/builds/${build.id}`);
    } else {
      alert('Failed to trigger build');
      setTriggering(false);
    }
  };

  const saveProject = async (e) => {
    e.preventDefault();
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm)
    });
    if (res.ok) {
      const updated = await res.json();
      setProject({ ...project, ...updated });
      setIsEditing(false);
    } else {
      alert('Failed to update project');
    }
  };

  if (!project) return <div>Loading project...</div>;

  return (
    <div>
      {isEditing && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2>Edit Project</h2>
              <button onClick={() => setIsEditing(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={saveProject} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Project Name</label>
                <input required type="text" value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Git Repository URL</label>
                <input required type="url" value={editForm.repoUrl || ''} onChange={e => setEditForm({...editForm, repoUrl: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Branch</label>
                  <input required type="text" value={editForm.branch || ''} onChange={e => setEditForm({...editForm, branch: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Build Scheme</label>
                  <input required type="text" value={editForm.buildScheme || ''} onChange={e => setEditForm({...editForm, buildScheme: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Bundle ID</label>
                <input required type="text" value={editForm.bundleId || ''} onChange={e => setEditForm({...editForm, bundleId: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff' }} />
              </div>
              <button type="submit" className="btn-primary" style={{ marginTop: '8px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                <Save size={18} /> Save Changes
              </button>
            </form>
          </div>
        </div>
      )}
      <Link href="/" style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>
      
      <div className="glass-panel" style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <h1 style={{ fontSize: '2.5rem', margin: 0 }}>{project.name}</h1>
              <button onClick={() => { setEditForm(project); setIsEditing(true); }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <Edit2 size={16} />
              </button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>{project.repoUrl} • {project.branch}</p>
          </div>
          <button className="btn-primary" style={{ padding: '12px 24px', fontSize: '1.1rem' }} onClick={triggerBuild} disabled={triggering}>
            <Play size={18} />
            {triggering ? 'Starting...' : 'Start New Build'}
          </button>
        </div>
      </div>

      <h2 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Activity size={20} /> Build History
      </h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {project.builds.length === 0 && (
          <p style={{ color: 'var(--text-muted)' }}>No builds yet. Trigger one to see it here.</p>
        )}
        {project.builds.map(build => (
          <Link href={`/builds/${build.id}`} key={build.id}>
            <div className="glass-panel" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
              <div>
                <strong style={{ display: 'block', marginBottom: '4px' }}>Build #{build.id.substring(0, 8)}</strong>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  {new Date(build.createdAt).toLocaleString()}
                </span>
              </div>
              <span className={`status-badge status-${build.status}`}>
                {build.status}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
