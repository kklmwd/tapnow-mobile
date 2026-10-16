import { useCallback, useEffect, useRef } from 'react';
import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { CardNode } from './CardNode';
import { Inspector } from './Inspector';
import { GalleryPanel, SettingsPanel } from './Panels';
import { useStore } from './store';
import type { Kind } from './types';

const nodeTypes = { card: CardNode };

function Canvas() {
  const s = useStore();
  const rf = useReactFlow();
  const wrap = useRef<HTMLDivElement>(null);
  const count = useRef(0);
  const selected = s.nodes.find((n) => n.id === s.selectedId);

  const add = useCallback(
    (kind: Kind) => {
      const box = wrap.current?.getBoundingClientRect();
      const cx = (box?.left ?? 0) + (box?.width ?? 300) / 2;
      const cy = (box?.top ?? 0) + (box?.height ?? 300) / 3;
      const k = count.current++ % 5;
      const p = rf.screenToFlowPosition({ x: cx - 80 + k * 14, y: cy - 60 + k * 14 });
      s.addNode(kind, p);
    },
    [rf, s],
  );

  // Fit the starter graph (or a restored project) once after load.
  useEffect(() => {
    const t = setTimeout(() => void rf.fitView({ padding: 0.15, maxZoom: 1 }), 80);
    return () => clearTimeout(t);
  }, [rf]);

  const showBar = !selected && !s.panel;

  return (
    <div className="app" ref={wrap}>
      <header className="top">
        <strong>TapCanvas</strong>
        <button
          className={`mode ${s.settings.mode}`}
          onClick={() => s.setPanel('settings')}
          data-testid="mode-chip"
        >
          {s.settings.mode === 'mock' ? 'Demo mode' : 'fal.ai live'}
        </button>
        <button className="icon-btn" onClick={() => void rf.fitView({ padding: 0.15, maxZoom: 1, duration: 250 })}>
          Fit
        </button>
      </header>

      <ReactFlow
        nodes={s.nodes}
        edges={s.edges}
        nodeTypes={nodeTypes}
        onNodesChange={s.onNodesChange}
        onEdgesChange={s.onEdgesChange}
        onConnect={s.onConnect}
        onNodeClick={(_, n) => {
          s.setPanel(null);
          s.select(n.id);
        }}
        onPaneClick={() => s.select(null)}
        minZoom={0.15}
        maxZoom={1.6}
        colorMode="dark"
        deleteKeyCode={null}
        connectionRadius={36}
        defaultEdgeOptions={{ animated: true }}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
      </ReactFlow>

      {s.settings.mode === 'mock' && showBar && (
        <button className="banner" onClick={() => s.setPanel('settings')}>
          Demo mode: results are placeholders. Tap to add your fal key.
        </button>
      )}

      {showBar && (
        <nav className="bar" aria-label="Add nodes">
          <button onClick={() => add('text')}>+ Prompt</button>
          <button onClick={() => add('upload')}>+ Photo</button>
          <button onClick={() => add('image')}>+ Image</button>
          <button onClick={() => add('video')}>+ Video</button>
          <button onClick={() => s.setPanel('gallery')}>Gallery</button>
          <button onClick={() => s.setPanel('settings')}>Settings</button>
        </nav>
      )}

      {selected && !s.panel && <Inspector key={selected.id} node={selected} />}
      {s.panel === 'gallery' && <GalleryPanel />}
      {s.panel === 'settings' && <SettingsPanel />}
    </div>
  );
}

export function App() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
