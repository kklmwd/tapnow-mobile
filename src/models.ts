import type { Settings } from './types';

export type Mode = 'text' | 'ref';

export interface ParamDef {
  key: string;
  label: string;
  options: string[];
}

export interface BuildCtx {
  prompt: string;
  /** Public image URLs, in connection order. */
  images: string[];
  params: Record<string, string>;
}

export interface ModelDef {
  id: string;
  label: string;
  blurb: string;
  kind: 'image' | 'video';
  /** fal endpoint used when there are no input images. */
  text: string;
  /** fal endpoint used when input images are connected (edit / image-to-video). */
  ref: string;
  params: ParamDef[];
  defaults: Record<string, string>;
  build(mode: Mode, ctx: BuildCtx): Record<string, unknown>;
  extract(output: unknown): string[];
}

const COUNT = { key: 'num_images', label: 'Images', options: ['1', '2', '3', '4'] };

const imagesOf = (o: unknown): string[] =>
  ((o as { images?: { url: string }[] })?.images ?? []).map((i) => i.url).filter(Boolean);

const videoOf = (o: unknown): string[] => {
  const url = (o as { video?: { url?: string } })?.video?.url;
  return url ? [url] : [];
};

export const MODELS: ModelDef[] = [
  {
    id: 'nano-banana-pro',
    label: 'Nano Banana Pro',
    blurb: 'Google Gemini image model. Best for edits and text in images.',
    kind: 'image',
    text: 'fal-ai/nano-banana-pro',
    ref: 'fal-ai/nano-banana-pro/edit',
    params: [
      {
        key: 'aspect_ratio',
        label: 'Aspect',
        options: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '4:5', '5:4', '21:9'],
      },
      { key: 'resolution', label: 'Resolution', options: ['1K', '2K', '4K'] },
      COUNT,
    ],
    defaults: { aspect_ratio: '1:1', resolution: '1K', num_images: '1' },
    build(mode, { prompt, images, params }) {
      const input: Record<string, unknown> = {
        prompt,
        num_images: Number(params.num_images ?? 1),
        aspect_ratio: params.aspect_ratio ?? '1:1',
        resolution: params.resolution ?? '1K',
        output_format: 'png',
      };
      if (mode === 'ref') input.image_urls = images;
      return input;
    },
    extract: imagesOf,
  },
  {
    id: 'gpt-image-2',
    label: 'GPT Image 2',
    blurb: 'OpenAI image model. Strong prompt following.',
    kind: 'image',
    text: 'openai/gpt-image-2',
    ref: 'openai/gpt-image-2/edit',
    params: [
      {
        key: 'image_size',
        label: 'Size',
        options: ['auto', 'square_hd', 'landscape_4_3', 'portrait_4_3', 'landscape_16_9', 'portrait_16_9'],
      },
      { key: 'quality', label: 'Quality', options: ['low', 'medium', 'high'] },
      COUNT,
    ],
    defaults: { image_size: 'auto', quality: 'medium', num_images: '1' },
    build(mode, { prompt, images, params }) {
      const input: Record<string, unknown> = {
        prompt,
        image_size: params.image_size ?? 'auto',
        quality: params.quality ?? 'medium',
        num_images: Number(params.num_images ?? 1),
        output_format: 'png',
      };
      if (mode === 'ref') input.image_urls = images.slice(0, 16);
      return input;
    },
    extract: imagesOf,
  },
  {
    id: 'seedance-2',
    label: 'Seedance 2.0',
    blurb: 'ByteDance video model with audio. Connect an image for image-to-video.',
    kind: 'video',
    text: 'bytedance/seedance-2.0/text-to-video',
    ref: 'bytedance/seedance-2.0/image-to-video',
    params: [
      { key: 'resolution', label: 'Resolution', options: ['480p', '720p', '1080p'] },
      { key: 'duration', label: 'Seconds', options: ['auto', '4', '5', '8', '10', '15'] },
      {
        key: 'aspect_ratio',
        label: 'Aspect',
        options: ['auto', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
      },
      { key: 'generate_audio', label: 'Audio', options: ['true', 'false'] },
    ],
    defaults: { resolution: '720p', duration: '5', aspect_ratio: '16:9', generate_audio: 'true' },
    build(mode, { prompt, images, params }) {
      const input: Record<string, unknown> = {
        prompt: prompt || 'Animate this image with natural, cinematic motion.',
        resolution: params.resolution ?? '720p',
        duration: params.duration ?? '5',
        aspect_ratio: params.aspect_ratio ?? '16:9',
        generate_audio: (params.generate_audio ?? 'true') === 'true',
      };
      if (mode === 'ref') {
        input.image_url = images[0];
        if (images[1]) input.end_image_url = images[1];
      }
      return input;
    },
    extract: videoOf,
  },
];

export const getModel = (id: string): ModelDef => MODELS.find((m) => m.id === id) ?? MODELS[0];

export const modelsFor = (kind: 'image' | 'video') => MODELS.filter((m) => m.kind === kind);

export function endpointFor(model: ModelDef, mode: Mode, settings: Pick<Settings, 'endpointOverrides'>) {
  const o = settings.endpointOverrides?.[model.id];
  return (mode === 'ref' ? o?.ref : o?.text) || model[mode];
}
