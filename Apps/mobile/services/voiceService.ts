import { apiRequest, getApiBaseUrl } from '@/services/apiClient';
import { createIncrementalSseParser } from '@/services/incrementalSseParser';
import { useAuthStore } from '@/store/authStore';
import * as FileSystem from 'expo-file-system/legacy';

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

interface SpeechToSpeechStartPayload {
  messageId: string;
  childId?: string;
}

interface SpeechToSpeechTranscriptionEndPayload {
  transcriptionId: string;
  messageId?: string;
  text: string;
  language?: string;
  durationSeconds?: number;
  finishReason?: string;
}

interface SpeechToSpeechChatEndPayload {
  messageId: string;
  finishReason?: string;
}

interface SpeechToSpeechStreamResult {
  transcriptionText: string;
  transcriptionId?: string;
  language?: string;
  durationSeconds?: number;
  messageId?: string;
  aiText: string;
  ttsLanguage: string;
}

interface SpeechToSpeechStreamPayload {
  userId: string;
  childId: string;
  sessionId: string;
  audioUri: string;
  context?: string;
  signal: AbortSignal;
  onTranscriptionStart: (payload: VoiceTranscriptionStartPayload) => void;
  onTranscriptionDelta: (text: string) => void;
  onTranscriptionEnd: (payload: SpeechToSpeechTranscriptionEndPayload) => void;
  onChatStart: (payload: SpeechToSpeechStartPayload) => void;
  onChatDelta: (text: string) => void;
  onChatEnd: (payload: SpeechToSpeechChatEndPayload) => void;
  onError: (code: string | number, message: string) => void;
}

interface SynthesizeVoiceTtsPayload {
  childId: string;
  sessionId: string;
  text: string;
  language?: string;
  signal?: AbortSignal;
}

interface SynthesizeVoiceTtsResponse {
  audioUri: string;
  contentType: string;
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

function getCurrentAccessToken(): string {
  const token = useAuthStore.getState().accessToken;
  if (!token) {
    throw new Error('You must be signed in to use voice chat.');
  }

  return token;
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

function buildSpeechToSpeechUrl(userId: string, childId: string, sessionId: string, stream: boolean): string {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/api/v1/voice/${encodeURIComponent(userId)}/${encodeURIComponent(childId)}/${encodeURIComponent(sessionId)}/speech-to-speech${stream ? '?stream=true' : ''}`;
}

function buildTtsUrl(userId: string, childId: string, sessionId: string): string {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/api/v1/voice/${encodeURIComponent(userId)}/${encodeURIComponent(childId)}/${encodeURIComponent(sessionId)}/tts`;
}

function createHandledStreamError(message: string): Error {
  const handledError = new Error(message) as Error & { __streamHandled?: boolean };
  handledError.__streamHandled = true;
  return handledError;
}

interface VoiceSseEventPayload {
  type?: unknown;
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

function getPayloadCode(value: unknown): string | number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const text = getPayloadString(value);
  return text ?? 0;
}

function mergeStreamingText(previousText: string, nextText: string): string {
  if (!nextText) {
    return previousText;
  }

  if (!previousText) {
    return nextText;
  }

  if (nextText.startsWith(previousText)) {
    return nextText;
  }

  return previousText + nextText;
}

function normalizeTtsLanguage(language: string | undefined): string {
  const normalized = language?.trim().toLowerCase();
  if (!normalized || normalized === 'unknown') {
    return 'en';
  }

  return normalized;
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

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not prepare audio playback.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not prepare audio playback.'));
        return;
      }

      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

async function readBlobAsText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') {
    return blob.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read response.'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(blob);
  });
}

async function getTtsErrorMessage(response: unknown, fallback: string): Promise<string> {
  if (typeof Blob !== 'undefined' && response instanceof Blob) {
    return getHttpErrorMessage(await readBlobAsText(response), fallback);
  }

  if (typeof response === 'string') {
    return getHttpErrorMessage(response, fallback);
  }

  return fallback;
}

