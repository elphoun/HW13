import head from '../assets/home/mascot-head.svg';
import leafLeft from '../assets/home/mascot-leaf-left.svg';
import leafRight from '../assets/home/mascot-leaf-right.svg';
import eye from '../assets/home/mascot-eye.svg';
import smile from '../assets/home/mascot-smile.svg';
import smileSmall from '../assets/home/mascot-smile-small.svg';
import stem from '../assets/home/mascot-stem.svg';

/** The "Slack Off" mascot that sits in the bush on the home screen. Layer order follows the Figma frame. */
export function HomeMascot() {
  return (
    <div className="home-mascot" aria-hidden>
      <img className="hm hm-head" src={head} alt="" />
      <img className="hm hm-leaf-l" src={leafLeft} alt="" />
      <img className="hm hm-leaf-r" src={leafRight} alt="" />
      <span className="hm hm-pill hm-green" />
      <span className="hm hm-pill hm-coral" />
      <span className="hm hm-pill hm-yellow" />
      <img className="hm hm-eye hm-eye-1" src={eye} alt="" />
      <img className="hm hm-smile" src={smile} alt="" />
      <img className="hm hm-smile-sm" src={smileSmall} alt="" />
      <img className="hm hm-eye hm-eye-2" src={eye} alt="" />
      <img className="hm hm-stem" src={stem} alt="" />
    </div>
  );
}
