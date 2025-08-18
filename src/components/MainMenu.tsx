interface MainMenuProps {
  connected: boolean;
  error?: string;
  onPlay: () => void;
}

export default function MainMenu({ connected, error, onPlay }: MainMenuProps) {
  return (
    <div className="snes-menu mb-12">
      <div className="menu-box">
        <div className="menu-title">Main Menu</div>
        <div className="column">
          <button
            className="menu-item snes-font"
            onClick={onPlay}
            disabled={!connected}
          >
            Play
          </button>
          <button className="menu-item snes-font" disabled>
            Leaderboard
          </button>
          <button className="menu-item snes-font" disabled>
            Customization
          </button>
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
