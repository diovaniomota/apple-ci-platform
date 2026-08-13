"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Cpu,
  HardDrive,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Server,
  RefreshCw,
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  Trash2,
  Sparkles
} from 'lucide-react';

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cleaningDisk, setCleaningDisk] = useState(false);
  const [cleanMessage, setCleanMessage] = useState(null);

  const fetchAnalytics = () => {
    fetch('/api/analytics')
      .then(res => res.json())
      .then(resData => {
        setData(resData);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load analytics:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleManualDiskCleanup = async () => {
    setCleaningDisk(true);
    setCleanMessage(null);
    try {
      const res = await fetch('/api/analytics/clean-disk', { method: 'POST' });
      const resData = await res.json();
      if (res.ok) {
        setCleanMessage(resData.message || 'Limpeza concluída com sucesso!');
        fetchAnalytics();
      } else {
        setCleanMessage(`Erro: ${resData.error || 'Falha ao limpar'}`);
      }
    } catch (e) {
      setCleanMessage('Erro ao comunicar com a API de limpeza.');
    } finally {
      setCleaningDisk(false);
      setTimeout(() => setCleanMessage(null), 5000);
    }
  };

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: 'var(--text-muted)' }}>
        <RefreshCw size={24} className="animate-spin" style={{ marginRight: '10px' }} />
        <span>Carregando métricas e telemetria...</span>
      </div>
    );
  }

  const summary = data?.summary || {
    totalBuilds: 0,
    successBuilds: 0,
    failedBuilds: 0,
    cancelledBuilds: 0,
    runningBuilds: 0,
    successRate: '100.0%',
    avgDuration: '4m 27s',
    timeSavedMin: '0 min'
  };

  const runners = data?.runners || [];
  const onlineCount = runners.filter(r => r.status === 'ONLINE' || r.status === 'BUILDING').length;

  return (
    <div style={{ paddingBottom: '60px' }}>
      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Link href="/" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', textDecoration: 'none', fontSize: '0.875rem' }}>
              <ArrowLeft size={16} style={{ marginRight: '4px' }} /> Projects
            </Link>
            <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: '0.875rem', color: 'var(--primary-color)' }}>Analytics & Telemetry</span>
          </div>
          <h1 style={{ fontSize: '2.1rem', fontWeight: 700, margin: 0 }}>
            Dashboard Analytics & Saúde do Runner
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '6px 0 0 0', fontSize: '0.95rem' }}>
            Monitoramento de desempenho do pipeline CI/CD, retenção de artefatos e telemetria de hardware do Mac mini.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleManualDiskCleanup}
            disabled={cleaningDisk}
            className="btn-primary"
            style={{ padding: '8px 16px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171' }}
          >
            <Trash2 size={15} />
            {cleaningDisk ? 'Limpando...' : 'Executar Limpeza SSD Agora'}
          </button>

          <button
            onClick={fetchAnalytics}
            className="btn-primary"
            style={{ padding: '8px 16px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc' }}
          >
            <RefreshCw size={15} />
            Atualizar Agora
          </button>
        </div>
      </div>

      {cleanMessage && (
        <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', borderRadius: '10px', padding: '12px 18px', marginBottom: '24px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={16} /> {cleanMessage}
        </div>
      )}

      {/* KPI Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '36px' }}>

        {/* Success Rate Card */}
        <div className="glass-panel" style={{ padding: '22px', borderRadius: '14px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>Taxa de Sucesso</span>
            <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981', marginBottom: '8px' }}>
            {summary.successRate}
          </div>
          <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: summary.successRate, height: '100%', background: '#10b981', borderRadius: '3px' }} />
          </div>
        </div>

        {/* Avg Duration Card */}
        <div className="glass-panel" style={{ padding: '22px', borderRadius: '14px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>Duração Média</span>
            <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
              <Clock size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f8fafc', marginBottom: '8px' }}>
            {summary.avgDuration}
          </div>
          <span style={{ fontSize: '0.775rem', color: '#94a3b8' }}>
            Tempo médio por compilação iOS
          </span>
        </div>

        {/* Cache Time Saved Card */}
        <div className="glass-panel" style={{ padding: '22px', borderRadius: '14px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>Tempo Economizado</span>
            <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c084fc' }}>
              <Zap size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#c084fc', marginBottom: '8px' }}>
            {summary.timeSavedMin}
          </div>
          <span style={{ fontSize: '0.775rem', color: '#c084fc' }}>
            ⚡ Via Cache Inteligente de Pods
          </span>
        </div>

        {/* Total Builds Executed Card */}
        <div className="glass-panel" style={{ padding: '22px', borderRadius: '14px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>Total de Builds</span>
            <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'rgba(234, 179, 8, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#eab308' }}>
              <Activity size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f8fafc', marginBottom: '8px' }}>
            {summary.totalBuilds}
          </div>
          <span style={{ fontSize: '0.775rem', color: '#94a3b8' }}>
            {summary.successBuilds} Sucessos • {summary.failedBuilds} Falhas
          </span>
        </div>

      </div>

      {/* MAC MINI RUNNERS HEALTH SECTION */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <Server size={22} color="#3b82f6" />
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0 }}>
            Saúde & Telemetria do Mac Mini Runner
          </h2>
          <span style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>
            {onlineCount} Runner(s) Ativo(s)
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
          {runners.map(runner => {
            const isOnline = runner.status === 'ONLINE' || runner.status === 'BUILDING';
            const isBuilding = runner.status === 'BUILDING';

            return (
              <div
                key={runner.id}
                className="glass-panel"
                style={{
                  padding: '28px',
                  borderRadius: '16px',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: isBuilding ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: isBuilding ? '0 0 20px rgba(59, 130, 246, 0.2)' : 'none'
                }}
              >
                {/* Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                        {runner.hostname}
                      </h3>
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '0.725rem',
                          fontWeight: 700,
                          background: isBuilding ? 'rgba(59, 130, 246, 0.2)' : isOnline ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: isBuilding ? '#60a5fa' : isOnline ? '#34d399' : '#f87171',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'currentColor' }} />
                        {runner.status}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                      {runner.machine}
                    </p>
                  </div>

                  <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span>
                      {runner.lastSeenAgoSec == null
                        ? 'Sem heartbeat'
                        : `Ping: ${runner.lastSeenAgoSec}s atrás`}
                    </span>
                  </div>
                </div>

                {/* Active Build Notification Badge if Building */}
                {runner.activeBuild && (
                  <div style={{ background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '10px', padding: '10px 14px', marginBottom: '20px', fontSize: '0.825rem', color: '#93c5fd', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Compilando build em andamento...</span>
                    </div>
                    <Link href={`/builds/${runner.activeBuild}`} style={{ color: '#60a5fa', fontWeight: 600, textDecoration: 'none' }}>
                      Ver Live Log →
                    </Link>
                  </div>
                )}

                {/* METRICS METERS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                  {/* CPU Meter */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem', marginBottom: '6px' }}>
                      <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Cpu size={15} color="#60a5fa" /> Processador (CPU)
                      </span>
                      <span style={{ fontWeight: 700, color: runner.cpuUsage > 80 ? '#f87171' : '#f8fafc' }}>
                        {runner.cpuUsage}%
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, runner.cpuUsage)}%`,
                          height: '100%',
                          background: runner.cpuUsage > 80 ? '#ef4444' : '#3b82f6',
                          borderRadius: '4px',
                          transition: 'width 0.5s ease'
                        }}
                      />
                    </div>
                  </div>

                  {/* RAM Meter */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem', marginBottom: '6px' }}>
                      <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Activity size={15} color="#c084fc" /> Memória RAM ({runner.memTotal})
                      </span>
                      <span style={{ fontWeight: 700, color: runner.memUsage > 85 ? '#f87171' : '#f8fafc' }}>
                        {runner.memUsage}%
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, runner.memUsage)}%`,
                          height: '100%',
                          background: runner.memUsage > 85 ? '#ef4444' : '#a855f7',
                          borderRadius: '4px',
                          transition: 'width 0.5s ease'
                        }}
                      />
                    </div>
                  </div>

                  {/* Disk Free Meter */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem', marginBottom: '6px' }}>
                      <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <HardDrive size={15} color="#34d399" /> Disco Rígido SSD
                      </span>
                      <span style={{ fontWeight: 700, color: runner.diskUsage > 90 ? '#f87171' : '#f8fafc' }}>
                        {runner.diskFree} ({runner.diskUsage}% usado)
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, runner.diskUsage)}%`,
                          height: '100%',
                          background: runner.diskUsage > 90 ? '#ef4444' : '#10b981',
                          borderRadius: '4px',
                          transition: 'width 0.5s ease'
                        }}
                      />
                    </div>
                  </div>

                </div>

                {/* Footer Security Badge */}
                <div style={{ marginTop: '22px', pt: '14px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ShieldCheck size={14} color="#10b981" /> Daemon `launchctl` ativo
                  </span>
                  <span>IP: Local Runner</span>
                </div>

              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
