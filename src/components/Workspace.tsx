import type { LoadedVideo } from '../state/session';
import { Dock } from './Dock';
import { MomentsPanel } from './MomentsPanel';
import { Stage } from './Stage';

/** Video + mirror on top, playback controls beneath, key moments alongside. */
export function Workspace({ video }: { video: LoadedVideo }) {
  return (
    <div className="workspace">
      <h1 className="sr-only">Practicing {video.name}</h1>
      <div className="workspace__main">
        <Stage video={video} />
        <Dock video={video} />
      </div>
      <aside className="workspace__side">
        <MomentsPanel video={video} />
      </aside>
    </div>
  );
}

/** The mirror on its own, for checking yourself before choosing a video. */
export function MirrorOnly() {
  return (
    <div className="workspace workspace--solo">
      <h1 className="sr-only">Mirror</h1>
      <div className="workspace__main">
        <Stage video={null} />
      </div>
    </div>
  );
}
