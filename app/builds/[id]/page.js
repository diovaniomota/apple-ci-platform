"use client";

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Terminal } from 'lucide-react';

export default function BuildLiveLogs() {
  const { id } = useParams();
  const [build, setBuild] = useState(null);
  const logsEndRef = useRef(null);

  useEffect(() => {
    // Poll the API for build status and logs
    const interval = setInterval(() => {
      fetch(`/api/builds/${id}`)
        .then(res => res.json())
        .then(data => {
          setBuild(data);
          if (data.status === 'SUCCESS' || data.status === 'FAILED') {
            clearInterval(interval);
          }
        });
    }, 2000); // poll every 2 seconds

    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [build?.logs]);

  if (!build) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading build...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link href={`/projects/${build.projectId}`} style={{ color: 'var(--text-muted)' }}>
            <ArrowLeft size={20} />
          </Link>
          <h1 style={{ fontSize: '1.5rem' }}>Build #{build.id.substring(0, 8)}</h1>
          <span className={`status-badge status-${build.status}`}>
            {build.status}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, background: '#000', borderRadius: '12px', padding: '16px', overflowY: 'auto', fontFamily: 'monospace', color: '#0f0', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: '#fff', opacity: 0.5 }}>
          <Terminal size={16} /> Live Terminal Output
        </div>
        <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', margin: 0, lineHeight: 1.5 }}>
          {build.logs}
        </pre>
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
