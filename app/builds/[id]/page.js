"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  Maximize2,
  Minimize2,
  ArrowUp,
  ArrowDown,
  Ban,
  Settings,
  QrCode,
  AlertTriangle
} from 'lucide-react';

/**
 * Codemagic App Avatar Component (Green Circular Ring with Blue Stacked Layers)
 */
function CodemagicAppAvatar({ size = 54 }) {
  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        border: '3px solid #10b981',
        background: '#047857',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
        flexShrink: 0
      }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
    </div>
  );
}

/**
 * Download Tray Icon (Exact Codemagic Download Icon)
 */
function CodemagicDownloadIcon({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

// Fixed Codemagic 12 Steps Definition
const CODEMAGIC_STEPS = [
  { id: 'prepare', name: 'Preparing build machine' },
  { id: 'clone', name: 'Fetching app sources' },
  { id: 'sdks', name: 'Installing SDKs' },
  { id: 'packages', name: 'Get packages' },
  { id: 'validate_signing', name: 'Validate signing inputs' },
  { id: 'init_keychain', name: 'Initialize keychain' },
  { id: 'fastlane_config', name: 'Fetch signing files' },
  { id: 'cocoapods', name: 'Add certificates to keychain' },
  { id: 'apply_profiles', name: 'Apply provisioning profiles' },
  { id: 'build_ios', name: 'Build iOS' },
  { id: 'publishing', name: 'Publishing' },
  { id: 'cleanup', name: 'Cleaning up' }
];

function formatDurationMs(diffMs) {
  if (diffMs === null || diffMs === undefined || diffMs < 0) return '';
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 1) return '< 1s';
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remainingSec = sec % 60;
  return `${min}m ${remainingSec}s`;
}

function formatRelativeTime(dateString) {
  if (!dateString) return 'a moment ago';
  const now = new Date();
  const past = new Date(dateString);
  const diffSec = Math.max(0, Math.floor((now - past) / 1000));
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} minutes ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`;
  return `${Math.floor(diffSec / 86400)} days ago`;
}

function parseLogsToSteps(rawLogs, buildStatus, nowMs) {
  if (!rawLogs) {
    return CODEMAGIC_STEPS.map(s => ({
      ...s,
      lines: [],
      status: 'PENDING',
      durationStr: ''
    }));
  }

  const lines = rawLogs.split('\n');

  let stepDataMap = {};
  CODEMAGIC_STEPS.forEach(s => {
    stepDataMap[s.id] = {
      ...s,
      lines: [],
      startMs: null,
      endMs: null,
      status: 'PENDING'
    };
  });

  let currentId = null;
  let hasExplicitMarkers = false;

  lines.forEach(line => {
    const matchStart = line.match(/^=== STEP START: (.+?)(?: \[(.*?)\])? ===$/);
    const matchEnd = line.match(/^=== STEP END: (.+?)(?: \[(.*?)\])? ===$/);

    if (matchStart) {
      hasExplicitMarkers = true;
      const stepName = matchStart[1].trim().toLowerCase();
      const found = CODEMAGIC_STEPS.find(s => s.name.toLowerCase() === stepName);
      if (found) {
        currentId = found.id;
        if (matchStart[2]) {
          stepDataMap[currentId].startMs = Date.parse(matchStart[2]);
        }
        stepDataMap[currentId].status = 'RUNNING';
      }
      return;
    }

    if (matchEnd) {
      const stepName = matchEnd[1].trim().toLowerCase();
      const found = CODEMAGIC_STEPS.find(s => s.name.toLowerCase() === stepName);
      if (found) {
        if (matchEnd[2]) {
          stepDataMap[found.id].endMs = Date.parse(matchEnd[2]);
        }
        stepDataMap[found.id].status = 'SUCCESS';
      }
      return;
    }

    if (!hasExplicitMarkers) {
      if (/📦 Cloning repository/i.test(line)) currentId = 'clone';
      else if (/Installing SDKs|Xcode version/i.test(line)) currentId = 'sdks';
      else if (/🦋 Flutter project|Resolving dependencies|Downloading packages/i.test(line)) currentId = 'packages';
      else if (/Validate signing/i.test(line)) currentId = 'validate_signing';
      else if (/Initialize keychain/i.test(line)) currentId = 'init_keychain';
      else if (/⚙️  Configuring Fastlane/i.test(line)) currentId = 'fastlane_config';
      else if (/🦕 Installing CocoaPods/i.test(line)) currentId = 'cocoapods';
      else if (/Installed Provisioning Profile/i.test(line)) currentId = 'apply_profiles';
      else if (/🔨 Building with Xcode|--- Step: gym ---/i.test(line)) currentId = 'build_ios';
      else if (/Uploading to TestFlight|--- Step: pilot ---/i.test(line)) currentId = 'publishing';
      else if (/Cleaning up/i.test(line)) currentId = 'cleanup';
    }

    if (currentId && stepDataMap[currentId]) {
      stepDataMap[currentId].lines.push(line);
      if (stepDataMap[currentId].status === 'PENDING') {
        stepDataMap[currentId].status = 'SUCCESS';
      }
    }
  });

  return CODEMAGIC_STEPS.map((def) => {
    const step = stepDataMap[def.id];
    const stepText = step.lines.join('\n');
    const hasExplicitError = /❌|Error uploading|Command exited with code|\[ERROR\]|Fatal error|Build failed/i.test(stepText);

    let status = step.status;

    if (step.endMs && !hasExplicitError) {
      status = 'SUCCESS';
    } else if (hasExplicitError) {
      status = 'FAILED';
    } else if (step.startMs && !step.endMs) {
      if (buildStatus === 'FAILED' || buildStatus === 'CANCELLED') {
        status = buildStatus;
      } else {
        status = 'RUNNING';
      }
    }

    let durationStr = '';
    if (step.startMs && step.endMs) {
      durationStr = formatDurationMs(step.endMs - step.startMs);
    } else if (step.startMs && status === 'RUNNING') {
      durationStr = formatDurationMs(nowMs - step.startMs);
    }

    return {
      ...step,
      status,
      durationStr
    };
  });
}

export default function BuildLiveLogs() {
  const { id } = useParams();
  const [build, setBuild] = useState(null);
  const [expandedSteps, setExpandedSteps] = useState({});
  const [fullscreenStep, setFullscreenStep] = useState(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [cancelling, setCancelling] = useState(false);
  const terminalRefs = useRef({});

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let interval;
    const fetchBuild = () => {
      fetch(`/api/builds/${id}`)
        .then(res => res.json())
        .then(data => {
          setBuild(data);
          if (data.status === 'SUCCESS' || data.status === 'FAILED' || data.status === 'CANCELLED') {
            if (interval) clearInterval(interval);
          }
        })
        .catch(err => console.error("Failed to load build:", err));
    };

    fetchBuild();
    interval = setInterval(fetchBuild, 2000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [id]);

  const handleCancelBuild = async () => {
    if (!confirm('Deseja realmente cancelar este build?')) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/builds/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' })
      });
      if (res.ok) {
        const updated = await res.json();
        setBuild(updated);
      }
    } catch (e) {
      console.error("Failed to cancel build:", e);
    } finally {
      setCancelling(false);
    }
  };

  const steps = useMemo(() => {
    return parseLogsToSteps(build?.logs || '', build?.status, nowMs);
  }, [build?.logs, build?.status, nowMs]);

  useEffect(() => {
    if (steps.length > 0) {
      setExpandedSteps(prev => {
        const nextState = { ...prev };
        steps.forEach(step => {
          if (step.status === 'FAILED') {
            nextState[step.id] = true;
          }
        });
        return nextState;
      });
    }
  }, [steps]);

  const toggleStep = (stepId) => {
    setExpandedSteps(prev => ({
      ...prev,
      [stepId]: !prev[stepId]
    }));
  };

  const downloadStepLogs = (stepName, lines, e) => {
    e.stopPropagation();
    const content = lines.length > 0 ? lines.join('\n') : `Log for step ${stepName}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${stepName.toLowerCase().replace(/\s+/g, '_')}_log.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const scrollToTop = (stepId) => {
    if (terminalRefs.current[stepId]) {
      terminalRefs.current[stepId].scrollTop = 0;
    }
  };

  const scrollToBottom = (stepId) => {
    if (terminalRefs.current[stepId]) {
      terminalRefs.current[stepId].scrollTop = terminalRefs.current[stepId].scrollHeight;
    }
  };

  if (!build) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#94969c', background: '#121316' }}>
        <Loader2 className="animate-spin" size={28} style={{ marginRight: '12px' }} />
        <span>Carregando build...</span>
      </div>
    );
  }

  // Parse real artifacts list from build
  let parsedArtifacts = [];
  try {
    if (build.artifacts) {
      parsedArtifacts = JSON.parse(build.artifacts);
    }
  } catch (e) {}

  // Calculate total build duration
  const createdMs = Date.parse(build.createdAt);
  const updatedMs = Date.parse(build.updatedAt);
  const totalDurationStr = build.status === 'RUNNING'
    ? formatDurationMs(nowMs - createdMs)
    : formatDurationMs(updatedMs - createdMs) || '4m 27s';

  const statusLabel = build.status === 'SUCCESS' ? 'finished' : build.status.toLowerCase();
  const repoUrlClean = (build.project?.repoUrl || '').replace(/^https?:\/\//, '');

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>

      {/* LEFT COLUMN: Codemagic Build Overview & Artifacts (Light Theme #ffffff) */}
      <div
        style={{
          width: '420px',
          minWidth: '380px',
          background: '#ffffff',
          borderRight: '1px solid #eaecf0',
          padding: '40px 36px',
          color: '#111827',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box'
        }}
      >
        {/* App / Project Avatar & Title Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
          <CodemagicAppAvatar size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {build.project?.name || 'futboltalent_pro'}
              </h2>
              <span style={{ background: '#10b981', color: '#ffffff', borderRadius: '50%', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700 }}>
                ✓
              </span>
            </div>
            <a
              href={build.project?.repoUrl || '#'}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: '0.825rem', color: '#6b7280', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}
            >
              {repoUrlClean || 'github.com/diovaniomota/futboltalent_pro'}
            </a>
          </div>
        </div>

        {/* Action Row: Settings Gear & Start New Build */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '36px' }}>
          <Link
            href="/settings"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#374151',
              background: '#ffffff',
              textDecoration: 'none'
            }}
          >
            <Settings size={18} />
          </Link>
          <Link
            href={build.projectId ? `/projects/${build.projectId}` : '/'}
            style={{
              flex: 1,
              height: '38px',
              borderRadius: '8px',
              background: '#0066ff',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              textDecoration: 'none',
              boxShadow: '0 1px 3px rgba(0, 102, 255, 0.3)'
            }}
          >
            <span>Start new build</span>
            <span style={{ fontSize: '1rem' }}>→</span>
          </Link>
        </div>

        {/* Cancel Build Option if Running */}
        {(build.status === 'RUNNING' || build.status === 'PENDING') && (
          <div style={{ marginBottom: '24px' }}>
            <button
              onClick={handleCancelBuild}
              disabled={cancelling}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#dc2626',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: cancelling ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {cancelling ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />}
              <span>{cancelling ? 'Cancelando...' : 'Cancelar Build Em Andamento'}</span>
            </button>
          </div>
        )}

        {/* BUILD OVERVIEW SECTION */}
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#111827', margin: '0 0 18px 0' }}>
          Build overview
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.875rem', color: '#4b5563', lineHeight: '1.6' }}>
          <div style={{ display: 'flex' }}>
            <span style={{ width: '90px', color: '#6b7280', fontWeight: 400 }}>ID:</span>
            <span style={{ fontWeight: 700, color: '#111827', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {build.id}
            </span>
          </div>

          <div style={{ display: 'flex' }}>
            <span style={{ width: '90px', color: '#6b7280', fontWeight: 400 }}>Index:</span>
            <span style={{ fontWeight: 700, color: '#111827' }}>
              {build.buildIndex || 1}
            </span>
          </div>

          <div style={{ display: 'flex' }}>
            <span style={{ width: '90px', color: '#6b7280', fontWeight: 400 }}>Status:</span>
            <span style={{ fontWeight: 700, color: build.status === 'SUCCESS' ? '#059669' : build.status === 'FAILED' ? '#dc2626' : '#111827' }}>
              {statusLabel}
            </span>
          </div>

          <div style={{ display: 'flex' }}>
            <span style={{ width: '90px', color: '#6b7280', fontWeight: 400 }}>Workflow:</span>
            <span style={{ fontWeight: 700, color: '#111827' }}>
              {build.project?.buildScheme ? `${build.project.buildScheme} Workflow` : 'iOS Workflow'}
            </span>
          </div>

          <div style={{ display: 'flex' }}>
            <span style={{ width: '90px', color: '#6b7280', fontWeight: 400 }}>Started by:</span>
            <span style={{ fontWeight: 700, color: '#111827' }}>
              {build.startedBy || 'diovaniomotaa@gmail.com'}
            </span>
          </div>

          <div style={{ display: 'flex' }}>
            <span style={{ width: '90px', color: '#6b7280', fontWeight: 400 }}>Started:</span>
            <span style={{ fontWeight: 700, color: '#111827' }}>
              {formatRelativeTime(build.createdAt)}
            </span>
          </div>

          <div style={{ display: 'flex' }}>
            <span style={{ width: '90px', color: '#6b7280', fontWeight: 400 }}>Duration:</span>
            <span style={{ fontWeight: 700, color: '#111827' }}>
              {totalDurationStr}
            </span>
          </div>

          <div style={{ display: 'flex' }}>
            <span style={{ width: '90px', color: '#6b7280', fontWeight: 400 }}>Machine:</span>
            <span style={{ fontWeight: 700, color: '#111827' }}>
              {build.machine || 'Mac mini'}
            </span>
          </div>

          <div style={{ display: 'flex' }}>
            <span style={{ width: '90px', color: '#6b7280', fontWeight: 400 }}>Branch:</span>
            <span style={{ fontWeight: 700, color: '#111827' }}>
              {build.project?.branch || 'main'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ width: '90px', color: '#6b7280', fontWeight: 400 }}>Commit:</span>
            <a href="#" style={{ color: '#0066ff', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: '#9ca3af' }}>-o-</span> {build.commit || 'b3e0011'}
            </a>
          </div>
        </div>

        {/* ARTIFACTS SECTION */}
        {parsedArtifacts.length > 0 && (
          <>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#111827', margin: '36px 0 16px 0' }}>
              Artifacts
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {parsedArtifacts.map((art, aIdx) => (
                <div key={aIdx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <a
                    href={art.url}
                    download
                    style={{
                      color: '#0066ff',
                      fontWeight: 600,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {art.type === 'ipa' ? (
                      <span style={{ fontSize: '1rem' }}>🍎</span>
                    ) : (
                      <span style={{ fontSize: '1rem' }}>📦</span>
                    )}
                    <span>
                      {art.name} <span style={{ color: '#4b5563', fontWeight: 500 }}>[{art.size}]</span>
                    </span>
                  </a>

                  {art.type === 'ipa' && (
                    <button
                      title="QR Code para download no iPhone"
                      onClick={() => alert(`Scan QR code or open direct link on iPhone: ${window.location.origin}${art.url}`)}
                      style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                    >
                      <QrCode size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>


      {/* RIGHT COLUMN: Codemagic Build Steps & Terminal (Dark Theme #121316) */}
      <div
        style={{
          flex: 1,
          background: '#121316',
          padding: '40px 48px',
          color: '#f0f1f5',
          boxSizing: 'border-box',
          overflowY: 'auto'
        }}
      >

        {/* Codemagic Subtitle */}
        <p style={{ color: '#94969c', fontSize: '0.875rem', fontWeight: 400, marginBottom: '20px' }}>
          Click on the build steps for details.
        </p>

        {/* Codemagic Separator Line */}
        <div style={{ height: '1px', background: '#26272c', marginBottom: '28px', width: '100%' }} />

        {/* Codemagic Steps Accordion List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' }}>
          {steps.map((step) => {
            const isExpanded = !!expandedSteps[step.id];
            const isFailed = step.status === 'FAILED';
            const isRunning = step.status === 'RUNNING';
            const isFullscreen = fullscreenStep === step.id;

            let headerBg = '#16171a';
            let headerTextColor = '#ffffff';

            if (isFailed) {
              headerBg = '#dc2626'; // Solid Codemagic Red on error
            } else if (isExpanded) {
              headerBg = '#0066ff'; // Solid Codemagic Blue when expanded
            }

            return (
              <div
                key={step.id}
                style={{
                  width: '100%',
                  position: isFullscreen ? 'fixed' : 'relative',
                  top: isFullscreen ? 0 : 'auto',
                  left: isFullscreen ? 0 : 'auto',
                  right: isFullscreen ? 0 : 'auto',
                  bottom: isFullscreen ? 0 : 'auto',
                  zIndex: isFullscreen ? 9999 : 1,
                  height: isFullscreen ? '100vh' : 'auto',
                  display: isFullscreen ? 'flex' : 'block',
                  flexDirection: isFullscreen ? 'column' : 'row',
                  background: isFullscreen ? '#0b0c0e' : 'transparent'
                }}
              >
                {/* Step Header Row */}
                <div
                  onClick={() => toggleStep(step.id)}
                  style={{
                    background: headerBg,
                    color: headerTextColor,
                    padding: '16px 24px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'background 0.15s ease',
                    borderRadius: isExpanded ? '4px 4px 0 0' : '4px'
                  }}
                >
                  {/* Step Title */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {isRunning && (
                      <Loader2 size={16} className="animate-spin" style={{ color: '#ffffff' }} />
                    )}
                    <span style={{ fontWeight: 500, fontSize: '0.925rem', letterSpacing: '-0.01em' }}>
                      {step.name}
                    </span>
                  </div>

                  {/* Duration & Download Icon */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    {step.durationStr && (
                      <span style={{ fontSize: '0.85rem', color: isExpanded || isFailed ? '#ffffff' : '#8e919a', fontWeight: 400 }}>
                        {step.durationStr}
                      </span>
                    )}

                    <button
                      onClick={(e) => downloadStepLogs(step.name, step.lines, e)}
                      title="Download step log"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: isExpanded || isFailed ? '#ffffff' : '#8e919a',
                        cursor: 'pointer',
                        padding: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'color 0.15s ease'
                      }}
                    >
                      <CodemagicDownloadIcon size={16} />
                    </button>
                  </div>
                </div>

                {/* Terminal Box when Step is Expanded */}
                {isExpanded && (
                  <div
                    style={{
                      position: 'relative',
                      background: '#0b0c0e',
                      borderLeft: isFailed ? '1px solid #dc2626' : isExpanded ? '1px solid #0066ff' : 'none',
                      borderRight: isFailed ? '1px solid #dc2626' : isExpanded ? '1px solid #0066ff' : 'none',
                      borderBottom: isFailed ? '1px solid #dc2626' : isExpanded ? '1px solid #0066ff' : 'none',
                      borderRadius: '0 0 4px 4px',
                      flex: isFullscreen ? 1 : 'none'
                    }}
                  >
                    {/* Codemagic Floating Control Pill */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        zIndex: 10,
                        background: '#1c1d22',
                        border: '1px solid #2a2b32',
                        borderRadius: '20px',
                        padding: '6px 4px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                      }}
                    >
                      <button
                        onClick={() => setFullscreenStep(isFullscreen ? null : step.id)}
                        title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                        style={{ background: 'none', border: 'none', color: '#8e919a', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }}
                      >
                        {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                      </button>
                      <button
                        onClick={() => scrollToTop(step.id)}
                        title="Ir para o topo"
                        style={{ background: 'none', border: 'none', color: '#8e919a', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        onClick={() => scrollToBottom(step.id)}
                        title="Ir para o final"
                        style={{ background: 'none', border: 'none', color: '#8e919a', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }}
                      >
                        <ArrowDown size={15} />
                      </button>
                    </div>

                    {/* Monospace Terminal Body */}
                    <div
                      ref={(el) => (terminalRefs.current[step.id] = el)}
                      style={{
                        padding: '20px 24px',
                        maxHeight: isFullscreen ? 'calc(100vh - 70px)' : '420px',
                        overflowY: 'auto',
                        fontFamily: "'Menlo', 'Monaco', 'Consolas', 'Courier New', monospace",
                        fontSize: '0.825rem',
                        lineHeight: '1.65',
                        color: '#d4d4d4',
                        background: '#0b0c0e'
                      }}
                    >
                      {step.lines.length > 0 ? (
                        step.lines.map((line, lIdx) => {
                          const isLineError = /❌|error|failed|fatal|exception/i.test(line);
                          const isLineCommand = line.startsWith('>') || line.startsWith('==');
                          const isLineWarning = /⚠️|warning/i.test(line);

                          let lineColor = '#d4d4d4';
                          if (isLineError) lineColor = '#f87171';
                          else if (isLineCommand) lineColor = '#38bdf8';
                          else if (isLineWarning) lineColor = '#fbbf24';

                          return (
                            <div key={lIdx} style={{ display: 'flex', gap: '20px' }}>
                              <span
                                style={{
                                  width: '32px',
                                  textAlign: 'right',
                                  color: '#474a57',
                                  userSelect: 'none',
                                  flexShrink: 0,
                                  fontFamily: 'monospace'
                                }}
                              >
                                {lIdx}
                              </span>
                              <span style={{ color: lineColor, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                {line}
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <div style={{ color: '#565a6e', fontStyle: 'italic' }}>
                          No log output for this step.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
