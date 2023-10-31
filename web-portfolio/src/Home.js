import profileImage from './assets/profilepicture.png';
import './Home.css';
import Timeline from './components/timeline/timeline';
import { useRef,useEffect,useState } from "react";

export default function Home() {
    const aboutMe = useRef(null);
    const skills = useRef(null);
    const experience = useRef(null);
    const [elementToScroll, setElementToScroll] = useState(true);
    const [showScrollTopButton, setShowScrollTopButton] = useState(true);
    

    useEffect(() => {
      window.addEventListener("scroll", () => {
        if (window.scrollY < window.innerHeight-90) {
          setShowScrollTopButton(true)
          setElementToScroll(true);
        } else if (window.scrollY < window.innerHeight*2-90*2) {
          setShowScrollTopButton(true)
          setElementToScroll(false);
        } else{
          setShowScrollTopButton(false)
        }
      });
     }, []);

    const scrollToSection = (elementRef) => {
      window.scrollTo({
        top: elementRef.current.offsetTop,
        behavior: "smooth",
      });
    };

    const scrollTop = () => {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    };

    
  return (
    <div className="container content grid">
      <section ref={aboutMe} className="aboutMe" id='aboutMe'>
        <div className='container'>
          <div className='row'>
            <div className='col-md-auto'>
              <img src={profileImage} alt="profileImage" className="profileImage"/>
            </div>
            <div className='col info'>
              <div className='row'>
                <h3>Hey There, My Name is</h3>
              </div>
              <div className='row'>
                <h1>Tan Jun Hong</h1> 
              </div> 
              <div className='row'>
                <p>Penultimate NTU Double Major in Mathematical and Computer Science<br/>
                Nanyang Scholar</p>
              </div>
            </div>
          </div>
          <br></br>
          <div className='row'>
            <h3>More About Me!</h3>
            <p>I am an avid gamer and traveller in my free time and coder in my not so free time. I like to explore new technology and find new ideas to
              impement to solve problems in my daily life.
            </p>
          </div>
        </div>
      </section>
      <section ref={experience} className="experience" id='experience'>
        <div className='container'>
          <div className='row'>
            <h3>Experience</h3>
          </div>
          <br></br>
          <div className='row'>
            <Timeline/>
          </div>
        </div>
      </section>
      <section ref={skills} className="skills" id='skills'>
        <div className='container'>
            <div className='row'>
              <h3>Skills</h3>
            </div>
            <div className='row'>
              
            </div>
        </div>
      </section>
      <div>{showScrollTopButton && <div onClick={() => scrollToSection(elementToScroll?experience:skills)} className='down-arrow'></div>}
            {!showScrollTopButton && <div onClick={() => scrollTop()} className='up-arrow'></div>}
        </div>
    </div>
  );
}
