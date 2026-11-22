import clouds from '../assets/home/clouds.png';

/**
 * Drifting cloud backdrop: the big cloud bank sways slowly, and two smaller copies sail right to left at different
 * speeds and heights for depth. Pure CSS animation; it stops for people who prefer reduced motion.
 */
export function CloudSky({ className = '' }: { className?: string }) {
  return (
    <div className={`cloud-sky ${className}`} aria-hidden>
      <img className="cs-far" src={clouds} alt="" />
      <img className="cs-bank" src={clouds} alt="" />
      <img className="cs-near" src={clouds} alt="" />
    </div>
  );
}
