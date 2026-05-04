import { apiRequest, getApiBaseUrl } from '@/services/apiClient';
import { createIncrementalSseParser } from '@/services/incrementalSseParser';
import { useAuthStore } from '@/store/authStore';

interface TranscribeVoiceRecordingPayload {
  childId: string;
  sessionId: string;
  audioUri: string;
}

interface TranscribeVoiceResponse {
  transcriptionId: string;
  text: string;
  language: string;
  durationSeconds: number;
}

interface VoiceTranscriptionApiResponse {
  transcription_id?: unknown;
  text?: unknown;
  language?: unknown;
  duration_seconds?: unknown;
}

interface VoiceTranscriptionStartPayload {
  transcriptionId: string;
  messageId?: string;
  childId?: string;
}

interface VoiceTranscriptionEndPayload {
  transcriptionId: string;
  messageId?: string;
  text: string;
  language?: string;
  durationSeconds?: number;
  finishReason?: string;
}

interface VoiceTranscriptionStreamPayload {
  userId: string;
  childId: string;
  sessionId: string;
  audioUri: string;
  context?: string;
  signal: AbortSignal;
  onStart: (payload: VoiceTranscriptionStartPayload) => void;
  onDelta: (text: string) => void;
  onEnd: (payload: VoiceTranscriptionEndPayload) => void;
  onError: (code: number, message: string) => void;
}

type ReactNativeFormDataFile = {
  uri: string;
  name: string;
  type: string;
};

function getCurrentUserId(): string {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) {
    throw new Error('You must be signed in to use voice chat.');
  }

  return userId;
}

function getFileExtension(uri: string): string {
  const normalizedPath = uri.split('?')[0] ?? uri;
  const extension = normalizedPath.split('.').pop();
  return extension && extension.length <= 5 ? extension.toLowerCase() : 'm4a';
}

