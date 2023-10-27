import './App.css';
import { Route,Routes, } from 'react-router-dom';
import Home from './Home.js';
import Projects from './Projects.js';
import Updates from './Updates.js';

export default function Router() {
  return (
    <Routes>
        <Route exact path="/" component={Home} />
        <Route path="/projects" component={Projects} />
        <Route path="/updates" component={Updates} />
    </Routes>
  );
}

