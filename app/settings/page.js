"use client";

import { useState, useEffect } from 'react';
import { Save, Key, GitBranch, Upload, Eye, EyeOff, CheckCircle, AlertCircle, Plus, Trash2, ShieldCheck, UserCheck, Users, Lock, Shield, Edit3 } from 'lucide-react';

function SettingField({ label, field, description, value, onChange, masked }) {
  const [show, setShow] = useState(false);

  return (
    <div style={{ marginBottom: '20px' }}>
      <label style={{ display: 'block', fontWeight: '500', marginBottom: '4px', color: 'var(--text-main)' }}>
        {label}
      </label>
      {description && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>{description}</p>
      )}
      <div style={{ position: 'relative' }}>
        <input
          type={masked && !show ? 'password' : 'text'}
          // Impede o autofill do navegador de tratar estes campos como um
          // formulário de login (email + senha salvos eram injetados aqui).
          name={`cfg-${field}`}
          autoComplete={masked ? 'new-password' : 'off'}
          value={value || ''}
          onChange={e => onChange(field, e.target.value)}
          style={{
            width: '100%',
            padding: '12px 40px 12px 12px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'rgba(15, 23, 42, 0.6)',
            color: 'var(--text-main)',
            fontSize: '0.9rem',
            outline: 'none',
            transition: 'border-color 0.2s ease',
          }}
          placeholder={`Enter ${label}`}
        />
        {masked && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}

function TextareaSettingField({ label, field, description, value, onChange }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <label style={{ display: 'block', fontWeight: '500', marginBottom: '4px', color: 'var(--text-main)' }}>
        {label}
      </label>
      {description && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>{description}</p>
      )}
      <textarea
        value={value || ''}
        onChange={e => onChange(field, e.target.value)}
        rows={6}
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          background: 'rgba(15, 23, 42, 0.6)',
          color: 'var(--text-main)',
          fontSize: '0.9rem',
          outline: 'none',
          fontFamily: 'monospace',
        }}
        placeholder={`Paste the content of your .p8 file here...`}
      />
    </div>
  );
}