function buildTtsAudioFileUri(): string {
  if (!FileSystem.cacheDirectory) {
    throw new Error('Audio playback storage is unavailable.');
  }

  const suffix = Math.random().toString(36).slice(2);
  return `${FileSystem.cacheDirectory}kidsmind-tts-${Date.now()}-${suffix}.mp3`;
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

type SpeechToSpeechPhase = 'transcription' | 'chat' | null;

interface SpeechToSpeechDispatchState {
  phase: SpeechToSpeechPhase;
  transcriptionText: string;
  transcriptionId?: string;
  transcriptionMessageId?: string;
  transcriptionLanguage?: string;
  transcriptionDurationSeconds?: number;
  chatMessageId?: string;
  aiText: string;
}

function dispatchSpeechToSpeechSseEvent(
  eventType: string,
  dataLines: string[],
  params: SpeechToSpeechStreamPayload,
  state: SpeechToSpeechDispatchState,
): Error | null {
  if (!eventType || dataLines.length === 0) {
    return null;
  }

  const payload = normalizeVoicePayload(dataLines);
  if (!payload) {
    return null;
  }

  if (eventType === 'start') {
    const streamType = getPayloadString(payload.type);
    const messageId =
      getPayloadString(payload.message_id) ??
      (streamType === 'transcription' ? `transcription-${Date.now()}` : `msg-${Date.now()}`);

    if (streamType === 'transcription') {
      state.phase = 'transcription';
      state.transcriptionId = messageId;
      state.transcriptionMessageId = messageId;
      params.onTranscriptionStart({
        transcriptionId: messageId,
        messageId,
        childId: getPayloadString(payload.child_id),
      });
      return null;
    }

    state.phase = 'chat';
    state.chatMessageId = messageId;
    params.onChatStart({
      messageId,
      childId: getPayloadString(payload.child_id),
    });
    return null;
  }

  if (eventType === 'delta') {
    const raw = payload.text ?? payload.content ?? payload.delta;
    const text = getPayloadString(raw) ?? (raw == null ? '' : String(raw));

    if (!text) {
      return null;
    }

    if (state.phase === 'transcription') {
      state.transcriptionText = mergeStreamingText(state.transcriptionText, text);
      params.onTranscriptionDelta(text);
      return null;
    }

    state.aiText += text;
    params.onChatDelta(text);
    return null;
  }

  if (eventType === 'end') {
    const finishReason = getPayloadString(payload.finish_reason);

    if (state.phase === 'transcription' || payload.text !== undefined || payload.duration_seconds !== undefined) {
      const finalText = getPayloadString(payload.text) ?? getPayloadString(payload.content) ?? state.transcriptionText;
      const transcriptionId =
        getPayloadString(payload.transcription_id) ??
        getPayloadString(payload.message_id) ??
        state.transcriptionId ??
        `transcription-${Date.now()}`;

      state.phase = null;
      state.transcriptionText = finalText;
      state.transcriptionId = transcriptionId;
      state.transcriptionMessageId = getPayloadString(payload.message_id);
      state.transcriptionLanguage = getPayloadString(payload.language);
      state.transcriptionDurationSeconds = getPayloadNumber(payload.duration_seconds);

      params.onTranscriptionEnd({
        transcriptionId,
        messageId: state.transcriptionMessageId,
        text: finalText,
        language: state.transcriptionLanguage,
        durationSeconds: state.transcriptionDurationSeconds,
        finishReason,
      });
      return null;
    }

    const messageId = getPayloadString(payload.message_id) ?? state.chatMessageId ?? `msg-${Date.now()}`;
    state.phase = null;
    state.chatMessageId = messageId;
    params.onChatEnd({ messageId, finishReason });
    return null;
  }

  if (eventType === 'error') {
    const code = getPayloadCode(payload.code);
    const message = getPayloadString(payload.message) ?? 'Voice request failed';
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

export function synthesizeVoiceTtsAudioFile({
  childId,
  sessionId,
  text,
  language = 'en',
  signal,
}: SynthesizeVoiceTtsPayload): Promise<SynthesizeVoiceTtsResponse> {
  return new Promise<SynthesizeVoiceTtsResponse>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Voice playback was cancelled.'));
      return;
    }

    const userId = getCurrentUserId();
    const token = getCurrentAccessToken();
    const formData = new FormData();
    formData.append('text', text);
    formData.append('language', language);

    const xhr = new XMLHttpRequest();
    const abortHandler = () => {
      xhr.abort();
    };

    signal?.addEventListener('abort', abortHandler, { once: true });

    const cleanup = () => {
      signal?.removeEventListener('abort', abortHandler);
    };

    const resolveAndClean = (payload: SynthesizeVoiceTtsResponse) => {
      cleanup();
      resolve(payload);
    };

    const rejectAndClean = (reason: unknown) => {
      cleanup();
      reject(reason);
    };

    xhr.onload = () => {
      void (async () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          const message = await getTtsErrorMessage(
            xhr.response,
            `Read aloud failed with status ${xhr.status}.`,
          );
          rejectAndClean(new Error(message));
          return;
        }

        if (!(typeof Blob !== 'undefined' && xhr.response instanceof Blob)) {
          rejectAndClean(new Error('Read aloud returned an audio format this device could not play.'));
          return;
        }

        const dataUrl = await readBlobAsDataUrl(xhr.response);
        const base64Audio = dataUrl.split(',')[1];
        if (!base64Audio) {
          rejectAndClean(new Error('Could not prepare audio playback.'));
          return;
        }

        const audioUri = buildTtsAudioFileUri();
        await FileSystem.writeAsStringAsync(audioUri, base64Audio, {
          encoding: FileSystem.EncodingType.Base64,
        });

        resolveAndClean({
          audioUri,
          contentType: xhr.getResponseHeader('content-type') ?? 'audio/mpeg',
        });
      })().catch(rejectAndClean);
    };

    xhr.onerror = () => {
      rejectAndClean(new Error('Network request failed.'));
    };

    xhr.onabort = () => {
      rejectAndClean(new Error('Voice playback was cancelled.'));
    };

    xhr.ontimeout = () => {
      rejectAndClean(new Error('Request timed out.'));
    };

    xhr.open('POST', buildTtsUrl(userId, childId, sessionId), true);
    xhr.setRequestHeader('Accept', 'audio/mpeg');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('X-Client-Type', 'mobile');
    xhr.responseType = 'blob';
    xhr.timeout = 45000;
    xhr.send(formData);
  });
}

