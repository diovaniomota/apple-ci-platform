"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Maximize2,
  Minimize2,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

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
  { id: 'prepare', name: 'Preparing build machine', defaultDuration: '46s' },
  { id: 'clone', name: 'Fetching app sources', defaultDuration: '5s' },
  { id: 'sdks', name: 'Installing SDKs', defaultDuration: '< 1s' },
  { id: 'packages', name: 'Get packages', defaultDuration: '23s' },
  { id: 'validate_signing', name: 'Validate signing inputs', defaultDuration: '< 1s' },
  { id: 'init_keychain', name: 'Initialize keychain', defaultDuration: '< 1s' },
  { id: 'fastlane_config', name: 'Fetch signing files', defaultDuration: '2s' },
  { id: 'cocoapods', name: 'Add certificates to keychain', defaultDuration: '< 1s' },
  { id: 'apply_profiles', name: 'Apply provisioning profiles', defaultDuration: '1s' },
  { id: 'build_ios', name: 'Build iOS', defaultDuration: '1m 51s' },
  { id: 'publishing', name: 'Publishing', defaultDuration: '1m 10s' },
  { id: 'cleanup', name: 'Cleaning up', defaultDuration: '3s' }
];

/**
 * Parse raw log string into structured Codemagic-like build steps
 */
function parseLogsToSteps(rawLogs, buildStatus) {
  if (!rawLogs) {
    return CODEMAGIC_STEPS.map(s => ({
      ...s,
      lines: ['No logs available'],
      status: 'PENDING',
      durationStr: s.defaultDuration
    }));
  }

  const lines = rawLogs.split('\n');

  // Check if logs contain explicit STEP START markers
  const hasExplicitMarkers = lines.some(line => line.startsWith('=== STEP START:'));

  let stepMap = {};
  CODEMAGIC_STEPS.forEach(s => {
    stepMap[s.id] = {
      ...s,
      lines: [],
      status: 'PENDING',
      durationStr: s.defaultDuration
    };
  });

  if (hasExplicitMarkers) {
    let currentId = 'prepare';
    lines.forEach(line => {
      const matchStart = line.match(/^=== STEP START: (.+) ===$/);
      const matchEnd = line.match(/^=== STEP END: (.+) ===$/);

      if (matchStart) {
        const found = CODEMAGIC_STEPS.find(s => s.name.toLowerCase() === matchStart[1].trim().toLowerCase());
        if (found) currentId = found.id;
        return;
      }
      if (matchEnd) return;

      if (stepMap[currentId]) {
        stepMap[currentId].lines.push(line);
        stepMap[currentId].status = 'SUCCESS';
      }
    });
  } else {
    // Legacy fallback: divide lines sequentially among standard steps
    let currentId = 'prepare';
    lines.forEach(line => {
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

      if (stepMap[currentId]) {
        stepMap[currentId].lines.push(line);
        stepMap[currentId].status = 'SUCCESS';
      }
    });
  }

  // Determine status and error highlights for each step
  return CODEMAGIC_STEPS.map((def, idx) => {
    const step = stepMap[def.id];
    const stepText = step.lines.join('\n');
    const hasError = /❌|Error uploading|FAILED|Command exited with code|build failed/i.test(stepText);

    let status = step.lines.length > 0 ? 'SUCCESS' : 'PENDING';
    if (hasError) {
      status = 'FAILED';
    } else if (buildStatus === 'RUNNING' && idx === CODEMAGIC_STEPS.findIndex(s => stepMap[s.id].lines.length > 0)) {
      status = 'RUNNING';
    } else if (buildStatus === 'FAILED' && idx === CODEMAGIC_STEPS.length - 1 && !stepMap.publishing.lines.length) {
      // mark active failed step
      if (hasError) status = 'FAILED';
    }

    return {
      ...step,
      status,
      durationStr: def.defaultDuration
    };
  });
}

export default function BuildLiveLogs() {
  const { id } = useParams();
  const [build, setBuild] = useState(null);
  const [expandedSteps, setExpandedSteps] = useState({});
  const [fullscreenStep, setFullscreenStep] = useState(null);
  const terminalRefs = useRef({});

  useEffect(() => {
    let interval;
    const fetchBuild = () => {
      fetch(`/api/builds/${id}`)
        .then(res => res.json())
        .then(data => {
          setBuild(data);
          if (data.status === 'SUCCESS' || data.status === 'FAILED') {
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

  const steps = useMemo(() => {
    return parseLogsToSteps(build?.logs || '', build?.status);
  }, [build?.logs, build?.status]);

  // Auto-expand FAILED step on load if present
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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: '#94969c', background: '#121316' }}>
        <Loader2 className="animate-spin" size={28} style={{ marginRight: '12px' }} />
        <span>Carregando build...</span>
      </div>
    );
  }

  return (
    <div style={{ background: '#121316', minHeight: '100vh', padding: '32px 48px', color: '#f0f1f5', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
      {/* Navigation Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link href={build.projectId ? `/projects/${build.projectId}` : '/'} style={{ color: '#94969c', display: 'flex', alignItems: 'center' }}>
            <ArrowLeft size={20} />
          </Link>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
            Build #{build.id.substring(0, 8)}
          </h1>
          <span className={`status-badge status-${build.status}`}>
            {build.status}
          </span>
        </div>
      </div>

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
                  <span style={{ fontSize: '0.85rem', color: isExpanded || isFailed ? '#ffffff' : '#8e919a', fontWeight: 400 }}>
                    {step.durationStr}
                  </span>

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
  );
}
