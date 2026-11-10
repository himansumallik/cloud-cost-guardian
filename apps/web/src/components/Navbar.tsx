import React, { useState } from 'react';

export interface NavbarProps {
  region: string;
  setRegion: (r: string) => void;
  dryRun: boolean;
  setDryRun: (d: boolean) => void;
  onRunScan: () => void;
  activeTab: string;
  setActiveTab: (t: string) => void;
  awsKeyId: string;
  awsSecretKey: string;
  onSaveCredentials: (keyId: string, secretKey: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  region,
  setRegion,
  dryRun,
  setDryRun,
  onRunScan,
  activeTab,
  setActiveTab,
  awsKeyId,
  awsSecretKey,
  onSaveCredentials,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [tempKeyId, setTempKeyId] = useState(awsKeyId);
  const [tempSecretKey, setTempSecretKey] = useState(awsSecretKey);

  return (
    <>
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold">
              CCG
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Cloud Cost Guardian</h1>
              <p className="text-xs text-slate-400">Approval-Gated AWS Cost Optimization • PERN + DevOps</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setTempKeyId(awsKeyId);
                setTempSecretKey(awsSecretKey);
                setShowModal(true);
              }}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition ${
                awsKeyId
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${awsKeyId ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`}></span>
              {awsKeyId ? 'AWS Keys Connected' : 'Set AWS Keys'}
            </button>

            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-emerald-400 font-mono"
            >
              <option value="ap-south-1">ap-south-1 (Mumbai)</option>
              <option value="us-east-1">us-east-1 (N. Virginia)</option>
            </select>

            <button
              type="button"
              onClick={() => setDryRun(!dryRun)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                dryRun
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-rose-500/20 border-rose-500/50 text-rose-300'
              }`}
            >
              {dryRun ? 'Dry-Run Mode: ON' : 'Live AWS Mode: ON'}
            </button>

            <button
              type="button"
              onClick={onRunScan}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold"
            >
              Run AWS Scan
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 flex flex-wrap gap-1 border-t border-slate-800/80 pt-1">
          {[
            { id: 'terraform', label: '1. Terraform (.tf)' },
            { id: 'ansible', label: '2. Ansible Playbooks' },
            { id: 'kubernetes', label: '3. Kubernetes (kind)' },
            { id: 'cicd', label: '4. Docker & Jenkins CI/CD' },
            { id: 'recommendations', label: '5. FinOps Approvals' },
            { id: 'inventory', label: '6. AWS Inventory' },
            { id: 'audit', label: '7. Audit Trail' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition ${
                activeTab === t.id
                  ? 'border-emerald-400 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Configure AWS IAM Credentials</h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Enter your IAM user Access Key and Secret. These are stored in your browser's{' '}
              <span className="font-mono text-emerald-400">localStorage</span> and passed via headers when calling AWS APIs.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">AWS Access Key ID</label>
                <input
                  type="text"
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                  value={tempKeyId}
                  onChange={(e) => setTempKeyId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">AWS Secret Access Key</label>
                <input
                  type="password"
                  placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                  value={tempSecretKey}
                  onChange={(e) => setTempSecretKey(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  onSaveCredentials('', '');
                  setShowModal(false);
                }}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-300 text-xs font-semibold transition"
              >
                Clear Keys
              </button>
              <button
                type="button"
                onClick={() => {
                  onSaveCredentials(tempKeyId, tempSecretKey);
                  setShowModal(false);
                }}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition"
              >
                Save &amp; Connect AWS
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;