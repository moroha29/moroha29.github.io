import './App.css';
import TopBar from './topbar';
import { Routes,Route } from "react-router-dom";
import Projects from './Projects';
import Home from './Home';
import Updates from './Updates';


function App() {
  return (
    <div>
      <TopBar/>
      <div className="">
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
