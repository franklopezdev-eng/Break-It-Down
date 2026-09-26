/**
 * The mirror: a camera stream plus everything the UI needs to explain what's
 * going on when it isn't working. The camera is never started implicitly; it needs
 * a user gesture, and it's fully released (light off) when the mirror is closed.
 */

import { create } from 'zustand';

export type WebcamStatus =
  | 'off'
  | 'starting'
  | 'live'
  /** The user (or their browser policy) said no. */
  | 'denied'
  /** No camera is connected, or the chosen one has gone away. */
  | 'unavailable'
  /** Another app has the camera. */
  | 'busy'
  /** Camera access needs HTTPS (or localhost). */
  | 'insecure'
  | 'unsupported'
  | 'error';

interface WebcamState {
  status: WebcamStatus;
  stream: MediaStream | null;
  devices: MediaDeviceInfo[];
  deviceId: string | null;
  /** Width / height of the live stream. */
  aspect: number;
}

export const useWebcam = create<WebcamState>(() => ({
  status: 'off',
  stream: null,
  devices: [],
  deviceId: null,
  aspect: 16 / 9,
}));

let watching = false;
let startToken = 0;

function classify(error: unknown): WebcamStatus {
  const name = error instanceof DOMException ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'unavailable';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy';
    default:
      return 'error';
  }
}

export async function refreshCameras(): Promise<void> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    useWebcam.setState({ devices: all.filter((d) => d.kind === 'videoinput') });
  } catch {
    // Listing cameras is a nicety; the mirror works without it.
  }
}

function releaseStream(): void {
  useWebcam.getState().stream?.getTracks().forEach((track) => track.stop());
}

export async function startWebcam(deviceId?: string | null): Promise<void> {
  if (!window.isSecureContext) {
    useWebcam.setState({ status: 'insecure' });
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    useWebcam.setState({ status: 'unsupported' });
    return;
  }

  const token = ++startToken;
  releaseStream();
  useWebcam.setState({ status: 'starting', stream: null });

  const wanted = deviceId ?? useWebcam.getState().deviceId;
  const video: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
    ...(wanted ? { deviceId: { exact: wanted } } : { facingMode: 'user' }),
  };

  try {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (error) {
      // A remembered camera that's been unplugged shouldn't lock the mirror out.
      if (wanted && error instanceof DOMException && error.name === 'OverconstrainedError') {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      } else {
        throw error;
      }
    }

    if (token !== startToken) {
      stream.getTracks().forEach((t) => t.stop()); // the user gave up while the prompt was open
      return;
    }

    const track = stream.getVideoTracks()[0];
    // A stream that arrives with no live video track would otherwise show "Live" over black.
    if (!track || track.readyState === 'ended') {
      stream.getTracks().forEach((t) => t.stop());
      throw new DOMException('The camera stream has no live video track', 'NotFoundError');
    }
    const settings = track.getSettings();
    track.addEventListener('ended', () => {
      if (useWebcam.getState().stream === stream) {
        useWebcam.setState({ status: 'unavailable', stream: null });
      }
    });

    useWebcam.setState({
      status: 'live',
      stream,
      deviceId: settings.deviceId ?? wanted ?? null,
      aspect: settings.width && settings.height ? settings.width / settings.height : 16 / 9,
    });

    // Labels only become available once permission has been granted.
    await refreshCameras();
    if (!watching) {
      watching = true;
      navigator.mediaDevices.addEventListener('devicechange', () => void refreshCameras());
    }
  } catch (error) {
    if (token !== startToken) return;
    console.warn('Camera unavailable', error);
    useWebcam.setState({ status: classify(error), stream: null });
  }
}

export function stopWebcam(): void {
  startToken++; // cancels a start that is still waiting on the permission prompt
  releaseStream();
  useWebcam.setState({ status: 'off', stream: null });
}

export function toggleWebcam(): void {
  const { status } = useWebcam.getState();
  if (status === 'live' || status === 'starting') stopWebcam();
  else void startWebcam();
}

export function selectCamera(deviceId: string): void {
  useWebcam.setState({ deviceId });
  if (useWebcam.getState().status === 'live') void startWebcam(deviceId);
}
