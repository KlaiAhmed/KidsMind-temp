export interface IncrementalSseParser {
  parseChunk: (fullText: string) => Error | null;
  flush: () => Error | null;
}

type SseEventHandler = (eventType: string, dataLines: string[]) => Error | null | void;

export function createIncrementalSseParser(onEvent: SseEventHandler): IncrementalSseParser {
  let processedLength = 0;
  let lineBuffer = '';
  let currentEvent = '';
  let currentDataLines: string[] = [];

  const flushCurrentEvent = (): Error | null => {
    const eventType = currentEvent;
    const dataLines = currentDataLines;
    currentEvent = '';
    currentDataLines = [];
    return onEvent(eventType, dataLines) ?? null;
  };

  const parseChunk = (fullText: string): Error | null => {
    const newChunk = fullText.slice(processedLength);
    processedLength = fullText.length;

    lineBuffer += newChunk;

    const lines = lineBuffer.split(/\r?\n/);
    lineBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line) {
        const error = flushCurrentEvent();
        if (error) {
          return error;
        }
        continue;
      }

      if (line.startsWith('event:')) {
        const error = flushCurrentEvent();
        if (error) {
          return error;
        }
        currentEvent = line.slice(6).trim();
        continue;
      }

      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data) {
          currentDataLines.push(data);
        }
      }
    }

    return null;
  };

  return {
    parseChunk,
    flush: flushCurrentEvent,
  };
}
