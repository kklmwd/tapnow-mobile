import { useMemo } from 'react';
import { canConnect, resolveInputs, upstreamPending, wouldCycle, type FlowNode } from './graph';
import { endpointFor, getModel, modelsFor } from './models';
import { useStore } from './store';

async function fileToDataUrl(file: File, max = 2048): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9);
}

export function Inspector({ node }: { node: FlowNode }) {
  const { nodes, edges, settings, patch, remove, select, toggleInput, runNode } = useStore();
  const d = node.data;
  const isGen = d.kind === 'image' || d.kind === 'video';
  const model = isGen ? getModel(d.modelId) : undefined;

  const inputs = useMemo(() => resolveInputs(nodes, edges, node.id), [nodes, edges, node.id]);
  const pending = useMemo(() => upstreamPending(nodes, edges, node.id), [nodes, edges, node.id]);
  const candidates = useMemo(
    () =>
      isGen
        ? nodes.filter((n) => {
            if (n.id === node.id || !canConnect(n, node)) return false;
            const linked = edges.some((e) => e.source === n.id && e.target === node.id);
            return linked || !wouldCycle(edges, n.id, node.id);
          })
        : [],
    [nodes, edges, node, isGen],
  );

  // Connected image generators with no result yet will run first, so they count as references.
  const waitingImages = edges.filter(
    (e) => e.target === node.id && nodes.find((n) => n.id === e.source)?.data.kind === 'image' &&
      nodes.find((n) => n.id === e.source)?.data.results.length === 0,
  ).length;
  const imageCount = inputs.images.length + waitingImages;
  const mode = imageCount ? 'ref' : 'text';
  const running = d.status === 'running';
  const params = { ...(model?.defaults ?? {}), ...d.params };

  const onFile = async (f?: File) => {
    if (!f) return;
    try {
      patch(node.id, { uploadUrl: await fileToDataUrl(f), remoteUrl: undefined });
    } catch {
      patch(node.id, { error: 'Could not read that image.' });
    }
  };

  return (
    <div className="sheet" role="dialog" aria-label="Node settings" data-testid="inspector">
      <div className="sheet-head">
        <input
          className="title-input"
          value={d.title}
          aria-label="Node name"
          onChange={(e) => patch(node.id, { title: e.target.value })}
        />
        <button className="icon-btn" onClick={() => select(null)}>
          Done
        </button>
      </div>

      {d.kind === 'text' && (
        <label className="field">
          Prompt
          <textarea
            rows={5}
            value={d.text}
            placeholder="Describe what you want"
            onChange={(e) => patch(node.id, { text: e.target.value })}
          />
        </label>
      )}

      {d.kind === 'upload' && (
        <div className="field">
          {d.uploadUrl && <img className="preview" src={d.uploadUrl} alt="Uploaded" />}
          <label className="btn">
            {d.uploadUrl ? 'Replace photo' : 'Choose photo'}
            <input
              type="file"
              accept="image/*"
              hidden
              data-testid="file-input"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
          {d.error && <div className="err-line">{d.error}</div>}
        </div>
      )}

      {isGen && model && (
        <>
          <label className="field">
            Model
            <select
              value={d.modelId}
              onChange={(e) => {
                const m = getModel(e.target.value);
                patch(node.id, { modelId: m.id, params: { ...m.defaults } });
              }}
            >
              {modelsFor(d.kind as 'image' | 'video').map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <small>{model.blurb}</small>
          </label>

          <label className="field">
            {d.kind === 'video' ? 'Motion / camera notes' : 'Prompt'} (added after connected prompts)
            <textarea
              rows={3}
              value={d.text}
              placeholder={d.kind === 'video' ? 'Slow push-in, wind in the trees' : 'Add details'}
              onChange={(e) => patch(node.id, { text: e.target.value })}
            />
          </label>

          <div className="grid">
            {model.params.map((p) => (
              <label key={p.key} className="field">
                {p.label}
                <select
                  value={params[p.key]}
                  onChange={(e) => patch(node.id, { params: { ...d.params, [p.key]: e.target.value } })}
                >
                  {p.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="field">
            Inputs
            {candidates.length === 0 && <small>Add a Prompt, Upload or Image node to connect.</small>}
            <div className="chips">
              {candidates.map((n) => {
                const on = edges.some((e) => e.source === n.id && e.target === node.id);
                return (
                  <button
                    key={n.id}
                    className={`chip${on ? ' on' : ''}`}
                    aria-pressed={on}
                    onClick={() => toggleInput(node.id, n.id)}
                  >
                    {on ? '✓ ' : ''}
                    {n.data.title} <em>{n.data.kind}</em>
                  </button>
                );
              })}
            </div>
            <small data-testid="mode-hint">
              {model.kind === 'video'
                ? mode === 'ref'
                  ? `Image to video (${imageCount} image${imageCount > 1 ? 's' : ''}, 2nd is the end frame)`
                  : 'Text to video'
                : mode === 'ref'
                  ? `Edit with ${imageCount} reference image${imageCount > 1 ? 's' : ''}`
                  : 'Text to image'}
              {' · '}
              {endpointFor(model, mode, settings)}
            </small>
          </div>

          <button
            className="primary"
            data-testid="generate"
            disabled={running}
            onClick={() => void runNode(node.id)}
          >
            {running ? (d.log ?? 'Working') : pending.length ? `Generate (runs ${pending.length} upstream first)` : 'Generate'}
          </button>
          {d.status === 'error' && <div className="err-line" role="alert">{d.error}</div>}

          {d.results.length > 0 && (
            <div className="field">
              Results (tap one to pass it downstream)
              <div className="strip">
                {d.results.map((a, i) => (
                  <button
                    key={a.id}
                    className={`strip-item${i === d.picked ? ' on' : ''}`}
                    onClick={() => patch(node.id, { picked: i })}
                    aria-label={`Result ${i + 1}`}
                  >
                    {a.kind === 'image' ? <img src={a.url} alt="" /> : <video src={`${a.url}#t=0.1`} muted playsInline preload="metadata" />}
                  </button>
                ))}
              </div>
              {d.results[d.picked] && (
                <div className="row">
                  <a className="btn" href={d.results[d.picked].url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                  <a
                    className="btn"
                    href={d.results[d.picked].url}
                    download={`${d.title.replace(/\s+/g, '-')}.${d.kind === 'video' ? 'mp4' : 'png'}`}
                  >
                    Download
                  </a>
                </div>
              )}
            </div>
          )}

          {d.lastRequest && (
            <details>
              <summary data-testid="last-request">Last request (tap to show)</summary>
              <pre>
                {d.lastRequest.endpoint +
                  (d.lastRequest.requestId ? `\nfal request id: ${d.lastRequest.requestId}` : '') +
                  '\n' +
                  JSON.stringify(d.lastRequest.input, null, 2)}
              </pre>
            </details>
          )}
        </>
      )}

      <button
        className="danger"
        onClick={() => {
          if (window.confirm(`Delete "${d.title}"?`)) remove(node.id);
        }}
      >
        Delete node
      </button>
    </div>
  );
}
