import Link from 'next/link';
import { PrismaClient } from '@prisma/client';
import { Plus, GitBranch, Play } from 'lucide-react';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const projects = await prisma.project.findMany({
    include: {
      appleAccount: true,
      builds: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Projects</h1>
          <p style={{ color: 'var(--text-muted)' }}>Manage and monitor your iOS builds.</p>
        </div>
        <Link href="/projects/new">
          <button className="btn-primary">
            <Plus size={18} />
            New Project
          </button>
        </Link>
      </div>

      {/* Runner Health & Smart Cache Banner */}
      <div
        style={{
          margin: '24px 0 32px 0',
          padding: '16px 20px',
          borderRadius: '12px',
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 10px #10b981' }} />
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#f8fafc' }}>Mac mini Runner Active</span>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
          <span style={{ fontSize: '0.825rem', color: '#94a3b8' }}>
            ⚡ <b>Smart Cache Ativo</b> (Pods & Flutter Plugin Symlinks)
          </span>
        </div>

        <Link href="/analytics" style={{ fontSize: '0.825rem', color: '#3b82f6', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
          Ver Telemetria & Analytics →
        </Link>
      </div>

      <div className="projects-grid">
        {projects.length === 0 && (
          <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', background: 'rgba(30, 41, 59, 0.4)', borderRadius: '12px' }}>
            <p style={{ color: 'var(--text-muted)' }}>No projects found. Create your first project to get started!</p>
          </div>
        )}
        
        {projects.map(project => {
          const lastBuild = project.builds[0];
          const status = lastBuild ? lastBuild.status : 'PENDING';
          
          return (
            <Link href={`/projects/${project.id}`} key={project.id}>
              <div className="glass-panel project-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3>{project.name}</h3>
                  <span className={`status-badge status-${status}`}>
                    {status}
                  </span>
                </div>
                <p>{project.repoUrl}</p>
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <GitBranch size={14} />
                    <span>{project.branch}</span>
                  </div>
                  {project.appleAccount ? (
                    <span style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.25)', color: '#34d399', fontSize: '0.725rem', padding: '2px 8px', borderRadius: '8px', fontWeight: 600 }}>
                      🔐 {project.appleAccount.name}
                    </span>
                  ) : (
                    <span style={{ background: 'rgba(255, 255, 255, 0.05)', color: '#94a3b8', fontSize: '0.725rem', padding: '2px 8px', borderRadius: '8px' }}>
                      Conta Padrão
                    </span>
                  )}
                </div>

                <div className="card-footer">
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Created {new Date(project.createdAt).toLocaleDateString()}
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.875rem' }}>
                      View
                    </button>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
