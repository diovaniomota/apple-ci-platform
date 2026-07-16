"use client";

import { useState, useEffect } from 'react';
import { Save, Key, GitBranch, Upload, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';

function SettingField({ label, field, description, type = 'text', value, onChange, masked }) {
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
          onFocus={e => e.target.style.borderColor = 'var(--primary)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
          placeholder={`Enter your ${label}`}
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

function SectionCard({ icon: Icon, title, children, color = '#3b82f6' }) {
  return (
    <div className="glass-panel" style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ background: `${color}22`, borderRadius: '8px', padding: '8px', display: 'flex' }}>
          <Icon size={20} color={color} />
        </div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: '600' }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => setSettings(data));
  }, []);

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

  return (
    <div style={{ maxWidth: '750px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '6px' }}>Settings</h1>
          <p style={{ color: 'var(--text-muted)' }}>Configure your Apple Developer credentials and build pipeline.</p>
        </div>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '12px 24px', gap: '8px' }}
        >
          {saveStatus === 'success' ? (
            <><CheckCircle size={18} /> Saved!</>
          ) : saveStatus === 'error' ? (
            <><AlertCircle size={18} /> Error</>
          ) : (
            <><Save size={18} /> {saving ? 'Saving...' : 'Save Changes'}</>
          )}
        </button>
      </div>

      {/* Apple Developer Account */}
      <SectionCard icon={Key} title="Apple Developer Account" color="#3b82f6">
        <SettingField
          label="Apple ID"
          field="APPLE_ID"
          description="The email address you use to log in to App Store Connect."
          value={settings.APPLE_ID}
          onChange={handleChange}
        />
        <SettingField
          label="Team ID"
          field="APPLE_TEAM_ID"
          description="Your 10-character Apple Developer Team ID. Found at developer.apple.com/account → Membership."
          value={settings.APPLE_TEAM_ID}
          onChange={handleChange}
        />
      </SectionCard>

      {/* App Store Connect API */}
      <SectionCard icon={Upload} title="App Store Connect API Key" color="#10b981">
        <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '0.85rem', color: '#94a3b8' }}>
          💡 Create an API key at <a href="https://appstoreconnect.apple.com/access/integrations/api" target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>App Store Connect → Users → Integrations → Keys</a>. Download the <strong>.p8</strong> file and note the <strong>Key ID</strong> and <strong>Issuer ID</strong>.
        </div>

        <SettingField
          label="Key ID"
          field="ASC_KEY_ID"
          description="The 10-character Key ID from App Store Connect (e.g. ABC1234567)."
          value={settings.ASC_KEY_ID}
          onChange={handleChange}
        />
        <SettingField
          label="Issuer ID"
          field="ASC_ISSUER_ID"
          description="The UUID Issuer ID from App Store Connect (e.g. 69a6de7e-xxxx-xxxx-xxxx-xxxxxxxxxxxx)."
          value={settings.ASC_ISSUER_ID}
          onChange={handleChange}
        />
        <SettingField
          label="Path to .p8 Key File"
          field="ASC_KEY_PATH"
          description="Absolute path to the downloaded AuthKey .p8 file on this Mac (e.g. /Users/diovaniomota/Downloads/AuthKey_ABC1234.p8)."
          value={settings.ASC_KEY_PATH}
          onChange={handleChange}
        />
      </SectionCard>

      {/* Fastlane Match */}
      <SectionCard icon={GitBranch} title="Fastlane Match (Code Signing)" color="#8b5cf6">
        <div style={{ background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '0.85rem', color: '#94a3b8' }}>
          💡 Fastlane Match armazena seus certificados iOS e provisioning profiles criptografados em um repositório Git privado. Crie um repositório privado no GitHub (ex: <strong>meu-usuario/ios-certs</strong>) e informe a URL abaixo.
        </div>

        <SettingField
          label="Match Git URL"
          field="MATCH_GIT_URL"
          description="URL HTTPS do seu repositório privado de certificados (ex: https://github.com/usuario/ios-certs.git)."
          value={settings.MATCH_GIT_URL}
          onChange={handleChange}
        />
        <SettingField
          label="Match Password"
          field="MATCH_PASSWORD"
          description="Senha usada para criptografar os certificados dentro do repositório."
          value={settings.MATCH_PASSWORD}
          onChange={handleChange}
          masked
        />
      </SectionCard>
    </div>
  );
}
