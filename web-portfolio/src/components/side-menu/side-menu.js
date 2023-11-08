import './side-menu.css';
import { faCaretSquareDown } from '@fortawesome/free-regular-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect } from 'react';

export default function SideMenu(props){
    const projects=props.projects;

    function toggleMenu(){
      this.previousElementSibling.classList.toggle("active");
      this.classList.toggle("active");
      var dropdownContent = this.nextElementSibling;
      if (dropdownContent.style.display === "none") {
        dropdownContent.style.display = "block";
      } else {
        dropdownContent.style.display = "none";
      }
    }

    useEffect(() => {
      var i;
      var dropdown = document.getElementsByClassName("megaMenuIcon");
      for (i = 0; i < dropdown.length; i++) {
        dropdown[i].addEventListener("click", toggleMenu);
      }
      return () =>{
        var j;
        for (j = 0; j < dropdown.length; j++) {
          dropdown[j].removeEventListener("click", toggleMenu)
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
                    {item.sections.map((submenu)=>{ return(
                      <li><a className={`${submenu.header ? "subMenuHeader" : ""}`} 
                      href={'#'+submenu.name} >
                      {submenu.displayName}
                    </a></li>
                    )
                    })
                    }
                  </div>
                </div>
              )
            })}
        </div>
      </div>
    );
  }
  