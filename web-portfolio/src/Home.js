import profileImage from './assets/profilepicture.png';
import './Home.css';
import Timeline from './components/timeline/timeline';
import Skills from './components/skills/skills';
import { useRef } from "react";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGithub,faLinkedin } from '@fortawesome/free-brands-svg-icons';
import { faEnvelope, faFilePdf } from '@fortawesome/free-regular-svg-icons';
import Pdf from './assets/tanjunhong_resume.pdf';

export default function Home() {
    const aboutMe = useRef(null);
    const skills = useRef(null);
    const experience = useRef(null);
    // const [elementToScroll, setElementToScroll] = useState(true);
    // const [showScrollTopButton, setShowScrollTopButton] = useState(true);
    
    // const getScroll=async (event)=>{
    //     var aboutMeElement = document.querySelector(".aboutMe").offsetHeight;
    //     var experienceElement = document.querySelector(".experience").offsetHeight;
    //     if (window.scrollY < aboutMeElement) {
    //       setShowScrollTopButton(true);
    //       setElementToScroll(true);
    //     } else if (window.scrollY < aboutMeElement+experienceElement) {
    //       setShowScrollTopButton(true);
    //       setElementToScroll(false);
    //     } else{
    //       setShowScrollTopButton(false)
    //     }
    //     event.stopPropagation();
    // }

    // useEffect(() => {
    //   document.addEventListener("scroll",getScroll);
    //   return ()=>document.removeEventListener('scroll', getScroll);
    //  }, []);


    // const scrollToSection = (elementRef) => {
    //   if(elementRef){
    //     window.scrollTo({
    //       top: elementRef.current.offsetTop-70,
    //       behavior: "smooth",
    //     });
    //   }
    // };

    // const scrollTop = () => {
    //   window.scrollTo({
    //     top: 0,
    //     behavior: "smooth",
    //   });
    // };

    
  return (
    <div className="container content grid">
      <section ref={aboutMe} className="aboutMe" id='aboutMe'>
        <div className='container'>
          <div className='row'>
            <div className='col-md-auto d-flex justify-content-center mb-3'>
              <img src={profileImage} alt="profileImage" className="profileImage "/>
            </div>
            <div className='col info'>
              <div className='row'>
                <h3>Hey There, My Name is</h3>
              </div>
              <div className='row'>
                <h1>Tan Jun Hong</h1>
              </div> 
              <div className='row'>
                <i><p>Penultimate NTU Double Major in Mathematical and Computer Science<br/>
                Nanyang Scholar</p></i>
              </div>
              <div className='row icons'>
                <a className='iconLinks' href='https://www.linkedin.com/in/jun-hong-tan-929b32249/' 
                target="_blank" rel="noreferrer noopener" title='Github Link'>
                  <FontAwesomeIcon className='col-md-auto fa-lg' icon={faGithub} />
                </a>
                <a className='iconLinks' href='https://github.com/moroha29' 
                target="_blank" rel="noreferrer noopener" title='Linkedin Link'>
                  <FontAwesomeIcon className='col-md-auto fa-lg' icon={faLinkedin} />
                </a>
                <a className='iconLinks' href='mailto:junhong.tan@gmail.com' title='Email me at'>
                  <FontAwesomeIcon className='col-md-auto fa-lg' icon={faEnvelope} />
                </a>
                <a className='iconLinks' href={Pdf} target="_blank" 
                  rel="noreferrer noopener" title='Open my resume'>
                  <FontAwesomeIcon className='col-md-auto fa-lg' icon={faFilePdf} />
                </a>
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
            <i>Hover for more info!</i>
          </div>
          <br></br>
          <div className='row'>
            <Timeline/>
          </div>
        </div>
      </section>
      <section ref={skills} className="skills mb-20" id='skills'>
        <div className='container'>
          <Skills/>
        </div>
      </section>
      <div>
        {/* {showScrollTopButton && <div onClick={() => scrollToSection(elementToScroll?experience:skills)} className='down-arrow'></div>}
        {!showScrollTopButton && <div onClick={() => scrollTop()} className='up-arrow'></div>} */}
      </div>
    </div>
    
  );
}
