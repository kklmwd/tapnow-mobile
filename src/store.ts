import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import type { Asset, Kind, NodeData, Settings } from './types';
import { canConnect, resolveInputs, upstreamPending, wouldCycle, type FlowNode } from './graph';
import { endpointFor, getModel, modelsFor, type Mode } from './models';
import { runMock } from './providers/mock';
import { afterReload } from './reload';
import { errorMessage, resumeFal, runFal, uploadToFal } from './providers/fal';

export type Panel = null | 'gallery' | 'settings';

interface State {
  nodes: FlowNode[];
  edges: Edge[];
  gallery: Asset[];
  settings: Settings;
  selectedId: string | null;
  panel: Panel;
  onNodesChange: (c: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (c: EdgeChange[]) => void;
  onConnect: (c: Connection) => void;
  addNode: (kind: Kind, position?: { x: number; y: number }, patch?: Partial<NodeData>) => string;
  patch: (id: string, p: Partial<NodeData>) => void;
  remove: (id: string) => void;
  toggleInput: (targetId: string, sourceId: string) => void;
  select: (id: string | null) => void;
  setPanel: (p: Panel) => void;
  setSettings: (p: Partial<Settings>) => void;
  runNode: (id: string, withUpstream?: boolean) => Promise<void>;
  importProject: (json: string) => void;
  resetCanvas: (seed?: boolean) => void;
  /** After a reload, pick up fal jobs that were still queued. */
  resumePending: () => void;
}

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

const TITLES: Record<Kind, string> = { text: 'Prompt', upload: 'Upload', image: 'Image', video: 'Video' };

export function newNode(kind: Kind, position: { x: number; y: number }, patch: Partial<NodeData> = {}): FlowNode {
  const model = kind === 'image' || kind === 'video' ? modelsFor(kind)[0] : undefined;
  return {
    id: uid(),
    type: 'card',
    position,
    data: {
      kind,
      title: TITLES[kind],
      text: '',
      modelId: model?.id ?? '',
      params: { ...(model?.defaults ?? {}) },
      results: [],
      picked: 0,
      status: 'idle',
      ...patch,
    },
  };
}

function seed(): { nodes: FlowNode[]; edges: Edge[] } {
  const t = newNode('text', { x: 0, y: 0 }, {
    title: 'Idea',
    text: 'A cozy ramen shop at night in the rain, neon reflections on wet street, cinematic',
  });
  const i = newNode('image', { x: 230, y: 0 }, { title: 'Still frame' });
  const v = newNode('video', { x: 460, y: 0 }, { title: 'Shot', text: 'Slow push-in, steam rising, rain falling' });
  t.id = 'seed-text';
  i.id = 'seed-image';
  v.id = 'seed-video';
  return {
    nodes: [t, i, v],
    edges: [
      { id: 'seed-text->seed-image', source: t.id, target: i.id },
      { id: 'seed-image->seed-video', source: i.id, target: v.id },
    ],
  };
}

const idbStorage = createJSONStorage(() => ({
  getItem: async (n: string) => (await idbGet<string>(n)) ?? null,
  setItem: (n: string, v: string) => idbSet(n, v),
  removeItem: (n: string) => idbDel(n),
}));

/** Keep stored request logs small: long strings (data URLs) are shortened. */
function shorten(v: unknown): unknown {
  if (typeof v === 'string') return v.length > 120 ? `${v.slice(0, 60)}...(${v.length} chars)` : v;
  if (Array.isArray(v)) return v.map(shorten);
  if (v && typeof v === 'object')
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shorten(x)]));
  return v;
}

