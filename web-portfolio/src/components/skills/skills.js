import './skills.css'


export default function Skills() {
  const skills=["TypeScript","JavaScript","React","Angular","SQL","Python","Java","R","HTML","Github"]
  const modules=["Data Structures and Algorithms","Object-Oriented Programming","Databases",
  "Operating Systems","Computer Network","Software Engineering","Cloud Computing"]
  return (
    <div className='skillItems container'>
        <h3 className='skillHeaders'>Skills</h3>
        <div className='row'>
          {skills.map((skill)=>{
            return(
              <li key={skill} className='col-6 col-sm-3 mt-1'>{skill}</li>
            )
          })}
        </div>

        <h3 className='moduleHeaders'>Relevant Modules</h3>
        <div className='row'>
          {modules.map((module)=>{
            return(
              <li key={module} className='col-12 col-sm-3 mt-3'>{module}</li>
            )
          })}
        </div>
    </div>
  );
}


