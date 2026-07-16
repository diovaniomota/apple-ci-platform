"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Play, Activity, Settings, ArrowLeft } from 'lucide-react';

export default function ProjectDetails() {
  const { id } = useParams();
  const router = useRouter();
  const [project, setProject] = useState(null);
  const [triggering, setTriggering] = useState(false);

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

  if (!project) return <div>Loading project...</div>;

  return (
    <div>
      <Link href="/" style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>
      
      <div className="glass-panel" style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '2.5rem', marginBottom: '8px' }}>{project.name}</h1>
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
