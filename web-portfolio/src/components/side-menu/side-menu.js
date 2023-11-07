import './side-menu.css';
import { faCaretSquareDown } from '@fortawesome/free-regular-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect } from 'react';

export default function SideMenu(props){
    const projects=props.projects;
    const subprojects=props.subprojects;

    useEffect(() => {
      var dropdown = document.getElementsByClassName("megaMenuIcon");
      var i;
      for (i = 0; i < dropdown.length; i++) {
        console.info(dropdown[i])
        dropdown[i].addEventListener("click", function() {
          // console.log(dropdown["0"]);
          // this.classList.toggle("active");
          var dropdownContent = this.nextElementSibling;
          console.log(dropdownContent.style.display);
          if (dropdownContent.style.display == "none") {
            dropdownContent.style.display = "block";
          } else {
            dropdownContent.style.display = "none";
          }
        });
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
                  <div className='col-md-3 megaMenuIcon' id={item.name}>
                    <FontAwesomeIcon className='' icon={faCaretSquareDown} />
                  </div>
                  <div className="dropdown-container" style={{display:"none"}}>
                    <a href="#">Link 1</a>
                    <a href="#">Link 2</a>
                    <a href="#">Link 3</a>
                  </div>
                </div>
              )
            })}
        </div>
      </div>
    );
  }
  