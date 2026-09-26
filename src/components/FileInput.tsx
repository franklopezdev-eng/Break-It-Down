import { openVideo } from '../state/session';

let input: HTMLInputElement | null = null;

/** Opens the system file picker. Must be called from a user gesture. */
export function pickVideo(): void {
  input?.click();
}

/** The one hidden file input every "choose a video" button drives. */
export function FileInput() {
  return (
    <input
      ref={(el) => {
        input = el;
      }}
      type="file"
      accept="video/*,.mp4,.m4v,.mov,.webm,.mkv"
      hidden
      data-testid="file-input"
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = ''; // lets the same file be chosen again
        if (file) void openVideo(file);
      }}
    />
  );
}
