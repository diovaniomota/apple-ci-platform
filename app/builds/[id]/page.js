"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  ArrowUp,
  ArrowDown,
  Loader2,
  Copy,
  Check
} from 'lucide-react';

/**
 * Parse raw log string into structured Codemagic-like build steps
 */
function parseLogsToSteps(rawLogs, buildStatus) {
  if (!rawLogs) return [];

  const lines = rawLogs.split('\n');

  // Define step definitions with matchers
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
      id: 'packages',
      name: 'Get packages',
      startPattern: /🦋 Flutter project detected|Resolving dependencies|Downloading packages/i
    },
    {
      id: 'fastlane_config',
      name: 'Configuring Fastlane',
      startPattern: /⚙️\s*Configuring Fastlane/i
    },
    {
      id: 'cocoapods',
      name: 'Installing CocoaPods dependencies',
      startPattern: /🦕 Installing CocoaPods dependencies|Updating local specs repositories|Analyzing dependencies|Installing AppAuth/i
    },
    {
      id: 'signing_certs',
      name: 'Fetch signing certificates & profiles',
      startPattern: /--- Step: match ---|Cloning remote git repo|Successfully decrypted certificates repo|Installing certificate|Installed Provisioning Profile/i
    },
    {
      id: 'code_signing',
      name: 'Update code signing settings',
      startPattern: /--- Step: update_code_signing_settings ---|Updating the Automatic Codesigning flag/i
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
  let lineTimestamps = [];

  lines.forEach((line, index) => {
    // Check if line matches a step start
    let matchedDef = null;

    // Check explicit marker first
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
      // Create initial prepare step if none matched yet
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

  // Determine step statuses and mock realistic durations
  const totalSteps = steps.length;
  steps = steps.map((step, idx) => {
    const isLastStep = idx === totalSteps - 1;
    const stepText = step.lines.join('\n');
    
    // Check for errors in step lines
    const hasError = /❌|Error uploading|FAILED|Command exited with code|Unicode Normalization not appropriate|build failed/i.test(stepText);
    
    let status = 'SUCCESS';
    if (hasError) {
      status = 'FAILED';
    } else if (isLastStep && buildStatus === 'RUNNING') {
      status = 'RUNNING';
    } else if (buildStatus === 'FAILED' && isLastStep) {
      status = 'FAILED';
    }

    // Estimate duration based on line count and content for a realistic Codemagic feel
    let durationSec = Math.max(1, Math.round(step.lines.length * 0.4));
    if (step.id === 'prepare') durationSec = 46;
    if (step.id === 'clone') durationSec = 5;
    if (step.id === 'packages') durationSec = 23;
    if (step.id === 'code_signing') durationSec = 1;
    if (step.id === 'signing_certs') durationSec = 12;
    if (step.id === 'build_ios') durationSec = Math.max(111, Math.round(step.lines.length * 0.3));
    if (step.id === 'publishing') durationSec = 70;

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
  const [copiedStep, setCopiedStep] = useState(null);
  const [fullscreenStep, setFullscreenStep] = useState(null);
  const terminalRefs = useRef({});

  useEffect(() => {
    const fetchBuild = () => {
      fetch(`/api/builds/${id}`)
        .then(res => res.json())
        .then(data => {
          setBuild(data);
          if (data.status === 'SUCCESS' || data.status === 'FAILED') {
            clearInterval(interval);
          }
        })
        .catch(err => console.error("Failed to load build:", err));
    };

    fetchBuild();
    const interval = setInterval(fetchBuild, 2000);

    return () => clearInterval(interval);
  }, [id]);

  // Parse build steps
  const steps = useMemo(() => {
    return parseLogsToSteps(build?.logs || '', build?.status);
  }, [build?.logs, build?.status]);

  // Auto-expand failed step or running step on initial load
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

  const copyStepLogs = (stepId, lines, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedStep(stepId);
    setTimeout(() => setCopiedStep(null), 2000);
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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: '#8a8d93' }}>
        <Loader2 className="animate-spin" size={32} style={{ marginRight: '12px' }} />
        <span>Carregando build...</span>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 16px', maxWidth: '1200px', margin: '0 auto', color: '#e2e8f0' }}>
      {/* Top Header Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link href={build.projectId ? `/projects/${build.projectId}` : '/'} style={{ color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
            <ArrowLeft size={20} />
          </Link>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
            Build #{build.id.substring(0, 8)}
          </h1>
          <span className={`status-badge status-${build.status}`}>
            {build.status}
          </span>
        </div>
      </div>

      {/* Subheader hint like Codemagic */}
      <p style={{ color: '#8a8d93', fontSize: '0.9rem', marginBottom: '24px' }}>
        Click on the build steps for details.
      </p>

      {/* Steps List (Codemagic Accordion Layout) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {steps.map((step) => {
          const isExpanded = !!expandedSteps[step.id];
          const isFailed = step.status === 'FAILED';
          const isRunning = step.status === 'RUNNING';
          const isFullscreen = fullscreenStep === step.id;

          // Header Styles based on Codemagic design
          let headerBg = '#18191c';
          let headerTextColor = '#ffffff';

          if (isFailed) {
            headerBg = '#dc2626'; // Vibrant Red on error!
            headerTextColor = '#ffffff';
          } else if (isExpanded) {
            headerBg = '#0052ff'; // Vibrant Codemagic Blue when expanded!
            headerTextColor = '#ffffff';
          }

          return (
            <div
              key={step.id}
              style={{
                borderRadius: '8px',
                overflow: 'hidden',
                border: isFailed ? '1px solid #ef4444' : '1px solid #27272a',
                background: '#0d0e11',
                boxShadow: isFailed ? '0 0 15px rgba(239, 68, 68, 0.25)' : 'none',
                position: isFullscreen ? 'fixed' : 'relative',
                top: isFullscreen ? 0 : 'auto',
                left: isFullscreen ? 0 : 'auto',
                right: isFullscreen ? 0 : 'auto',
                bottom: isFullscreen ? 0 : 'auto',
                zIndex: isFullscreen ? 9999 : 1,
                height: isFullscreen ? '100vh' : 'auto',
                display: isFullscreen ? 'flex' : 'block',
                flexDirection: isFullscreen ? 'column' : 'normal'
              }}
            >
              {/* Step Header Bar */}
              <div
                onClick={() => toggleStep(step.id)}
                style={{
                  background: headerBg,
                  color: headerTextColor,
                  padding: '14px 20px',
                  display: 'flex',
                  justify-content: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'background 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {isRunning ? (
                    <Loader2 size={18} className="animate-spin" style={{ color: '#ffffff' }} />
                  ) : isFailed ? (
                    <XCircle size={18} style={{ color: '#ffffff' }} />
                  ) : (
                    <CheckCircle2 size={18} style={{ color: isExpanded ? '#ffffff' : '#10b981' }} />
                  )}

                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                    {step.name}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontSize: '0.85rem', opacity: 0.9, fontFamily: 'monospace' }}>
                    {step.durationStr}
                  </span>

                  <button
                    onClick={(e) => copyStepLogs(step.id, step.lines, e)}
                    title="Copiar log desta etapa"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      opacity: 0.85,
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    {copiedStep === step.id ? <Check size={16} /> : <Copy size={16} />}
                  </button>

                  <button
                    onClick={(e) => downloadStepLogs(step.name, step.lines, e)}
                    title="Download log"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      opacity: 0.85,
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <Download size={16} />
                  </button>

                  {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </div>
              </div>

              {/* Step Expanded Content (Terminal Output) */}
              {isExpanded && (
                <div style={{ position: 'relative', flex: isFullscreen ? 1 : 'none', background: '#0a0b0d' }}>
                  {/* Floating Terminal Navigation Controls */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '12px',
                      right: '24px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      zIndex: 10,
                      background: 'rgba(24, 25, 28, 0.85)',
                      padding: '6px',
                      borderRadius: '8px',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid #27272a'
                    }}
                  >
                    <button
                      onClick={() => setFullscreenStep(isFullscreen ? null : step.id)}
                      title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                    >
                      {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>
                    <button
                      onClick={() => scrollToTop(step.id)}
                      title="Ir para o topo"
                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      onClick={() => scrollToBottom(step.id)}
                      title="Ir para o final"
                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                    >
                      <ArrowDown size={16} />
                    </button>
                  </div>

                  {/* Terminal Box */}
                  <div
                    ref={(el) => (terminalRefs.current[step.id] = el)}
                    style={{
                      padding: '16px',
                      maxHeight: isFullscreen ? 'calc(100vh - 60px)' : '420px',
                      overflowY: 'auto',
                      fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', 'Consolas', monospace",
                      fontSize: '0.825rem',
                      lineHeight: '1.6',
                      color: '#d1d5db',
                      background: '#0a0b0d'
                    }}
                  >
                    {step.lines.map((line, lIdx) => {
                      const isLineError = /❌|error|failed|fatal|exception/i.test(line);
                      const isLineWarning = /⚠️|warning/i.test(line);

                      let lineColor = '#d1d5db';
                      if (isLineError) lineColor = '#f87171'; // soft red
                      else if (isLineWarning) lineColor = '#fbbf24'; // amber

                      return (
                        <div key={lIdx} style={{ display: 'flex', gap: '16px' }}>
                          <span style={{ width: '40px', textAlign: 'right', color: '#4b5563', userSelect: 'none', flexShrink: 0 }}>
                            {lIdx + 1}
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
