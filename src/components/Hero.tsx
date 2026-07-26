import { GlassWrap } from './GlassProvider';

export function Hero() {
  return (
    <section className="hero" id="heroSection">
      <GlassWrap
        borderRadius={24}
        style={{
          padding: '40px 60px',
          background: 'transparent',
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
        }}
      >
        <div className="hero-icon">🎮</div>
        <h1>益智游戏集</h1>
      </GlassWrap>
      <p>
        丰富的益智游戏集合，包含棋类、数字游戏、记忆挑战等多种类型。锻炼思维，放松身心。
      </p>
    </section>
  );
}