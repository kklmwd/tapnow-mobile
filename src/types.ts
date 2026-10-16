export type Kind = 'text' | 'upload' | 'image' | 'video';

export interface Asset {
  id: string;
  kind: 'image' | 'video';
  url: string;
  prompt: string;
  modelId: string;
  createdAt: number;
}

export type NodeData = {
  kind: Kind;
  title: string;
  /** Text node: the prompt. Image/video node: its own prompt, appended after upstream text. */
  text: string;
  /** Upload node: the picture (data URL). */
  uploadUrl?: string;
  /** Upload node: cached fal storage URL for uploadUrl. */
  remoteUrl?: string;
  modelId: string;
  params: Record<string, string>;
  results: Asset[];
  /** Index into results of the one passed downstream. */
  picked: number;
  status: 'idle' | 'running' | 'error';
  error?: string;
  log?: string;
  lastRequest?: { endpoint: string; input: unknown };
} & Record<string, unknown>;

export interface Settings {
  mode: 'mock' | 'fal';
  falKey: string;
  /** modelId -> { text?: endpoint, ref?: endpoint } */
  endpointOverrides: Record<string, { text?: string; ref?: string }>;
}
