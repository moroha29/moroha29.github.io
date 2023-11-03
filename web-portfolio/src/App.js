import './App.css';
import TopBar from './topbar';
import { Routes,Route,useLocation } from "react-router-dom";
import Projects from './Projects';
import Home from './Home';
import Updates from './Updates';
import { useEffect } from 'react';

const titles = {
  '/': 'About Me',
  '/projects': 'Projects',
  '/updates': 'Updates on Projects'
}

function App() {
  const location = useLocation()
  useEffect(() => {(document.title = titles[location.pathname] ?? 'Hello World')},
    [location]
  )
  return (
    <div>
      <div className='top'>
        <TopBar/>
      </div>
      <div className="body">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/updates" element={<Updates />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
