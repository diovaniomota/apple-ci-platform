import Link from 'next/link';
import { PrismaClient } from '@prisma/client';
import { Plus, GitBranch, Play } from 'lucide-react';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const projects = await prisma.project.findMany({
    include: {
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
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  <GitBranch size={14} />
                  <span>{project.branch}</span>
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
