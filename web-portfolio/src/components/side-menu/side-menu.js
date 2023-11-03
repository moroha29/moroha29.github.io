import './side-menu.css';

export default function SideMenu(props) {
    const projects=props.projects;
    return (
      <div className='sideMenu'>
        <div className="sideNav">
            {projects.map((item)=>{
              return(
                <a className='sideMenuButton' key={item.name} href={'#'+item.name}>
                  {item.displayName}
                </a>)
            })}
        </div>
      </div>
    );
  }
  