import './App.css';
import { Link } from 'react-router-dom';

export default function TopBar() {
  return (
    <div className="TopBar">
        <div className="MenuItems">
            <Link className="MenuItem" to="/">Home</Link>
            <Link className="MenuItem" to="/projects">Projects</Link>
            <Link className="MenuItem" to="/updates">Updates</Link>
        </div>
    </div>
  );
}

