"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Play, Activity, ArrowLeft, Edit2, X, Save, Copy, Check, GitPullRequest, Hash, Key } from 'lucide-react';

export default function ProjectDetails() {
  const { id } = useParams();
  const router = useRouter();
  const [project, setProject] = useState(null);
  const [appleAccounts, setAppleAccounts] = useState([]);
  const [triggering, setTriggering] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }

    fetch(`/api/projects/${id}`)
      .then(res => res.json())
      .then(data => setProject(data));

    fetch('/api/apple-accounts')
      .then(res => res.json())
      .then(data => setAppleAccounts(data))
      .catch(() => {});
  }, [id]);

  const webhookUrl = `${origin}/api/webhooks/github`;

  const copyWebhookToClipboard = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2500);
  };

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

  if (!project) return <div style={{ padding: '40px', color: 'var(--text-muted)' }}>Loading project...</div>;

  return (
    <div style={{ paddingBottom: '60px' }}>
      {/* EDIT MODAL */}
      {isEditing && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '540px', padding: '28px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.3rem', margin: 0 }}>Editar Projeto</h2>
              <button onClick={() => setIsEditing(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={saveProject} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Nome do Projeto</label>
                <input required type="text" value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff' }} />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Repositório Git (HTTPS)</label>
                <input required type="text" value={editForm.repoUrl || ''} onChange={e => setEditForm({...editForm, repoUrl: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Branch</label>
                  <input required type="text" value={editForm.branch || ''} onChange={e => setEditForm({...editForm, branch: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Xcode Scheme</label>
                  <input required type="text" value={editForm.buildScheme || ''} onChange={e => setEditForm({...editForm, buildScheme: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Bundle ID</label>
                <input required type="text" value={editForm.bundleId || ''} onChange={e => setEditForm({...editForm, bundleId: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff' }} />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Conta de Desenvolvedor Apple</label>
                <select
                  value={editForm.appleAccountId || ''}
                  onChange={e => setEditForm({ ...editForm, appleAccountId: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#0f172a', color: '#fff' }}
                >
                  <option value="">-- Usar Conta Padrão das Configurações --</option>
                  {appleAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      🔐 {acc.name} (Team ID: {acc.teamId})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Distribuição</label>
                <select
                  value={editForm.distribution || 'testflight'}
                  onChange={e => setEditForm({ ...editForm, distribution: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#0f172a', color: '#fff' }}
                >
                  <option value="testflight">🚀 TestFlight / App Store</option>
                  <option value="development">📱 Development (.ipa para devices registrados, sem loja)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Variáveis de Ambiente (.env do build)</label>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Escrito como .env na raiz do projeto em cada build. Formato: CHAVE=valor, uma por linha.
                </p>
                <textarea
                  value={editForm.envVars || ''}
                  onChange={e => setEditForm({ ...editForm, envVars: e.target.value })}
                  rows={5}
                  placeholder={'SUPABASE_URL=https://xxxx.supabase.co\nSUPABASE_ANON_KEY=eyJ...'}
                  spellCheck={false}
                  autoComplete="off"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }}
                />
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '14px', marginTop: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.9rem', color: '#f8fafc', margin: 0 }}>
                    🏷️ Auto-Incremento de Versão
                  </label>
                  <input
                    type="checkbox"
                    checked={editForm.autoIncrementBuild !== false}
                    onChange={e => setEditForm({ ...editForm, autoIncrementBuild: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Próximo número do build:</span>
                  <input
                    type="number"
                    min="1"
                    value={editForm.currentBuildNumber || 1}
                    onChange={e => setEditForm({ ...editForm, currentBuildNumber: parseInt(e.target.value, 10) || 1 })}
                    style={{ width: '80px', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: '12px', justifyContent: 'center', gap: '8px' }}>
                <Save size={18} /> Salvar Alterações
              </button>
            </form>
          </div>
        </div>
      )}

      <Link href="/" style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '24px', textDecoration: 'none' }}>
        <ArrowLeft size={16} /> Voltar para o Dashboard
      </Link>
      
      {/* HEADER CARD */}
      <div className="glass-panel" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <h1 style={{ fontSize: '2.2rem', margin: 0 }}>{project.name}</h1>
              <button onClick={() => { setEditForm(project); setIsEditing(true); }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Editar Projeto">
                <Edit2 size={16} />
              </button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem', margin: '0 0 12px 0' }}>{project.repoUrl} • Branch: <b>{project.branch}</b></p>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {project.appleAccount ? (
                <span style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', fontSize: '0.8rem', padding: '4px 10px', borderRadius: '8px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Key size={14} /> Conta Apple: {project.appleAccount.name} ({project.appleAccount.teamId})
                </span>
              ) : (
                <span style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8', fontSize: '0.8rem', padding: '4px 10px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Key size={14} /> Conta Apple Padrão
                </span>
              )}

              <span style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60a5fa', fontSize: '0.8rem', padding: '4px 10px', borderRadius: '8px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Hash size={14} /> Build #{project.currentBuildNumber || 1} {project.autoIncrementBuild !== false && '(Auto-Incremento)'}
              </span>
            </div>
          </div>

          <button className="btn-primary" style={{ padding: '12px 24px', fontSize: '1rem' }} onClick={triggerBuild} disabled={triggering}>
            <Play size={18} />
            {triggering ? 'Iniciando...' : 'Iniciar Build Manual'}
          </button>
        </div>
      </div>

      {/* GITHUB WEBHOOK INTEGRATION CARD */}
      <div className="glass-panel" style={{ marginBottom: '32px', background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '6px', borderRadius: '8px', display: 'flex' }}>
            <GitPullRequest size={18} color="#60a5fa" />
          </div>
          <h3 style={{ fontSize: '1.05rem', margin: 0, color: '#f8fafc', fontWeight: 600 }}>
            Gatilho Automático (GitHub Webhook)
          </h3>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
          Copie a URL abaixo e adicione no GitHub em <strong>Settings → Webhooks → Add Webhook</strong> do seu repositório. Toda vez que você der <code>git push</code> na branch <b>{project.branch}</b>, o Mac mini iniciará o build automaticamente!
        </p>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            readOnly
            value={webhookUrl}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              background: 'rgba(0, 0, 0, 0.5)',
              color: '#38bdf8',
              fontFamily: 'monospace',
              fontSize: '0.85rem'
            }}
          />
          <button
            onClick={copyWebhookToClipboard}
            className="btn-primary"
            style={{ padding: '10px 16px', fontSize: '0.85rem', gap: '6px', background: copiedWebhook ? '#10b981' : '#0066ff' }}
          >
            {copiedWebhook ? <><Check size={16} /> Copiado!</> : <><Copy size={16} /> Copiar URL</>}
          </button>
        </div>
      </div>

      <h2 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Activity size={20} /> Histórico de Compilações
      </h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {project.builds.length === 0 && (
          <p style={{ color: 'var(--text-muted)' }}>Nenhum build executado ainda. Clique em "Iniciar Build Manual" para testar.</p>
        )}
        {project.builds.map(build => (
          <Link href={`/builds/${build.id}`} key={build.id}>
            <div className="glass-panel" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
              <div>
                <strong style={{ display: 'block', marginBottom: '4px' }}>Build #{build.id.substring(0, 8)}</strong>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  {build.commit || 'Build Manual'} • {new Date(build.createdAt).toLocaleString()}
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