function getAudioContentType(extension: string): string {
  switch (extension) {
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'webm':
      return 'audio/webm';
    case 'ogg':
      return 'audio/ogg';
    case 'mp4':
      return 'audio/mp4';
    case 'm4a':
    default:
      return 'audio/m4a';
  }
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function buildTranscriptionUrl(userId: string, childId: string, sessionId: string, stream: boolean): string {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/api/v1/voice/${encodeURIComponent(userId)}/${encodeURIComponent(childId)}/${encodeURIComponent(sessionId)}/transcribe${stream ? '?stream=true' : ''}`;
}

function createHandledStreamError(message: string): Error {
  const handledError = new Error(message) as Error & { __streamHandled?: boolean };
  handledError.__streamHandled = true;
  return handledError;
}

interface VoiceSseEventPayload {
  message_id?: unknown;
  transcription_id?: unknown;
  child_id?: unknown;
  text?: unknown;
  content?: unknown;
  delta?: unknown;
  language?: unknown;
  duration_seconds?: unknown;
  finish_reason?: unknown;
  code?: unknown;
  message?: unknown;
}

function normalizeVoicePayload(dataLines: string[]): VoiceSseEventPayload | null {
  if (dataLines.length === 0) {
    return null;
  }

  const json = dataLines.join('\n').trim();
  if (!json) {
    return null;
  }

  try {
    const payload = JSON.parse(json) as VoiceSseEventPayload;
    return payload && typeof payload === 'object' ? payload : null;
  } catch (error) {
    console.warn('[voiceService] SSE JSON parse failed:', JSON.stringify(json.slice(0, 200)), error);
    return null;
  }
}

function getPayloadString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function getPayloadNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getHttpErrorMessage(responseText: string, fallback: string): string {
  if (!responseText.trim()) {
    return fallback;
  }

  try {
    const payload = JSON.parse(responseText) as { detail?: unknown; message?: unknown };
    const detail = getPayloadString(payload.detail) ?? getPayloadString(payload.message);
    return detail ?? fallback;
  } catch {
    return fallback;
  }
}

function dispatchVoiceSseEvent(
  eventType: string,
  dataLines: string[],
  params: Pick<VoiceTranscriptionStreamPayload, 'onStart' | 'onDelta' | 'onEnd' | 'onError'>,
): Error | null {
  if (!eventType || dataLines.length === 0) {
    return null;
  }

  const payload = normalizeVoicePayload(dataLines);
  if (!payload) {
    return null;
  }

  if (eventType === 'start') {
    const transcriptionId =
      getPayloadString(payload.message_id) ??
      getPayloadString(payload.transcription_id) ??
      `transcription-${Date.now()}`;

    params.onStart({
      transcriptionId,
      messageId: getPayloadString(payload.message_id),
      childId: getPayloadString(payload.child_id),
    });
    return null;
  }

  if (eventType === 'delta') {
    const raw = payload.text ?? payload.content ?? payload.delta;
    const text = getPayloadString(raw) ?? (raw == null ? '' : String(raw));

    if (text.length > 0) {
      params.onDelta(text);
    }
    return null;
  }

  if (eventType === 'end') {
    const transcriptionId =
      getPayloadString(payload.message_id) ??
      getPayloadString(payload.transcription_id) ??
      `transcription-${Date.now()}`;

    params.onEnd({
      transcriptionId,
      messageId: getPayloadString(payload.message_id),
      text: getPayloadString(payload.text) ?? getPayloadString(payload.content) ?? '',
      language: getPayloadString(payload.language),
      durationSeconds: getPayloadNumber(payload.duration_seconds),
      finishReason: getPayloadString(payload.finish_reason),
    });
    return null;
  }

  if (eventType === 'error') {
    const code = getPayloadNumber(payload.code) ?? 0;
    const message = getPayloadString(payload.message) ?? 'Transcription failed';
    params.onError(code, message);
    return createHandledStreamError(message);
  }

  return null;
}

export async function transcribeVoiceRecording({
  childId,
  sessionId,
  audioUri,
}: TranscribeVoiceRecordingPayload): Promise<TranscribeVoiceResponse> {
  const userId = getCurrentUserId();
  const extension = getFileExtension(audioUri);
  const file: ReactNativeFormDataFile = {
    uri: audioUri,
    name: `kidsmind-recording.${extension}`,
    type: getAudioContentType(extension),
  };
  const formData = new FormData();

  formData.append('audio_file', file as unknown as Blob);
  formData.append('child_id', childId);

  const response = await apiRequest<VoiceTranscriptionApiResponse>(
    `/api/v1/voice/${encodeURIComponent(userId)}/${encodeURIComponent(childId)}/${encodeURIComponent(sessionId)}/transcribe/sync`,
    {
      method: 'POST',
      body: formData,
      timeoutMs: 45000,
    },
  );

  return {
    transcriptionId: normalizeString(response.transcription_id, `transcription-${Date.now()}`),
    text: normalizeString(response.text, ''),
    language: normalizeString(response.language, 'unknown'),
    durationSeconds:
      typeof response.duration_seconds === 'number' && Number.isFinite(response.duration_seconds)
        ? response.duration_seconds
        : 0,
  };
}

export function sendVoiceTranscriptionStreaming(params: VoiceTranscriptionStreamPayload): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (params.signal.aborted) {
      resolve();
      return;
    }

    const token = useAuthStore.getState().accessToken;
    if (!token) {
      reject(new Error('You must be signed in to use voice chat.'));
      return;
    }

    const extension = getFileExtension(params.audioUri);
    const file: ReactNativeFormDataFile = {
      uri: params.audioUri,
      name: `kidsmind-recording.${extension}`,
      type: getAudioContentType(extension),
    };

    const formData = new FormData();
    formData.append('audio_file', file as unknown as Blob);
    formData.append('child_id', params.childId);
    formData.append('context', params.context ?? '');
    formData.append('content_type', getAudioContentType(extension));

    const xhr = new XMLHttpRequest();
    const parser = createIncrementalSseParser((eventType, dataLines) =>
      dispatchVoiceSseEvent(eventType, dataLines, params),
    );

    const abortHandler = () => {
      xhr.abort();
    };

    params.signal.addEventListener('abort', abortHandler);

    const cleanup = () => {
      params.signal.removeEventListener('abort', abortHandler);
    };

    const resolveAndClean = () => {
      cleanup();
      resolve();
    };

    const rejectAndClean = (reason: unknown) => {
      cleanup();
      reject(reason);
    };

    xhr.onprogress = () => {
      if (!xhr.responseText) {
        return;
      }

      const error = parser.parseChunk(xhr.responseText);
      if (error) {
        xhr.abort();
        rejectAndClean(error);
      }
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        const message = getHttpErrorMessage(
          xhr.responseText ?? '',
          `Request failed with status ${xhr.status}.`,
        );
        params.onError(xhr.status, message);
        rejectAndClean(createHandledStreamError(message));
        return;
      }

      if (xhr.responseText) {
        const error = parser.parseChunk(xhr.responseText);
        if (error) {
          rejectAndClean(error);
          return;
        }
      }

      const error = parser.flush();
      if (error) {
        rejectAndClean(error);
        return;
      }

      resolveAndClean();
    };

    xhr.onerror = () => {
      if (params.signal.aborted) {
        resolveAndClean();
        return;
      }

      const message = 'Network request failed.';
      params.onError(0, message);
      rejectAndClean(new Error(message));
    };

    xhr.onabort = () => {
      resolveAndClean();
    };

    xhr.ontimeout = () => {
      const message = 'Request timed out.';
      params.onError(0, message);
      rejectAndClean(new Error(message));
    };

    xhr.open('POST', buildTranscriptionUrl(params.userId, params.childId, params.sessionId, true), true);
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('X-Client-Type', 'mobile');
    xhr.overrideMimeType?.('text/event-stream; charset=utf-8');
    xhr.responseType = 'text';
    xhr.timeout = 45000;
    xhr.send(formData);
  });
}
