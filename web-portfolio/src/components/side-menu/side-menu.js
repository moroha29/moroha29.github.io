import './side-menu.css';
import { faCaretSquareDown } from '@fortawesome/free-regular-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect } from 'react';

export default function SideMenu(props){
    const projects=props.projects;
    const subprojects=props.subprojects;
    var dropdown = document.getElementsByClassName("megaMenuIcon");
    var i;

    function toggleMenu(){
      this.previousElementSibling.classList.toggle("active");
      this.classList.toggle("active");
      var dropdownContent = this.nextElementSibling;
      if (dropdownContent.style.display == "none") {
        dropdownContent.style.display = "block";
      } else {
        dropdownContent.style.display = "none";
      }
    }

    useEffect(() => {
      for (i = 0; i < dropdown.length; i++) {
        dropdown[i].addEventListener("click", toggleMenu);
      }
      return () =>{
        for (i = 0; i < dropdown.length; i++) {
          dropdown[i].removeEventListener("click", toggleMenu)
        }
      }
      },[]);
    
    return (
      <div className='sideMenu'>
        <div className="sideNav container">
            {projects.map((item)=>{
              return(
                <div className='row' key={item.name}>
                  <a className='col-md-9 sideMenuButton ripple' href={'#'+item.name}>
                    {item.displayName} 
                  </a>
                  <div className='col-md-3 megaMenuIcon' >
                    <FontAwesomeIcon className='' icon={faCaretSquareDown} />
                  </div>
                  <div className="dropdown-container" style={{display:'none'}}>
                    <a className='col-12' href="#">Link 1</a>
                    <a className='col-12' href="#">Link 2</a>
                    <a className='col-12' href="#">Link 3</a>
                  </div>
                </div>
              )
            })}
        </div>
      </div>
    );
  }
  