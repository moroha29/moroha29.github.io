import profileImage from './assets/profilepicture.png';
import './Home.css';

export default function Home() {
  return (
    <div className="container content grid">
        <img src={profileImage} alt="profileImage" className="profileImage"/>
        <section className="aboutMe" id='aboutMe'>
          About Me
        </section>
        <a href='#skills'><div className='down-arrow'></div></a>
        <section className="skills" id='skills'>
          Skills
        </section>
        <section className="experience" id='experience'>
          Experience
        </section>
    </div>
  );
}
