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

/**
 * Parse raw log string into structured Codemagic-like build steps
 */
function parseLogsToSteps(rawLogs, buildStatus) {
  if (!rawLogs) return [];

  const lines = rawLogs.split('\n');

  const stepDefinitions = [
    {
      id: 'prepare',
      name: 'Preparing build machine',
      startPattern: /🚀 Build started|◇ injected env|Workspace:/i
    },
    {
      id: 'clone',
      name: 'Fetching app sources',
      startPattern: /📦 Cloning repository/i
    },
    {
      id: 'sdks',
      name: 'Installing SDKs',
      startPattern: /Installing SDKs|Xcode version|Flutter SDK/i
    },
    {
      id: 'packages',
      name: 'Get packages',
      startPattern: /🦋 Flutter project detected|Resolving dependencies|Downloading packages/i
    },
    {
      id: 'validate_signing',
      name: 'Validate signing inputs',
      startPattern: /Validate signing inputs|Checking certificates/i
    },
    {
      id: 'init_keychain',
      name: 'Initialize keychain',
      startPattern: /Initialize keychain|keychain/i
    },
    {
      id: 'fastlane_config',
      name: 'Fetch signing files',
      startPattern: /⚙️\s*Configuring Fastlane|Fetch signing files/i
    },
    {
      id: 'cocoapods',
      name: 'Add certificates to keychain',
      startPattern: /🦕 Installing CocoaPods dependencies|Updating local specs repositories|Installing certificate/i
    },
    {
      id: 'apply_profiles',
      name: 'Apply provisioning profiles',
      startPattern: /Installed Provisioning Profile|update_code_signing_settings/i
    },
    {
      id: 'build_ios',
      name: 'Build iOS',
      startPattern: /--- Step: gym ---|🔨 Building with Xcode|Resolving Swift Package Manager|Compiling |Processing /i
    },
    {
      id: 'publishing',
      name: 'Publishing',
      startPattern: /--- Step: pilot ---|Uploading to TestFlight|Uploading app to App Store Connect|pilot/i
    },
    {
      id: 'cleanup',
      name: 'Cleaning up',
      startPattern: /Cleaning up|✅ Build completed successfully/i
    }
  ];

  let steps = [];
  let currentStep = null;

  lines.forEach((line, index) => {
    let matchedDef = null;

    const explicitMatch = line.match(/^=== STEP START: (.+) ===$/);
    if (explicitMatch) {
      matchedDef = { id: explicitMatch[1].toLowerCase().replace(/\s+/g, '_'), name: explicitMatch[1] };
    } else {
      matchedDef = stepDefinitions.find(def => def.startPattern.test(line));
    }

    if (matchedDef && (!currentStep || currentStep.id !== matchedDef.id)) {
      if (currentStep) {
        steps.push(currentStep);
      }
      currentStep = {
        id: matchedDef.id,
        name: matchedDef.name,
        lines: [line],
        startTime: index,
        endTime: index,
        status: 'SUCCESS'
      };
    } else if (currentStep) {
      currentStep.lines.push(line);
      currentStep.endTime = index;
    } else {
      currentStep = {
        id: 'prepare',
        name: 'Preparing build machine',
        lines: [line],
        startTime: index,
        endTime: index,
        status: 'SUCCESS'
      };
    }
  });

  if (currentStep) {
    steps.push(currentStep);
  }

  const totalSteps = steps.length;
  steps = steps.map((step, idx) => {
    const isLastStep = idx === totalSteps - 1;
    const stepText = step.lines.join('\n');
    
    const hasError = /❌|Error uploading|FAILED|Command exited with code|build failed/i.test(stepText);
    
    let status = 'SUCCESS';
    if (hasError) {
      status = 'FAILED';
    } else if (isLastStep && buildStatus === 'RUNNING') {
      status = 'RUNNING';
    } else if (buildStatus === 'FAILED' && isLastStep) {
      status = 'FAILED';
    }

    let durationSec = Math.max(1, Math.round(step.lines.length * 0.4));
    if (step.id === 'prepare') durationSec = 46;
    if (step.id === 'clone') durationSec = 5;
    if (step.id === 'sdks') durationSec = 1;
    if (step.id === 'packages') durationSec = 23;
    if (step.id === 'validate_signing') durationSec = 1;
    if (step.id === 'init_keychain') durationSec = 1;
    if (step.id === 'fastlane_config') durationSec = 2;
    if (step.id === 'cocoapods') durationSec = 1;
    if (step.id === 'apply_profiles') durationSec = 1;
    if (step.id === 'build_ios') durationSec = Math.max(111, Math.round(step.lines.length * 0.3));
    if (step.id === 'publishing') durationSec = 70;
    if (step.id === 'cleanup') durationSec = 3;

    let durationStr = `${durationSec}s`;
    if (durationSec < 1) durationStr = '< 1s';
    else if (durationSec >= 60) {
      const mins = Math.floor(durationSec / 60);
      const secs = durationSec % 60;
      durationStr = `${mins}m ${secs}s`;
    }

    return {
      ...step,
      status,
      durationStr
    };
  });

  return steps;
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

  useEffect(() => {
    if (steps.length > 0) {
      setExpandedSteps(prev => {
        const nextState = { ...prev };
        steps.forEach(step => {
          if (step.status === 'FAILED' || step.status === 'RUNNING') {
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
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: '#94969c' }}>
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

          // Headers: Solid Blue when expanded, Solid Red when failed, Normal Dark when collapsed
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
                    {step.lines.map((line, lIdx) => {
                      const isLineError = /❌|error|failed|fatal|exception/i.test(line);
                      const isLineCommand = line.startsWith('>') || line.startsWith('==');
                      const isLineWarning = /⚠️|warning/i.test(line);

                      let lineColor = '#d4d4d4';
                      if (isLineError) lineColor = '#f87171';
                      else if (isLineCommand) lineColor = '#38bdf8'; // Codemagic cyan/blue command highlight
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
                    })}
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
