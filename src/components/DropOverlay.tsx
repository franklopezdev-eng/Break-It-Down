import { Upload } from 'lucide-react';
import { useEffect } from 'react';
import { openVideo } from '../state/session';
import { useUI } from '../state/ui';

const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');

/** Accepts a video dropped anywhere on the window and shows a hint while one is dragged in. */
export function DropOverlay() {
  const dragging = useUI((s) => s.dragging);

  useEffect(() => {
    let depth = 0; // dragenter/dragleave fire for every child element
    const setDragging = (value: boolean) => useUI.setState({ dragging: value });

    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth++;
      setDragging(true);
    };
    const onOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const file = event.dataTransfer?.files[0];
      if (file) void openVideo(file);
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  if (!dragging) return null;
  return (
    <div className="drop-overlay" role="presentation">
      <div className="drop-overlay__card glass">
        <Upload size={34} strokeWidth={1.75} />
        <div className="t-title3">Drop to open</div>
        <div className="t-subhead t-secondary">Release to load this choreography video</div>
      </div>
    </div>
  );
}
