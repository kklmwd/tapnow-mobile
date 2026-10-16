import { useState } from 'react';
import { MODELS } from './models';
import { cleanKey, keyProblem } from './providers/fal';
import { useStore } from './store';
import type { Asset } from './types';

export function GalleryPanel() {
  const { gallery, setPanel, addNode } = useStore();
  const [open, setOpen] = useState<Asset | null>(null);

  return (
    <div className="sheet tall" role="dialog" aria-label="Gallery" data-testid="gallery">
      <div className="sheet-head">
        <strong>Gallery ({gallery.length})</strong>
        <button className="icon-btn" onClick={() => setPanel(null)}>
          Done
        </button>
      </div>
      {gallery.length === 0 && <p className="muted">Everything you generate shows up here.</p>}
      <div className="gal">
        {gallery.map((a) => (
          <button key={a.id} className="gal-item" onClick={() => setOpen(a)} aria-label={`${a.kind} from ${a.modelId}`}>
            {a.kind === 'image' ? <img src={a.url} alt="" loading="lazy" /> : <video src={`${a.url}#t=0.1`} muted playsInline preload="metadata" />}
          </button>
        ))}
      </div>
      {open && (
        <div className="lightbox" onClick={() => setOpen(null)}>
          <div className="lb-body" onClick={(e) => e.stopPropagation()}>
            {open.kind === 'image' ? <img src={open.url} alt="" /> : <video src={open.url} controls playsInline loop autoPlay muted />}
            <p className="muted">{open.prompt}</p>
            <div className="row">
              {open.kind === 'image' && (
                <button
                  className="btn"
                  onClick={() => {
                    addNode('upload', undefined, {
                      title: 'From gallery',
                      uploadUrl: open.url,
                      remoteUrl: /^https?:/.test(open.url) ? open.url : undefined,
                    });
                    setOpen(null);
                    setPanel(null);
                  }}
                >
                  Add to canvas
                </button>
              )}
              <a className="btn" href={open.url} target="_blank" rel="noreferrer">
                Open
              </a>
              <button className="btn" onClick={() => setOpen(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsPanel() {
  const { settings, setSettings, setPanel, resetCanvas } = useStore();
  const [msg, setMsg] = useState('');

  const setOverride = (id: string, which: 'text' | 'ref', v: string) =>
    setSettings({
      endpointOverrides: {
        ...settings.endpointOverrides,
        [id]: { ...settings.endpointOverrides[id], [which]: v.trim() || undefined },
      },
    });

  const exportProject = () => {
    const { nodes, edges, gallery } = useStore.getState();
    const blob = new Blob([JSON.stringify({ nodes, edges, gallery })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tapcanvas-project.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importProject = async (f?: File) => {
    if (!f) return;
    try {
      useStore.getState().importProject(await f.text());
      setMsg('Project loaded.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not load that file.');
    }
  };

  return (
    <div className="sheet tall" role="dialog" aria-label="Settings" data-testid="settings">
      <div className="sheet-head">
        <strong>Settings</strong>
        <button className="icon-btn" onClick={() => setPanel(null)}>
          Done
        </button>
      </div>

      <div className="field">
        Generation mode
        <div className="seg">
          <button className={settings.mode === 'mock' ? 'on' : ''} onClick={() => setSettings({ mode: 'mock' })}>
            Demo (free, fake)
          </button>
          <button className={settings.mode === 'fal' ? 'on' : ''} onClick={() => setSettings({ mode: 'fal' })}>
            fal.ai (real)
          </button>
        </div>
      </div>

      <label className="field">
        fal.ai API key
        <input
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={settings.falKey}
          placeholder="paste key id:secret"
          data-testid="fal-key"
          onChange={(e) => setSettings({ falKey: cleanKey(e.target.value) })}
        />
        {keyProblem(settings.falKey) && (
          <div className="err-line" data-testid="key-problem">
            {keyProblem(settings.falKey)}
          </div>
        )}
        <small>
          Stored only in this browser. Every generation is billed to your fal account. Use a key with a spend limit.
        </small>
      </label>

      <details>
        <summary>Model endpoints (advanced)</summary>
        <small className="muted">Blank uses the default. Change these if fal renames a model.</small>
        {MODELS.map((m) => (
          <div key={m.id} className="field">
            <strong>{m.label}</strong>
            <input
              placeholder={m.text}
              value={settings.endpointOverrides[m.id]?.text ?? ''}
              onChange={(e) => setOverride(m.id, 'text', e.target.value)}
              aria-label={`${m.label} text endpoint`}
            />
            <input
              placeholder={m.ref}
              value={settings.endpointOverrides[m.id]?.ref ?? ''}
              onChange={(e) => setOverride(m.id, 'ref', e.target.value)}
              aria-label={`${m.label} reference endpoint`}
            />
          </div>
        ))}
      </details>

      <div className="field">
        Project
        <div className="row">
          <button className="btn" onClick={exportProject}>
            Export
          </button>
          <label className="btn">
            Import
            <input type="file" accept="application/json" hidden onChange={(e) => void importProject(e.target.files?.[0])} />
          </label>
          <button
            className="btn"
            onClick={() => {
              if (window.confirm('Reset the canvas to the starter example? Your gallery is kept.')) resetCanvas(true);
            }}
          >
            Reset canvas
          </button>
        </div>
        {msg && <small>{msg}</small>}
      </div>

      <small className="muted">Tip: on iPhone use Share, Add to Home Screen. On Android use Install app.</small>
    </div>
  );
}
