import './skills.css'

export default function Skills() {
  return (
    <div className='skillItems container'>
        <h3 class='skillHeaders'>Skills</h3>
        <div className='row'>
            <li className='col-3'>TypeScript</li>
            <li className='col-3'>JavaScript</li>
            <li className='col-3'>React</li>
            <li className='col-3'>Angular</li>
            <li className='col-3'>SQL</li>
            <li className='col-3'>Python</li>
            <li className='col-3'>Java</li>
            <li className='col-3'>R</li>
            <li className='col-3'>HTML</li>
            <li className='col-3'>Git and Github</li>
        </div>

        <h3 class='moduleHeaders'>Relevant Modules</h3>
        <div className='row'>
            <li className='col-3'>Module</li>
            <li className='col-3'>Module</li>
            <li className='col-3'>Module</li>
            <li className='col-3'>Module</li>
            <li className='col-3'>Module</li>
            <li className='col-3'>Module</li>
            <li className='col-3'>Module</li>
            <li className='col-3'>Module</li>
            <li className='col-3'>Module</li>
            <li className='col-3'>Module</li>
        </div>
    </div>
  );
}


