import profileImage from './assets/profilepicture.png';
import './Home.css';
import { useRef,useEffect,useState } from "react";

export default function Home() {
    const aboutMe = useRef(null);
    const skills = useRef(null);
    const experience = useRef(null);
    const [elementToScroll, setElementToScroll] = useState(false);
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
      <img ref={aboutMe} src={profileImage} alt="profileImage" className="profileImage"/>
      <section className="aboutMe" id='aboutMe'>
        About Me
      </section>
      <section ref={skills} className="skills" id='skills'>
        Skills
      </section>
      <section ref={experience} className="experience" id='experience'>
        Experience
      </section>
      <div>{showScrollTopButton && <div onClick={() => scrollToSection(elementToScroll?skills:experience)} className='down-arrow'></div>}
            {!showScrollTopButton && <div onClick={() => scrollTop()} className='up-arrow'></div>}
        </div>
    </div>
  );
}
