import './App.css';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';

export default function TopBar() {
  const [darkMode, setdarkMode] = useState(false);
  useEffect(() => {
    if(darkMode){
      document.querySelector(':root').style.setProperty('--background', '#36393e');
      document.querySelector(':root').style.setProperty('--color-text', 'white');
    }else{
      document.querySelector(':root').style.setProperty('--background', 'white');
      document.querySelector(':root').style.setProperty('--color-text', 'black');
    }
   }, [darkMode]);

  return (
    <div className="TopBar">
        <div className="MenuItems">
            <Link className="MenuItem" to="/">Home</Link>
            {/* <Link className="MenuItem" to="/projects">Projects</Link> */}
          <div className="MenuItem SwitchItem">
            <label className='switch'>
              <input
              type="checkbox"
              checked={darkMode} 
              onChange={(e) => setdarkMode(e.target.checked)}/>
              <span className="slider round"></span>
            </label>
          </div>
        </div>
    </div>
  );
}