function SectionCard({ icon: Icon, title, children, color = '#3b82f6', actionButton }) {
  return (
    <div className="glass-panel" style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: `${color}22`, borderRadius: '8px', padding: '8px', display: 'flex' }}>
            <Icon size={20} color={color} />
          </div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: '600', margin: 0 }}>{title}</h2>
        </div>
        {actionButton}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState({});
  const [appleAccounts, setAppleAccounts] = useState([]);
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  // Apple Account Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAccId, setEditingAccId] = useState(null);
  const [newAcc, setNewAcc] = useState({
    name: '', appleId: '', teamId: '', ascKeyId: '', ascIssuerId: '', ascKeyContent: '', matchGitUrl: '', matchPassword: ''
  });
  const [addingAcc, setAddingAcc] = useState(false);

  // User Management State
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', name: '', role: 'ADMIN' });
  const [addingUser, setAddingUser] = useState(false);

  // Change Password State
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [changingPwd, setChangingPwd] = useState(false);
  const [pwdStatus, setPwdStatus] = useState(null);

  useEffect(() => {
    fetchSettings();
    fetchAppleAccounts();
    fetchUsers();
  }, []);

  const fetchSettings = () => {
    fetch('/api/settings').then(r => r.json()).then(data => setSettings(data));
  };

  const fetchAppleAccounts = () => {
    fetch('/api/apple-accounts').then(r => r.json()).then(data => setAppleAccounts(data));
  };

  const fetchUsers = () => {
    fetch('/api/users').then(r => r.json()).then(data => setUsers(Array.isArray(data) ? data : []));
  };

  const handleChange = (key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        setSaveStatus('success');
        setTimeout(() => setSaveStatus(null), 3000);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      setPwdStatus({ type: 'error', message: 'A confirmação de senha não confere.' });
      return;
    }
    setChangingPwd(true);
    setPwdStatus(null);

    try {
      const res = await fetch('/api/users/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: pwdForm.currentPassword,
          newPassword: pwdForm.newPassword
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPwdStatus({ type: 'success', message: 'Senha alterada com sucesso!' });
        setPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setPwdStatus({ type: 'error', message: data.error || 'Erro ao alterar senha.' });
      }
    } catch (e) {
      setPwdStatus({ type: 'error', message: 'Falha de conexão com a API.' });
    } finally {
      setChangingPwd(false);
      setTimeout(() => setPwdStatus(null), 5000);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUser.email || !newUser.password) {
      alert('E-mail e Senha são obrigatórios.');
      return;
    }
    setAddingUser(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      if (res.ok) {
        setShowAddUserModal(false);
        setNewUser({ email: '', password: '', name: '', role: 'ADMIN' });
        fetchUsers();
      } else {
        const err = await res.json();
        alert(`Erro ao adicionar membro: ${err.error || 'Erro desconhecido'}`);
      }
    } catch (e) {
      alert('Erro de conexão ao criar usuário.');
    } finally {
      setAddingUser(false);
    }
  };

  const handleDeleteUser = async (id, email) => {
    if (!confirm(`Deseja realmente remover o usuário "${email}"?`)) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchUsers();
      } else {
        const err = await res.json();
        alert(err.error || 'Não foi possível excluir.');
      }
    } catch (e) {
      alert('Erro ao excluir usuário.');
    }
  };

  const handleOpenAddAppleModal = () => {
    setEditingAccId(null);
    setNewAcc({ name: '', appleId: '', teamId: '', ascKeyId: '', ascIssuerId: '', ascKeyContent: '', matchGitUrl: '', matchPassword: '' });
    setShowAddModal(true);
  };

  const handleOpenEditAppleModal = (acc) => {
    setEditingAccId(acc.id);
    setNewAcc({
      name: acc.name || '',
      appleId: acc.appleId || '',
      teamId: acc.teamId || '',
      ascKeyId: acc.ascKeyId || '',
      ascIssuerId: acc.ascIssuerId || '',
      ascKeyContent: acc.ascKeyContent || '',
      matchGitUrl: acc.matchGitUrl || '',
      matchPassword: acc.matchPassword || ''
    });
    setShowAddModal(true);
  };

  const handleAddAppleAccount = async (e) => {
    e.preventDefault();
    if (!newAcc.name || !newAcc.teamId) {
      alert('Nome da conta e Team ID são obrigatórios.');
      return;
    }
    setAddingAcc(true);
    try {
      const url = editingAccId ? `/api/apple-accounts/${editingAccId}` : '/api/apple-accounts';
      const method = editingAccId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAcc)
      });
      if (res.ok) {
        setShowAddModal(false);
        setEditingAccId(null);
        setNewAcc({ name: '', appleId: '', teamId: '', ascKeyId: '', ascIssuerId: '', ascKeyContent: '', matchGitUrl: '', matchPassword: '' });
        fetchAppleAccounts();
      } else {
        const err = await res.json();
        alert(`Erro ao salvar conta: ${err.error || 'Erro desconhecido'}`);
      }
    } catch (err) {
      alert('Falha de conexão ao salvar conta.');
    } finally {
      setAddingAcc(false);
    }
  };

  const handleDeleteAppleAccount = async (id, name) => {
    if (!confirm(`Deseja realmente remover a conta "${name}"?`)) return;
    try {
      const res = await fetch(`/api/apple-accounts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchAppleAccounts();
      }
    } catch (e) {
      alert('Erro ao excluir conta.');
    }
  };

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '6px' }}>Settings</h1>
          <p style={{ color: 'var(--text-muted)' }}>Gerencie membros da equipe, segurança da conta e credenciais da Apple.</p>
        </div>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '12px 24px', gap: '8px' }}
        >
          {saveStatus === 'success' ? (
            <><CheckCircle size={18} /> Salvo!</>
          ) : saveStatus === 'error' ? (
            <><AlertCircle size={18} /> Erro</>
          ) : (
            <><Save size={18} /> {saving ? 'Salvando...' : 'Salvar Padrões Globais'}</>
          )}
        </button>
      </div>

      {/* CHANGE MY PASSWORD SECTION */}
      <SectionCard icon={Lock} title="Alterar Minha Senha de Acesso" color="#eab308">
        <form onSubmit={handleChangePassword}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <SettingField
              label="Senha Atual"
              field="currentPassword"
              value={pwdForm.currentPassword}
              onChange={(f, v) => setPwdForm({ ...pwdForm, currentPassword: v })}
              masked
            />
            <SettingField
              label="Nova Senha"
              field="newPassword"
              value={pwdForm.newPassword}
              onChange={(f, v) => setPwdForm({ ...pwdForm, newPassword: v })}
              masked
            />
            <SettingField
              label="Confirmar Nova Senha"
              field="confirmPassword"
              value={pwdForm.confirmPassword}
              onChange={(f, v) => setPwdForm({ ...pwdForm, confirmPassword: v })}
              masked
            />
          </div>

          {pwdStatus && (
            <div style={{
              background: pwdStatus.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${pwdStatus.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              color: pwdStatus.type === 'success' ? '#34d399' : '#f87171',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '0.875rem',
              marginBottom: '16px'
            }}>
              {pwdStatus.message}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={changingPwd || !pwdForm.currentPassword || !pwdForm.newPassword}
            style={{ padding: '10px 20px', fontSize: '0.875rem', background: '#eab308', color: '#000', fontWeight: 700 }}
          >
            {changingPwd ? 'Atualizando...' : 'Atualizar Minha Senha'}
          </button>
        </form>
      </SectionCard>

      {/* TEAM USERS MANAGEMENT SECTION */}
      <SectionCard
        icon={Users}
        title="Membros da Equipe (Usuários do Dashboard)"
        color="#a855f7"
        actionButton={
          <button
            className="btn-primary"
            onClick={() => setShowAddUserModal(true)}
            style={{ padding: '8px 16px', fontSize: '0.875rem', gap: '6px', background: '#a855f7' }}
          >
            <Plus size={16} /> Adicionar Membro
          </button>
        }
      >
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
          Gerencie os desenvolvedores e administradores autorizados a acessar a plataforma Apple CI.
        </p>

        {users.length === 0 ? (
          <div style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: '10px', padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Nenhum usuário secundário cadastrado.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {users.map(u => (
              <div
                key={u.id}
                style={{
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                      {u.name || u.email}
                    </h3>
                    <span style={{ background: u.role === 'ADMIN' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(59, 130, 246, 0.2)', color: u.role === 'ADMIN' ? '#c084fc' : '#60a5fa', padding: '2px 8px', borderRadius: '10px', fontSize: '0.725rem', fontWeight: 700 }}>
                      {u.role}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                    {u.email} • Cadastrado em {new Date(u.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <button
                  onClick={() => handleDeleteUser(u.id, u.email)}
                  style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', borderRadius: '8px', padding: '8px', cursor: 'pointer' }}
                  title="Remover Usuário"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ADD USER MODAL */}
      {showAddUserModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '480px', color: '#f8fafc' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '8px' }}>
              Adicionar Novo Membro na Equipe
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
              Cadastre as credenciais de acesso do novo desenvolvedor.
            </p>

            <form onSubmit={handleAddUser}>
              <SettingField label="Nome Completo" field="name" value={newUser.name} onChange={(f, v) => setNewUser({ ...newUser, name: v })} />
              <SettingField label="E-mail de Acesso" field="email" value={newUser.email} onChange={(f, v) => setNewUser({ ...newUser, email: v })} />
              <SettingField label="Senha Inicial" field="password" value={newUser.password} onChange={(f, v) => setNewUser({ ...newUser, password: v })} masked />

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '6px', color: 'var(--text-main)', fontSize: '0.9rem' }}>
                  Função / Permissão
                </label>
                <select
                  value={newUser.role}
                  onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(15, 23, 42, 0.9)', color: 'white', fontSize: '0.9rem' }}
                >
                  <option value="ADMIN">👑 Administrador (Acesso Total)</option>
                  <option value="DEVELOPER">💻 Desenvolvedor (Inicia Builds)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" onClick={() => setShowAddUserModal(false)} className="btn-secondary" style={{ padding: '10px 20px', background: 'transparent', border: '1px solid var(--border)', color: '#94a3b8', borderRadius: '8px', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={addingUser} style={{ padding: '10px 24px', borderRadius: '8px', background: '#a855f7' }}>
                  {addingUser ? 'Criando...' : 'Criar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MULTIPLE APPLE DEVELOPER ACCOUNTS SECTION */}
      <SectionCard
        icon={UserCheck}
        title="Contas de Desenvolvedor Apple (Multi-Account)"
        color="#10b981"
        actionButton={
          <button
            className="btn-primary"
            onClick={handleOpenAddAppleModal}
            style={{ padding: '8px 16px', fontSize: '0.875rem', gap: '6px', background: '#0066ff' }}
          >
            <Plus size={16} /> Nova Conta Apple
          </button>
        }
      >
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
          Cadastre contas de desenvolvedor Apple individuais (Pessoal, Empresa X, Cliente Y). Ao criar um novo projeto, você poderá escolher qual conta utilizar para assinar e subir o binário no TestFlight.
        </p>

        {appleAccounts.length === 0 ? (
          <div style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: '10px', padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Nenhuma conta Apple cadastrada ainda. Clique no botão <strong>"+ Nova Conta Apple"</strong> para adicionar.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {appleAccounts.map(acc => (
              <div
                key={acc.id}
                style={{
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  padding: '20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: '700', margin: 0, color: '#f8fafc' }}>
                      {acc.name}
                    </h3>
                    <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '2px 8px', borderRadius: '10px', fontSize: '0.725rem', fontWeight: 600 }}>
                      Team ID: {acc.teamId}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                    {acc.appleId ? `Apple ID: ${acc.appleId}` : 'Sem e-mail cadastrado'} • Key ID: {acc.ascKeyId || 'Padrão'} • {acc.projects?.length || 0} Projeto(s) Vinculado(s)
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleOpenEditAppleModal(acc)}
                    style={{ background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60a5fa', borderRadius: '8px', padding: '8px', cursor: 'pointer' }}
                    title="Editar Conta Apple"
                  >
                    <Edit3 size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteAppleAccount(acc.id, acc.name)}
                    style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', borderRadius: '8px', padding: '8px', cursor: 'pointer' }}
                    title="Excluir Conta"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ADD/EDIT APPLE ACCOUNT MODAL / FORM */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', color: '#f8fafc' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '8px' }}>
              {editingAccId ? 'Editar Conta Apple Developer' : 'Cadastrar Nova Conta Apple Developer'}
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
              Preencha os dados da conta da Apple (Team ID e credenciais da API do App Store Connect).
            </p>

            <form onSubmit={handleAddAppleAccount}>
              <SettingField label="Nome de Identificação (ex: Empresa X)" field="name" value={newAcc.name} onChange={(f, v) => setNewAcc({ ...newAcc, name: v })} />
              <SettingField label="Apple ID (E-mail)" field="appleId" value={newAcc.appleId} onChange={(f, v) => setNewAcc({ ...newAcc, appleId: v })} />
              <SettingField label="Apple Team ID (ex: Y96DN6W9YV)" field="teamId" value={newAcc.teamId} onChange={(f, v) => setNewAcc({ ...newAcc, teamId: v })} />
              <SettingField label="App Store Connect Key ID" field="ascKeyId" value={newAcc.ascKeyId} onChange={(f, v) => setNewAcc({ ...newAcc, ascKeyId: v })} />
              <SettingField label="App Store Connect Issuer ID (UUID)" field="ascIssuerId" value={newAcc.ascIssuerId} onChange={(f, v) => setNewAcc({ ...newAcc, ascIssuerId: v })} />
              <TextareaSettingField label="Conteúdo do Arquivo .p8" field="ascKeyContent" value={newAcc.ascKeyContent} onChange={(f, v) => setNewAcc({ ...newAcc, ascKeyContent: v })} />
              <SettingField label="Fastlane Match Git URL" field="matchGitUrl" value={newAcc.matchGitUrl} onChange={(f, v) => setNewAcc({ ...newAcc, matchGitUrl: v })} />
              <SettingField label="Fastlane Match Password" field="matchPassword" value={newAcc.matchPassword} onChange={(f, v) => setNewAcc({ ...newAcc, matchPassword: v })} masked />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '28px' }}>
                <button type="button" onClick={() => { setShowAddModal(false); setEditingAccId(null); }} className="btn-secondary" style={{ padding: '10px 20px', background: 'transparent', border: '1px solid var(--border)', color: '#94a3b8', borderRadius: '8px', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={addingAcc} style={{ padding: '10px 24px', borderRadius: '8px' }}>
                  {addingAcc ? 'Salvando...' : editingAccId ? 'Atualizar Conta Apple' : 'Salvar Conta Apple'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GLOBAL DEFAULT SETTINGS SECTION */}
      <SectionCard icon={Key} title="Configurações Globais Fallback" color="#3b82f6">
        <SettingField label="Apple ID Padrão" field="APPLE_ID" description="E-mail padrão para projetos sem conta específica." value={settings.APPLE_ID} onChange={handleChange} />
        <SettingField label="Team ID Padrão" field="APPLE_TEAM_ID" description="Team ID de 10 caracteres padrão da Apple." value={settings.APPLE_TEAM_ID} onChange={handleChange} />
        <SettingField label="Match Git URL Padrão" field="MATCH_GIT_URL" description="URL HTTPS do repositório Git de certificados padrão." value={settings.MATCH_GIT_URL} onChange={handleChange} />
        <SettingField label="Match Password Padrão" field="MATCH_PASSWORD" description="Senha do Match padrão." value={settings.MATCH_PASSWORD} onChange={handleChange} masked />
      </SectionCard>
    </div>
  );
}
