import './App.css';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';

export default function TopBar() {
  const [darkMode, setdarkMode] = useState(false);
  useEffect(() => {
    if(darkMode){
      document.querySelector(':root').style.setProperty('--background', 'grey');
    }else{
      document.querySelector(':root').style.setProperty('--background', 'white');
    }
   }, [darkMode]);

  return (
    <div className="TopBar">
        <div className="MenuItems">
            <Link className="MenuItem" to="/">Home</Link>
            <Link className="MenuItem" to="/projects">Projects</Link>
            <Link className="MenuItem" to="/updates">Updates</Link>
            <label className="switch">
              <input 
              type="checkbox"
              checked={darkMode} 
              onChange={(e) => setdarkMode(e.target.checked)}/>
              <span className="slider round"></span>
            </label>
        </div>
    </div>
  );
}