const edgeId = (s: string, t: string) => `${s}->${t}`;

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const patch = (id: string, p: Partial<NodeData>) =>
        set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)) }));

      function finish(id: string, kind: 'image' | 'video', modelId: string, prompt: string, out: string[]) {
        if (!out.length) throw new Error('The model returned no output.');
        const assets: Asset[] = out.map((url) => ({ id: uid(), kind, url, prompt, modelId, createdAt: Date.now() }));
        const cur = get().nodes.find((n) => n.id === id);
        patch(id, {
          results: [...assets, ...(cur?.data.results ?? [])].slice(0, 12),
          picked: 0,
          status: 'idle',
          log: undefined,
          pending: undefined,
        });
        set((st) => ({ gallery: [...assets, ...st.gallery].slice(0, 200) }));
      }

      /** Wait for a fal job that was queued before a reload. */
      async function resumeOne(id: string) {
        const node = get().nodes.find((n) => n.id === id);
        const p = node?.data.pending;
        if (!node || !p) return;
        const model = getModel(node.data.modelId);
        const log = (m: string) => patch(id, { log: m });
        try {
          const data = await resumeFal(p.endpoint, p.requestId, get().settings.falKey, log);
          finish(id, model.kind, model.id, p.prompt, model.extract(data));
        } catch (e) {
          patch(id, { status: 'error', error: errorMessage(e), log: undefined, pending: undefined });
        }
      }

      async function generateOne(id: string) {
        const s = get();
        const node = s.nodes.find((n) => n.id === id);
        if (!node || (node.data.kind !== 'image' && node.data.kind !== 'video')) return;
        if (node.data.status === 'running') return;
        const model = getModel(node.data.modelId);
        const { prompt, images } = resolveInputs(s.nodes, s.edges, id);
        const mode: Mode = images.length ? 'ref' : 'text';
        if (!prompt && !(model.kind === 'video' && mode === 'ref')) {
          patch(id, { status: 'error', error: 'Write a prompt or connect a Prompt node.' });
          return;
        }
        patch(id, { status: 'running', error: undefined, log: 'Starting', pending: undefined });
        const log = (m: string) => patch(id, { log: m });
        try {
          const { settings } = get();
          let urls = images.map((i) => i.url);
          if (settings.mode === 'fal') {
            urls = await Promise.all(
              images.map(async (i) => {
                if (/^https?:/.test(i.url)) return i.url;
                const src = get().nodes.find((n) => n.id === i.nodeId);
                if (src?.data.kind === 'upload' && src.data.remoteUrl) return src.data.remoteUrl;
                log('Uploading reference');
                const remote = await uploadToFal(i.url, settings.falKey);
                if (src?.data.kind === 'upload') patch(src.id, { remoteUrl: remote });
                return remote;
              }),
            );
          }
          const params = { ...model.defaults, ...node.data.params };
          const input = model.build(mode, { prompt, images: urls, params });
          const endpoint = endpointFor(model, mode, settings);
          patch(id, { lastRequest: { endpoint, input: shorten(input) } });
          const out =
            settings.mode === 'mock'
              ? await runMock(model.kind, model.label, input, log)
              : model.extract(
                  await runFal(endpoint, input, settings.falKey, log, (requestId) =>
                    patch(id, { pending: { endpoint, requestId, prompt } }),
                  ),
                );
          finish(id, model.kind, model.id, prompt, out);
        } catch (e) {
          patch(id, { status: 'error', error: errorMessage(e), log: undefined, pending: undefined });
        }
      }

      return {
        ...seed(),
        gallery: [],
        settings: { mode: 'mock', falKey: '', endpointOverrides: {} },
        selectedId: null,
        panel: null,

        onNodesChange: (c) => set((s) => ({ nodes: applyNodeChanges(c, s.nodes) })),
        onEdgesChange: (c) => set((s) => ({ edges: applyEdgeChanges(c, s.edges) })),
        onConnect: (c) => {
          const { nodes, edges } = get();
          const src = nodes.find((n) => n.id === c.source);
          const dst = nodes.find((n) => n.id === c.target);
          if (!src || !dst || !canConnect(src, dst) || wouldCycle(edges, src.id, dst.id)) return;
          const id = edgeId(src.id, dst.id);
          if (edges.some((e) => e.id === id)) return;
          set({ edges: [...edges, { id, source: src.id, target: dst.id }] });
        },
        addNode: (kind, position, p) => {
          const n = newNode(kind, position ?? { x: 0, y: 0 }, p);
          set((s) => ({ nodes: [...s.nodes.map((x) => ({ ...x, selected: false })), { ...n, selected: true }], selectedId: n.id }));
          return n.id;
        },
        patch,
        remove: (id) =>
          set((s) => ({
            nodes: s.nodes.filter((n) => n.id !== id),
            edges: s.edges.filter((e) => e.source !== id && e.target !== id),
            selectedId: s.selectedId === id ? null : s.selectedId,
          })),
        toggleInput: (targetId, sourceId) => {
          const { nodes, edges } = get();
          const id = edgeId(sourceId, targetId);
          if (edges.some((e) => e.id === id)) {
            set({ edges: edges.filter((e) => e.id !== id) });
            return;
          }
          const src = nodes.find((n) => n.id === sourceId);
          const dst = nodes.find((n) => n.id === targetId);
          if (!src || !dst || !canConnect(src, dst) || wouldCycle(edges, sourceId, targetId)) return;
          set({ edges: [...edges, { id, source: sourceId, target: targetId }] });
        },
        select: (id) =>
          set((s) => ({
            selectedId: id,
            nodes: s.nodes.map((n) => (n.selected === (n.id === id) ? n : { ...n, selected: n.id === id })),
          })),
        setPanel: (panel) => set({ panel }),
        setSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
        runNode: async (id, withUpstream = true) => {
          if (withUpstream) {
            for (const p of upstreamPending(get().nodes, get().edges, id)) {
              await generateOne(p);
              if (get().nodes.find((n) => n.id === p)?.data.status === 'error') return;
            }
          }
          await generateOne(id);
        },
        importProject: (json) => {
          const d = JSON.parse(json) as { nodes?: FlowNode[]; edges?: Edge[]; gallery?: Asset[] };
          if (!Array.isArray(d.nodes) || !Array.isArray(d.edges)) throw new Error('Not a TapCanvas project file.');
          set({ nodes: d.nodes, edges: d.edges, gallery: d.gallery ?? [], selectedId: null });
        },
        resumePending: () => {
          for (const n of get().nodes) if (n.data.status === 'running' && n.data.pending) void resumeOne(n.id);
        },
        resetCanvas: (withSeed = true) =>
          set(withSeed ? { ...seed(), selectedId: null } : { nodes: [], edges: [], selectedId: null }),
      };
    },
    {
      name: 'tapcanvas-v1',
      version: 1,
      storage: idbStorage,
      partialize: (s) => ({
        nodes: s.nodes.map((n) => ({
          ...n,
          selected: false,
          data: afterReload(n.data),
        })),
        edges: s.edges,
        gallery: s.gallery,
        settings: s.settings,
      }),
      onRehydrateStorage: () => (state) => {
        // Defer so the store has finished merging the stored state.
        if (state) setTimeout(() => useStore.getState().resumePending(), 0);
      },
    },
  ),
);

/** Expose the store for end-to-end tests. */
if (typeof window !== 'undefined') (window as unknown as { __store: typeof useStore }).__store = useStore;
