import type { Edge, Node } from '@xyflow/react';
import type { Kind, NodeData } from './types';

export type FlowNode = Node<NodeData>;

export interface ImgRef {
  nodeId: string;
  url: string;
}

const generators: Kind[] = ['image', 'video'];

/** Text, uploads and images can feed generators. Video and generators cannot feed text/upload. */
export function canConnect(src: FlowNode, dst: FlowNode): boolean {
  if (src.id === dst.id) return false;
  if (!generators.includes(dst.data.kind)) return false;
  return src.data.kind !== 'video';
}

export function ancestors(edges: Edge[], id: string): Set<string> {
  const seen = new Set<string>();
  const walk = (n: string) => {
    for (const e of edges) {
      if (e.target === n && !seen.has(e.source)) {
        seen.add(e.source);
        walk(e.source);
      }
    }
  };
  walk(id);
  return seen;
}

export function wouldCycle(edges: Edge[], sourceId: string, targetId: string): boolean {
  return sourceId === targetId || ancestors(edges, sourceId).has(targetId);
}

export function pickedAsset(n: FlowNode) {
  return n.data.results[n.data.picked] ?? n.data.results[0];
}

/** Collect what a generator node is fed with, in edge-creation order. */
export function resolveInputs(
  nodes: FlowNode[],
  edges: Edge[],
  id: string,
): { prompt: string; images: ImgRef[] } {
  const self = nodes.find((n) => n.id === id);
  const texts: string[] = [];
  const images: ImgRef[] = [];
  for (const e of edges) {
    if (e.target !== id) continue;
    const up = nodes.find((n) => n.id === e.source);
    if (!up) continue;
    if (up.data.kind === 'text') {
      if (up.data.text.trim()) texts.push(up.data.text.trim());
    } else if (up.data.kind === 'upload') {
      if (up.data.uploadUrl) images.push({ nodeId: up.id, url: up.data.uploadUrl });
    } else if (up.data.kind === 'image') {
      const a = pickedAsset(up);
      if (a) images.push({ nodeId: up.id, url: a.url });
    }
  }
  const own = self?.data.text.trim();
  if (own) texts.push(own);
  return { prompt: texts.join('\n'), images };
}

/** Image generators upstream of `id` that have no result yet, deepest first. */
export function upstreamPending(nodes: FlowNode[], edges: Edge[], id: string): string[] {
  const order: string[] = [];
  const seen = new Set<string>([id]);
  const visit = (n: string) => {
    for (const e of edges) {
      if (e.target !== n || seen.has(e.source)) continue;
      seen.add(e.source);
      visit(e.source);
      const up = nodes.find((x) => x.id === e.source);
      if (up && up.data.kind === 'image' && up.data.results.length === 0) order.push(up.id);
    }
  };
  visit(id);
  return order;
}
