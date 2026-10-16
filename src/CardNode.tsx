import { Handle, Position, type NodeProps } from '@xyflow/react';
import { pickedAsset, type FlowNode } from './graph';
import { getModel } from './models';
import { useStore } from './store';

export function CardNode({ id, data, selected }: NodeProps<FlowNode>) {
  const runNode = useStore((s) => s.runNode);
  const isGen = data.kind === 'image' || data.kind === 'video';
  const asset = isGen ? pickedAsset({ data } as FlowNode) : undefined;
  const running = data.status === 'running';

  return (
    <div className={`card k-${data.kind}${selected ? ' sel' : ''}${running ? ' run' : ''}`} data-testid={`node-${data.kind}`}>
      {data.kind !== 'text' && <Handle type="target" position={Position.Left} />}
      {data.kind !== 'video' && <Handle type="source" position={Position.Right} />}

      <div className="card-head">
        <span className="badge">{data.kind}</span>
        <span className="card-title">{data.title}</span>
      </div>

      {data.kind === 'text' && <p className="snippet">{data.text || 'Tap to write a prompt'}</p>}

      {data.kind === 'upload' &&
        (data.uploadUrl ? (
          <img className="thumb" src={data.uploadUrl} alt="" draggable={false} />
        ) : (
          <div className="thumb empty">Tap to add a photo</div>
        ))}

      {isGen && (
        <>
          <div className="model-line">{getModel(data.modelId).label}</div>
          <div className="thumb">
            {asset?.kind === 'image' && <img src={asset.url} alt="" draggable={false} />}
            {asset?.kind === 'video' && (
              <video src={`${asset.url}#t=0.1`} muted loop playsInline preload="metadata" />
            )}
            {!asset && !running && <span className="empty">{data.kind === 'image' ? 'No image yet' : 'No video yet'}</span>}
            {running && (
              <div className="busy">
                <div className="spinner" />
                <span>{data.log ?? 'Working'}</span>
              </div>
            )}
          </div>
          {data.status === 'error' && <div className="err-line">{data.error}</div>}
          <button
            className="run-btn nodrag"
            disabled={running}
            onClick={(e) => {
              e.stopPropagation();
              void runNode(id);
            }}
          >
            {running ? 'Running' : data.results.length ? 'Run again' : 'Run'}
          </button>
        </>
      )}
    </div>
  );
}
