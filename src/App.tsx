import { Ambient } from './components/Ambient';
import { DropOverlay } from './components/DropOverlay';
import { FileInput } from './components/FileInput';
import { ImportView } from './components/ImportView';
import { ShortcutsSheet } from './components/ShortcutsSheet';
import { Toasts } from './components/Toasts';
import { Toolbar } from './components/Toolbar';
import { MirrorOnly, Workspace } from './components/Workspace';
import { useShortcuts } from './hooks/useShortcuts';
import { useSession } from './state/session';
import { useUI } from './state/ui';

export default function App() {
  const video = useSession((s) => s.video);
  const mirrorOnly = useUI((s) => s.mirrorOnly);
  useShortcuts();

  return (
    <div className="app">
      <Ambient />
      <Toolbar />
      <main className="app__main">
        {video ? <Workspace key={video.id} video={video} /> : mirrorOnly ? <MirrorOnly /> : <ImportView />}
      </main>
      <FileInput />
      <DropOverlay />
      <ShortcutsSheet />
      <Toasts />
    </div>
  );
}
