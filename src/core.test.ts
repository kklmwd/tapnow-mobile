import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import { canConnect, resolveInputs, upstreamPending, wouldCycle, type FlowNode } from './graph';
import { endpointFor, getModel, MODELS } from './models';
import type { NodeData } from './types';

const node = (id: string, kind: NodeData['kind'], extra: Partial<NodeData> = {}): FlowNode => ({
  id,
  type: 'card',
  position: { x: 0, y: 0 },
  data: { kind, title: id, text: '', modelId: '', params: {}, results: [], picked: 0, status: 'idle', ...extra },
});
const edge = (s: string, t: string): Edge => ({ id: `${s}->${t}`, source: s, target: t });
const asset = (url: string) => ({ id: url, kind: 'image' as const, url, prompt: '', modelId: 'x', createdAt: 0 });

describe('model payloads (shapes from fal docs)', () => {
  it('nano banana pro text vs edit', () => {
    const m = getModel('nano-banana-pro');
    const base = { prompt: 'a cat', images: ['https://x/a.png'], params: { ...m.defaults, num_images: '2' } };
    const t = m.build('text', base);
    expect(t).toMatchObject({ prompt: 'a cat', num_images: 2, aspect_ratio: '1:1', resolution: '1K', output_format: 'png' });
    expect(t).not.toHaveProperty('image_urls');
    expect(m.build('ref', base)).toHaveProperty('image_urls', ['https://x/a.png']);
    expect(endpointFor(m, 'text', { endpointOverrides: {} })).toBe('fal-ai/nano-banana-pro');
    expect(endpointFor(m, 'ref', { endpointOverrides: {} })).toBe('fal-ai/nano-banana-pro/edit');
  });

  it('gpt image 2 caps references at 16', () => {
    const m = getModel('gpt-image-2');
    const imgs = Array.from({ length: 20 }, (_, i) => `https://x/${i}.png`);
    const out = m.build('ref', { prompt: 'p', images: imgs, params: m.defaults });
    expect((out.image_urls as string[]).length).toBe(16);
    expect(endpointFor(m, 'ref', { endpointOverrides: {} })).toBe('openai/gpt-image-2/edit');
  });

  it('seedance image-to-video uses image_url and optional end frame, audio is boolean', () => {
    const m = getModel('seedance-2');
    const one = m.build('ref', { prompt: '', images: ['https://x/a.png'], params: m.defaults });
    expect(one).toMatchObject({ image_url: 'https://x/a.png', generate_audio: true, duration: '5', resolution: '720p' });
    expect(one).not.toHaveProperty('end_image_url');
    expect(String(one.prompt).length).toBeGreaterThan(5);
    const two = m.build('ref', { prompt: 'p', images: ['https://x/a.png', 'https://x/b.png'], params: { ...m.defaults, generate_audio: 'false' } });
    expect(two).toMatchObject({ end_image_url: 'https://x/b.png', generate_audio: false });
    expect(m.build('text', { prompt: 'p', images: [], params: m.defaults })).not.toHaveProperty('image_url');
  });

  it('endpoint overrides win over defaults', () => {
    const m = getModel('seedance-2');
    const o = { endpointOverrides: { 'seedance-2': { text: 'bytedance/custom/t2v' } } };
    expect(endpointFor(m, 'text', o)).toBe('bytedance/custom/t2v');
    expect(endpointFor(m, 'ref', o)).toBe('bytedance/seedance-2.0/image-to-video');
  });

  it('extracts outputs', () => {
    expect(getModel('nano-banana-pro').extract({ images: [{ url: 'a' }, { url: 'b' }] })).toEqual(['a', 'b']);
    expect(getModel('seedance-2').extract({ video: { url: 'v' } })).toEqual(['v']);
    expect(getModel('seedance-2').extract({})).toEqual([]);
  });

  it('every default exists in its own options', () => {
    for (const m of MODELS) for (const p of m.params) expect(p.options).toContain(m.defaults[p.key]);
  });
});

describe('graph', () => {
  it('connection rules', () => {
    const t = node('t', 'text'), u = node('u', 'upload'), i = node('i', 'image'), v = node('v', 'video');
    expect(canConnect(t, i)).toBe(true);
    expect(canConnect(u, v)).toBe(true);
    expect(canConnect(i, v)).toBe(true);
    expect(canConnect(v, i)).toBe(false);
    expect(canConnect(t, u)).toBe(false);
    expect(canConnect(i, i)).toBe(false);
  });

  it('detects cycles', () => {
    const e = [edge('a', 'b'), edge('b', 'c')];
    expect(wouldCycle(e, 'c', 'a')).toBe(true);
    expect(wouldCycle(e, 'a', 'c')).toBe(false);
  });

  it('resolves prompt and images in connection order', () => {
    const nodes = [
      node('t', 'text', { text: ' neon city ' }),
      node('u', 'upload', { uploadUrl: 'data:image/png;base64,AAA' }),
      node('i', 'image', { results: [asset('r0'), asset('r1')], picked: 1 }),
      node('v', 'video', { text: 'slow zoom' }),
    ];
    const edges = [edge('u', 'v'), edge('i', 'v'), edge('t', 'v')];
    const r = resolveInputs(nodes, edges, 'v');
    expect(r.prompt).toBe('neon city\nslow zoom');
    expect(r.images.map((x) => x.url)).toEqual(['data:image/png;base64,AAA', 'r1']);
  });

  it('lists pending upstream generators deepest first', () => {
    const nodes = [
      node('i1', 'image'),
      node('i2', 'image'),
      node('i3', 'image', { results: [asset('done')] }),
      node('v', 'video'),
    ];
    const edges = [edge('i1', 'i2'), edge('i2', 'v'), edge('i3', 'v')];
    expect(upstreamPending(nodes, edges, 'v')).toEqual(['i1', 'i2']);
  });
});
