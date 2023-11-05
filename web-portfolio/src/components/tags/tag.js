import './tag.css';

export default function Tags(props) {
    const tagNames=props.tagNames;
    return (
      <div className='container'>
        <div className='row'>
            {tagNames.map(name=>{
                return (
                    <div className='skill-bubble'>
                        <li>
                            <div>{name}</div>
                        </li>
                    </div>
                )
            })}
        </div>
      </div>
    );
  }