export function sendSpeechToSpeechStreaming(params: SpeechToSpeechStreamPayload): Promise<SpeechToSpeechStreamResult> {
  return new Promise<SpeechToSpeechStreamResult>((resolve, reject) => {
    if (params.signal.aborted) {
      resolve({
        transcriptionText: '',
        aiText: '',
        ttsLanguage: 'en',
      });
      return;
    }

    const token = getCurrentAccessToken();

    const extension = getFileExtension(params.audioUri);
    const contentType = getAudioContentType(extension);
    const file: ReactNativeFormDataFile = {
      uri: params.audioUri,
      name: `kidsmind-recording.${extension}`,
      type: contentType,
    };

    const formData = new FormData();
    formData.append('audio_file', file as unknown as Blob);
    formData.append('child_id', params.childId);
    formData.append('context', params.context ?? '');
    formData.append('content_type', contentType);

    const state: SpeechToSpeechDispatchState = {
      phase: null,
      transcriptionText: '',
      aiText: '',
    };

    const xhr = new XMLHttpRequest();
    const parser = createIncrementalSseParser((eventType, dataLines) =>
      dispatchSpeechToSpeechSseEvent(eventType, dataLines, params, state),
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
      resolve({
        transcriptionText: state.transcriptionText,
        transcriptionId: state.transcriptionId,
        language: state.transcriptionLanguage,
        durationSeconds: state.transcriptionDurationSeconds,
        messageId: state.chatMessageId,
        aiText: state.aiText,
        ttsLanguage: normalizeTtsLanguage(state.transcriptionLanguage),
      });
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

    xhr.open('POST', buildSpeechToSpeechUrl(params.userId, params.childId, params.sessionId, true), true);
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('X-Client-Type', 'mobile');
    xhr.overrideMimeType?.('text/event-stream; charset=utf-8');
    xhr.responseType = 'text';
    xhr.timeout = 90000;
    xhr.send(formData);
  });
}

export function sendVoiceTranscriptionStreaming(params: VoiceTranscriptionStreamPayload): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (params.signal.aborted) {
      resolve();
      return;
    }

    const token = getCurrentAccessToken();

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
